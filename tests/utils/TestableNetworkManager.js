/**
 * TestableNetworkManager.js
 * 
 * A version of NetworkManager that allows for testing without real socket connections
 */

import { jest } from '@jest/globals';

export class TestableNetworkManager {
  constructor(gameManager, playerManager) {
    this.gameManager = gameManager;
    this.playerManager = playerManager;
    
    // Mock a socket.io instance
    this.io = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      sockets: {
        sockets: new Map()
      },
      of: jest.fn().mockReturnThis(),
      on: jest.fn()
    };
    
    // Mock a http server
    this.server = {
      close: jest.fn()
    };
    
    // Keep track of connected clients
    this.mockClients = new Map();
    
    // Mock rate limiting data
    this.movementRateLimits = new Map();
    this.healthRateLimits = new Map();
    this.attackRateLimits = new Map();
    this.securityLog = [];
  }
  
  resetState() {
    this.mockClients.clear();
    this.movementRateLimits.clear();
    this.healthRateLimits.clear();
    this.attackRateLimits.clear();
    this.securityLog = [];
    
    // Reset mocks
    this.io.emit.mockClear();
    this.io.to.mockClear();
  }
  
  // Simulate a client connection
  simulateConnection(socketId, mockClient, username = 'TestUser') {
    // Store the client
    this.mockClients.set(socketId, mockClient);
    
    // Add the player to player manager
    const player = this.playerManager.addPlayer(socketId, username);
    
    // Broadcast the join to other clients
    this.broadcastToAllButOne(socketId, 'playerJoined', player);
    
    // Create initial game state to send to client
    const gameState = {
      players: this.playerManager.getAllPlayers(),
      npcs: this.gameManager.getAllNPCs(),
      environment: {}, // Mock environment data
      serverTime: Date.now()
    };
    
    return gameState;
  }
  
  // Simulate a client disconnection
  simulateDisconnection(socketId) {
    if (!this.mockClients.has(socketId)) return;
    
    // Remove from mock clients
    this.mockClients.delete(socketId);
    
    // Remove player from player manager
    this.playerManager.removePlayer(socketId);
    
    // Broadcast disconnect to all clients
    this.broadcastToAll('playerLeft', { id: socketId });
  }
  
  // Handle player movement
  simulatePlayerMovement(socketId, movementData) {
    if (!this.mockClients.has(socketId)) return false;
    
    // Validate the movement data
    if (!this.validateMovementData(socketId, movementData)) {
      return false;
    }
    
    // Apply rate limiting
    if (!this.rateLimitMovement(socketId)) {
      return false;
    }
    
    // Update player position
    const { position, rotation } = movementData;
    
    // Update in game manager
    const success = this.gameManager.updatePlayerMovement(socketId, position, rotation);
    
    // Update in player manager
    this.playerManager.updatePlayerPosition(socketId, position, rotation);
    
    // Broadcast to all other clients
    const playerMoveData = {
      id: socketId,
      position,
      rotation,
      path: null // No path for test
    };
    
    this.broadcastToAll('playerMoved', playerMoveData);
    
    return true;
  }
  
  // Handle player health updates
  simulateHealthUpdate(socketId, healthData) {
    if (!this.mockClients.has(socketId)) return false;
    
    // Validate health data
    if (!this.validateHealthData(socketId, healthData)) {
      return false;
    }
    
    // Apply rate limiting
    if (!this.rateLimitHealth(socketId)) {
      return false;
    }
    
    // Update health
    const { health } = healthData;
    this.playerManager.updatePlayerHealth(socketId, health);
    
    // Get updated player
    const player = this.playerManager.getPlayer(socketId);
    
    // Broadcast health update
    const healthUpdateData = {
      id: socketId,
      health,
      maxHealth: player?.maxHealth || 100
    };
    
    this.broadcastToAll('playerHealthUpdate', healthUpdateData);
    
    return true;
  }
  
  // Handle player damage
  simulateDamage(socketId, damageData) {
    if (!this.mockClients.has(socketId)) return false;
    
    // Validate damage data
    if (!this.validateDamageData(socketId, damageData)) {
      return false;
    }
    
    // Apply rate limiting
    if (!this.rateLimitAttack(socketId)) {
      return false;
    }
    
    // Process damage
    this.gameManager.processDamage(damageData);
    
    // Broadcast damage
    const damageEventData = {
      sourceId: socketId,
      targetId: damageData.targetId,
      damage: damageData.damage,
      attackType: damageData.attackType
    };
    
    this.broadcastToAll('damageEvent', damageEventData);
    
    return true;
  }
  
  // Broadcasting methods
  broadcastToAll(event, data) {
    // Log the broadcast for testing
    this.io.emit(event, data);
    
    // Also manually trigger the event on all connected mock clients
    this.mockClients.forEach(client => {
      if (client && client.handleEvent) {
        client.handleEvent(event, data);
      }
    });
  }
  
  broadcastToAllButOne(socketId, event, data) {
    // Log the broadcast for testing
    this.io.to.mockClear();
    this.io.to().emit(event, data);
    
    // In a real socket.io setup, this would use socket.broadcast.emit
    // Here we manually send to all except the specified socket
    this.mockClients.forEach((client, id) => {
      if (id !== socketId && client && client.handleEvent) {
        client.handleEvent(event, data);
      }
    });
  }
  
  // Validation methods
  validateClientVersion(version) {
    return version === '1.0.0' || version === 'test';
  }
  
  validateSession(token) {
    return true; // Always valid for tests
  }
  
  validateMovementData(socketId, data) {
    if (!data || !data.position || !data.rotation) {
      this.logSecurityEvent(socketId, 'Invalid movement data', data);
      return false;
    }
    
    // Check if the position has valid x, y, z coordinates
    if (typeof data.position.x !== 'number' || 
        typeof data.position.y !== 'number' || 
        typeof data.position.z !== 'number') {
      this.logSecurityEvent(socketId, 'Invalid position coordinates', data.position);
      return false;
    }
    
    return true;
  }
  
  validateHealthData(socketId, data) {
    if (!data || typeof data.health !== 'number') {
      this.logSecurityEvent(socketId, 'Invalid health data', data);
      return false;
    }
    
    return true;
  }
  
  validateDamageData(socketId, data) {
    if (!data || !data.targetId || typeof data.damage !== 'number' || !data.attackType) {
      this.logSecurityEvent(socketId, 'Invalid damage data', data);
      return false;
    }
    
    return true;
  }
  
  // Rate limiting methods
  rateLimitMovement(socketId) {
    const now = Date.now();
    const lastUpdate = this.movementRateLimits.get(socketId) || 0;
    
    // Allow updates every 50ms (20 updates per second)
    if (now - lastUpdate < 50) {
      return false;
    }
    
    this.movementRateLimits.set(socketId, now);
    return true;
  }
  
  rateLimitHealth(socketId) {
    const now = Date.now();
    const lastUpdate = this.healthRateLimits.get(socketId) || 0;
    
    // Allow health updates every 100ms
    if (now - lastUpdate < 100) {
      return false;
    }
    
    this.healthRateLimits.set(socketId, now);
    return true;
  }
  
  rateLimitAttack(socketId) {
    const now = Date.now();
    const lastUpdate = this.attackRateLimits.get(socketId) || 0;
    
    // Allow attacks every 500ms
    if (now - lastUpdate < 500) {
      return false;
    }
    
    this.attackRateLimits.set(socketId, now);
    return true;
  }
  
  // Security logging
  logSecurityEvent(socketId, message, data) {
    this.securityLog.push({
      socketId,
      message,
      data,
      timestamp: Date.now()
    });
    
    console.warn(`Security event: ${socketId} - ${message}`);
  }
  
  // Utility method to log
  log(...args) {
    // Disabled in tests
  }
} 