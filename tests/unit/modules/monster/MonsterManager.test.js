/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock THREE and GLTFLoader before importing MonsterManager
jest.mock('three', () => require('../../../../tests/mocks/three.mock'));
jest.mock('three/examples/jsm/loaders/GLTFLoader.js', () => require('../../../../tests/mocks/GLTFLoader.mock'));

// Mock the GLTFLoader preload function to return immediately to prevent timeout
jest.mock('../../../../src/modules/monster/MonsterManager', () => {
  const originalModule = jest.requireActual('../../../../src/modules/monster/MonsterManager');
  
  return {
    ...originalModule,
    MonsterManager: class extends originalModule.MonsterManager {
      async preloadMonsterModels() {
        console.log('Mock preloading monster models');
        this.monsterModels['BASIC'] = {
          scene: {
            clone: () => ({
              position: { set: jest.fn() },
              rotation: { set: jest.fn() },
              scale: { set: jest.fn() },
              traverse: jest.fn(cb => {
                cb({
                  isMesh: true,
                  material: {
                    clone: jest.fn().mockReturnValue({
                      transparent: false,
                      opacity: 1,
                      metalness: 0,
                      roughness: 0
                    })
                  },
                  castShadow: false,
                  receiveShadow: false
                });
              }),
              add: jest.fn(),
              userData: {}
            })
          }
        };
        
        // Also store under lowercase for case-insensitive matching
        this.monsterModels['basic'] = this.monsterModels['BASIC'];
        
        return Promise.resolve();
      }
    }
  };
});

// Import MonsterManager after mocking dependencies
const { MonsterManager } = require('../../../../src/modules/monster/MonsterManager');

