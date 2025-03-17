/**
 * Common test utilities and helpers for NPCManager tests
 */

import { MockNPCManager } from './mockNPCManager';
import { MockUIManager } from '../ui/mockUIManager';

/**
 * Creates a standard mock game object for NPC tests
 * @returns {Object} The mock game object
 */
export const createMockGame = () => {
  // Create a mock UI manager with jest functions
  const mockUIManager = new MockUIManager({});
  mockUIManager.showDialogue = jest.fn();
  mockUIManager.hideDialogue = jest.fn();
  mockUIManager.showInteractionLabel = jest.fn();
  mockUIManager.hideInteractionLabel = jest.fn();
  
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
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn()
      }
    },
    playerManager: {
      players: new Map(),
      localPlayer: {
        id: 'local-player-id',
        position: { x: 0, y: 0, z: 0 },
        rotation: { y: 0 }
      }
    },
    uiManager: mockUIManager
  };
};

/**
 * Creates a standard setup for NPCManager tests
 * @returns {Object} The test setup with mockGame, npcManager, etc.
 */
export const createNPCTestSetup = () => {
  // Create mock game
  const mockGame = createMockGame();
  
  // Create NPCManager instance
  const npcManager = new MockNPCManager(mockGame);
  
  // Initialize the NPC manager
  npcManager.init();
  
  return { mockGame, npcManager };
}; 