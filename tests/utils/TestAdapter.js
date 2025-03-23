/**
 * TestAdapter.js
 * 
 * This adapter helps bridge the gap between our test mocks and the actual implementation code.
 * It provides wrappers and utilities to connect integration tests to the real implementation.
 */

import GameConstants from '../../server/src/config/GameConstants.js';

// Import actual implementations (these will be properly mocked in the test environment)
import GameManager from '../../server/src/modules/game/GameManager.js';
import PlayerManager from '../../server/src/modules/player/PlayerManager.js';
import MonsterManager from '../../server/src/modules/monster/MonsterManager.js';
import NPCManager from '../../server/src/modules/npc/NPCManager.js';

/**
 * Create a real game manager instance with connections to the actual implementation
 * but with controlled mock data for testing
 */
export function createRealGameManager() {
  const mockSocket = {
    emit: jest.fn(),
    on: jest.fn(),
    id: 'server-mock'
  };
  
  const mockIo = {
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
    sockets: {
      sockets: new Map()
    }
  };
  
  // Create actual manager instances
  const npcManager = new NPCManager();
  const monsterManager = new MonsterManager();
  const playerManager = new PlayerManager();
  const gameManager = new GameManager(mockIo, npcManager, monsterManager, playerManager);
  
  return {
    gameManager,
    playerManager,
    monsterManager,
    npcManager,
    mockIo
  };
}

/**
 * Create a connected test context that provides access to both 
 * the real implementation and the test mocks
 */
export function createIntegrationTestContext() {
  const { 
    gameManager, 
    playerManager, 
    monsterManager, 
    npcManager, 
    mockIo 
  } = createRealGameManager();
  
  // Track connections and mock data
  const connections = new Map();
  const mockData = {
    players: new Map(),
    monsters: new Map(),
    npcs: new Map()
  };
  
  return {
    // Real implementations
    gameManager,
    playerManager,
    monsterManager,
    npcManager,
    
    // Test utilities
    mockIo,
    connections,
    mockData,
    
    // Add a test player with controlled data
    addTestPlayer(socketId, playerData = {}) {
      const defaultData = {
        username: `TestPlayer_${socketId}`,
        position: { ...GameConstants.PLAYER.SPAWN_POSITION },
        stats: {
          life: GameConstants.PLAYER.DEFAULT_LIFE,
          maxLife: GameConstants.PLAYER.DEFAULT_MAX_LIFE,
          mana: GameConstants.PLAYER.DEFAULT_MANA,
          maxMana: GameConstants.PLAYER.DEFAULT_MAX_MANA,
          karma: GameConstants.PLAYER.DEFAULT_KARMA,
          level: 1,
          experience: 0,
          path: null,
          skills: []
        }
      };
      
      const player = { ...defaultData, ...playerData, id: socketId };
      mockData.players.set(socketId, player);
      playerManager.addPlayer(socketId, player.username);
      
      return player;
    },
    
    // Get events that were broadcast
    getEmittedEvents() {
      return mockIo.emit.mock.calls.map(call => ({ 
        event: call[0], 
        data: call[1] 
      }));
    }
  };
} 