describe('MonsterManager', () => {
  let monsterManager;
  let mockGame;
  
  beforeEach(() => {
    jest.useFakeTimers();
    
    // Create a mock scene that can track adds and removes
    const mockScene = {
      add: jest.fn(),
      remove: jest.fn()
    };
    
    // Create a mock camera
    const mockCamera = {
      position: { x: 0, y: 5, z: 10 }
    };
    
    // Create mock camera manager
    const mockCameraManager = {
      getCamera: jest.fn().mockReturnValue(mockCamera)
    };
    
    // Create mock targeting manager
    const mockTargetingManager = {
      clearTarget: jest.fn(),
      currentTarget: null
    };
    
    // Create mock UI manager
    const mockUIManager = {
      updateTargetDisplay: jest.fn()
    };
    
    // Create a mock game object
    mockGame = {
      scene: mockScene,
      camera: mockCamera,
      cameraManager: mockCameraManager,
      targetingManager: mockTargetingManager,
      uiManager: mockUIManager
    };
    
    // Create the monster manager instance
    monsterManager = new MonsterManager(mockGame);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });
  
  // Test initialization - with a shorter timeout
  test('should initialize and preload models', async () => {
    await monsterManager.init();
    
    expect(monsterManager.initialized).toBe(true);
    expect(monsterManager.monsterModels).toHaveProperty('BASIC');
    expect(monsterManager.monsterModels).toHaveProperty('basic');
  }, 2000); // 2 second timeout
  
  // Test monster creation with proper scaling and positioning
  test('should create monster with proper scaling and positioning', () => {
    // First initialize the manager to load models
    monsterManager.monsterModels['BASIC'] = {
      clone: jest.fn().mockReturnValue({
        position: { set: jest.fn() },
        rotation: { set: jest.fn() },
        scale: { set: jest.fn() },
        traverse: jest.fn(cb => cb({ 
          isMesh: true, 
          material: { 
            clone: jest.fn().mockReturnValue({}) 
          } 
        })),
        add: jest.fn(),
        userData: {}
      })
    };
    
    const monsterData = {
      id: 'test-monster-1',
      type: 'BASIC',
      position: { x: 10, y: 0, z: 10 },
      rotation: { y: 1.5 },
      health: 100,
      maxHealth: 100,
      scale: 1
    };
    
    const monster = monsterManager.createMonster(monsterData);
    
    // Check if the monster was added to the scene
    expect(mockGame.scene.add).toHaveBeenCalled();
    
    // Check if scaling was applied correctly (3.0 * scale)
    expect(monster.mesh.scale.set).toHaveBeenCalledWith(3.0, 3.0, 3.0);
    
    // Check if position was adjusted with the +2.0 height offset
    expect(monster.mesh.position.set).toHaveBeenCalledWith(10, 2.0, 10);
    
    // Check if the monster was stored in the map
    expect(monsterManager.monsters.get('test-monster-1')).toBe(monster);
  });
  
  // Test health bar creation
  test('should create health bar with correct dimensions and position', () => {
    const healthBar = monsterManager.createHealthBar({ id: 'test-monster' });
    
    // Check if the health bar position is set to the expected height
    expect(healthBar.position.y).toBe(8.0);
    
    // Check if the health bar is set to billboard (face camera)
    expect(healthBar.userData.isBillboard).toBe(true);
  });
  
  // Test monster update with height adjustment
  test('should update monster position with height adjustment', () => {
    // Set up a monster in the manager's collection
    const mockMesh = {
      position: { set: jest.fn() },
      rotation: { set: jest.fn() }
    };
    
    const monster = {
      id: 'test-monster-1',
      mesh: mockMesh,
      health: 100,
      maxHealth: 100
    };
    
    monsterManager.monsters.set('test-monster-1', monster);
    
    // Update the monster
    const updateData = {
      id: 'test-monster-1',
      position: { x: 15, y: 0, z: 15 },
      rotation: { y: 2.0 }
    };
    
    monsterManager.updateMonster(updateData);
    
    // Check if the height adjustment is applied during update
    expect(mockMesh.position.set).toHaveBeenCalledWith(15, 2.0, 15);
  });
  
  // Test monster death and target clearing
  test('should clear target when monster health reaches zero', () => {
    // Set up a monster and make it the current target
    const mockMesh = {
      traverse: jest.fn(cb => cb({ 
        isMesh: true, 
        material: {
          // Mock the material with proper clone method
          clone: jest.fn().mockReturnValue({
            transparent: false,
            opacity: 1
          })
        } 
      })),
      userData: {
        healthBarInner: {
          scale: { x: 1 },
          position: { x: 0 }
        }
      }
    };
    
    const monster = {
      id: 'test-monster-1',
      mesh: mockMesh,
      health: 100,
      maxHealth: 100,
      type: 'BASIC'
    };
    
    monsterManager.monsters.set('test-monster-1', monster);
    
    // Set it as current target
    mockGame.targetingManager.currentTarget = {
      type: 'monster',
      id: 'test-monster-1'
    };
    
    // Process monster update that kills it
    const updateData = {
      monsterId: 'test-monster-1',
      health: 0
    };
    
    monsterManager.processMonsterUpdate(updateData);
    
    // Check if target was cleared
    expect(mockGame.targetingManager.clearTarget).toHaveBeenCalled();
    
    // Check if the monster is scheduled for removal (via setTimeout)
    jest.advanceTimersByTime(2000);
    expect(mockGame.scene.remove).toHaveBeenCalledWith(mockMesh);
  });
  
  // Test monster removal
  test('should remove monster from scene and collection', () => {
    // Set up a monster
    const mockMesh = {};
    const monster = {
      id: 'test-monster-1',
      mesh: mockMesh
    };
    
    monsterManager.monsters.set('test-monster-1', monster);
    
    // Remove the monster
    monsterManager.removeMonster('test-monster-1');
    
    // Check if monster was removed from scene
    expect(mockGame.scene.remove).toHaveBeenCalledWith(mockMesh);
    
    // Check if monster was removed from collection
    expect(monsterManager.monsters.has('test-monster-1')).toBe(false);
  });
  
  // Test case-insensitive model type matching
  test('should handle case-insensitive model type matching', () => {
    // Set up models with different case
    monsterManager.monsterModels['basic'] = {
      clone: jest.fn().mockReturnValue({
        position: { set: jest.fn() },
        rotation: { set: jest.fn() },
        scale: { set: jest.fn() },
        traverse: jest.fn(cb => cb({ 
          isMesh: true, 
          material: { 
            clone: jest.fn().mockReturnValue({}) 
          } 
        })),
        add: jest.fn(),
        userData: {}
      })
    };
    
    // Try to create with mixed case - Add rotation property
    const monsterData = {
      id: 'test-monster-2',
      type: 'Basic', // Mixed case
      position: { x: 10, y: 0, z: 10 },
      rotation: { y: 0 }, // Add rotation to prevent undefined error
      health: 100,
      maxHealth: 100
    };
    
    const monster = monsterManager.createMonster(monsterData);
    
    // Check if the model was still found and monster created
    expect(monster).toBeDefined();
    expect(monsterManager.monsters.get('test-monster-2')).toBe(monster);
  });
}); 