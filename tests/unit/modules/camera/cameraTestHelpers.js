/**
 * Common test utilities and helpers for CameraManager tests
 */

import { MockCameraManager } from './mockCameraManager';

/**
 * Creates a standard mock game object for camera tests
 * @returns {Object} The mock game object
 */
export const createMockGame = () => {
  return {
    scene: {
      add: jest.fn(),
      remove: jest.fn()
    },
    renderer: {
      domElement: {
        clientWidth: 1920,
        clientHeight: 1080
      }
    },
    playerManager: {
      player: {
        position: { 
          x: 0, 
          y: 0, 
          z: 0,
          copy: jest.fn()
        }
      }
    }
  };
};

/**
 * Creates a standard setup for CameraManager tests
 * @returns {Object} The test setup with mockGame, cameraManager, etc.
 */
export const createCameraTestSetup = () => {
  // Create mock game
  const mockGame = createMockGame();
  
  // Create CameraManager instance
  const cameraManager = new MockCameraManager(mockGame);
  
  // Initialize the camera manager
  cameraManager.init();
  
  return { mockGame, cameraManager };
}; 