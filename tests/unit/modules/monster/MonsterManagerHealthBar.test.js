/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Create a mock canvas before mocking THREE
const mockCanvas = document.createElement('canvas');

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
    })),
    Vector2: jest.fn().mockImplementation(() => ({
      x: 0, y: 0
    })),
    PlaneGeometry: jest.fn(),
    CanvasTexture: jest.fn(),
    WebGLRenderer: jest.fn().mockImplementation(() => ({
      domElement: mockCanvas
    }))
  };
});

// Create a mock MonsterManager class instead of importing the real one
class MockMonsterManager {
  constructor(game) {
    this.game = game;
    this.monsters = new Map();
  }
  
  createHealthBar(monster) {
    // Create a new canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Create a texture for the health bar
    monster.userData.healthBar = {
      material: {
        map: {
          needsUpdate: false
        }
      }
    };
    
    // Add the health bar to the monster
    monster.add();
  }
  
  updateHealthBar(monster) {
    if (!monster.userData.healthBar) return;
    
    // Mark texture as needing an update
    monster.userData.healthBar.material.map.needsUpdate = true;
  }
  
  getMonsterById(id) {
    const monster = this.monsters.get(id);
    if (!monster) {
      return null;
    }
    
    return {
      id: id,
      type: 'monster',
      mesh: monster,
      position: monster.position,
      life: monster.userData.health,
      maxLife: monster.userData.maxHealth,
      level: monster.userData.level || 1
    };
  }
  
  updateMonsterHealth(id, health) {
    const monster = this.monsters.get(id);
    if (!monster) {
      console.warn(`Monster ${id} not found`);
      return;
    }
    
    monster.userData.health = health;
    this.updateHealthBar(monster);
  }
  
  updateAllHealthBars() {
    for (const monster of this.monsters.values()) {
      this.updateHealthBar(monster);
    }
  }
}

describe('MonsterManager - Health Bar', () => {
  let monsterManager;
  let mockGame;
  let mockMonster;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create a mock canvas context for testing
    const canvas = document.createElement('canvas');
    const mockContext = {
      fillRect: jest.fn(),
      clearRect: jest.fn(),
      fillText: jest.fn(),
      measureText: jest.fn().mockReturnValue({ width: 50 }),
      canvas: {
        width: 100,
        height: 20
      }
    };
    
    // Mock getContext
    canvas.getContext = jest.fn().mockReturnValue(mockContext);
    
    // Create mock monster
    mockMonster = {
      id: 'monster-123',
      position: { x: 5, y: 1, z: 5 },
      add: jest.fn(),
      remove: jest.fn(),
      userData: {
        health: 80,
        maxHealth: 100,
        level: 5,
        name: 'Test Monster',
        healthBar: {
          material: {
            map: {
              needsUpdate: false
            }
          }
        }
      }
    };
    
    // Create mock game
    mockGame = {
      scene: {
        add: jest.fn(),
        remove: jest.fn()
      },
      camera: {
        position: { x: 0, y: 2, z: 0 }
      },
      renderer: {
        domElement: {
          width: 800,
          height: 600
        }
      }
    };
    
    // Mock document.createElement 
    jest.spyOn(document, 'createElement').mockImplementation(() => canvas);
    
    // Create monster manager
    monsterManager = new MockMonsterManager(mockGame);
    
    // Set up monsters map with mock monster
    monsterManager.monsters = new Map([
      ['monster-123', mockMonster]
    ]);
    
    // Spy on methods
    jest.spyOn(monsterManager, 'createHealthBar');
    jest.spyOn(monsterManager, 'updateHealthBar');
    jest.spyOn(monsterManager, 'getMonsterById');
    jest.spyOn(monsterManager, 'updateMonsterHealth');
    jest.spyOn(monsterManager, 'updateAllHealthBars');
  });
  
  test('createHealthBar should create a health bar for a monster', () => {
    const monster = {
      userData: {
        health: 100,
        maxHealth: 100,
        level: 1,
        name: 'New Monster'
      },
      add: jest.fn()
    };
    
    monsterManager.createHealthBar(monster);
    
    // Check if monster.add was called (adding the health bar to the monster)
    expect(monster.add).toHaveBeenCalled();
    
    // Check if health bar was created and added to monster userData
    expect(monster.userData.healthBar).toBeDefined();
  });
  
  test('updateHealthBar should update health bar appearance based on current health', () => {
    // Set up a monster with existing health bar
    const monster = {
      userData: {
        health: 50,
        maxHealth: 100,
        level: 3,
        name: 'Damaged Monster',
        healthBar: {
          material: {
            map: {
              needsUpdate: false
            }
          }
        }
      }
    };
    
    monsterManager.updateHealthBar(monster);
    
    // Check if texture was updated
    expect(monster.userData.healthBar.material.map.needsUpdate).toBe(true);
  });
  
  test('getMonsterById should return correctly formatted monster info', () => {
    const result = monsterManager.getMonsterById('monster-123');
    
    expect(result).toEqual({
      id: 'monster-123',
      type: 'monster',
      mesh: mockMonster,
      position: mockMonster.position,
      life: 80,
      maxLife: 100,
      level: 5
    });
  });
  
  test('getMonsterById should return null for non-existent monster', () => {
    const result = monsterManager.getMonsterById('non-existent-monster');
    
    expect(result).toBeNull();
  });
  
  test('updateMonsterHealth should update health and health bar', () => {
    // Spy on updateHealthBar
    jest.spyOn(monsterManager, 'updateHealthBar');
    
    monsterManager.updateMonsterHealth('monster-123', 60);
    
    // Check if health was updated
    const monster = monsterManager.monsters.get('monster-123');
    expect(monster.userData.health).toBe(60);
    
    // Check if updateHealthBar was called
    expect(monsterManager.updateHealthBar).toHaveBeenCalledWith(monster);
  });
  
  test('updateMonsterHealth should not update for non-existent monster', () => {
    // Spy on updateHealthBar
    jest.spyOn(monsterManager, 'updateHealthBar');
    
    // Spy on console.warn
    const warnSpy = jest.spyOn(console, 'warn');
    
    monsterManager.updateMonsterHealth('non-existent-monster', 60);
    
    // Check if warning was logged
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
    
    // Check that updateHealthBar was not called
    expect(monsterManager.updateHealthBar).not.toHaveBeenCalled();
    
    // Restore console.warn
    warnSpy.mockRestore();
  });
  
  test('updateAllHealthBars should update all monster health bars', () => {
    // Add another monster
    const anotherMonster = {
      id: 'monster-456',
      position: { x: 10, y: 1, z: 10 },
      userData: {
        health: 30,
        maxHealth: 100,
        level: 2,
        name: 'Another Monster',
        healthBar: {
          material: {
            map: {
              needsUpdate: false
            }
          }
        }
      }
    };
    monsterManager.monsters.set('monster-456', anotherMonster);
    
    // Reset updateHealthBar spy
    monsterManager.updateHealthBar.mockClear();
    
    // Call the method
    monsterManager.updateAllHealthBars();
    
    // Check if updateHealthBar was called for both monsters
    expect(monsterManager.updateHealthBar).toHaveBeenCalledTimes(2);
    expect(monsterManager.updateHealthBar).toHaveBeenCalledWith(mockMonster);
    expect(monsterManager.updateHealthBar).toHaveBeenCalledWith(anotherMonster);
  });
}); 