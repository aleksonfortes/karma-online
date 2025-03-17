/**
 * PlayerManagerNetwork.test.js - Network-related tests for PlayerManager
 */

// Import necessary modules
import { jest } from '@jest/globals';
import { MockPlayerManager } from './mockPlayerManager';
import { createMockGame, createMockPlayer, createPlayerTestSetup } from './playerTestHelpers';

// Mock THREE
jest.mock('three', () => {
  return {
    Group: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { y: 0, set: jest.fn() },
      add: jest.fn(),
      remove: jest.fn(),
      children: [],
      traverse: jest.fn(),
      userData: {}
    })),
    Vector3: jest.fn().mockImplementation((x, y, z) => ({ x: x || 0, y: y || 0, z: z || 0 })),
    Quaternion: jest.fn().mockImplementation(() => ({
      x: 0, y: 0, z: 0, w: 1,
      set: jest.fn()
    })),
    MathUtils: { lerp: jest.fn((a, b, t) => a + (b - a) * t) },
    Loader: class Loader {}
  };
});

jest.mock('three/examples/jsm/loaders/GLTFLoader.js', () => {
  const THREE = require('three');
  return {
    GLTFLoader: class GLTFLoader extends THREE.Loader {
      constructor() {
        super();
      }
      load() {
        return jest.fn();
      }
    }
  };
});

