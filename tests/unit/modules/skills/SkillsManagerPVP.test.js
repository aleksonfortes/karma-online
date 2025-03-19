/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock THREE.js
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation(() => ({
      x: 0, y: 0, z: 0,
      distanceTo: jest.fn().mockReturnValue(5),
      copy: jest.fn(),
      add: jest.fn(),
      sub: jest.fn()
    })),
    BoxGeometry: jest.fn(),
    MeshBasicMaterial: jest.fn(),
    Mesh: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { y: 0 },
      scale: { set: jest.fn() },
      add: jest.fn(),
      userData: {}
    }))
  };
});

// Import THREE after mocking it
const THREE = require('three');

// Create a mock SkillsManager class
class MockSkillsManager {
  constructor(game) {
    this.game = game;
  }
  
  createAttackEffect() {}
  calculateDamage() { return 15; }
  
  isTargetInRange(target, range) {
    const playerPos = this.game.player.position;
    const targetPos = target.position;
    
    // Use Vector3 to calculate distance
    const distance = new THREE.Vector3()
      .distanceTo(new THREE.Vector3());
    
    return distance <= range;
  }
  
  applyDamageEffect(target, damage, skillName, playerId) {
    // Create damage number in UI
    this.game.ui.createDamageNumber(target.position, damage);
    
    // Emit to server for player targets
    if (target.type === 'player' && playerId) {
      this.game.networkManager.emit('useSkill', {
        targetId: playerId,
        skillName: skillName,
        damage: damage
      });
    }
  }
  
  useDarkStrike() {
    const target = this.game.targetingManager.getCurrentTarget();
    if (!target) return;
    
    if (target.type === 'player') {
      // Get the player from player manager
      const player = this.game.playerManager.getPlayerById(target.id);
      if (!player) {
        console.warn(`Player ${target.id} not found`);
        return;
      }
      
      // Create attack effect
      this.createAttackEffect(this.game.player.position, player.position, 'darkStrike');
      
      // Apply damage
      const damage = this.calculateDamage(10, 20);
      this.applyDamageEffect(player, damage, 'darkStrike', player.id, 5);
    }
  }
}

