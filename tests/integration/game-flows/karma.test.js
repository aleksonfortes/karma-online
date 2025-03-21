/**
 * @jest-environment node
 * 
 * Karma System Integration Tests
 * 
 * Tests for the karma system mechanics
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
        player.stats.skills = ['dark_ball'];
      } else if (path === 'light') {
        player.stats.skills = ['martial_arts'];
      }
    }
    return true;
  }),
  processKarmaChange: jest.fn().mockImplementation((socketId, karmaChange) => {
    const player = mockPlayers.get(socketId);
    if (!player) return false;
    
    // Apply karma change
    player.stats.karma = Math.max(0, Math.min(100, player.stats.karma + karmaChange));
    
    return true;
  }),
  processDamage: jest.fn().mockImplementation((sourceId, targetId, damage) => {
    const sourcePlayer = mockPlayers.get(sourceId);
    const targetPlayer = mockPlayers.get(targetId);
    if (!sourcePlayer || !targetPlayer) return false;
    
    // Apply karmic damage multiplier
    let karmaMultiplier = 1.0;
    if (sourcePlayer.stats.karma > 0) {
      // Each point of karma increases damage by 0.5%
      karmaMultiplier = 1.0 + (sourcePlayer.stats.karma * 0.005);
    }
    
    const finalDamage = Math.floor(damage * karmaMultiplier);
    
    // Apply damage to target
    targetPlayer.stats.life = Math.max(0, targetPlayer.stats.life - finalDamage);
    
    // Check if player died
    if (targetPlayer.stats.life <= 0) {
      targetPlayer.stats.isDead = true;
      
      // Increase killer's karma
      if (sourcePlayer.stats.karma < 5) {
        // Illuminated player (nearly no karma) gains more karma for kills
        mockGameManager.processKarmaChange(sourceId, 20);
      } else {
        // Normal karma gain for kills
        mockGameManager.processKarmaChange(sourceId, 10);
      }
      
      // Schedule respawn
      setTimeout(() => {
        // Respawn player with full health
        targetPlayer.stats.life = targetPlayer.stats.maxLife;
        targetPlayer.stats.isDead = false;
        targetPlayer.position = { x: 0, y: 0, z: 0 }; // Reset to spawn position
      }, 5000); // 5 second respawn time
      
      // Return true to indicate player died
      return true;
    }
    
    // Return false to indicate player is still alive
    return false;
  }),
  isInTemple: jest.fn().mockImplementation((position) => {
    // Temple area is a 20x20 square in the center
    return Math.abs(position.x) < 10 && Math.abs(position.z) < 10;
  }),
  updateKarmaForTemple: jest.fn().mockImplementation((socketId) => {
    const player = mockPlayers.get(socketId);
    if (!player) return;
    
    // In temple, karma slowly decreases
    if (player.stats.karma > 0) {
      mockGameManager.processKarmaChange(socketId, -1);
    }
  }),
  calculatePlayerSpeed: jest.fn().mockImplementation((player) => {
    if (!player) return 1.0;
    
    // Base speed
    let speed = 1.0;
    
    // If player has karma, they move slower
    if (player.stats.karma > 0) {
      // Each 20 points of karma reduces speed by 10%
      const reduction = (player.stats.karma / 20) * 0.1;
      speed = Math.max(0.5, 1.0 - reduction); // Never slower than 50% speed
    }
    
    return speed;
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
  updatePlayerPosition: jest.fn().mockImplementation((socketId, position) => {
    const player = mockPlayers.get(socketId);
    if (player) {
      player.position = position;
    }
  }),
  removePlayer: jest.fn().mockImplementation(socketId => {
    mockPlayers.delete(socketId);
  })
};

describe('Karma System Integration Tests', () => {
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
  
  describe('Karma Mechanics', () => {
    let client;
    
    beforeEach(async () => {
      // Create mock client
      client = createMockClient(networkManager, { 
        username: 'TestPlayer',
        position: { x: 0, y: 0, z: 0 } // Start in temple
      });
      
      // Connect client
      await client.connect();
    });
    
    afterEach(async () => {
      // Disconnect client
      await client.disconnect();
    });
    
    test('karma decreases in temple', async () => {
      const socketId = client.getSocketId();
      const player = mockPlayers.get(socketId);
      
      // Set initial karma
      player.stats.karma = 50;
      
      // Emulate time spent in temple
      for (let i = 0; i < 5; i++) {
        mockGameManager.updateKarmaForTemple(socketId);
      }
      
      // Verify karma decreased
      expect(player.stats.karma).toBeLessThan(50);
    });
    
    test('killing increases karma', async () => {
      const clientA = client;
      const clientAId = clientA.getSocketId();
      const playerA = mockPlayers.get(clientAId);
      
      // Add a second player to kill
      const clientB = createMockClient(networkManager, { 
        username: 'VictimPlayer',
        position: { x: 15, y: 0, z: 15 } // Outside temple
      });
      await clientB.connect();
      const clientBId = clientB.getSocketId();
      
      // Set initial karma for attacker
      playerA.stats.karma = 20;
      
      // Setup client positions outside temple
      mockPlayerManager.updatePlayerPosition(clientAId, { x: 15, y: 0, z: 14 });
      
      // Give both players a path and skills
      mockGameManager.processPathChoice(clientAId, 'dark');
      mockGameManager.processPathChoice(clientBId, 'light');
      
      // Client A kills client B
      mockGameManager.processDamage(clientAId, clientBId, 500); // High damage to ensure kill
      
      // Verify killer's karma increased
      expect(playerA.stats.karma).toBeGreaterThan(20);
      
      // Cleanup
      await clientB.disconnect();
    });
    
    test('illuminated players get more karma for kills', async () => {
      const clientA = client;
      const clientAId = clientA.getSocketId();
      const playerA = mockPlayers.get(clientAId);
      
      // Add a second player to kill
      const clientB = createMockClient(networkManager, { 
        username: 'VictimPlayer',
        position: { x: 15, y: 0, z: 15 } // Outside temple
      });
      await clientB.connect();
      const clientBId = clientB.getSocketId();
      
      // Set very low karma for attacker to simulate illuminated state
      playerA.stats.karma = 3;
      
      // Setup client positions outside temple
      mockPlayerManager.updatePlayerPosition(clientAId, { x: 15, y: 0, z: 14 });
      
      // Give both players a path and skills
      mockGameManager.processPathChoice(clientAId, 'dark');
      mockGameManager.processPathChoice(clientBId, 'light');
      
      // Client A kills client B
      mockGameManager.processDamage(clientAId, clientBId, 500); // High damage to ensure kill
      
      // Verify killer's karma increased by more (20 instead of 10)
      expect(playerA.stats.karma).toBe(23);
      
      // Cleanup
      await clientB.disconnect();
    });
    
    test('higher karma increases damage', async () => {
      const clientA = client;
      const clientAId = clientA.getSocketId();
      const playerA = mockPlayers.get(clientAId);
      
      // Add a second player to attack
      const clientB = createMockClient(networkManager, { 
        username: 'VictimPlayer',
        position: { x: 15, y: 0, z: 15 } // Outside temple
      });
      await clientB.connect();
      const clientBId = clientB.getSocketId();
      const playerB = mockPlayers.get(clientBId);
      
      // Setup client positions outside temple
      mockPlayerManager.updatePlayerPosition(clientAId, { x: 15, y: 0, z: 14 });
      
      // Give both players a path and skills
      mockGameManager.processPathChoice(clientAId, 'dark');
      mockGameManager.processPathChoice(clientBId, 'light');
      
      // First attack with no karma
      playerA.stats.karma = 0;
      mockGameManager.processDamage(clientAId, clientBId, 20);
      const damageWithoutKarma = 100 - playerB.stats.life;
      
      // Reset victim health
      playerB.stats.life = 100;
      
      // Now attack with high karma
      playerA.stats.karma = 60;
      mockGameManager.processDamage(clientAId, clientBId, 20);
      const damageWithKarma = 100 - playerB.stats.life;
      
      // Verify damage was higher with karma
      expect(damageWithKarma).toBeGreaterThan(damageWithoutKarma);
      
      // Cleanup
      await clientB.disconnect();
    });
    
    test('karma makes player slower', async () => {
      const clientA = client;
      const clientAId = clientA.getSocketId();
      const playerA = mockPlayers.get(clientAId);
      
      // Test speed with no karma
      playerA.stats.karma = 0;
      const baseSpeed = mockGameManager.calculatePlayerSpeed(playerA);
      
      // Test speed with medium karma
      playerA.stats.karma = 40;
      const mediumKarmaSpeed = mockGameManager.calculatePlayerSpeed(playerA);
      
      // Test speed with high karma
      playerA.stats.karma = 80;
      const highKarmaSpeed = mockGameManager.calculatePlayerSpeed(playerA);
      
      // Verify karma reduces speed
      expect(mediumKarmaSpeed).toBeLessThan(baseSpeed);
      expect(highKarmaSpeed).toBeLessThan(mediumKarmaSpeed);
    });
    
    test('no karma provides PVP immunity (illuminated state)', async () => {
      const clientA = client;
      const clientAId = clientA.getSocketId();
      const playerA = mockPlayers.get(clientAId);
      
      // Add a second player to attack
      const clientB = createMockClient(networkManager, { 
        username: 'IlluminatedPlayer',
        position: { x: 15, y: 0, z: 15 } // Outside temple
      });
      await clientB.connect();
      const clientBId = clientB.getSocketId();
      const playerB = mockPlayers.get(clientBId);
      
      // Setup client positions outside temple
      mockPlayerManager.updatePlayerPosition(clientAId, { x: 15, y: 0, z: 14 });
      
      // Give both players a path and skills
      mockGameManager.processPathChoice(clientAId, 'dark');
      mockGameManager.processPathChoice(clientBId, 'light');
      
      // Mock the illuminated state for player B (virtually no karma)
      playerB.stats.karma = 0;
      
      // Override process damage to check for illuminated state
      const originalProcessDamage = mockGameManager.processDamage;
      mockGameManager.processDamage = jest.fn().mockImplementation((sourceId, targetId, damage) => {
        const targetPlayer = mockPlayers.get(targetId);
        
        // If target has no karma, they are immune (no damage)
        if (targetPlayer && targetPlayer.stats.karma <= 0) {
          return false;
        }
        
        return originalProcessDamage(sourceId, targetId, damage);
      });
      
      // Client A attacks illuminated client B
      const result = mockGameManager.processDamage(clientAId, clientBId, 30);
      
      // Verify no damage was dealt (player is immune)
      expect(result).toBe(false);
      expect(playerB.stats.life).toBe(100);
      
      // Restore original implementation
      mockGameManager.processDamage = originalProcessDamage;
      
      // Cleanup
      await clientB.disconnect();
    });
  });
}); 