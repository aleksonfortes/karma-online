/**
 * TestableNetworkManager.js
 * 
 * A version of NetworkManager that allows for testing without real socket connections
 */

import { jest } from '@jest/globals';

export class TestableNetworkManager {
  constructor(gameManager, playerManager, physicsManager) {
    this.gameManager = gameManager || {
      getAllNPCs: jest.fn().mockReturnValue([]),
      getNPC: jest.fn(),
      updateNPC: jest.fn(),
      addNPC: jest.fn(),
      removeNPC: jest.fn(),
      processDamage: jest.fn(),
      handlePlayerDeath: jest.fn()
    };
    
    this.playerManager = playerManager || {
      addPlayer: jest.fn(),
      getPlayerCount: jest.fn().mockReturnValue(0),
      getAllPlayers: jest.fn().mockReturnValue([]),
      getPlayer: jest.fn(),
      updatePlayerPosition: jest.fn(),
      updatePlayerHealth: jest.fn(),
      removePlayer: jest.fn()
    };
    
    this.physicsManager = physicsManager || {
      checkCollision: jest.fn(),
      resolveCollision: jest.fn()
    };
    
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
    const player = this.playerManager.addPlayer(socketId, { username });
    
    // Broadcast the join to other clients
    this.broadcastToAllButOne(socketId, 'playerJoined', player);
    
    // Create initial game state to send to client
    const gameState = {
      players: this.playerManager.getAllPlayers(),
      npcs: this.gameManager.getAllNPCs ? this.gameManager.getAllNPCs() : [],
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
    
    // Get the position from movement data
    const { position, rotation } = movementData;
    
    // Check for collision if physics manager is available
    if (this.physicsManager && this.physicsManager.checkCollision) {
      const player = this.playerManager.getPlayer(socketId);
      this.physicsManager.checkCollision(player, position);
    }
    
    // Update in game manager
    const success = this.gameManager.updatePlayerMovement ? 
      this.gameManager.updatePlayerMovement(socketId, position, rotation) : true;
    
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
    
    // If this is a skill use, validate it if the method exists
    let isSkillValid = true;
    if (damageData.skillId && this.gameManager.validateSkillUse) {
      try {
        isSkillValid = this.gameManager.validateSkillUse(socketId, damageData.skillId);
      } catch (err) {
        isSkillValid = false;
        console.log(`Skill validation error in simulateDamage: ${err.message}`);
      }
    }
    
    // Only process damage if skill validation passes or it's not a skill-based attack
    if (isSkillValid) {
      // Process damage
      // Check if gameManager has processDamage, otherwise log the damage event
      if (this.gameManager.processDamage) {
        this.gameManager.processDamage(damageData);
      } else if (this.gameManager.processSkillOnMonster && damageData.attackType === 'monster') {
        this.gameManager.processSkillOnMonster(socketId, damageData.monsterId, damageData.skillId, damageData.damage);
      } else {
        // For mocking purposes in tests, just log the event when methods aren't available
        console.log(`Test: Damage processed - ${JSON.stringify(damageData)}`);
      }
      
      // Broadcast damage
      const damageEventData = {
        sourceId: socketId,
        targetId: damageData.targetId || damageData.monsterId,
        damage: damageData.damage,
        attackType: damageData.attackType
      };
      
      this.broadcastToAll('damageEvent', damageEventData);
    }
    
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
    if (!data || !data.position) {
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
    // For testing purposes, always allow skill data
    if (data && data.attackType === 'skill') {
      return true;
    }
    
    // For testing purposes, we need to be flexible with damage data
    if (!data) {
      this.logSecurityEvent(socketId, 'Invalid damage data - missing data object', data);
      return false;
    }
    
    // If we're dealing with a PVP attack, require targetId and damage
    if (data.attackType === 'pvp' && (!data.targetId || typeof data.damage !== 'number')) {
      this.logSecurityEvent(socketId, 'Invalid PVP damage data', data);
      return false;
    }
    
    // If we're dealing with a monster attack, require monsterId and damage
    if (data.attackType === 'monster' && (!data.monsterId || typeof data.damage !== 'number')) {
      this.logSecurityEvent(socketId, 'Invalid monster damage data', data);
      return false;
    }
    
    // For other attack types, be lenient in testing
    return true;
  }
  
  // Rate limiting methods
  rateLimitMovement(socketId) {
    return true; // No rate limiting in tests
  }
  
  rateLimitHealth(socketId) {
    return true; // No rate limiting in tests
  }
  
  rateLimitAttack(socketId) {
    return true; // No rate limiting in tests
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
  
  // Utility methods
  simulateNpcInteraction(npcData, socketId) {
    this.broadcastToAll('npcDialogue', {
      npcId: npcData.npcId,
      socketId: socketId,
      text: `Test dialogue for ${npcData.npcId}`
    });
  }
} 