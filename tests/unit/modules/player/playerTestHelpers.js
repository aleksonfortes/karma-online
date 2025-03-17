/**
 * Common test utilities and helpers for PlayerManager tests
 */

import { MockPlayerManager } from './mockPlayerManager';

/**
 * Creates a standard mock game object for player tests
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
      sendPlayerState: jest.fn(),
      applyPendingUpdates: jest.fn()
    },
    uiManager: {
      createHealthBar: jest.fn().mockReturnValue({
        mesh: { position: { set: jest.fn() } },
        update: jest.fn()
      }),
      createNameTag: jest.fn().mockReturnValue({
        mesh: { position: { set: jest.fn() } }
      }),
      updateStatusBars: jest.fn(),
      showDeathScreen: jest.fn(),
      hideDeathScreen: jest.fn()
    },
    karmaManager: {
      updateKarma: jest.fn(),
      getKarmaColor: jest.fn().mockReturnValue({ r: 1, g: 1, b: 1 })
    },
    terrainManager: {
      getHeightAt: jest.fn().mockReturnValue(0)
    },
    skillsManager: {
      useSkill: jest.fn(),
      canUseSkill: jest.fn().mockReturnValue(true)
    },
    targetingManager: {
      setTarget: jest.fn(),
      clearTarget: jest.fn()
    },
    localPlayerId: 'local-player-id'
  };
};

/**
 * Creates a standard mock player object
 * @param {Object} THREE - The THREE.js mock object
 * @param {string} id - The player ID
 * @param {Object} options - Additional player options
 * @returns {Object} The mock player object
 */
export const createMockPlayer = (THREE, id = 'player-1', options = {}) => {
  const defaultStats = {
    life: 100,
    maxLife: 100,
    karma: 50,
    maxKarma: 100,
    level: 1,
    experience: 0
  };

  const stats = { ...defaultStats, ...options.stats };
  
  return {
    id,
    position: { x: 0, y: 0, z: 0, set: jest.fn() },
    rotation: { y: 0, set: jest.fn() },
    add: jest.fn(),
    remove: jest.fn(),
    children: [],
    traverse: jest.fn(),
    userData: {
      stats,
      isPlayer: true,
      isDead: false,
      isMoving: false,
      lastDamageTime: 0,
      ...options.userData
    },
    healthBar: {
      mesh: { position: { set: jest.fn() } },
      update: jest.fn()
    },
    nameTag: {
      mesh: { position: { set: jest.fn() } }
    },
    visible: true
  };
};

/**
 * Creates a standard setup for PlayerManager tests
 * @returns {Object} The test setup with mockGame, playerManager, etc.
 */
export const createPlayerTestSetup = () => {
  // Create mock game
  const mockGame = createMockGame();
  
  // Create PlayerManager instance
  const playerManager = new MockPlayerManager(mockGame);
  
  // Initialize the player manager
  playerManager.init();
  
  return { mockGame, playerManager };
}; 