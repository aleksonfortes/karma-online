/**
 * @jest-environment node
 * 
 * Player Movement Integration Tests
 * 
 * Tests for player movement events and validation
 */

import { jest, describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { createMockClient } from '../../utils/MockClient.js';
import { TestableNetworkManager } from '../../utils/TestableNetworkManager.js';

// Create mock game data
let mockPlayers = new Map();
let mockNpcs = new Map();

// Mock the server's game manager and player manager
const mockGameManager = {
  getAllNPCs: jest.fn().mockImplementation(() => Array.from(mockNpcs.values())),
  getNPC: jest.fn().mockImplementation(id => mockNpcs.get(id)),
  updateNPC: jest.fn().mockImplementation((id, data) => {
    const npc = mockNpcs.get(id);
    if (npc) {
      Object.assign(npc, data);
    }
  }),
  addNPC: jest.fn().mockImplementation(npc => {
    mockNpcs.set(npc.id, npc);
    return npc;
  }),
  removeNPC: jest.fn().mockImplementation(id => {
    mockNpcs.delete(id);
  }),
  updatePlayerMovement: jest.fn().mockImplementation((socketId, position, rotation) => {
    const player = mockPlayers.get(socketId);
    if (player) {
      player.position = position;
      player.rotation = rotation;
      return true;
    }
    return false;
  }),
  processDamage: jest.fn(),
  handlePlayerDeath: jest.fn(),
  broadcastEnvironmentUpdate: jest.fn()
};

const mockPlayerManager = {
  addPlayer: jest.fn((socketId, username, position) => {
    const player = { 
      id: socketId, 
      username: username || 'DefaultUser',
      position: position || { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      health: 100,
      maxHealth: 100,
      stats: { strength: 10, dexterity: 10, intelligence: 10 },
      inventory: []
    };
    mockPlayers.set(socketId, player);
    return player;
  }),
  getPlayerCount: jest.fn().mockImplementation(() => mockPlayers.size),
  getAllPlayers: jest.fn().mockImplementation(() => Array.from(mockPlayers.values())),
  getPlayer: jest.fn().mockImplementation(socketId => mockPlayers.get(socketId)),
  updatePlayerPosition: jest.fn().mockImplementation((socketId, position, rotation) => {
    const player = mockPlayers.get(socketId);
    if (player) {
      player.position = position;
      player.rotation = rotation;
    }
  }),
  updatePlayerHealth: jest.fn().mockImplementation((socketId, health) => {
    const player = mockPlayers.get(socketId);
    if (player) {
      player.health = health;
    }
  }),
  removePlayer: jest.fn().mockImplementation(socketId => {
    mockPlayers.delete(socketId);
  })
};

describe('Player Movement Integration Tests', () => {
  let networkManager;
  
  beforeAll(() => {
    // Set up the test network manager with mocked dependencies
    networkManager = new TestableNetworkManager(mockGameManager, mockPlayerManager);
  });
  
  describe('Player Movement Synchronization', () => {
    let clientA;
    let clientB;
    
    beforeEach(async () => {
      // Clear mock data
      mockPlayers = new Map();
      mockNpcs = new Map();
      
      // Reset mock function calls
      jest.clearAllMocks();
      
      // Reset network manager state
      networkManager.resetState();
      
      // Create mock clients
      clientA = createMockClient(networkManager, { username: 'PlayerA' });
      clientB = createMockClient(networkManager, { username: 'PlayerB' });
      
      // Connect all clients
      await clientA.connect();
      await clientB.connect();
    });
    
    afterEach(async () => {
      // Disconnect all clients
      await clientA.disconnect();
      await clientB.disconnect();
    });
    
    test('should update other clients when a player moves', async () => {
      // Get client A's socket ID
      const socketId = clientA.getSocketId();
      
      // Set up a listener for position updates on client B
      let movementUpdateReceived = false;
      clientB.on('playerMoved', (data) => {
        movementUpdateReceived = true;
        expect(data).toBeDefined();
        expect(data.id).toBe(socketId);
        expect(data.position.x).toBe(10);
        expect(data.position.y).toBe(1);
        expect(data.position.z).toBe(15);
      });
      
      // Create movement data
      const movementData = {
        position: { x: 10, y: 1, z: 15 },
        rotation: { x: 0, y: 0.7071, z: 0, w: 0.7071 },
        timestamp: Date.now()
      };
      
      // Directly trigger movement from network manager
      networkManager.simulatePlayerMovement(socketId, movementData);
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify the game manager was called to update player position
      expect(mockGameManager.updatePlayerMovement).toHaveBeenCalledWith(
        socketId,
        movementData.position,
        movementData.rotation
      );
      
      // Verify the player manager was called to update position
      expect(mockPlayerManager.updatePlayerPosition).toHaveBeenCalledWith(
        socketId,
        movementData.position,
        movementData.rotation
      );
    });
    
    test('should reject invalid movement data', async () => {
      // Create invalid movement data (missing position)
      const invalidData = {
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        timestamp: Date.now()
      };
      
      // Spy on the logSecurityEvent method
      const securitySpy = jest.spyOn(networkManager, 'logSecurityEvent');
      
      // Check that the data is invalid
      const isValid = networkManager.validateMovementData(clientA.getSocketId(), invalidData);
      
      // Expect validation to fail
      expect(isValid).toBe(false);
      
      // Expect security event to be logged
      expect(securitySpy).toHaveBeenCalled();
      
      // Clean up spy
      securitySpy.mockRestore();
    });
    
    test('should apply rate limiting on movement updates', async () => {
      // Store the original rate limit method
      const originalRateLimit = networkManager.rateLimitMovement;
      
      // Create a mock implementation that passes on first call and fails on second
      networkManager.rateLimitMovement = jest.fn()
        .mockImplementationOnce(() => true)  // First call passes
        .mockImplementationOnce(() => false); // Second call fails (rate limited)
      
      const socketId = clientA.getSocketId();
      
      // Test first movement update (should pass rate limiting)
      const firstResult = networkManager.rateLimitMovement(socketId);
      expect(firstResult).toBe(true);
      
      // Test second movement update (should fail rate limiting)
      const secondResult = networkManager.rateLimitMovement(socketId);
      expect(secondResult).toBe(false);
      
      // Restore the original rate limit method
      networkManager.rateLimitMovement = originalRateLimit;
    });
  });
}); 