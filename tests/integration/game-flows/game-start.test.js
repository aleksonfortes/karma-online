/**
 * @jest-environment node
 * 
 * Game Start Integration Tests
 * 
 * Tests for game initialization and initial player state
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
  processDamage: jest.fn(),
  handlePlayerDeath: jest.fn(),
  validateSkillUse: jest.fn(),
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

describe('Game Start Integration Tests', () => {
  let networkManager;
  
  beforeAll(() => {
    // Set up the test network manager with mocked dependencies
    networkManager = new TestableNetworkManager(mockGameManager, mockPlayerManager);
  });
  
  beforeEach(async () => {
    // Clear mock data
    mockPlayers = new Map();
    mockNpcs = new Map();
    
    // Reset mock function calls
    jest.clearAllMocks();
    
    // Reset network manager state
    networkManager.resetState();
  });
  
  describe('Initial Game State', () => {
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
    
    test('player should start with no path selected', async () => {
      // Get the player state
      const socketId = client.getSocketId();
      const player = mockPlayerManager.getPlayer(socketId);
      
      // Verify no path is selected
      expect(player).toBeDefined();
      expect(player.stats.path).toBeNull();
    });
    
    test('player should start with no skills selected', async () => {
      // Get the player state
      const socketId = client.getSocketId();
      const player = mockPlayerManager.getPlayer(socketId);
      
      // Verify no skills are selected
      expect(player).toBeDefined();
      expect(player.stats.skills).toEqual([]);
    });
    
    test('player should not be able to use skills with empty skill bar', async () => {
      // Get the player state
      const socketId = client.getSocketId();
      const player = mockPlayerManager.getPlayer(socketId);
      
      // Mock validateSkillUse to return false
      mockGameManager.validateSkillUse = jest.fn().mockReturnValue(false);
      
      // Set up a listener for error messages
      let errorReceived = false;
      client.on('errorMessage', (data) => {
        if (data.type === 'combat' && data.message.includes('skill')) {
          errorReceived = true;
        }
      });
      
      // Emit a skill use attempt without having any skills
      client.emit('useSkill', {
        targetId: 'player123',
        skillId: 'test_skill_1',
        damage: 30
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify the server rejected the skill use - processDamage should not be called
      expect(mockGameManager.validateSkillUse).toHaveBeenCalled();
      expect(mockGameManager.processDamage).not.toHaveBeenCalled();
    });
  });
}); 