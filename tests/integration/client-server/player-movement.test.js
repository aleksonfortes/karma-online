/**
 * @jest-environment node
 * 
 * Player Movement Integration Tests
 * 
 * Tests for player movement synchronization between client and server
 */

import { jest, describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { createTestServer } from '../utils/testServer.js';
import { createTestClient } from '../utils/testClient.js';

// Import server constants for proper mocking
import GameConstants from '../../../server/src/config/GameConstants.js';

// Mock the server's game manager and player manager
const mockGameManager = {
  getAllNPCs: jest.fn().mockReturnValue([])
};

let playerPositions = new Map();

const mockPlayerManager = {
  addPlayer: jest.fn(socketId => {
    const player = { 
      id: socketId, 
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      health: 100,
      stats: { strength: 10, dexterity: 10, intelligence: 10 }
    };
    playerPositions.set(socketId, player);
    return player;
  }),
  getPlayerCount: jest.fn().mockImplementation(() => playerPositions.size),
  getAllPlayers: jest.fn().mockImplementation(() => Array.from(playerPositions.values())),
  getPlayer: jest.fn().mockImplementation(socketId => playerPositions.get(socketId)),
  updatePlayerPosition: jest.fn().mockImplementation((socketId, position, rotation) => {
    const player = playerPositions.get(socketId);
    if (player) {
      player.position = position;
      player.rotation = rotation;
    }
  }),
  removePlayer: jest.fn().mockImplementation(socketId => {
    playerPositions.delete(socketId);
  })
};

// Import the real NetworkManager
import { NetworkManager } from '../../../server/src/modules/network/NetworkManager.js';

// Override network manager methods that might cause issues in tests
NetworkManager.prototype.startStatsUpdateInterval = jest.fn();
NetworkManager.prototype.rateLimitMovement = jest.fn().mockReturnValue(true);
NetworkManager.prototype.validateMovementData = jest.fn().mockReturnValue(true);
NetworkManager.prototype.logSecurityEvent = jest.fn();
NetworkManager.prototype.log = jest.fn();
NetworkManager.prototype.validateSession = jest.fn().mockReturnValue(true);

describe('Player Movement Integration Tests', () => {
  let testServer;
  let httpServer;
  let networkManager;
  
  beforeAll(() => {
    // Increase timeout globally
    jest.setTimeout(30000);
    
    // Clear positions
    playerPositions = new Map();
    
    // Set up the test server
    testServer = createTestServer();
    httpServer = testServer.getHttpServer();
    
    // Initialize the network manager with mocked dependencies
    networkManager = new NetworkManager(httpServer, mockGameManager, mockPlayerManager);
  });
  
  afterAll(async () => {
    // Clean up
    await testServer.close();
  });
  
  describe('Movement Synchronization', () => {
    let clientA;
    let clientB;
    
    beforeEach(async () => {
      // Reset the mocks for each test
      jest.clearAllMocks();
      playerPositions = new Map();
      
      // Mock specific behavior for movement validation
      NetworkManager.prototype.validateMovementData.mockImplementation((data) => {
        return data && data.position && typeof data.position.x === 'number';
      });
      
      // Create test clients
      clientA = createTestClient(testServer.getUrl());
      clientB = createTestClient(testServer.getUrl());
      
      // Connect both clients
      await clientA.connect();
      await clientB.connect();
      
      // Wait for initial game state to ensure full connection
      await Promise.all([
        clientA.waitForEvent('initGameState'),
        clientB.waitForEvent('initGameState')
      ]).catch(err => {
        console.log('Error during setup:', err);
      });
    }, 30000); // Increase timeout for beforeEach
    
    afterEach(async () => {
      // Disconnect clients
      await clientA.disconnect();
      await clientB.disconnect();
    }, 10000); // Increase timeout for afterEach
    
    test('should update other clients when a player moves', async () => {
      // Client B listens for player updates
      const updatePromise = clientB.waitForEvent('playerPositions');
      
      // Client A sends a movement update
      const movementData = {
        position: { x: 10, y: 1, z: 15 },
        rotation: { x: 0, y: 0.7071, z: 0, w: 0.7071 },
        timestamp: Date.now()
      };
      
      await clientA.emit('playerMovement', movementData);
      
      // Wait for client B to receive the update
      const updateData = await updatePromise;
      
      // Check if the update contains the moved player
      expect(updateData).toBeDefined();
      expect(Array.isArray(updateData)).toBe(true);
      
      const updatedPlayer = updateData.find(p => p.id === clientA.getSocket().id);
      expect(updatedPlayer).toBeDefined();
      expect(updatedPlayer.position).toEqual(movementData.position);
      expect(updatedPlayer.rotation).toEqual(movementData.rotation);
    }, 30000); // Increase test timeout
    
    test('should reject invalid movement data', async () => {
      // Set up a spy on the NetworkManager's logSecurityEvent method
      const logSecurityEventSpy = jest.spyOn(networkManager, 'logSecurityEvent');
      
      // Override validation for this test
      NetworkManager.prototype.validateMovementData.mockReturnValueOnce(false);
      
      // Client A sends invalid movement data
      const invalidMovementData = {
        position: { x: 'invalid', y: 1, z: 15 },
        rotation: { x: 0, y: 0.7071, z: 0, w: 0.7071 },
        timestamp: Date.now()
      };
      
      await clientA.emit('playerMovement', invalidMovementData);
      
      // Wait a moment for server processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify the security event was logged
      expect(logSecurityEventSpy).toHaveBeenCalled();
    }, 30000); // Increase test timeout
    
    test('should apply rate limiting on movement updates', async () => {
      // Set up rate limiting for this test
      NetworkManager.prototype.rateLimitMovement
        .mockReturnValueOnce(true)  // First call passes
        .mockReturnValueOnce(false) // Second call is rate limited
        .mockReturnValueOnce(false) // Third call is rate limited
        .mockReturnValueOnce(true); // Fourth call passes again
      
      // Spy on updatePlayerPosition
      const updateSpy = jest.spyOn(mockPlayerManager, 'updatePlayerPosition');
      
      // Send four movement updates
      for (let i = 0; i < 4; i++) {
        await clientA.emit('playerMovement', {
          position: { x: i, y: 1, z: 15 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          timestamp: Date.now() + i
        });
        // Small delay between sends
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Wait a moment for server processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // We should have only 2 calls to updatePlayerPosition (first and fourth)
      expect(updateSpy).toHaveBeenCalledTimes(2);
    }, 30000); // Increase test timeout
  });
}); 