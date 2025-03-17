/**
 * Common test utilities and helpers for KarmaManager tests
 */

import { MockKarmaManager } from './mockKarmaManager';

/**
 * Creates a standard mock game object for karma tests
 * @returns {Object} The mock game object
 */
export const createMockGame = () => {
  // Create mock scene
  const mockScene = {
    add: jest.fn(),
    remove: jest.fn(),
    children: []
  };
  
  // Create mock player manager
  const mockPlayerManager = {
    localPlayer: {
      position: { x: 0, y: 0, z: 0 },
      userData: {}
    },
    players: new Map()
  };
  
  // Create mock network manager
  const mockNetworkManager = {
    emit: jest.fn(),
    on: jest.fn()
  };
  
  // Create mock UI manager
  const mockUIManager = {
    showNotification: jest.fn(),
    updateKarmaDisplay: jest.fn()
  };
  
  return {
    scene: mockScene,
    playerManager: mockPlayerManager,
    networkManager: mockNetworkManager,
    uiManager: mockUIManager
  };
};

/**
 * Creates a standard setup for KarmaManager tests
 * @returns {Object} The test setup with mockGame, karmaManager, etc.
 */
export const createKarmaTestSetup = () => {
  // Create mock game
  const mockGame = createMockGame();
  
  // Create KarmaManager instance
  const karmaManager = new MockKarmaManager(mockGame);
  
  return { mockGame, karmaManager };
};

/**
 * Creates a mock karma change listener
 * @returns {Function} The mock listener function
 */
export const createMockKarmaListener = () => {
  return jest.fn();
}; 