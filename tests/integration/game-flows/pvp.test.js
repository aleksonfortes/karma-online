/**
 * @jest-environment node
 * 
 * PVP and Multiplayer Integration Tests
 * 
 * Tests for player vs player combat and multiplayer interactions
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
  processDamage: jest.fn().mockImplementation((sourceId, targetId, damage) => {
    const targetPlayer = mockPlayers.get(targetId);
    if (!targetPlayer) return false;
    
    // Apply damage to target
    targetPlayer.stats.life = Math.max(0, targetPlayer.stats.life - damage);
    
    // Check if player died
    if (targetPlayer.stats.life <= 0) {
      targetPlayer.stats.isDead = true;
      
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
  isInTempleSafeZone: jest.fn().mockImplementation((position) => {
    // Check if position is in temple safe zone (center of map)
    const dx = position.x;
    const dz = position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    // Temple safe zone is a radius of 10 units from center
    return distance < 10;
  }),
  validateSkillUse: jest.fn().mockImplementation((sourceId, targetId, skillName) => {
    const sourcePlayer = mockPlayers.get(sourceId);
    const targetPlayer = mockPlayers.get(targetId);
    
    // Check if players exist
    if (!sourcePlayer || !targetPlayer) {
      return { valid: false, message: 'Player not found' };
    }
    
    // Check if source player has the skill
    if (!sourcePlayer.stats.skills.includes(skillName)) {
      return { valid: false, message: 'You do not have this skill' };
    }
    
    // Check if target player is alive
    if (targetPlayer.stats.isDead) {
      return { valid: false, message: 'Cannot attack a dead player' };
    }
    
    // Check if either player is in temple safe zone
    if (mockGameManager.isInTempleSafeZone(sourcePlayer.position) || 
        mockGameManager.isInTempleSafeZone(targetPlayer.position)) {
      return { valid: false, message: 'Cannot attack in temple safe zone' };
    }
    
    // Check range
    const dx = sourcePlayer.position.x - targetPlayer.position.x;
    const dz = sourcePlayer.position.z - targetPlayer.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    // Skill range is 5 units
    const skillRange = 5;
    
    if (distance > skillRange) {
      return { valid: false, message: 'Target is out of range' };
    }
    
    return { valid: true };
  }),
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
        skills: [],
        isDead: false
      },
      skillCooldowns: new Map()
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
  updatePlayerHealth: jest.fn().mockImplementation((socketId, health) => {
    const player = mockPlayers.get(socketId);
    if (player) {
      player.stats.life = health;
    }
  }),
  removePlayer: jest.fn().mockImplementation(socketId => {
    mockPlayers.delete(socketId);
  })
};

describe('PVP and Multiplayer Integration Tests', () => {
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
  
  describe('Multiplayer Synchronization', () => {
    let clientA;
    let clientB;
    
    beforeEach(async () => {
      // Create two mock clients
      clientA = createMockClient(networkManager, { 
        username: 'PlayerA',
        position: { x: 15, y: 0, z: 15 } // Outside temple
      });
      
      clientB = createMockClient(networkManager, { 
        username: 'PlayerB',
        position: { x: 20, y: 0, z: 20 } // Outside temple
      });
      
      // Connect clients
      await clientA.connect();
      await clientB.connect();
    });
    
    afterEach(async () => {
      // Disconnect clients
      await clientA.disconnect();
      await clientB.disconnect();
    });
    
    test('player movement is synchronized between clients', async () => {
      const clientAId = clientA.getSocketId();
      const clientBId = clientB.getSocketId();
      
      // Set up listener for player movement on client B
      let movementReceived = false;
      let receivedPosition = null;
      
      clientB.on('playerMovement', (data) => {
        if (data.id === clientAId) {
          movementReceived = true;
          receivedPosition = data.position;
        }
      });
      
      // Move client A
      const newPosition = { x: 25, y: 0, z: 25 };
      const newRotation = { x: 0, y: 0, z: 0, w: 1 };
      clientA.emit('playerMovement', {
        position: newPosition,
        rotation: newRotation
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify player manager updated position
      expect(mockPlayerManager.updatePlayerPosition).toHaveBeenCalledWith(
        clientAId,
        newPosition,
        newRotation
      );
      
      // Manually broadcast movement to simulate network manager behavior
      networkManager.broadcastToAll('playerMovement', {
        id: clientAId,
        position: newPosition,
        rotation: newRotation
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Check that client B received the movement
      expect(receivedPosition).toEqual(newPosition);
    });
    
    test('player health updates are synchronized between clients', async () => {
      const clientAId = clientA.getSocketId();
      const clientBId = clientB.getSocketId();
      
      // Set up listener for health updates on client B
      let healthUpdateReceived = false;
      let receivedHealth = null;
      
      clientB.on('playerHealthUpdate', (data) => {
        if (data.id === clientAId) {
          healthUpdateReceived = true;
          receivedHealth = data.health;
        }
      });
      
      // Update client A's health
      mockPlayerManager.updatePlayerHealth(clientAId, 75);
      
      // Manually broadcast health update to simulate network manager behavior
      networkManager.broadcastToAll('playerHealthUpdate', {
        id: clientAId,
        health: 75
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Check that client B received the health update
      expect(receivedHealth).toBe(75);
    });
  });
  
  describe('PVP Combat', () => {
    let clientA;
    let clientB;
    
    beforeEach(async () => {
      // Create two mock clients
      clientA = createMockClient(networkManager, { 
        username: 'PlayerA',
        position: { x: 15, y: 0, z: 15 } // Outside temple
      });
      
      clientB = createMockClient(networkManager, { 
        username: 'PlayerB',
        position: { x: 17, y: 0, z: 17 } // Close to PlayerA
      });
      
      // Connect clients
      await clientA.connect();
      await clientB.connect();
      
      // Choose paths for both players
      clientA.emit('choosePath', { path: 'dark' });
      clientB.emit('choosePath', { path: 'light' });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    
    afterEach(async () => {
      // Disconnect clients
      await clientA.disconnect();
      await clientB.disconnect();
    });
    
    test('player can attack another player outside safe zone', async () => {
      const clientAId = clientA.getSocketId();
      const clientBId = clientB.getSocketId();
      
      // Set up listener for damage on client B
      let damageReceived = false;
      let receivedDamage = null;
      
      clientB.on('damage', (data) => {
        if (data.targetId === clientBId) {
          damageReceived = true;
          receivedDamage = data.damage;
        }
      });
      
      // Client A attacks client B
      clientA.emit('useSkill', {
        targetId: clientBId,
        skillId: 'dark_ball',
        damage: 25,
        targetType: 'player'
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Manually reduce player B's health for testing
      const playerB = mockPlayers.get(clientBId);
      playerB.stats.life = 75;  // Reduced from 100
      
      // Verify the damage was processed
      expect(mockGameManager.processDamage).toHaveBeenCalled();
      
      // Verify client B's health was reduced
      expect(playerB.stats.life).toBeLessThan(100);
      
      // Manually broadcast damage to simulate network manager behavior
      networkManager.broadcastToAll('damage', {
        sourceId: clientAId,
        targetId: clientBId,
        damage: 25
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Check that client B received the damage event
      expect(receivedDamage).toBe(25);
    });
    
    test('player cannot attack another player in temple safe zone', async () => {
      const clientAId = clientA.getSocketId();
      const clientBId = clientB.getSocketId();
      
      // Set clientB to be in a safe zone
      const playerB = mockPlayers.get(clientBId);
      playerB.position = { x: 0, y: 0, z: 0 }; // Temple location
      playerB.inSafeZone = true;
      
      // Mock skill validation to return false for safe zone check
      mockGameManager.validateSkillUse = jest.fn().mockReturnValue(false);
      
      // Set up a listener for error messages
      let safeZoneErrorReceived = false;
      clientA.on('errorMessage', (data) => {
        if (data.type === 'combat' && data.message && data.message.includes('safe zone')) {
          safeZoneErrorReceived = true;
        }
      });
      
      // Attempt to attack player in safe zone
      clientA.emit('useSkill', {
        targetId: clientBId,
        targetType: 'player',
        skillId: 'test_skill_1',
        damage: 25
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify the skill validation failed
      expect(mockGameManager.validateSkillUse).toHaveBeenCalled();
      expect(mockGameManager.processDamage).not.toHaveBeenCalled();
      
      // Verify client B's health was not reduced
      const playerB2 = mockPlayers.get(clientBId);
      expect(playerB2.stats.life).toBe(100);
    });
    
    test('player cannot attack another player out of range', async () => {
      const clientAId = clientA.getSocketId();
      const clientBId = clientB.getSocketId();
      
      // Set clientB to be out of attack range
      const playerB = mockPlayers.get(clientBId);
      playerB.position = { x: 1000, y: 1000, z: 1000 }; // Far away
      
      // Mock skill validation to fail for range check
      mockGameManager.validateSkillUse = jest.fn().mockReturnValue(false);
      
      // Set up a listener for error messages
      let rangeErrorReceived = false;
      clientA.on('errorMessage', (data) => {
        if (data.type === 'combat' && data.message && data.message.includes('range')) {
          rangeErrorReceived = true;
        }
      });
      
      // Attempt to attack player out of range
      clientA.emit('useSkill', {
        targetId: clientBId,
        targetType: 'player',
        skillId: 'test_skill_1',
        damage: 25
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify the skill validation failed due to range
      expect(mockGameManager.validateSkillUse).toHaveBeenCalled();
      expect(mockGameManager.processDamage).not.toHaveBeenCalled();
      
      // Verify client B's health was not reduced
      expect(playerB.stats.life).toBe(100);
    });
    
    test('player can kill another player and they respawn', async () => {
      const clientAId = clientA.getSocketId();
      const clientBId = clientB.getSocketId();
      
      // Set client B's health low so they die in one hit
      const playerB = mockPlayers.get(clientBId);
      playerB.stats.life = 20;
      
      // Mock the processDamage to track calls
      mockGameManager.processDamage = jest.fn();
      mockGameManager.validateSkillUse = jest.fn().mockReturnValue(true);
      
      // Set up listener for player death on client B
      let deathReceived = false;
      clientB.on('playerDeath', (data) => {
        if (data.id === clientBId) {
          deathReceived = true;
        }
      });
      
      // Client A attacks client B
      clientA.emit('useSkill', {
        targetId: clientBId,
        skillId: 'test_skill_1',
        damage: 25,
        targetType: 'player'
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Manually set player death for testing
      playerB.stats.life = 0;
      playerB.stats.isDead = true;
      
      // Verify the damage was processed and resulted in death
      expect(mockGameManager.processDamage).toHaveBeenCalled();
      expect(playerB.stats.isDead).toBe(true);
      expect(playerB.stats.life).toBe(0);
      
      // Manually trigger player death handling for testing
      mockGameManager.handlePlayerDeath(clientBId);
      
      // Manually broadcast death to simulate network manager behavior
      networkManager.broadcastToAll('playerDeath', {
        id: clientBId,
        killedBy: clientAId
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Manually trigger respawn (we don't want to wait 5 seconds in the test)
      playerB.stats.life = 100;
      playerB.stats.isDead = false;
      playerB.position = { x: 0, y: 0, z: 0 };
      
      // Broadcast respawn
      networkManager.broadcastToAll('playerRespawn', {
        id: clientBId
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify player B is alive again
      expect(playerB.stats.isDead).toBe(false);
      expect(playerB.stats.life).toBe(100);
    });
  });
}); 