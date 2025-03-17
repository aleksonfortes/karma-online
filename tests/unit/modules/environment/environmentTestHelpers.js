/**
 * Common test utilities and helpers for EnvironmentManager tests
 */

import { MockEnvironmentManager } from './mockEnvironmentManager';

/**
 * Creates a standard mock game object for environment tests
 * @returns {Object} The mock game object
 */
export const createMockGame = () => {
  return {
    scene: {
      add: jest.fn(),
      remove: jest.fn(),
      children: []
    },
    playerManager: {
      localPlayer: {
        position: { x: 0, y: 0, z: 0 }
      }
    },
    debugMode: false
  };
};

/**
 * Creates a standard setup for EnvironmentManager tests
 * @returns {Object} The test setup with mockGame, environmentManager, etc.
 */
export const createEnvironmentTestSetup = () => {
  // Create mock game
  const mockGame = createMockGame();
  
  // Create EnvironmentManager instance
  const environmentManager = new MockEnvironmentManager(mockGame);
  
  return { mockGame, environmentManager };
};

/**
 * Creates a mock GLTF model for testing
 * @returns {Object} The mock GLTF model
 */
export const createMockGLTFModel = () => {
  const mockScene = {
    position: { set: jest.fn() },
    rotation: { set: jest.fn() },
    scale: { set: jest.fn() }
  };
  
  return {
    scene: mockScene,
    animations: []
  };
};

/**
 * Creates a mock collider for testing
 * @param {string} id - The ID of the collider
 * @returns {Object} The mock collider
 */
export const createMockCollider = (id = 'test-collider') => {
  return {
    id,
    position: { set: jest.fn() },
    rotation: { set: jest.fn() },
    scale: { set: jest.fn() },
    isMesh: true,
    geometry: {
      type: 'BoxGeometry'
    },
    material: {
      visible: false
    }
  };
}; 