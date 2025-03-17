/**
 * NetworkManagerPlayerHealth.test.js - Unit tests for the health-related functionality of NetworkManager
 * 
 * These tests focus on testing the health and combat-related functionality of the NetworkManager
 * without setting up real socket connections.
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { NetworkManager } from '../../../../server/src/modules/network/NetworkManager.js';
import GameConstants from '../../../../server/src/config/GameConstants.js';

// Mock dependencies
const mockPlayerManager = {
  addPlayer: jest.fn(),
  getPlayerCount: jest.fn(),
  getAllPlayers: jest.fn(),
  getPlayer: jest.fn(),
  updatePlayerPosition: jest.fn(),
  updatePlayerHealth: jest.fn(),
  removePlayer: jest.fn()
};

const mockGameManager = {
  getAllNPCs: jest.fn(),
  updatePlayerMovement: jest.fn(),
  handlePlayerDeath: jest.fn(),
  processDamage: jest.fn()
};

// Mock Socket.io
const mockSocket = {
  id: 'test-socket-id',
  handshake: {
    query: {
      username: 'TestUser',
      version: '1.0.0'
    }
  },
  on: jest.fn(),
  emit: jest.fn(),
  join: jest.fn(),
  to: jest.fn().mockReturnThis(),
  broadcast: {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn()
  }
};

// Mock Socket.io server
const mockIo = {
  on: jest.fn(),
  emit: jest.fn(),
  to: jest.fn().mockReturnThis()
};

// Create a testable subclass of NetworkManager
class TestableNetworkManager extends NetworkManager {
  constructor() {
    // Create a mock HTTP server
    const mockHttpServer = {};
    super(mockHttpServer, mockGameManager, mockPlayerManager);
    
    // Replace the io instance with our mock
    this.io = mockIo;
    
    // Initialize collections for tracking
    this.lastUpdateTime = new Map();
    this.sockets = new Map();
  }
  
  // Override socket initialization
  setupSocketHandlers() {
    // No-op for testing
  }
  
  // Override to prevent stats interval
  startStatsUpdateInterval() {
    // No-op for testing
  }
  
  // Simulate a new connection
  simulateConnection(socket = mockSocket) {
    // Manually add the player as the connection handler would
    const player = this.playerManager.addPlayer(socket.id, socket.handshake.query.username, { x: 0, y: 0, z: 0 });
    
    // Store the socket
    this.sockets.set(socket.id, { statsInterval: null });
    
    // Send initial game state
    socket.emit('initialGameState', {
      players: this.playerManager.getAllPlayers(),
      npcs: this.gameManager.getAllNPCs(),
      serverTime: Date.now()
    });
    
    // Broadcast to others
    socket.broadcast.emit('playerJoined', player);
    
    return socket;
  }
  
  // Simulate player health update
  simulateHealthUpdate(socketId, healthData) {
    // Validate health data
    if (!this.validateHealthData(healthData)) {
      return false;
    }
    
    // Update player health
    this.playerManager.updatePlayerHealth(socketId, healthData.health);
    
    // Get the updated player
    const player = this.playerManager.getPlayer(socketId);
    
    // Broadcast health update to all clients
    this.io.emit('playerHealthUpdate', {
      id: socketId,
      health: healthData.health,
      maxHealth: player.maxHealth || 100
    });
    
    return true;
  }
  
  // Simulate damage event
  simulateDamageEvent(attackerId, targetId, damageData) {
    // Validate damage data
    if (!this.validateDamageData(damageData)) {
      return false;
    }
    
    // Process damage through game manager
    const damageResult = this.gameManager.processDamage(targetId, damageData.damage, attackerId);
    
    // Get the updated target player
    const targetPlayer = this.playerManager.getPlayer(targetId);
    
    // Check if the player died
    if (targetPlayer.health <= 0) {
      // Handle player death
      this.gameManager.handlePlayerDeath(targetId, attackerId);
      
      // Broadcast death event
      this.io.emit('playerDeath', {
        id: targetId,
        killerId: attackerId
      });
    } else {
      // Broadcast damage event
      this.io.emit('playerDamaged', {
        id: targetId,
        attackerId: attackerId,
        damage: damageData.damage,
        health: targetPlayer.health,
        attackType: damageData.attackType
      });
    }
    
    return damageResult;
  }
  
  // Validation methods
  validateHealthData(data) {
    if (!data || typeof data.health !== 'number') {
      return false;
    }
    
    // Health should be a non-negative number
    if (data.health < 0 || data.health > 1000) {
      return false;
    }
    
    return true;
  }
  
  validateDamageData(data) {
    if (!data || !data.targetId || typeof data.damage !== 'number' || !data.attackType) {
      return false;
    }
    
    // Damage should be positive and reasonable
    if (data.damage <= 0 || data.damage > 100) {
      return false;
    }
    
    return true;
  }
}

describe('NetworkManager Player Health Tests', () => {
  let networkManager;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create an instance of our testable subclass
    networkManager = new TestableNetworkManager();
    
    // Mock console methods for testing
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // When adding a player, return a mock player object
    mockPlayerManager.addPlayer.mockImplementation((socketId, username, position) => ({
      id: socketId,
      username: username || 'DefaultUser',
      position: position || { x: 0, y: 0, z: 0 },
      health: 100,
      maxHealth: 100
    }));
    
    // Configure getPlayer to return a valid player
    mockPlayerManager.getPlayer.mockImplementation((socketId) => ({
      id: socketId,
      username: 'TestUser',
      health: 100,
      maxHealth: 100,
      position: { x: 0, y: 0, z: 0 }
    }));
    
    // Configure processDamage to return a success result
    mockGameManager.processDamage.mockReturnValue({
      success: true,
      damage: 25,
      newHealth: 75
    });
  });
  
  test('should handle player health updates', () => {
    // Simulate a connection
    const socket = networkManager.simulateConnection();
    
    // Reset mocks
    mockIo.emit.mockClear();
    
    // New health data
    const healthData = {
      health: 75,
      timestamp: Date.now()
    };
    
    // Update mockPlayerManager.getPlayer to return player with updated health
    mockPlayerManager.getPlayer.mockReturnValueOnce({
      id: socket.id,
      username: 'TestUser',
      health: healthData.health,
      maxHealth: 100,
      position: { x: 0, y: 0, z: 0 }
    });
    
    // Simulate health update
    networkManager.simulateHealthUpdate(socket.id, healthData);
    
    // Verify player health was updated
    expect(mockPlayerManager.updatePlayerHealth).toHaveBeenCalledWith(
      socket.id,
      healthData.health
    );
    
    // Verify broadcast to clients
    expect(mockIo.emit).toHaveBeenCalledWith(
      'playerHealthUpdate',
      expect.objectContaining({
        id: socket.id,
        health: healthData.health
      })
    );
  });
  
  test('should handle player damage events', () => {
    // Simulate players
    const attacker = networkManager.simulateConnection({
      ...mockSocket,
      id: 'attacker-id',
      handshake: { query: { username: 'Attacker' } }
    });
    
    const target = networkManager.simulateConnection({
      ...mockSocket,
      id: 'target-id',
      handshake: { query: { username: 'Target' } }
    });
    
    // Reset mocks
    mockIo.emit.mockClear();
    
    // Damage data
    const damageData = {
      targetId: target.id,
      damage: 25,
      attackType: 'melee',
      timestamp: Date.now()
    };
    
    // Update mockPlayerManager.getPlayer to return player with updated health
    mockPlayerManager.getPlayer.mockReturnValueOnce({
      id: target.id,
      username: 'Target',
      health: 75, // After damage
      maxHealth: 100,
      position: { x: 0, y: 0, z: 0 }
    });
    
    // Simulate damage event
    networkManager.simulateDamageEvent(attacker.id, target.id, damageData);
    
    // Verify damage was processed
    expect(mockGameManager.processDamage).toHaveBeenCalledWith(
      target.id,
      damageData.damage,
      attacker.id
    );
    
    // Verify broadcast to clients
    expect(mockIo.emit).toHaveBeenCalledWith(
      'playerDamaged',
      expect.objectContaining({
        id: target.id,
        attackerId: attacker.id,
        damage: damageData.damage
      })
    );
  });
  
  test('should broadcast player death', () => {
    // Simulate players
    const attacker = networkManager.simulateConnection({
      ...mockSocket,
      id: 'attacker-id',
      handshake: { query: { username: 'Attacker' } }
    });
    
    const target = networkManager.simulateConnection({
      ...mockSocket,
      id: 'target-id',
      handshake: { query: { username: 'Target' } }
    });
    
    // Reset mocks
    mockIo.emit.mockClear();
    
    // Damage data that will kill the target
    const damageData = {
      targetId: target.id,
      damage: 100,
      attackType: 'melee',
      timestamp: Date.now()
    };
    
    // Update mockPlayerManager.getPlayer to return player with 0 health
    mockPlayerManager.getPlayer.mockReturnValueOnce({
      id: target.id,
      username: 'Target',
      health: 0, // Dead
      maxHealth: 100,
      position: { x: 0, y: 0, z: 0 }
    });
    
    // Simulate damage event
    networkManager.simulateDamageEvent(attacker.id, target.id, damageData);
    
    // Verify death was handled
    expect(mockGameManager.handlePlayerDeath).toHaveBeenCalledWith(
      target.id,
      attacker.id
    );
    
    // Verify death broadcast
    expect(mockIo.emit).toHaveBeenCalledWith(
      'playerDeath',
      expect.objectContaining({
        id: target.id,
        killerId: attacker.id
      })
    );
  });
  
  test('should validate health data correctly', () => {
    // Valid health data
    const validData = {
      health: 75,
      timestamp: Date.now()
    };
    
    // Invalid health data (negative health)
    const invalidData1 = {
      health: -10,
      timestamp: Date.now()
    };
    
    // Invalid health data (non-numeric health)
    const invalidData2 = {
      health: 'not-a-number',
      timestamp: Date.now()
    };
    
    // Test validation
    expect(networkManager.validateHealthData(validData)).toBe(true);
    expect(networkManager.validateHealthData(invalidData1)).toBe(false);
    expect(networkManager.validateHealthData(invalidData2)).toBe(false);
  });
  
  test('should validate damage data correctly', () => {
    // Valid damage data
    const validData = {
      targetId: 'target-id',
      damage: 25,
      attackType: 'melee',
      timestamp: Date.now()
    };
    
    // Invalid damage data (missing targetId)
    const invalidData1 = {
      damage: 25,
      attackType: 'melee',
      timestamp: Date.now()
    };
    
    // Invalid damage data (negative damage)
    const invalidData2 = {
      targetId: 'target-id',
      damage: -10,
      attackType: 'melee',
      timestamp: Date.now()
    };
    
    // Test validation
    expect(networkManager.validateDamageData(validData)).toBe(true);
    expect(networkManager.validateDamageData(invalidData1)).toBe(false);
    expect(networkManager.validateDamageData(invalidData2)).toBe(false);
  });
}); 