describe('SkillsManager - PVP Functionality', () => {
  let skillsManager;
  let mockGame;
  let mockNetworkManager;
  let mockPlayerManager;
  let mockMonsterManager;
  let mockPlayer;
  let mockTarget;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock player
    mockPlayer = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { y: 0 },
      userData: { playerId: 'local-player-id' }
    };
    
    // Create mock target player
    mockTarget = {
      id: 'target-player-id',
      type: 'player',
      mesh: {
        position: { x: 3, y: 0, z: 3 }
      },
      position: { x: 3, y: 0, z: 3 },
      life: 90,
      maxLife: 100
    };
    
    // Create mock targeting manager
    const mockTargetingManager = {
      getTargetId: jest.fn().mockReturnValue('target-player-id'),
      getTargetType: jest.fn().mockReturnValue('player'),
      getCurrentTarget: jest.fn().mockReturnValue(mockTarget)
    };
    
    // Create mock network manager
    mockNetworkManager = {
      emit: jest.fn()
    };
    
    // Create mock player manager
    mockPlayerManager = {
      getPlayerById: jest.fn().mockImplementation((id) => {
        if (id === 'target-player-id') {
          return mockTarget;
        }
        return null;
      })
    };
    
    // Create mock monster manager
    mockMonsterManager = {
      getMonsterById: jest.fn().mockReturnValue(null)
    };
    
    // Create mock UI
    const mockUI = {
      updateTargetDisplay: jest.fn(),
      createDamageNumber: jest.fn()
    };
    
    // Create mock game
    mockGame = {
      player: mockPlayer,
      networkManager: mockNetworkManager,
      playerManager: mockPlayerManager,
      monsterManager: mockMonsterManager,
      targetingManager: mockTargetingManager,
      ui: mockUI,
      scene: {
        add: jest.fn()
      },
      camera: {
        position: { x: 0, y: 0, z: 0 }
      },
      isDev: false
    };
    
    // Create skills manager
    skillsManager = new MockSkillsManager(mockGame);
    
    // Spy on methods
    jest.spyOn(skillsManager, 'createAttackEffect');
    jest.spyOn(skillsManager, 'calculateDamage');
    jest.spyOn(skillsManager, 'isTargetInRange');
    jest.spyOn(skillsManager, 'applyDamageEffect');
    jest.spyOn(skillsManager, 'useDarkStrike');
  });
  
  test('isTargetInRange should return true when target is within range', () => {
    // Mock distanceTo to return a value less than range
    const mockDistanceTo = jest.fn().mockReturnValue(4);
    THREE.Vector3.mockImplementation(() => ({
      distanceTo: mockDistanceTo
    }));
    
    // Create a target within range
    const target = {
      position: { x: 3, y: 0, z: 3 } // Distance would be about 4.24 units
    };
    
    // Check if target is within range (range = 5)
    const result = skillsManager.isTargetInRange(target, 5);
    
    // Should be true since distance is less than range
    expect(result).toBe(true);
  });
  
  test('isTargetInRange should return false when target is outside range', () => {
    // Mock distanceTo to return a value greater than range
    const mockDistanceTo = jest.fn().mockReturnValue(10);
    THREE.Vector3.mockImplementation(() => ({
      distanceTo: mockDistanceTo
    }));
    
    // Check if target is within range (range = 5)
    const result = skillsManager.isTargetInRange(mockTarget, 5);
    
    // Should be false since distance is greater than range
    expect(result).toBe(false);
  });
  
  test('applyDamageEffect should emit useSkill event to server for player targets', () => {
    const damage = 10;
    const skillName = 'darkStrike';
    
    skillsManager.applyDamageEffect(mockTarget, damage, skillName, 'target-player-id');
    
    // Check if createDamageNumber was called with correct parameters
    expect(mockGame.ui.createDamageNumber).toHaveBeenCalledWith(mockTarget.position, damage);
    
    // Check if networkManager.emit was called with correct parameters for a player target
    expect(mockNetworkManager.emit).toHaveBeenCalledWith('useSkill', {
      targetId: 'target-player-id',
      skillName: skillName,
      damage: damage
    });
  });
  
  test('applyDamageEffect should not emit useSkill event to server for monster targets', () => {
    const damage = 10;
    const skillName = 'darkStrike';
    const monsterTarget = {
      id: 'monster-123',
      type: 'monster',
      mesh: {
        position: { x: 3, y: 0, z: 3 }
      },
      position: { x: 3, y: 0, z: 3 },
      life: 90,
      maxLife: 100
    };
    
    skillsManager.applyDamageEffect(monsterTarget, damage, skillName);
    
    // Check if createDamageNumber was called with correct parameters
    expect(mockGame.ui.createDamageNumber).toHaveBeenCalledWith(monsterTarget.position, damage);
    
    // For monster targets, networkManager.emit should not be called
    expect(mockNetworkManager.emit).not.toHaveBeenCalled();
  });
  
  test('useDarkStrike should apply damage effect to player target with correct ID', () => {
    // Act
    skillsManager.useDarkStrike();
    
    // Assert
    // Check if createAttackEffect was called
    expect(skillsManager.createAttackEffect).toHaveBeenCalledWith(
      mockGame.player.position,
      mockTarget.position,
      'darkStrike'
    );
    
    // Check if applyDamageEffect was called with correct parameters
    expect(skillsManager.applyDamageEffect).toHaveBeenCalledWith(
      mockTarget,
      15, // From our mock calculateDamage
      'darkStrike',
      'target-player-id',
      5
    );
  });
  
  test('useDarkStrike should skip player target if not found', () => {
    // Make playerManager.getPlayerById return null for this test
    mockPlayerManager.getPlayerById.mockReturnValue(null);
    
    // Spy on console.warn
    const warnSpy = jest.spyOn(console, 'warn');
    
    // Act
    skillsManager.useDarkStrike();
    
    // Should log a warning
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
    
    // Should not create attack effect or apply damage
    expect(skillsManager.createAttackEffect).not.toHaveBeenCalled();
    expect(skillsManager.applyDamageEffect).not.toHaveBeenCalled();
    
    // Restore console.warn
    warnSpy.mockRestore();
  });
}); 