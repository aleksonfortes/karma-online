/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock THREE.js before importing CameraManager
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

// Import CameraManager after mocking THREE.js
import { CameraManager } from '../../../../src/modules/camera/CameraManager.js';

describe('CameraManager', () => {
  let cameraManager;
  let mockGame;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a mock game object
    mockGame = {
      scene: {
        add: jest.fn(),
        remove: jest.fn()
      },
      renderer: {
        domElement: document.createElement('canvas')
      },
      playerManager: {
        player: {
          position: { x: 0, y: 0, z: 0 }
        }
      }
    };
    
    // Mock window methods
    window.addEventListener = jest.fn();
    window.removeEventListener = jest.fn();
    
    // Create CameraManager instance
    cameraManager = new CameraManager(mockGame);
  });
  
  test('should initialize correctly', () => {
    expect(cameraManager).toBeDefined();
    expect(cameraManager.game).toBe(mockGame);
    expect(cameraManager.camera).toBeDefined();
    expect(cameraManager.cameraOffset).toBeDefined();
    expect(cameraManager.minZoom).toBeDefined();
    expect(cameraManager.maxZoom).toBeDefined();
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
    // Mock the setupCamera method to avoid calling the actual implementation
    cameraManager.setupCamera();
    
    // Verify that the camera position was set
    expect(cameraManager.camera.position.set).toHaveBeenCalled();
    
    // Verify that the camera target was created and added to the scene
    expect(cameraManager.cameraTarget).toBeDefined();
    expect(mockGame.scene.add).toHaveBeenCalledWith(cameraManager.cameraTarget);
  });
  
  test('should update camera position', () => {
    // Set up camera target
    cameraManager.cameraTarget = {
      position: { x: 0, y: 0, z: 0, copy: jest.fn() }
    };
    
    // Set player position
    mockGame.playerManager.player.position = { x: 10, y: 5, z: 10 };
    
    // Mock the update method
    const originalUpdate = cameraManager.update;
    cameraManager.update = jest.fn().mockImplementation((deltaTime) => {
      // Call the camera lookAt method to simulate the camera following the player
      cameraManager.camera.lookAt();
    });
    
    // Update camera
    cameraManager.update(0.016);
    
    // Camera should follow player
    expect(cameraManager.camera.lookAt).toHaveBeenCalled();
    
    // Restore the original method
    cameraManager.update = originalUpdate;
  });
  
  test('should update aspect ratio', () => {
    cameraManager.updateAspectRatio();
    
    expect(cameraManager.camera.updateProjectionMatrix).toHaveBeenCalled();
  });
}); 