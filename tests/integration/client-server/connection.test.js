/**
 * @jest-environment node
 * 
 * Connection Integration Tests
 * 
 * Tests for basic socket connection between client and server
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

// More complete player manager mock
const mockPlayerManager = {
  addPlayer: jest.fn(socketId => ({ 
    id: socketId, 
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    health: 100,
    stats: { strength: 10, dexterity: 10, intelligence: 10 }
  })),
  getPlayerCount: jest.fn().mockReturnValue(1),
  getAllPlayers: jest.fn().mockReturnValue([]),
  removePlayer: jest.fn(),
  getPlayer: jest.fn(socketId => ({ 
    id: socketId, 
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    health: 100,
    stats: { strength: 10, dexterity: 10, intelligence: 10 }
  })),
  updatePlayerPosition: jest.fn()
};

// Import the real NetworkManager
import { NetworkManager } from '../../../server/src/modules/network/NetworkManager.js';

// Override network manager methods that might cause issues in tests
NetworkManager.prototype.startStatsUpdateInterval = jest.fn();
NetworkManager.prototype.rateLimitMovement = jest.fn().mockReturnValue(true);
NetworkManager.prototype.logSecurityEvent = jest.fn();
NetworkManager.prototype.log = jest.fn();

describe('Client-Server Connection Tests', () => {
  let testServer;
  let httpServer;
  let networkManager;
  
  beforeAll(() => {
    jest.setTimeout(30000); // Increase timeout for all tests
    
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
  
  describe('Connection Establishment', () => {
    let clientA;
    
    beforeEach(async () => {
      // Reset the mocks for each test
      mockPlayerManager.addPlayer.mockClear();
      mockPlayerManager.getAllPlayers.mockClear();
      mockGameManager.getAllNPCs.mockClear();
      
      // Create a test client
      clientA = createTestClient(testServer.getUrl());
    });
    
    afterEach(async () => {
      // Clean up after each test
      await clientA.disconnect();
    });
    
    test('should connect successfully to the server', async () => {
      // Connect to the server
      await clientA.connect();
      
      // Check if the socket is connected
      expect(clientA.getSocket().connected).toBe(true);
    }, 30000); // Add explicit timeout
    
    test('should receive initial game state on connection', async () => {
      // Set up mock data for this test
      const mockPlayer = { id: 'test-player', position: { x: 0, y: 0, z: 0 } };
      const mockNpcs = [{ id: 'npc-1', position: { x: 10, y: 0, z: 10 } }];
      
      mockPlayerManager.getAllPlayers.mockReturnValueOnce([mockPlayer]);
      mockGameManager.getAllNPCs.mockReturnValueOnce(mockNpcs);
      
      // Set up listener first, then connect
      const initStatePromise = clientA.waitForEvent('initGameState');
      await clientA.connect();
      
      // Wait for the initGameState event
      const initGameState = await initStatePromise;
      
      // Check if we received the correct data
      expect(initGameState).toBeDefined();
      expect(initGameState.players).toEqual([mockPlayer]);
      expect(initGameState.npcs).toEqual(mockNpcs);
      expect(initGameState.serverTime).toBeDefined();
      
      // Verify manager methods were called
      expect(mockPlayerManager.addPlayer).toHaveBeenCalled();
      expect(mockPlayerManager.getAllPlayers).toHaveBeenCalled();
      expect(mockGameManager.getAllNPCs).toHaveBeenCalled();
    }, 30000); // Add explicit timeout
  });
}); 