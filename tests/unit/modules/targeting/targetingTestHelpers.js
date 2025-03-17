/**
 * Common test utilities and helpers for TargetingManager tests
 */

import { MockTargetingManager } from './mockTargetingManager';

/**
 * Creates a standard mock game object for targeting tests
 * @returns {Object} The mock game object
 */
export function createMockGame() {
  // Create mock scene
  const mockScene = {
    add: jest.fn(),
    remove: jest.fn(),
    children: []
  };
  
  // Create mock player manager
  const mockPlayerManager = {
    players: [],
    localPlayer: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { y: 0 },
      id: 'local-player-id'
    },
    getPlayerById: jest.fn().mockImplementation(id => {
      return mockPlayerManager.players.find(player => player.id === id) || null;
    }),
    addPlayer: jest.fn().mockImplementation(player => {
      mockPlayerManager.players.push(player);
    })
  };
  
  // Create mock camera
  const mockCamera = {
    position: { x: 0, y: 5, z: 10 },
    lookAt: jest.fn()
  };
  
  // Create mock network manager with server authority methods
  const mockNetworkManager = {
    validateActionWithServer: jest.fn().mockImplementation(action => {
      // Default to successful validation
      return true;
    }),
    requestCurrentTarget: jest.fn(),
    sendTargetUpdate: jest.fn(),
    handleServerRejection: jest.fn(),
    handleServerConfirmation: jest.fn(),
    handleServerForcedTarget: jest.fn(),
    handleServerTargetSync: jest.fn()
  };
  
  // Create mock game
  const mockGame = {
    scene: mockScene,
    playerManager: mockPlayerManager,
    camera: mockCamera,
    networkManager: mockNetworkManager,
    localPlayerId: 'local-player-id'
  };
  
  return mockGame;
}

/**
 * Creates a standard setup for TargetingManager tests
 * @returns {Object} The test setup with mockGame, targetingManager, etc.
 */
export const createTargetingTestSetup = () => {
  // Create mock game
  const mockGame = createMockGame();
  
  // Create TargetingManager instance
  const targetingManager = new MockTargetingManager(mockGame);
  
  return { mockGame, targetingManager };
};

/**
 * Creates a mock targetable object
 * @param {string} id - The ID of the object
 * @param {string} type - The type of object (player, npc, enemy)
 * @param {Object} position - The position of the object
 * @returns {Object} The mock targetable object
 */
export const createMockTargetableObject = (id, type = 'player', position = { x: 0, y: 0, z: 0 }) => {
  return {
    userData: { id, type },
    position: { ...position, copy: jest.fn() },
    parent: null
  };
};

/**
 * Creates a mock mouse event
 * @param {number} clientX - The X coordinate of the mouse
 * @param {number} clientY - The Y coordinate of the mouse
 * @returns {Object} The mock mouse event
 */
export const createMockMouseEvent = (clientX = 0, clientY = 0) => {
  return {
    clientX,
    clientY,
    preventDefault: jest.fn()
  };
};

/**
 * Creates a mock raycaster intersection
 * @param {Object} object - The intersected object
 * @param {number} distance - The distance to the intersection
 * @returns {Object} The mock intersection
 */
export const createMockIntersection = (object, distance = 5) => {
  return {
    object,
    distance,
    point: { x: 0, y: 0, z: 0 }
  };
}; 