/**
 * Integration test setup file
 * 
 * This file provides global setup for all integration tests, ensuring
 * proper mocking of dependencies and consistent test environment.
 */

import { jest } from '@jest/globals';
import GameConstants from '../../server/src/config/GameConstants.js';

// Set up mocks
// Note: In ESM environment, we need dynamic imports for mocking
jest.unstable_mockModule('../../server/src/modules/network/NetworkManager.js', 
  () => ({
    default: jest.fn().mockImplementation(() => ({
      init: jest.fn(),
      broadcastToAll: jest.fn(),
      broadcastToAllExcept: jest.fn(),
      sendToClient: jest.fn(),
      handleDisconnect: jest.fn(),
      registerEventHandlers: jest.fn()
    }))
  })
);

jest.unstable_mockModule('../../server/src/modules/game/GameManager.js', () => ({
  default: jest.fn()
}));

jest.unstable_mockModule('../../server/src/modules/player/PlayerManager.js', () => ({
  default: jest.fn()
}));

jest.unstable_mockModule('../../server/src/modules/monster/MonsterManager.js', () => ({
  default: jest.fn()
}));

jest.unstable_mockModule('../../server/src/modules/npc/NPCManager.js', () => ({
  default: jest.fn()
}));

// Set up environment variables that tests may need
process.env.NODE_ENV = 'test';

// Define globals that tests can use
global.__TEST__ = true;
global.__GAME_CONSTANTS__ = GameConstants;

// This ensures that tests will fail if there are uncaught promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection in tests:', err);
  process.exit(1);
});

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
}); 