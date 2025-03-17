/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MockKarmaManager } from './mockKarmaManager';
import { createKarmaTestSetup, createMockKarmaListener } from './karmaTestHelpers';
import { KarmaManager } from '../../../../src/modules/karma/KarmaManager';
import * as THREE from 'three';

// Import Jest spy utilities
const { spyOn } = jest;

// Mock THREE.js
jest.mock('three', () => {
  return {
    Color: jest.fn().mockImplementation(() => ({
      r: 1, g: 1, b: 1,
      multiplyScalar: jest.fn().mockReturnThis(),
      set: jest.fn()
    })),
    Vector3: jest.fn().mockImplementation(() => ({
      set: jest.fn(),
      normalize: jest.fn().mockReturnThis(),
      multiplyScalar: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      distanceTo: jest.fn().mockReturnValue(2)
    })),
    Object3D: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      add: jest.fn(),
      remove: jest.fn(),
      traverse: jest.fn()
    })),
    Mesh: jest.fn().mockImplementation(() => ({
      material: { color: { set: jest.fn() } },
      position: { x: 0, y: 0, z: 0 },
      geometry: { dispose: jest.fn() },
      dispose: jest.fn()
    })),
    Scene: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      remove: jest.fn(),
      traverse: jest.fn(),
      children: []
    })),
    PointLight: jest.fn().mockImplementation(() => ({
      position: { set: jest.fn() },
      intensity: 1.0
    })),
    MeshBasicMaterial: jest.fn(),
    SphereGeometry: jest.fn(),
    BoxGeometry: jest.fn(),
    Raycaster: jest.fn().mockImplementation(() => ({
      setFromCamera: jest.fn(),
      intersectObject: jest.fn().mockReturnValue([])
    })),
    Group: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      remove: jest.fn(),
      children: []
    }))
  };
});

describe('KarmaManager', () => {
  let karmaManager;
  let mockGame;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create test setup
    const setup = createKarmaTestSetup();
    mockGame = setup.mockGame;
    karmaManager = setup.karmaManager;
    
    // Initialize karma manager
    karmaManager.init();
  });
  
  afterEach(() => {
    // Clean up
    jest.clearAllMocks();
    karmaManager.cleanup();
  });
  
  test('should initialize with default karma value', () => {
    expect(karmaManager.karma).toBe(50);
    expect(karmaManager.initialized).toBe(true);
  });
  
  test('should adjust karma within limits', () => {
    // Test increasing karma
    karmaManager.adjustKarma(25);
    expect(karmaManager.karma).toBe(75);
    
    // Test decreasing karma
    karmaManager.adjustKarma(-15);
    expect(karmaManager.karma).toBe(60);
    
    // Test decreasing below neutral
    karmaManager.adjustKarma(-20);
    expect(karmaManager.karma).toBe(40);
    
    // Test decreasing to minimum
    karmaManager.adjustKarma(-100);
    expect(karmaManager.karma).toBe(0);
    
    // Test increasing from high value
    karmaManager.setKarma(90);
    karmaManager.adjustKarma(20);
    expect(karmaManager.karma).toBe(100);
  });
  
  test('should set karma to specific value', () => {
    // Set to specific value
    karmaManager.setKarma(75);
    expect(karmaManager.karma).toBe(75);
    
    // Set to value above max
    karmaManager.setKarma(150);
    expect(karmaManager.karma).toBe(100);
    
    // Set to value below min
    karmaManager.setKarma(-50);
    expect(karmaManager.karma).toBe(0);
  });
  
  test('should determine karma state correctly', () => {
    // Test good karma
    karmaManager.setKarma(80);
    expect(karmaManager.getKarmaState()).toBe('good');
    
    // Test neutral karma
    karmaManager.setKarma(50);
    expect(karmaManager.getKarmaState()).toBe('neutral');
    
    // Test evil karma
    karmaManager.setKarma(20);
    expect(karmaManager.getKarmaState()).toBe('evil');
  });
  
  test('should notify karma change listeners', () => {
    // Create a mock listener
    const mockListener = createMockKarmaListener();
    
    // Add the listener
    karmaManager.addKarmaChangeListener(mockListener);
    
    // Adjust karma
    karmaManager.adjustKarma(10, 'test reason');
    
    // Verify listener was called
    expect(mockListener).toHaveBeenCalledWith(50, 60, 'test reason');
    
    // Remove the listener
    karmaManager.removeKarmaChangeListener(mockListener);
    
    // Adjust karma again
    karmaManager.adjustKarma(10);
    
    // Verify listener was only called once
    expect(mockListener).toHaveBeenCalledTimes(1);
  });
  
  test('should update karma visuals', () => {
    // Set up spy on updateKarmaVisuals
    const updateSpy = jest.spyOn(karmaManager, 'updateKarmaVisuals');
    
    // Adjust karma
    karmaManager.adjustKarma(10);
    
    // Verify updateKarmaVisuals was called
    expect(updateSpy).toHaveBeenCalled();
    
    // Restore original method
    updateSpy.mockRestore();
  });
  
  test('should update karma aura position during update', () => {
    // Set up player position
    mockGame.playerManager.localPlayer.position = { x: 10, y: 5, z: 10 };
    
    // Set up spy on karmaAura.position.set
    karmaManager.karmaAura.position.set = jest.fn();
    
    // Call update
    karmaManager.update(0.016);
    
    // Verify position was updated
    expect(karmaManager.karmaAura.position.set).toHaveBeenCalledWith(10, 5, 10);
  });
  
  test('should clean up resources', () => {
    // Set up spy on scene.remove
    mockGame.scene.remove = jest.fn();
    
    // Call cleanup
    karmaManager.cleanup();
    
    // Verify resources were cleaned up
    expect(mockGame.scene.remove).toHaveBeenCalledWith(karmaManager.karmaAura);
    expect(karmaManager.karmaChangeListeners).toEqual([]);
    expect(karmaManager.initialized).toBe(false);
  });
});
