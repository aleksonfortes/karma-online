/**
 * @jest-environment node
 * 
 * Game State Integration Tests
 * 
 * Tests for game state synchronization between client and server
 */

import { jest, describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { createTestServer } from '../utils/testServer.js';
import { createTestClient } from '../utils/testClient.js';

// Import server constants for proper mocking
import GameConstants from '../../../server/src/config/GameConstants.js';

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
  broadcastEnvironmentUpdate: jest.fn()
};

const mockPlayerManager = {
  addPlayer: jest.fn(socketId => {
    const player = { 
      id: socketId, 
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      health: 100,
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

// Import the real NetworkManager
import { NetworkManager } from '../../../server/src/modules/network/NetworkManager.js';

// Override network manager methods that might cause issues in tests
NetworkManager.prototype.startStatsUpdateInterval = jest.fn();
NetworkManager.prototype.rateLimitMovement = jest.fn().mockReturnValue(true);
NetworkManager.prototype.validateMovementData = jest.fn().mockReturnValue(true);
NetworkManager.prototype.logSecurityEvent = jest.fn();
NetworkManager.prototype.log = jest.fn();
NetworkManager.prototype.validateSession = jest.fn().mockReturnValue(true);
NetworkManager.prototype.validateHealthData = jest.fn().mockReturnValue(true);

describe('Game State Integration Tests', () => {
  let testServer;
  let httpServer;
  let networkManager;
  
  beforeAll(() => {
    // Increase timeout globally
    jest.setTimeout(30000);
    
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
  
  describe('Player State Synchronization', () => {
    let clientA;
    let clientB;
    let clientC;
    
    beforeEach(async () => {
      // Clear mock data
      mockPlayers = new Map();
      mockNpcs = new Map();
      
      // Reset mock function calls
      jest.clearAllMocks();
      
      // Create test clients
      clientA = createTestClient(testServer.getUrl());
      clientB = createTestClient(testServer.getUrl());
      clientC = createTestClient(testServer.getUrl());
      
      // Connect all clients
      await Promise.all([
        clientA.connect(),
        clientB.connect(),
        clientC.connect()
      ]);
      
      // Wait for initial game state on all clients
      await Promise.all([
        clientA.waitForEvent('initGameState'),
        clientB.waitForEvent('initGameState'),
        clientC.waitForEvent('initGameState')
      ]).catch(err => {
        console.log('Error during setup:', err);
      });
    }, 30000); // Increase timeout for beforeEach
    
    afterEach(async () => {
      // Disconnect all clients
      await Promise.all([
        clientA.disconnect(),
        clientB.disconnect(),
        clientC.disconnect()
      ]).catch(err => {
        console.log('Error during teardown:', err);
      });
    }, 10000); // Increase timeout for afterEach
    
    test('new clients should receive complete game state', async () => {
      // Add NPCs before connecting a new client
      const testNpcs = [
        { id: 'npc1', type: 'enemy', position: { x: 10, y: 0, z: 20 } },
        { id: 'npc2', type: 'friendly', position: { x: -10, y: 0, z: -20 } }
      ];
      
      testNpcs.forEach(npc => mockGameManager.addNPC(npc));
      
      // Connect a new client
      const clientD = createTestClient(testServer.getUrl());
      
      // Set up the promise before connecting
      const gameStatePromise = clientD.waitForEvent('initGameState');
      await clientD.connect();
      
      // Wait for and check the game state
      const gameState = await gameStatePromise;
      
      // Verify the new client received all existing players and NPCs
      expect(gameState).toBeDefined();
      expect(gameState.players.length).toBe(3); // 3 existing clients
      expect(gameState.npcs.length).toBe(2); // 2 NPCs we added
      
      // Cleanup
      await clientD.disconnect();
    }, 30000); // Increase test timeout
    
    test('should notify all clients when a player disconnects', async () => {
      // Set up listeners for player left events
      const leftPromiseB = clientB.waitForEvent('playerLeft');
      const leftPromiseC = clientC.waitForEvent('playerLeft');
      
      // Disconnect client A
      const clientAId = clientA.getSocket().id;
      await clientA.disconnect();
      
      // Check that other clients were notified
      const leftEventB = await leftPromiseB;
      const leftEventC = await leftPromiseC;
      
      // Verify the player ID matches
      expect(leftEventB).toBe(clientAId);
      expect(leftEventC).toBe(clientAId);
      
      // Verify the player was removed from the player manager
      expect(mockPlayerManager.removePlayer).toHaveBeenCalledWith(clientAId);
    }, 30000); // Increase test timeout
    
    test('should synchronize player health updates', async () => {
      // Set up a listener for player updates
      const updatePromiseB = clientB.waitForEvent('playerUpdates');
      
      // Client A sends a health update event
      const healthUpdateData = {
        health: 75,
        timestamp: Date.now()
      };
      
      await clientA.emit('playerHealth', healthUpdateData);
      
      // Wait for client B to receive the update
      const updateData = await updatePromiseB;
      
      // Check the update data
      expect(updateData).toBeDefined();
      expect(Array.isArray(updateData)).toBe(true);
      
      // Find the updated player
      const updatedPlayer = updateData.find(p => p.id === clientA.getSocket().id);
      expect(updatedPlayer).toBeDefined();
      expect(updatedPlayer.health).toBe(75);
      
      // Verify the player manager was called to update health
      expect(mockPlayerManager.updatePlayerHealth).toHaveBeenCalledWith(
        clientA.getSocket().id,
        75
      );
    }, 30000); // Increase test timeout
  });
}); 