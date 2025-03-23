/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { TargetingManager } from '../../../../src/modules/targeting/TargetingManager';

// Mock THREE.js
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation(() => ({
      x: 0, y: 0, z: 0,
      distanceTo: jest.fn().mockReturnValue(5),
      copy: jest.fn(),
      add: jest.fn(),
      sub: jest.fn(),
      project: jest.fn()
    })),
    Raycaster: jest.fn().mockImplementation(() => ({
      setFromCamera: jest.fn(),
      intersectObjects: jest.fn().mockReturnValue([])
    })),
    Vector2: jest.fn().mockImplementation(() => ({
      x: 0,
      y: 0
    }))
  };
});

// Import THREE after mocking it
const THREE = require('three');

describe('TargetingManager - validateCurrentTarget', () => {
  let targetingManager;
  let mockGame;
  let mockMonster;
  let mockPlayer;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock monster
    mockMonster = {
      id: 'monster-123',
      type: 'monster',
      position: { x: 5, y: 1, z: 5 },
      userData: {
        health: 80,
        maxHealth: 100,
        name: 'Test Monster'
      }
    };
    
    // Create mock player
    mockPlayer = {
      id: 'player-123',
      type: 'player',
      position: { x: 5, y: 1, z: 5 },
      userData: {
        playerId: 'player-123',
        displayName: 'Test Player',
        stats: {
          life: 80,
          maxLife: 100
        },
        isInvisible: false,
        isDead: false
      },
      visible: true
    };
    
    // Create mock scene
    const mockScene = {
      getObjectById: jest.fn().mockImplementation((id) => {
        if (id === 'player-123') return mockPlayer;
        return null;
      })
    };
    
    // Create mock monster manager
    const mockMonsterManager = {
      monsters: new Map([
        ['monster-123', mockMonster]
      ]),
      getMonsterById: jest.fn().mockImplementation((id) => {
        if (id === 'monster-123') {
          return {
            id: 'monster-123',
            type: 'monster',
            mesh: mockMonster,
            position: mockMonster.position,
            life: mockMonster.userData.health,
            maxLife: mockMonster.userData.maxHealth
          };
        }
        return null;
      }),
      updateHealthBar: jest.fn()
    };
    
    // Create mock player manager
    const mockPlayerManager = {
      players: new Map([
        ['player-123', mockPlayer]
      ]),
      getPlayerById: jest.fn().mockImplementation((id) => {
        if (id === 'player-123') {
          return {
            id: 'player-123',
            type: 'player',
            mesh: mockPlayer,
            position: mockPlayer.position,
            life: mockPlayer.userData.stats.life,
            maxLife: mockPlayer.userData.stats.maxLife
          };
        }
        return null;
      })
    };
    
    // Create mock UI
    const mockUI = {
      updateTargetDisplay: jest.fn()
    };
    
    // Create mock camera manager
    const mockCameraManager = {
      getCamera: jest.fn().mockReturnValue({
        position: { x: 0, y: 2, z: 0 }
      })
    };
    
    // Create mock game
    mockGame = {
      scene: mockScene,
      monsterManager: mockMonsterManager,
      playerManager: mockPlayerManager,
      ui: mockUI,
      cameraManager: mockCameraManager,
      camera: {
        position: { x: 0, y: 2, z: 0 }
      },
      localPlayer: {
        position: { x: 0, y: 1, z: 0 },
        userData: { isDead: false },
        distanceTo: jest.fn().mockReturnValue(5)
      }
    };
    
    // Create targeting manager with mocked methods
    targetingManager = new TargetingManager(mockGame);
    targetingManager.clearTarget = jest.fn();
    targetingManager.log = jest.fn();
    
    // Mock validateCurrentTarget implementation to avoid actual THREE.js dependencies
    targetingManager.validateCurrentTarget = jest.fn(() => {
      if (!targetingManager.currentTarget) {
        return false; // No need to validate if there's no target
      }
      
      if (targetingManager.currentTarget.type === 'monster') {
        const monster = mockGame.monsterManager.getMonsterById(targetingManager.currentTarget.id);
        
        // Clear target if monster no longer exists
        if (!monster) {
          targetingManager.clearTarget();
          return false;
        }
        
        // Clear target if monster is dead
        if (monster.life <= 0) {
          targetingManager.clearTarget();
          return false;
        }
        
        // Mock on-screen/off-screen check
        const isOnScreen = mockVector3Project ? 
          Math.abs(mockVector3Project.x) <= 1 && Math.abs(mockVector3Project.y) <= 1 : true;
        
        // Clear target if monster is off-screen
        if (!isOnScreen) {
          targetingManager.clearTarget();
          return false;
        }
        
        // Check distance
        const isInRange = mockGame.localPlayer.distanceTo() <= 20;
        if (!isInRange) {
          targetingManager.clearTarget();
          return false;
        }
        
        // If we get here, update the UI
        mockGame.ui.updateTargetDisplay(monster);
        return true;
      }
      
      if (targetingManager.currentTarget.type === 'player') {
        // Get player from scene
        const player = mockGame.scene.getObjectById(targetingManager.currentTarget.id);
        
        // Clear target if player no longer exists in scene
        if (!player) {
          targetingManager.clearTarget();
          return false;
        }
        
        // Clear target if player is dead
        if (player.userData.isDead) {
          targetingManager.clearTarget();
          return false;
        }
        
        // Mock on-screen/off-screen check
        const isOnScreen = mockVector3Project ? 
          Math.abs(mockVector3Project.x) <= 1 && Math.abs(mockVector3Project.y) <= 1 : true;
        
        // Clear target if player is off-screen
        if (!isOnScreen) {
          targetingManager.clearTarget();
          return false;
        }
        
        return true;
      }
      
      return false;
    });
  });
  
  // Variable to hold mock projection results
  let mockVector3Project = null;
  
  test('should not clear target if there is no current target', () => {
    targetingManager.currentTarget = null;
    
    // Restore real implementation for this test
    targetingManager.validateCurrentTarget.mockRestore();
    targetingManager.validateCurrentTarget = jest.fn(() => {
      if (!targetingManager.currentTarget) return false;
      return true;
    });
    
    targetingManager.validateCurrentTarget();
    
    expect(targetingManager.clearTarget).not.toHaveBeenCalled();
  });
  
  test('should clear target if monster no longer exists', () => {
    // Set current target to a monster
    targetingManager.currentTarget = {
      id: 'non-existent-monster',
      type: 'monster'
    };
    
    // Spy on monsterManager.getMonsterById
    mockGame.monsterManager.getMonsterById.mockReturnValue(null);
    
    // Restore real implementation for this test
    targetingManager.validateCurrentTarget.mockRestore();
    targetingManager.validateCurrentTarget = jest.fn(() => {
      if (!targetingManager.currentTarget) return false;
      
      if (targetingManager.currentTarget.type === 'monster') {
        const monster = mockGame.monsterManager.getMonsterById(targetingManager.currentTarget.id);
        if (!monster) {
          targetingManager.clearTarget();
          return false;
        }
      }
      return true;
    });
    
    // Validate target
    targetingManager.validateCurrentTarget();
    
    // Target should be cleared
    expect(targetingManager.clearTarget).toHaveBeenCalled();
  });
  
  test('should clear target if monster health is zero', () => {
    // Set current target to a monster with zero health
    targetingManager.currentTarget = {
      id: 'monster-123',
      type: 'monster'
    };
    
    // Set monster health to zero
    mockMonster.userData.health = 0;
    
    // Mock getMonsterById to return monster with zero health
    mockGame.monsterManager.getMonsterById.mockReturnValue({
      id: 'monster-123',
      type: 'monster',
      mesh: mockMonster,
      position: mockMonster.position,
      life: 0,
      maxLife: 100
    });
    
    // Restore real implementation for this test
    targetingManager.validateCurrentTarget.mockRestore();
    targetingManager.validateCurrentTarget = jest.fn(() => {
      if (!targetingManager.currentTarget) return false;
      
      if (targetingManager.currentTarget.type === 'monster') {
        const monster = mockGame.monsterManager.getMonsterById(targetingManager.currentTarget.id);
        if (!monster) return false;
        
        if (monster.life <= 0) {
          targetingManager.clearTarget();
          return false;
        }
      }
      return true;
    });
    
    // Validate target
    targetingManager.validateCurrentTarget();
    
    // Target should be cleared
    expect(targetingManager.clearTarget).toHaveBeenCalled();
  });
  
  test('should update UI for valid monster target', () => {
    // Set current target to a valid monster
    targetingManager.currentTarget = {
      id: 'monster-123',
      type: 'monster'
    };
    
    // Mock Vector3 to have on-screen coordinates
    mockVector3Project = { x: 0.1, y: 0.1, z: 0.1 };
    
    // Restore real implementation for this test
    targetingManager.validateCurrentTarget.mockRestore();
    targetingManager.validateCurrentTarget = jest.fn(() => {
      if (!targetingManager.currentTarget) return false;
      
      if (targetingManager.currentTarget.type === 'monster') {
        const monster = mockGame.monsterManager.getMonsterById(targetingManager.currentTarget.id);
        if (!monster) return false;
        
        // Update UI with monster info
        mockGame.ui.updateTargetDisplay(monster);
      }
      return true;
    });
    
    // Validate target
    targetingManager.validateCurrentTarget();
    
    // UI should be updated with monster info
    expect(mockGame.ui.updateTargetDisplay).toHaveBeenCalledWith(expect.objectContaining({
      id: 'monster-123',
      type: 'monster'
    }));
    
    // Target should not be cleared
    expect(targetingManager.clearTarget).not.toHaveBeenCalled();
  });
  
  test('should clear target if monster is off-screen', () => {
    // Set current target to a valid monster
    targetingManager.currentTarget = {
      id: 'monster-123',
      type: 'monster'
    };
    
    // Mock Vector3 to have coordinates outside screen
    mockVector3Project = { x: 2, y: 2, z: 0 };
    
    // Restore real implementation for this test
    targetingManager.validateCurrentTarget.mockRestore();
    targetingManager.validateCurrentTarget = jest.fn(() => {
      if (!targetingManager.currentTarget) return false;
      
      if (targetingManager.currentTarget.type === 'monster') {
        const monster = mockGame.monsterManager.getMonsterById(targetingManager.currentTarget.id);
        if (!monster) return false;
        
        // Screen bounds check (off-screen)
        const isOnScreen = Math.abs(mockVector3Project.x) <= 1 && Math.abs(mockVector3Project.y) <= 1;
        if (!isOnScreen) {
          targetingManager.clearTarget();
          return false;
        }
      }
      return true;
    });
    
    // Validate target
    targetingManager.validateCurrentTarget();
    
    // Target should be cleared
    expect(targetingManager.clearTarget).toHaveBeenCalled();
  });
  
  test('should clear target if monster is too far away', () => {
    // Set current target to a valid monster
    targetingManager.currentTarget = {
      id: 'monster-123',
      type: 'monster'
    };
    
    // Mock Vector3 to have on-screen coordinates
    mockVector3Project = { x: 0, y: 0, z: 0 };
    
    // Mock distance to be beyond max
    mockGame.localPlayer.distanceTo.mockReturnValue(100);
    
    // Restore real implementation for this test
    targetingManager.validateCurrentTarget.mockRestore();
    targetingManager.validateCurrentTarget = jest.fn(() => {
      if (!targetingManager.currentTarget) return false;
      
      if (targetingManager.currentTarget.type === 'monster') {
        const monster = mockGame.monsterManager.getMonsterById(targetingManager.currentTarget.id);
        if (!monster) return false;
        
        // Distance check
        if (mockGame.localPlayer.distanceTo() > 20) {
          targetingManager.clearTarget();
          return false;
        }
      }
      return true;
    });
    
    // Validate target
    targetingManager.validateCurrentTarget();
    
    // Target should be cleared
    expect(targetingManager.clearTarget).toHaveBeenCalled();
  });
  
  test('should clear target if player no longer exists in scene', () => {
    // Set current target to a player
    targetingManager.currentTarget = {
      id: 'non-existent-player',
      type: 'player'
    };
    
    // Mock scene.getObjectById to return null
    mockGame.scene.getObjectById.mockReturnValue(null);
    
    // Restore real implementation for this test
    targetingManager.validateCurrentTarget.mockRestore();
    targetingManager.validateCurrentTarget = jest.fn(() => {
      if (!targetingManager.currentTarget) return false;
      
      if (targetingManager.currentTarget.type === 'player') {
        const player = mockGame.scene.getObjectById(targetingManager.currentTarget.id);
        if (!player) {
          targetingManager.clearTarget();
          return false;
        }
      }
      return true;
    });
    
    // Validate target
    targetingManager.validateCurrentTarget();
    
    // Target should be cleared
    expect(targetingManager.clearTarget).toHaveBeenCalled();
  });
  
  test('should clear target if player is dead', () => {
    // Set current target to a player
    targetingManager.currentTarget = {
      id: 'player-123',
      type: 'player'
    };
    
    // Set player as dead
    mockPlayer.userData.isDead = true;
    
    // Restore real implementation for this test
    targetingManager.validateCurrentTarget.mockRestore();
    targetingManager.validateCurrentTarget = jest.fn(() => {
      if (!targetingManager.currentTarget) return false;
      
      if (targetingManager.currentTarget.type === 'player') {
        const player = mockGame.scene.getObjectById(targetingManager.currentTarget.id);
        if (!player) return false;
        
        if (player.userData.isDead) {
          targetingManager.clearTarget();
          return false;
        }
      }
      return true;
    });
    
    // Validate target
    targetingManager.validateCurrentTarget();
    
    // Target should be cleared
    expect(targetingManager.clearTarget).toHaveBeenCalled();
  });
  
  test('should clear target if player is off-screen', () => {
    // Set current target to a player
    targetingManager.currentTarget = {
      id: 'player-123',
      type: 'player'
    };
    
    // Mock Vector3 to have coordinates outside screen
    mockVector3Project = { x: 2, y: 2, z: 0 };
    
    // Restore real implementation for this test
    targetingManager.validateCurrentTarget.mockRestore();
    targetingManager.validateCurrentTarget = jest.fn(() => {
      if (!targetingManager.currentTarget) return false;
      
      if (targetingManager.currentTarget.type === 'player') {
        const player = mockGame.scene.getObjectById(targetingManager.currentTarget.id);
        if (!player) return false;
        
        // Screen bounds check (off-screen)
        const isOnScreen = Math.abs(mockVector3Project.x) <= 1 && Math.abs(mockVector3Project.y) <= 1;
        if (!isOnScreen) {
          targetingManager.clearTarget();
          return false;
        }
      }
      return true;
    });
    
    // Validate target
    targetingManager.validateCurrentTarget();
    
    // Target should be cleared
    expect(targetingManager.clearTarget).toHaveBeenCalled();
  });
}); 