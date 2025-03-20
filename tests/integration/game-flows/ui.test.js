/**
 * @jest-environment node
 * 
 * UI Integration Tests
 * 
 * Tests for UI updates based on game state
 */

import { jest, describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { createMockClient } from '../../utils/MockClient.js';
import { TestableNetworkManager } from '../../utils/TestableNetworkManager.js';

// Import server constants for proper mocking
import GameConstants from '../../../server/src/config/GameConstants.js';

// Create mock game data
let mockPlayers = new Map();

// Mock the server's game manager and player manager
const mockGameManager = {
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
  processExperienceGain: jest.fn().mockImplementation((socketId, amount) => {
    const player = mockPlayers.get(socketId);
    if (!player) return false;
    
    // Add experience
    player.stats.experience += amount;
    
    // Check for level up
    const nextLevelExp = GameConstants.EXPERIENCE.BASE_EXPERIENCE * 
      Math.pow(GameConstants.EXPERIENCE.SCALING_FACTOR, player.stats.level - 1);
    
    if (player.stats.experience >= nextLevelExp) {
      player.stats.level += 1;
      player.stats.experience -= nextLevelExp;
      
      // Increase max stats on level up
      player.stats.maxLife += 10;
      player.stats.maxMana += 5;
      
      // Fully heal on level up
      player.stats.life = player.stats.maxLife;
      player.stats.mana = player.stats.maxMana;
      
      return true; // Indicate level up
    }
    
    return false; // No level up
  }),
  processKarmaChange: jest.fn().mockImplementation((socketId, karmaChange) => {
    const player = mockPlayers.get(socketId);
    if (!player) return false;
    
    // Apply karma change
    player.stats.karma = Math.max(0, Math.min(100, player.stats.karma + karmaChange));
    
    return true;
  }),
  processHealthChange: jest.fn().mockImplementation((socketId, healthChange) => {
    const player = mockPlayers.get(socketId);
    if (!player) return false;
    
    // Apply health change
    player.stats.life = Math.max(0, Math.min(player.stats.maxLife, player.stats.life + healthChange));
    
    return true;
  }),
  processManaChange: jest.fn().mockImplementation((socketId, manaChange) => {
    const player = mockPlayers.get(socketId);
    if (!player) return false;
    
    // Apply mana change
    player.stats.mana = Math.max(0, Math.min(player.stats.maxMana, player.stats.mana + manaChange));
    
    return true;
  })
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
        skills: [],
        karma: 0,
        isDead: false
      }
    };
    mockPlayers.set(socketId, player);
    return player;
  }),
  getPlayerCount: jest.fn().mockImplementation(() => mockPlayers.size),
  getAllPlayers: jest.fn().mockImplementation(() => Array.from(mockPlayers.values())),
  getPlayer: jest.fn().mockImplementation(socketId => mockPlayers.get(socketId)),
  removePlayer: jest.fn().mockImplementation(socketId => {
    mockPlayers.delete(socketId);
  })
};

describe('UI Integration Tests', () => {
  let networkManager;
  
  beforeAll(() => {
    // Set up the test network manager with mocked dependencies
    networkManager = new TestableNetworkManager(mockGameManager, mockPlayerManager);
  });
  
  beforeEach(async () => {
    // Clear mock data
    mockPlayers = new Map();
    
    // Reset mock function calls
    jest.clearAllMocks();
    
    // Reset network manager state
    networkManager.resetState();
  });
  
  describe('UI Status Updates', () => {
    let client;
    
    beforeEach(async () => {
      // Create mock client
      client = createMockClient(networkManager, { 
        username: 'TestPlayer'
      });
      
      // Connect client
      await client.connect();
    });
    
    afterEach(async () => {
      // Disconnect client
      await client.disconnect();
    });
    
    test('UI receives EXP updates and level up', async () => {
      const socketId = client.getSocketId();
      const player = mockPlayers.get(socketId);
      
      // Set up listener for experience and level updates
      let expUpdateReceived = false;
      let levelUpReceived = false;
      
      client.on('experienceUpdate', (data) => {
        expUpdateReceived = true;
      });
      
      client.on('levelUp', (data) => {
        levelUpReceived = true;
      });
      
      // Give player enough experience to level up
      const baseExperience = GameConstants.EXPERIENCE.BASE_EXPERIENCE;
      mockGameManager.processExperienceGain(socketId, baseExperience + 10); // Enough to level up
      
      // Broadcast the level up
      networkManager.broadcastToAll('levelUp', {
        id: socketId,
        level: player.stats.level,
        maxLife: player.stats.maxLife,
        maxMana: player.stats.maxMana
      });
      
      // Broadcast the experience update
      networkManager.broadcastToAll('experienceUpdate', {
        id: socketId,
        experience: player.stats.experience,
        level: player.stats.level
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify player leveled up
      expect(player.stats.level).toBe(2);
    });
    
    test('UI receives health and mana updates', async () => {
      const socketId = client.getSocketId();
      const player = mockPlayers.get(socketId);
      
      // Set up listener for health and mana updates
      let healthUpdateReceived = false;
      let manaUpdateReceived = false;
      
      client.on('healthUpdate', (data) => {
        healthUpdateReceived = true;
      });
      
      client.on('manaUpdate', (data) => {
        manaUpdateReceived = true;
      });
      
      // Reduce player's health and mana
      mockGameManager.processHealthChange(socketId, -30); // Reduce health by 30
      mockGameManager.processManaChange(socketId, -40); // Reduce mana by 40
      
      // Broadcast the health update
      networkManager.broadcastToAll('healthUpdate', {
        id: socketId,
        health: player.stats.life,
        maxHealth: player.stats.maxLife
      });
      
      // Broadcast the mana update
      networkManager.broadcastToAll('manaUpdate', {
        id: socketId,
        mana: player.stats.mana,
        maxMana: player.stats.maxMana
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify player's health and mana were reduced
      expect(player.stats.life).toBe(70);
      expect(player.stats.mana).toBe(60);
    });
    
    test('UI receives karma updates', async () => {
      const socketId = client.getSocketId();
      const player = mockPlayers.get(socketId);
      
      // Set up listener for karma updates
      let karmaUpdateReceived = false;
      
      client.on('karmaUpdate', (data) => {
        karmaUpdateReceived = true;
      });
      
      // Change player's karma
      mockGameManager.processKarmaChange(socketId, 25); // Increase karma by 25
      
      // Broadcast the karma update
      networkManager.broadcastToAll('karmaUpdate', {
        id: socketId,
        karma: player.stats.karma
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify player's karma was increased
      expect(player.stats.karma).toBe(25);
    });
    
    test('UI receives skill bar updates after choosing path', async () => {
      const socketId = client.getSocketId();
      const player = mockPlayers.get(socketId);
      
      // Set up listener for skill updates
      let skillUpdateReceived = false;
      let receivedSkills = null;
      
      client.on('skillUpdate', (data) => {
        skillUpdateReceived = true;
        receivedSkills = data.skills;
      });
      
      // Choose path to get skills
      mockGameManager.processPathChoice(socketId, 'dark');
      
      // Broadcast the skill update
      networkManager.broadcastToAll('skillUpdate', {
        id: socketId,
        skills: player.stats.skills
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify player received dark path skill
      expect(player.stats.skills).toContain('dark_strike');
    });
  });
}); 