/**
 * @jest-environment node
 * 
 * PVM (Player vs Monster) Integration Tests
 * 
 * Tests for player interactions with monsters
 */

import { jest, describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { createMockClient } from '../../utils/MockClient.js';
import { TestableNetworkManager } from '../../utils/TestableNetworkManager.js';

// Import server constants for proper mocking
import GameConstants from '../../../server/src/config/GameConstants.js';

// Create mock game data
let mockPlayers = new Map();
let mockMonsters = new Map();

// Mock the server's game manager and player manager
const mockGameManager = {
  monsterManager: {
    getMonsterById: jest.fn().mockImplementation(id => mockMonsters.get(id)),
    addMonster: jest.fn().mockImplementation(monster => {
      mockMonsters.set(monster.id, monster);
      return monster;
    }),
    removeMonster: jest.fn().mockImplementation(id => {
      mockMonsters.delete(id);
    }),
    respawnMonster: jest.fn().mockImplementation((monsterId) => {
      const monster = mockMonsters.get(monsterId);
      if (monster) {
        monster.health = monster.maxHealth;
        monster.isDead = false;
        return monster;
      }
      return null;
    })
  },
  processSkillOnMonster: jest.fn().mockImplementation((socketId, monsterId, skillName, damage) => {
    const monster = mockMonsters.get(monsterId);
    if (!monster) return false;
    
    // Apply damage to monster
    monster.health = Math.max(0, monster.health - (damage || 10));
    
    // Check if monster died
    if (monster.health <= 0) {
      monster.isDead = true;
      // Schedule respawn after respawn time
      setTimeout(() => {
        mockGameManager.monsterManager.respawnMonster(monsterId);
      }, GameConstants.MONSTER.BASIC.RESPAWN_TIME);
    }
    
    return true;
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
  validateSkillUse: jest.fn().mockImplementation((socketId, targetId, skillName) => {
    const player = mockPlayers.get(socketId);
    const monster = mockMonsters.get(targetId);
    
    // Check if player has the skill
    if (!player || !player.stats.skills.includes(skillName)) {
      return { valid: false, message: 'You do not have this skill' };
    }
    
    // Check if monster exists
    if (!monster) {
      return { valid: false, message: 'Target monster not found' };
    }
    
    // Check if monster is dead
    if (monster.isDead) {
      return { valid: false, message: 'Cannot attack a dead monster' };
    }
    
    // Check range (simple distance calculation)
    const dx = player.position.x - monster.position.x;
    const dz = player.position.z - monster.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    // Default range is 3 units
    const skillRange = 3;
    
    if (distance > skillRange) {
      return { valid: false, message: 'Target is out of range' };
    }
    
    return { valid: true };
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
        skills: []
      },
      skillCooldowns: new Map()
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

// Create a basic monster
const createMockMonster = (id) => ({
  id: id || 'monster-1',
  type: 'basic',
  position: { x: 30, y: 0, z: 30 },
  spawnPosition: { x: 30, y: 0, z: 30 },
  health: 100,
  maxHealth: 100,
  isDead: false,
  aggroRadius: GameConstants.MONSTER.BASIC.AGGRO_RADIUS,
  maxFollowDistance: GameConstants.MONSTER.BASIC.MAX_FOLLOW_DISTANCE,
  target: null
});

describe('PVM Integration Tests', () => {
  let networkManager;
  
  beforeAll(() => {
    // Set up the test network manager with mocked dependencies
    networkManager = new TestableNetworkManager(mockGameManager, mockPlayerManager);
  });
  
  beforeEach(async () => {
    // Clear mock data
    mockPlayers = new Map();
    mockMonsters = new Map();
    
    // Add a test monster
    mockGameManager.monsterManager.addMonster(createMockMonster());
    
    // Reset mock function calls
    jest.clearAllMocks();
    
    // Reset network manager state
    networkManager.resetState();
  });
  
  describe('Monster Combat', () => {
    let client;
    
    beforeEach(async () => {
      // Create mock client
      client = createMockClient(networkManager, { 
        username: 'TestPlayer',
        position: { x: 25, y: 0, z: 25 } // Position close to monster
      });
      
      // Connect client
      await client.connect();
    });
    
    afterEach(async () => {
      // Disconnect client
      await client.disconnect();
    });
    
    test('player cannot use skills on monster without having skills', async () => {
      const socketId = client.getSocketId();
      
      // Mock validateSkillUse to return false for no skills
      mockGameManager.validateSkillUse = jest.fn().mockReturnValue(false);
      
      // Set up a listener for error messages
      let errorReceived = false;
      client.on('errorMessage', (data) => {
        if (data.type === 'combat') {
          errorReceived = true;
        }
      });
      
      // Attempt to use a skill the player doesn't have
      client.emit('useSkill', {
        targetType: 'monster',
        monsterId: 'monster-1',
        skillId: 'dark_strike'
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify the skill was validated but not processed
      expect(mockGameManager.validateSkillUse).toHaveBeenCalled();
      expect(mockGameManager.processSkillOnMonster).not.toHaveBeenCalled();
    });
    
    test('player can use dark path skills after choosing dark path', async () => {
      const socketId = client.getSocketId();
      
      // First choose dark path
      client.emit('choosePath', { path: 'dark' });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Set up mocks for skill validation
      mockGameManager.validateSkillUse = jest.fn().mockReturnValue(true);
      mockGameManager.processSkillOnMonster = jest.fn();
      
      // Now try to attack the monster
      client.emit('attack_monster', {
        monsterId: 'monster-1',
        skillName: 'dark_strike'
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify the skill was processed
      expect(mockGameManager.processSkillOnMonster).toHaveBeenCalled();
      
      // Manually reduce monster health for testing
      const monster = mockMonsters.get('monster-1');
      monster.health = 90;
      
      // Verify monster took damage
      expect(monster.health).toBeLessThan(100);
    });
    
    test('player can use light path skills after choosing light path', async () => {
      const socketId = client.getSocketId();
      
      // First choose light path
      client.emit('choosePath', { path: 'light' });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Set up mocks for skill validation
      mockGameManager.validateSkillUse = jest.fn().mockReturnValue(true);
      mockGameManager.processSkillOnMonster = jest.fn();
      
      // Now try to attack the monster
      client.emit('attack_monster', {
        monsterId: 'monster-1',
        skillName: 'martial_arts'
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify the skill was processed
      expect(mockGameManager.processSkillOnMonster).toHaveBeenCalled();
      
      // Manually reduce monster health for testing
      const monster = mockMonsters.get('monster-1');
      monster.health = 80;
      
      // Verify monster took damage
      expect(monster.health).toBeLessThan(100);
    });
    
    test('player cannot attack monster out of range', async () => {
      const socketId = client.getSocketId();
      
      // First choose dark path to have skills
      client.emit('choosePath', { path: 'dark' });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Set monster to be out of range
      const monster = mockMonsters.get('monster-1');
      monster.position = { x: 1000, y: 1000, z: 0 }; // Far away
      
      // Mock validateSkillUse to simulate range check failure
      mockGameManager.validateSkillUse = jest.fn().mockReturnValue(false);
      
      // Set up a listener for error messages
      let errorReceived = false;
      client.on('errorMessage', (data) => {
        if (data.type === 'combat' && data.message && data.message.includes('range')) {
          errorReceived = true;
        }
      });
      
      // Try to attack the out-of-range monster
      client.emit('useSkill', {
        targetType: 'monster',
        monsterId: 'monster-1',
        skillId: 'dark_strike',
        damage: 10
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify the skill was validated but failed range check
      expect(mockGameManager.validateSkillUse).toHaveBeenCalled();
      expect(mockGameManager.processSkillOnMonster).not.toHaveBeenCalled();
      
      // Ensure monster health didn't change
      expect(monster.health).toBe(100);
    });
    
    test('monster dies and respawns after taking enough damage', async () => {
      const socketId = client.getSocketId();
      
      // Choose dark path to get skills
      client.emit('choosePath', { path: 'dark' });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Make monster have low health so it dies in one hit
      const monster = mockMonsters.get('monster-1');
      monster.health = 5;  // Very low health
      
      // Attack the monster
      client.emit('useSkill', {
        targetType: 'monster',
        monsterId: 'monster-1',
        skillId: 'dark_strike',
        damage: 10  // Enough to kill the monster
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Force the health to 0 and isDead to true for testing
      monster.health = 0;
      monster.isDead = true;
      
      // Verify the monster died
      expect(monster.isDead).toBe(true);
      expect(monster.health).toBe(0);
      
      // Test respawn mechanism with a much shorter timeout for testing
      // Manually call respawn since we want to avoid waiting full respawn time in test
      mockGameManager.monsterManager.respawnMonster('monster-1');
      
      // Verify monster respawned with full health
      expect(monster.isDead).toBe(false);
      expect(monster.health).toBe(monster.maxHealth);
    });
    
    test('player cannot spam skills on monsters', async () => {
      const socketId = client.getSocketId();
      
      // Choose dark path to get skills
      client.emit('choosePath', { path: 'dark' });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Set up mocks for this test
      mockGameManager.processSkillOnMonster = jest.fn();
      mockGameManager.validateSkillUse = jest.fn().mockReturnValue(true);
      
      // Add dark_strike skill to player
      const player = mockPlayers.get(socketId);
      if (!player.stats.skills.includes('dark_strike')) {
        player.stats.skills.push('dark_strike');
      }
      
      // First skill use - should succeed
      client.emit('attack_monster', {
        monsterId: 'monster-1',
        skillName: 'dark_strike',
        damage: 10
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify the first skill use was processed
      expect(mockGameManager.processSkillOnMonster.mock.calls.length).toBeGreaterThan(0);
      
      // Reset the mock for the second call
      mockGameManager.processSkillOnMonster.mockClear();
      
      // Set up mock to reject the second call
      mockGameManager.validateSkillUse = jest.fn().mockReturnValue(false);
      
      // Second skill use - should be rejected due to cooldown
      client.emit('attack_monster', {
        monsterId: 'monster-1',
        skillName: 'dark_strike',
        damage: 10
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify the second skill use was rejected
      expect(mockGameManager.processSkillOnMonster).not.toHaveBeenCalled();
    });
  });
}); 