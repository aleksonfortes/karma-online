/**
 * Common test utilities and helpers for TerrainManager tests
 */

import { MockTerrainManager } from './mockTerrainManager';

/**
 * Creates a standard mock game object for terrain tests
 * @returns {Object} The mock game object
 */
export const createMockGame = () => {
  // Create mock scene
  const mockScene = {
    add: jest.fn(),
    remove: jest.fn(),
    children: []
  };
  
  // Create mock renderer
  const mockRenderer = {
    setClearColor: jest.fn()
  };
  
  // Create mock environment manager
  const mockEnvironmentManager = {
    getColliders: jest.fn().mockReturnValue([])
  };
  
  return {
    scene: mockScene,
    renderer: mockRenderer,
    environmentManager: mockEnvironmentManager
  };
};

/**
 * Creates a standard setup for TerrainManager tests
 * @returns {Object} The test setup with mockGame, terrainManager, etc.
 */
export const createTerrainTestSetup = () => {
  // Create mock game
  const mockGame = createMockGame();
  
  // Create TerrainManager instance
  const terrainManager = new MockTerrainManager(mockGame);
  
  return { mockGame, terrainManager };
};

/**
 * Creates a mock collider for testing
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} radius - Collider radius
 * @returns {Object} The mock collider
 */
export const createMockCollider = (x = 10, z = 10, radius = 2.0) => {
  return {
    position: { x, y: 0, z },
    radius
  };
};

/**
 * Creates a mock wave ring for testing
 * @param {number} baseY - Base Y position
 * @param {number} phase - Wave phase
 * @param {number} amplitude - Wave amplitude
 * @returns {Object} The mock wave ring
 */
export const createMockWaveRing = (baseY = -0.5, phase = 0, amplitude = 0.1) => {
  return {
    mesh: { 
      position: { x: 0, y: baseY, z: 0 },
      parent: {
        remove: jest.fn()
      },
      geometry: {
        dispose: jest.fn()
      },
      material: {
        dispose: jest.fn()
      }
    },
    baseY,
    phase,
    amplitude
  };
}; 