describe('PlayerManager Network', () => {
  let mockGame;
  let playerManager;
  let THREE;
  
  beforeEach(() => {
    // Get the mocked THREE
    THREE = require('three');
    
    // Create mock game
    mockGame = createMockGame();
    
    // Create player manager with mock game
    playerManager = new MockPlayerManager(mockGame);
    
    // Initialize player manager
    playerManager.init();
    
    // Create a test player
    const playerId = 'test-player';
    playerManager.createLocalPlayer({
      id: playerId,
      position: { x: 0, y: 0, z: 0 },
      rotation: { y: 0 }
    });
    
    mockGame.localPlayerId = playerId;
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Player Updates', () => {
    test('should update player position from server', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      
      // Create position update from server
      const updateData = {
        type: 'position',
        position: { x: 10, y: 5, z: 20 },
        rotation: { y: 1.5 }
      };
      
      // Apply server update
      playerManager.applyServerUpdate(playerId, updateData);
      
      // Verify position was updated according to server
      expect(player.position.set).toHaveBeenCalledWith(10, 5, 20);
      expect(player.rotation.y).toBe(1.5);
    });
    
    test('should update player stats from server', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      
      // Create stats update from server
      const updateData = {
        type: 'stats',
        stats: {
          life: 80,
          maxLife: 100,
          karma: 60,
          maxKarma: 100,
          level: 2
        }
      };
      
      // Apply server update
      playerManager.applyServerUpdate(playerId, updateData);
      
      // Verify stats were updated according to server
      expect(player.userData.stats.life).toBe(80);
      expect(player.userData.stats.karma).toBe(60);
      expect(player.userData.stats.level).toBe(2);
    });
  });
  
  describe('Reconnection Handling', () => {
    test('should handle player reconnection', () => {
      // Setup
      playerManager.players.clear();
      
      // Simulate server sending player data on reconnection
      const reconnectData = {
        players: [
          {
            id: 'player-1',
            position: { x: 10, y: 0, z: 20 },
            rotation: { y: 1.5 },
            stats: { life: 80, maxLife: 100 }
          },
          {
            id: 'player-2',
            position: { x: 15, y: 0, z: 25 },
            rotation: { y: 0.5 },
            stats: { life: 90, maxLife: 100 }
          }
        ],
        localPlayerId: 'player-1'
      };
      
      // Handle reconnection
      playerManager.handleReconnection(reconnectData);
      
      // Verify players were created
      expect(playerManager.players.size).toBe(2);
      expect(playerManager.players.has('player-1')).toBe(true);
      expect(playerManager.players.has('player-2')).toBe(true);
      
      // Verify local player was set
      expect(playerManager.localPlayer).toBe(playerManager.players.get('player-1'));
      
      // Verify positions were set
      const player1 = playerManager.players.get('player-1');
      const player2 = playerManager.players.get('player-2');
      
      expect(player1.position.x).toBe(10);
      expect(player1.position.z).toBe(20);
      expect(player1.rotation.y).toBe(1.5);
      
      expect(player2.position.x).toBe(15);
      expect(player2.position.z).toBe(25);
      expect(player2.rotation.y).toBe(0.5);
    });
  });
  
  describe('Server Authority', () => {
    test('should prioritize server position over client position', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      
      // Create position correction from server
      const correctionData = {
        type: 'position',
        position: { x: 10, y: 5, z: 20 },
        rotation: { y: 1.5 }
      };
      
      // Apply server correction
      playerManager.applyServerUpdate(playerId, correctionData);
      
      // Verify position was corrected to server's version
      expect(player.position.set).toHaveBeenCalledWith(10, 5, 20);
      expect(player.rotation.y).toBe(1.5);
    });
    
    test('should handle server-initiated player spawn', () => {
      // Setup
      const newPlayerData = {
        id: 'new-player',
        position: { x: 15, y: 0, z: 25 },
        rotation: { y: 0.5 }
      };
      
      // Create network player
      const newPlayer = playerManager.createNetworkPlayer(newPlayerData);
      
      // Verify player was created
      expect(playerManager.players.has('new-player')).toBe(true);
      
      // Verify position was set according to server
      expect(newPlayer.position.x).toBe(15);
      expect(newPlayer.position.y).toBe(0);
      expect(newPlayer.position.z).toBe(25);
      expect(newPlayer.rotation.y).toBe(0.5);
    });
    
    test('should handle server-initiated player removal', () => {
      // Setup
      const playerId = 'player-to-remove';
      playerManager.createPlayer(playerId, { x: 0, y: 0, z: 0 });
      
      // Simulate server sending disconnect event
      playerManager.handlePlayerDisconnect(playerId);
      
      // Verify player was removed
      expect(playerManager.players.has(playerId)).toBe(false);
    });
  });
  
  describe('Network Communication', () => {
    test('should send player state to server', () => {
      // Setup
      mockGame.networkManager.sendPlayerState = jest.fn();
      
      // Call method
      playerManager.sendPlayerState();
      
      // Verify network manager was called
      expect(mockGame.networkManager.sendPlayerState).toHaveBeenCalled();
    });
    
    test('should apply pending updates', () => {
      // Setup
      const playerId = 'test-player';
      const updates = [
        { type: 'position', position: { x: 5, y: 0, z: 10 } },
        { type: 'health', life: 90, maxLife: 100 }
      ];
      
      mockGame.networkManager.applyPendingUpdates = jest.fn();
      
      // Call method
      playerManager.applyPendingUpdates(playerId, updates);
      
      // Verify network manager was called with correct parameters
      expect(mockGame.networkManager.applyPendingUpdates).toHaveBeenCalledWith(playerId, updates);
    });
  });
  
  describe('Health Updates', () => {
    test('should update player health from server', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      
      // Create health update from server
      const updateData = {
        type: 'health',
        life: 60,
        maxLife: 100
      };
      
      // Apply server update
      playerManager.applyServerUpdate(playerId, updateData);
      
      // Verify health was updated
      expect(player.userData.stats.life).toBe(60);
      expect(player.userData.stats.maxLife).toBe(100);
      
      // Verify UI was updated
      expect(mockGame.uiManager.updateStatusBars).toHaveBeenCalledWith(
        60, 100, player.userData.stats.karma, player.userData.stats.maxKarma
      );
    });
    
    test('should handle player death from server', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      
      // Create death update from server
      const updateData = {
        type: 'death',
        isDead: true
      };
      
      // Apply server update
      playerManager.applyServerUpdate(playerId, updateData);
      
      // Verify player is marked as dead
      expect(player.userData.isDead).toBe(true);
      expect(player.userData.stats.life).toBe(0);
      
      // Verify death screen is shown for local player
      expect(mockGame.uiManager.showDeathScreen).toHaveBeenCalled();
    });
  });
}); 