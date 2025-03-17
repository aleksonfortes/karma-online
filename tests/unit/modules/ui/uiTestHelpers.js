/**
 * Common test utilities and helpers for UIManager tests
 */

import { MockUIManager } from './mockUIManager';

/**
 * Creates a standard mock game object for UI tests
 * @returns {Object} The mock game object
 */
export const createMockGame = () => {
  return {
    scene: {
      add: jest.fn(),
      remove: jest.fn()
    },
    camera: {
      position: { x: 0, y: 0, z: 0 }
    },
    networkManager: {
      isConnected: true,
      socket: {
        emit: jest.fn()
      },
      sendPlayerState: jest.fn()
    },
    playerManager: {
      players: new Map(),
      localPlayer: {
        id: 'local-player-id',
        position: { x: 0, y: 0, z: 0 },
        rotation: { y: 0 },
        userData: {
          stats: {
            life: 100,
            maxLife: 100,
            karma: 50,
            maxKarma: 100
          }
        }
      }
    },
    karmaManager: {
      getKarmaColor: jest.fn().mockReturnValue({ r: 1, g: 1, b: 1 })
    },
    localPlayerId: 'local-player-id'
  };
};

/**
 * Creates a standard setup for UIManager tests
 * @returns {Object} The test setup with mockGame, uiManager, etc.
 */
export const createUITestSetup = () => {
  // Create mock game
  const mockGame = createMockGame();
  
  // Create UIManager instance
  const uiManager = new MockUIManager(mockGame);
  
  // Initialize the UI manager
  uiManager.init();
  
  return { mockGame, uiManager };
}; 