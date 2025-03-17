/**
 * Common test utilities and helpers for TargetingManager tests
 */

import { MockTargetingManager } from './mockTargetingManager';

/**
 * Creates a standard mock game object for targeting tests
 * @returns {Object} The mock game object
 */
export const createMockGame = () => {
  // Create a mock game object with scene first
  const mockGame = {
    scene: {
      add: jest.fn(),
      remove: jest.fn(),
      children: []
    },
    camera: {
      position: { x: 0, y: 5, z: 10 }
    },
    localPlayerId: 'local-player-id'
  };
  
  // Create mock players directly instead of using MockPlayerManager
  mockGame.playerManager = {
    players: new Map([
      ['local-player-id', {
        id: 'local-player-id',
        position: { x: 0, y: 0, z: 0, copy: jest.fn() },
        rotation: { y: 0 },
        userData: { isPlayer: true, isLocal: true }
      }],
      ['remote-player-1', {
        id: 'remote-player-1',
        position: { x: 5, y: 0, z: 5, copy: jest.fn() },
        rotation: { y: 0 },
        userData: { isPlayer: true }
      }],
      ['remote-player-2', {
        id: 'remote-player-2',
        position: { x: -5, y: 0, z: -5, copy: jest.fn() },
        rotation: { y: 0 },
        userData: { isPlayer: true }
      }]
    ]),
    localPlayer: {
      id: 'local-player-id',
      position: { x: 0, y: 0, z: 0, copy: jest.fn() },
      rotation: { y: 0 },
      userData: { isPlayer: true, isLocal: true }
    }
  };
  
  // Add mock NPCs
  mockGame.npcManager = {
    npcs: new Map([
      ['npc-1', {
        id: 'npc-1',
        position: { x: 10, y: 0, z: 10, copy: jest.fn() },
        userData: { isNPC: true }
      }],
      ['npc-2', {
        id: 'npc-2',
        position: { x: -10, y: 0, z: -10, copy: jest.fn() },
        userData: { isNPC: true }
      }]
    ])
  };
  
  return mockGame;
};

/**
 * Creates a standard setup for TargetingManager tests
 * @returns {Object} The test setup with mockGame, targetingManager, etc.
 */
export const createTargetingTestSetup = () => {
  // Create mock game
  const mockGame = createMockGame();
  
  // Create TargetingManager instance
  const targetingManager = new MockTargetingManager(mockGame);
  
  // Initialize the targeting manager
  targetingManager.init();
  
  return { mockGame, targetingManager };
}; 