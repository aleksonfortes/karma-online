/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MockCameraManager } from './mockCameraManager';
import { createCameraTestSetup } from './cameraTestHelpers';

// Mock THREE.js
jest.mock('three', () => {
  return {
    PerspectiveCamera: jest.fn().mockImplementation(() => ({
      position: { 
        x: 0, 
        y: 0, 
        z: 0,
        set: jest.fn()
      },
      rotation: { x: 0, y: 0, z: 0 },
      lookAt: jest.fn(),
      updateProjectionMatrix: jest.fn()
    })),
    Vector3: jest.fn().mockImplementation((x, y, z) => ({ 
      x, 
      y, 
      z,
      copy: jest.fn(),
      set: jest.fn()
    })),
    Euler: jest.fn().mockImplementation((x, y, z) => ({ x, y, z })),
    Object3D: jest.fn().mockImplementation(() => ({
      position: { 
        x: 0, 
        y: 0, 
        z: 0, 
        copy: jest.fn() 
      }
    })),
    MathUtils: {
      clamp: jest.fn().mockImplementation((value, min, max) => {
        return Math.min(Math.max(value, min), max);
      })
    }
  };
});

describe('CameraManager', () => {
  let cameraManager;
  let mockGame;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock window methods
    window.addEventListener = jest.fn();
    window.removeEventListener = jest.fn();
    
    // Create test setup
    const setup = createCameraTestSetup();
    mockGame = setup.mockGame;
    cameraManager = setup.cameraManager;
  });
  
  afterEach(() => {
    // Clean up
    jest.clearAllMocks();
    cameraManager.cleanup();
  });
  
  test('should initialize correctly', () => {
    expect(cameraManager).toBeDefined();
    expect(cameraManager.game).toBe(mockGame);
    expect(cameraManager.camera).toBeDefined();
    expect(cameraManager.cameraOffset).toBeDefined();
    expect(cameraManager.minZoom).toBeDefined();
    expect(cameraManager.maxZoom).toBeDefined();
    expect(cameraManager.initialized).toBe(true);
  });
  
  test('should set up zoom controls', () => {
    expect(window.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function));
  });
  
  test('should adjust zoom within limits', () => {
    // Test zooming in
    const initialZoom = cameraManager.currentZoom;
    cameraManager.adjustZoom(-1); // Zoom in
    expect(cameraManager.currentZoom).toBeLessThan(initialZoom);
    
    // Test zooming out
    cameraManager.adjustZoom(1); // Zoom out
    expect(cameraManager.currentZoom).toBe(initialZoom);
    
    // Test min zoom limit
    cameraManager.currentZoom = cameraManager.minZoom;
    cameraManager.adjustZoom(-1); // Try to zoom in beyond limit
    expect(cameraManager.currentZoom).toBe(cameraManager.minZoom);
    
    // Test max zoom limit
    cameraManager.currentZoom = cameraManager.maxZoom;
    cameraManager.adjustZoom(1); // Try to zoom out beyond limit
    expect(cameraManager.currentZoom).toBe(cameraManager.maxZoom);
  });
  
  test('should set up camera', () => {
    // Verify that the camera position was set
    expect(cameraManager.camera.position.set).toHaveBeenCalled();
    
    // Verify that the camera target was created and added to the scene
    expect(cameraManager.cameraTarget).toBeDefined();
    expect(mockGame.scene.add).toHaveBeenCalledWith(cameraManager.cameraTarget);
  });
  
  test('should update camera position', () => {
    // Set player position
    mockGame.playerManager.player.position = { x: 10, y: 5, z: 10, copy: jest.fn() };
    
    // Update camera
    cameraManager.update(0.016);
    
    // Camera should follow player
    expect(cameraManager.camera.lookAt).toHaveBeenCalled();
  });
  
  test('should update aspect ratio', () => {
    cameraManager.updateAspectRatio();
    
    expect(cameraManager.camera.updateProjectionMatrix).toHaveBeenCalled();
  });
  
  test('should clean up properly', () => {
    cameraManager.cleanup();
    
    expect(window.removeEventListener).toHaveBeenCalledWith('wheel', expect.any(Function));
    expect(mockGame.scene.remove).toHaveBeenCalledWith(cameraManager.cameraTarget);
  });
}); 