/**
 * @jest-environment node
 * 
 * NPC Interactions Integration Tests
 * 
 * Tests for NPC interactions and path selection
 */

import { jest, describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { createMockClient } from '../../utils/MockClient.js';
import { TestableNetworkManager } from '../../utils/TestableNetworkManager.js';

// Import server constants for proper mocking
import GameConstants from '../../../server/src/config/GameConstants.js';

// Create mock game data
let mockPlayers = new Map();
let mockNpcs = new Map();

// Mock the server's game manager and player manager
const mockGameManager = {
  getAllNPCs: jest.fn().mockImplementation(() => Array.from(mockNpcs.values())),
  getNPC: jest.fn().mockImplementation(id => mockNpcs.get(id)),
  updateNPC: jest.fn(),
  addNPC: jest.fn().mockImplementation(npc => {
    mockNpcs.set(npc.id, npc);
    return npc;
  }),
  removeNPC: jest.fn().mockImplementation(id => {
    mockNpcs.delete(id);
  }),
  processPathChoice: jest.fn().mockImplementation((socketId, path) => {
    const player = mockPlayers.get(socketId);
    if (player) {
      player.stats.path = path;
      
      // Add appropriate skills based on path
      if (path === 'dark') {
        player.stats.skills = ['dark_strike'];
      } else if (path === 'light') {
        player.stats.skills = ['martial_arts'];
      }
    }
    return true;
  }),
  processDamage: jest.fn(),
  handlePlayerDeath: jest.fn(),
};

const mockPlayerManager = {
  addPlayer: jest.fn((socketId, userData) => {
    const player = { 
      id: socketId, 
      username: userData?.username || 'DefaultUser',
      position: userData?.position || { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      stats: {
        life: 100,
        maxLife: 100,
        mana: 100,
        maxMana: 100,
        level: 1,
        experience: 0,
        path: null,
        skills: []
      }
    };
    mockPlayers.set(socketId, player);
    return player;
  }),
  getPlayerCount: jest.fn().mockImplementation(() => mockPlayers.size),
  getAllPlayers: jest.fn().mockImplementation(() => Array.from(mockPlayers.values())),
  getPlayer: jest.fn().mockImplementation(socketId => mockPlayers.get(socketId)),
  updatePlayerPosition: jest.fn(),
  updatePlayerHealth: jest.fn(),
  removePlayer: jest.fn().mockImplementation(socketId => {
    mockPlayers.delete(socketId);
  })
};

// Create mock NPCs
const darkNpc = {
  id: 'dark_npc',
  type: 'dark_npc',
  position: { x: 7, y: 3.5, z: -9 }
};

const lightNpc = {
  id: 'light_npc',
  type: 'light_npc',
  position: { x: -7, y: 0.5, z: -9.5 }
};

describe('NPC Interactions Integration Tests', () => {
  let networkManager;
  
  beforeAll(() => {
    // Set up the test network manager with mocked dependencies
    networkManager = new TestableNetworkManager(mockGameManager, mockPlayerManager);
  });
  
  beforeEach(async () => {
    // Clear mock data
    mockPlayers = new Map();
    mockNpcs = new Map();
    
    // Add NPCs to the mock game
    mockGameManager.addNPC(darkNpc);
    mockGameManager.addNPC(lightNpc);
    
    // Reset mock function calls
    jest.clearAllMocks();
    
    // Reset network manager state
    networkManager.resetState();
  });
  
  describe('Path Selection and NPC Interaction', () => {
    let client;
    
    beforeEach(async () => {
      // Create mock client
      client = createMockClient(networkManager, { username: 'TestPlayer' });
      
      // Connect client
      await client.connect();
    });
    
    afterEach(async () => {
      // Disconnect client
      await client.disconnect();
    });
    
    test('player can talk to both NPCs without choosing a path', async () => {
      // Set up listener for NPC interaction responses
      let darkNpcResponse = false;
      let lightNpcResponse = false;
      
      client.on('npcDialogue', (data) => {
        if (data.npcId === 'dark_npc') {
          darkNpcResponse = true;
        } else if (data.npcId === 'light_npc') {
          lightNpcResponse = true;
        }
      });
      
      // Emulate talking to dark NPC
      client.emit('npcInteraction', { npcId: 'dark_npc' });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Emulate talking to light NPC
      client.emit('npcInteraction', { npcId: 'light_npc' });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Mock network manager should simulate dialogue response
      networkManager.simulateNpcInteraction({ npcId: 'dark_npc' }, client.getSocketId());
      networkManager.simulateNpcInteraction({ npcId: 'light_npc' }, client.getSocketId());
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify player path is still null
      const player = mockPlayerManager.getPlayer(client.getSocketId());
      expect(player.stats.path).toBeNull();
    });
    
    test('player can choose dark path and learn correct skill', async () => {
      const socketId = client.getSocketId();
      
      // Emulate talking to dark NPC
      client.emit('npcInteraction', { npcId: 'dark_npc' });
      
      // Emulate choosing dark path
      client.emit('choosePath', { path: 'dark' });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify path choice was processed
      expect(mockGameManager.processPathChoice).toHaveBeenCalledWith(socketId, 'dark');
      
      // Get updated player state
      const player = mockPlayerManager.getPlayer(socketId);
      
      // Verify player has dark path
      expect(player.stats.path).toBe('dark');
      
      // Verify player has dark skill
      expect(player.stats.skills).toContain('dark_strike');
    });
    
    test('player can choose light path and learn correct skill', async () => {
      const socketId = client.getSocketId();
      
      // Emulate talking to light NPC
      client.emit('npcInteraction', { npcId: 'light_npc' });
      
      // Emulate choosing light path
      client.emit('choosePath', { path: 'light' });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify path choice was processed
      expect(mockGameManager.processPathChoice).toHaveBeenCalledWith(socketId, 'light');
      
      // Get updated player state
      const player = mockPlayerManager.getPlayer(socketId);
      
      // Verify player has light path
      expect(player.stats.path).toBe('light');
      
      // Verify player has light skill
      expect(player.stats.skills).toContain('martial_arts');
    });
    
    test('player cannot learn skills from opposite path', async () => {
      const socketId = client.getSocketId();
      
      // Emulate choosing dark path first
      client.emit('choosePath', { path: 'dark' });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Now try to choose light path
      client.emit('choosePath', { path: 'light' });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // processPathChoice should only be called once (for the first path choice)
      expect(mockGameManager.processPathChoice).toHaveBeenCalledTimes(1);
      expect(mockGameManager.processPathChoice).toHaveBeenCalledWith(socketId, 'dark');
      
      // Get updated player state
      const player = mockPlayerManager.getPlayer(socketId);
      
      // Verify player still has dark path
      expect(player.stats.path).toBe('dark');
      
      // Verify player only has dark skill
      expect(player.stats.skills).toContain('dark_strike');
      expect(player.stats.skills).not.toContain('martial_arts');
    });
  });
}); 