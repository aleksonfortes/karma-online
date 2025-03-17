/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MockTargetingManager } from './mockTargetingManager';
import { createTargetingTestSetup } from './targetingTestHelpers';

// Mock THREE.js
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation((x, y, z) => ({
      x: x || 0,
      y: y || 0,
      z: z || 0,
      distanceTo: jest.fn().mockReturnValue(2),
      copy: jest.fn(),
      add: jest.fn(),
      sub: jest.fn(),
      normalize: jest.fn().mockReturnThis(),
      multiplyScalar: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis()
    })),
    Vector2: jest.fn().mockImplementation((x, y) => ({
      x: x || 0,
      y: y || 0
    })),
    Raycaster: jest.fn().mockImplementation(() => ({
      set: jest.fn(),
      setFromCamera: jest.fn(),
      intersectObjects: jest.fn().mockReturnValue([]),
      intersectObject: jest.fn().mockReturnValue([])
    })),
    Scene: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      remove: jest.fn(),
      children: [],
      traverse: jest.fn()
    })),
    Mesh: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      add: jest.fn(),
      remove: jest.fn()
    })),
    Group: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      remove: jest.fn(),
      children: []
    })),
    MeshBasicMaterial: jest.fn(),
    CircleGeometry: jest.fn(),
    Object3D: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    }))
  };
});

describe('TargetingManager', () => {
  let targetingManager;
  let mockGame;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock window methods
    window.addEventListener = jest.fn();
    window.removeEventListener = jest.fn();
    
    // Create test setup
    const setup = createTargetingTestSetup();
    mockGame = setup.mockGame;
    targetingManager = setup.targetingManager;
    
    // Initialize the targeting manager
    targetingManager.init();
    
    // Mock the targetIndicator.position.copy method for tests
    targetingManager.targetIndicator.position.copy = jest.fn();
  });
  
  afterEach(() => {
    // Clean up
    jest.clearAllMocks();
    targetingManager.cleanup();
  });
  
  test('should initialize correctly', () => {
    expect(targetingManager).toBeDefined();
    expect(targetingManager.game).toBe(mockGame);
    expect(targetingManager.raycaster).toBeDefined();
    expect(targetingManager.mouse).toBeDefined();
    expect(targetingManager.targetIndicator).toBeDefined();
    expect(targetingManager.initialized).toBe(true);
  });
  
  test('should set up event listeners', () => {
    expect(window.addEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(window.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
  });
  
  test('should handle mouse movement', () => {
    // Create a mock mouse event
    const mockEvent = {
      clientX: 800,
      clientY: 600
    };
    
    // Call the handler directly
    targetingManager.handleMouseMove(mockEvent);
    
    // Verify mouse position was updated
    expect(targetingManager.mouse.x).not.toBe(0);
    expect(targetingManager.mouse.y).not.toBe(0);
  });
  
  test('should handle targeting', () => {
    // Mock raycaster to return an intersection
    const mockIntersection = {
      object: {
        userData: { isPlayer: true },
        parent: null,
        position: { x: 5, y: 0, z: 5 },
        id: 'remote-player-1'
      }
    };
    targetingManager.raycaster.intersectObjects.mockReturnValue([mockIntersection]);
    
    // Mock validateTargetWithServer to return true
    targetingManager.validateTargetWithServer.mockReturnValue(true);
    
    // Call the targeting handler
    const target = targetingManager.handleTargeting();
    
    // Verify raycaster was used
    expect(targetingManager.raycaster.setFromCamera).toHaveBeenCalled();
    expect(targetingManager.raycaster.intersectObjects).toHaveBeenCalled();
  });
  
  test('should set and clear targets', () => {
    // Create a mock target
    const mockTarget = {
      id: 'test-target',
      position: { x: 5, y: 0, z: 5, copy: jest.fn() },
      userData: { isPlayer: true }
    };
    
    // Mock validateTargetWithServer to return true
    targetingManager.validateTargetWithServer.mockReturnValue(true);
    
    // Set target
    targetingManager.setTarget(mockTarget);
    
    // Verify target was set
    expect(targetingManager.currentTarget).toBe(mockTarget);
    expect(targetingManager.targetIndicator.visible).toBe(true);
    
    // Clear target
    targetingManager.clearTarget();
    
    // Verify target was cleared
    expect(targetingManager.currentTarget).toBeNull();
    expect(targetingManager.targetIndicator.visible).toBe(false);
  });
  
  test('should update target indicator position', () => {
    // Create a mock target with position.copy spy
    const mockTarget = {
      id: 'test-target',
      position: { x: 5, y: 0, z: 5, copy: jest.fn() },
      userData: { isPlayer: true }
    };
    
    // Mock validateTargetWithServer to return true
    targetingManager.validateTargetWithServer.mockReturnValue(true);
    
    // Set target
    targetingManager.setTarget(mockTarget);
    
    // Update
    targetingManager.update(0.016);
    
    // Verify target indicator position was updated
    expect(targetingManager.targetIndicator.position.copy).toHaveBeenCalled();
  });
  
  test('should clean up properly', () => {
    targetingManager.cleanup();
    
    expect(window.removeEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(window.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(targetingManager.currentTarget).toBeNull();
  });
});
