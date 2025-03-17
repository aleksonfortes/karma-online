/**
 * NetworkManagerSynchronization.test.js - Tests for player synchronization aspects of NetworkManager
 * 
 * This file focuses on testing the player synchronization aspects of the NetworkManager,
 * including handling player joins/leaves, position updates, and state synchronization.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MockNetworkManager } from './mockNetworkManager';
import { createNetworkTestSetup } from './networkTestHelpers';

// Mock THREE library
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation((x, y, z) => ({
      x: x || 0,
      y: y || 0,
      z: z || 0,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis(),
      distanceTo: jest.fn().mockReturnValue(5),
      lerp: jest.fn()
    })),
    Quaternion: jest.fn().mockImplementation(() => ({
      x: 0,
      y: 0,
      z: 0,
      w: 1,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis(),
      slerp: jest.fn()
    })),
    MathUtils: {
      lerp: jest.fn((a, b, t) => a + (b - a) * t),
      radToDeg: jest.fn(rad => rad * (180 / Math.PI)),
      degToRad: jest.fn(deg => deg * (Math.PI / 180))
    },
    Object3D: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0, set: jest.fn() },
      rotation: { x: 0, y: 0, z: 0, set: jest.fn() },
      quaternion: { x: 0, y: 0, z: 0, w: 1, set: jest.fn() },
      add: jest.fn(),
      remove: jest.fn()
    }))
  };
});

// Mock config
jest.mock('../../../../src/config.js', () => ({
  getServerUrl: jest.fn().mockReturnValue('http://localhost:3000'),
  SERVER_URL: 'http://localhost:3000',
  NETWORK: {
    UPDATE_RATE: 100,
    INTERPOLATION_DELAY: 100
  }
}));

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    connected: true
  }));
});

describe('NetworkManager Player Synchronization', () => {
  let networkManager;
  let mockGame;
  let mockSocket;
  let THREE;
  
  beforeEach(() => {
    // Get the mocked THREE
    THREE = require('three');
    
    // Create test setup
    const setup = createNetworkTestSetup();
    mockGame = setup.mockGame;
    
    // Enhance player manager with more methods
    mockGame.playerManager = {
      ...mockGame.playerManager,
      createPlayer: jest.fn().mockImplementation((id, position, rotation, isLocal) => {
        const player = {
          id,
          position: new THREE.Vector3(position.x, position.y, position.z),
          rotation: { y: rotation?.y || 0 },
          userData: { isLocal, stats: {} }
        };
        mockGame.playerManager.players.set(id, player);
        return player;
      }),
      removePlayer: jest.fn().mockImplementation((id) => {
        mockGame.playerManager.players.delete(id);
        return true;
      }),
      updatePlayerColor: jest.fn(),
      updateHealthBar: jest.fn()
    };
    
    // Create NetworkManager instance
    networkManager = new MockNetworkManager(mockGame);
    
    // Initialize
    networkManager.init();
    
    // Get the socket
    mockSocket = networkManager.socket;
    
    // Set connected state
    networkManager.isConnected = true;
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Player Join/Leave Handling', () => {
    test('should handle new player joining the game', () => {
      // Setup
      const playerData = {
        id: 'new-player-123',
        position: { x: 10, y: 0, z: 10 },
        rotation: { y: 45 },
        stats: {
          life: 100,
          maxLife: 100,
          mana: 100,
          maxMana: 100,
          karma: 50,
          maxKarma: 100
        }
      };
      
      // Mock handlePlayerJoined method
      networkManager.handlePlayerJoined = jest.fn().mockImplementation((data) => {
        // Create the player
        const player = mockGame.playerManager.createPlayer(
          data.id,
          data.position,
          data.rotation,
          false // not local
        );
        
        // Set player stats
        if (player && data.stats) {
          player.userData.stats = { ...data.stats };
        }
        
        return player;
      });
      
      // Handle player joined
      const result = networkManager.handlePlayerJoined(playerData);
      
      // Verify player was added
      expect(mockGame.playerManager.createPlayer).toHaveBeenCalledWith(
        playerData.id,
        playerData.position,
        playerData.rotation,
        false
      );
      expect(result).toBeDefined();
      expect(result.userData.stats).toEqual(playerData.stats);
      expect(mockGame.playerManager.players.has(playerData.id)).toBe(true);
    });
    
    test('should handle player leaving the game', () => {
      // Setup - add a player first
      const playerId = 'player-to-remove';
      mockGame.playerManager.players.set(playerId, {
        id: playerId,
        position: new THREE.Vector3(10, 0, 10),
        userData: {}
      });
      
      // Mock handlePlayerLeft method
      networkManager.handlePlayerLeft = jest.fn().mockImplementation((id) => {
        return mockGame.playerManager.removePlayer(id);
      });
      
      // Verify player exists before removal
      expect(mockGame.playerManager.players.has(playerId)).toBe(true);
      
      // Handle player left
      const result = networkManager.handlePlayerLeft(playerId);
      
      // Verify player was removed
      expect(result).toBe(true);
      expect(mockGame.playerManager.removePlayer).toHaveBeenCalledWith(playerId);
      expect(mockGame.playerManager.players.has(playerId)).toBe(false);
    });
  });
  
  describe('Player Position Updates', () => {
    test('should handle individual player position updates', () => {
      // Setup - add a player first
      const playerId = 'remote-player-1';
      const player = {
        id: playerId,
        position: new THREE.Vector3(0, 0, 0),
        rotation: { y: 0 },
        userData: { stats: {} }
      };
      mockGame.playerManager.players.set(playerId, player);
      
      // Create update data
      const updateData = {
        id: playerId,
        position: { x: 15, y: 1, z: 20 },
        rotation: { y: 180 },
        path: 'dark',
        karma: 20,
        maxKarma: 100,
        life: 80,
        maxLife: 100,
        mana: 50,
        maxMana: 100
      };
      
      // Mock handlePlayerUpdate method
      networkManager.handlePlayerUpdate = jest.fn().mockImplementation((data) => {
        // Don't update local player from server data
        if (data.id === mockSocket.id) return false;
        
        const player = mockGame.playerManager.players.get(data.id);
        if (!player) return false;
        
        // Update position and rotation
        player.position.set(data.position.x, data.position.y, data.position.z);
        player.rotation.y = data.rotation.y;
        
        // Update player stats
        if (!player.userData) player.userData = {};
        player.userData.path = data.path;
        
        if (!player.userData.stats) player.userData.stats = {};
        player.userData.stats.karma = data.karma;
        player.userData.stats.maxKarma = data.maxKarma;
        player.userData.stats.life = data.life;
        player.userData.stats.maxLife = data.maxLife;
        player.userData.stats.mana = data.mana;
        player.userData.stats.maxMana = data.maxMana;
        
        // Update visual effects based on path
        mockGame.playerManager.updatePlayerColor(player);
        
        return true;
      });
      
      // Handle player update
      const result = networkManager.handlePlayerUpdate(updateData);
      
      // Verify player was updated
      expect(result).toBe(true);
      expect(player.position.set).toHaveBeenCalledWith(15, 1, 20);
      expect(player.rotation.y).toBe(180);
      expect(player.userData.path).toBe('dark');
      expect(player.userData.stats.karma).toBe(20);
      expect(player.userData.stats.life).toBe(80);
      expect(player.userData.stats.mana).toBe(50);
      expect(mockGame.playerManager.updatePlayerColor).toHaveBeenCalledWith(player);
    });
    
    test('should handle batch position updates for multiple players', () => {
      // Setup - add multiple players
      const player1Id = 'remote-player-1';
      const player2Id = 'remote-player-2';
      
      const player1 = {
        id: player1Id,
        position: new THREE.Vector3(0, 0, 0),
        rotation: { y: 0 },
        userData: { stats: {} }
      };
      
      const player2 = {
        id: player2Id,
        position: new THREE.Vector3(5, 0, 5),
        rotation: { y: 90 },
        userData: { stats: {} }
      };
      
      mockGame.playerManager.players.set(player1Id, player1);
      mockGame.playerManager.players.set(player2Id, player2);
      
      // Create batch update data
      const batchData = {
        positions: [
          {
            id: player1Id,
            position: { x: 10, y: 1, z: 10 },
            rotation: { y: 45 }
          },
          {
            id: player2Id,
            position: { x: 15, y: 1, z: 15 },
            rotation: { y: 135 }
          }
        ],
        timestamp: Date.now()
      };
      
      // Mock handleBatchPositionUpdate method
      networkManager.handleBatchPositionUpdate = jest.fn().mockImplementation((data) => {
        if (!data || !data.positions || !Array.isArray(data.positions)) {
          return false;
        }
        
        // Process each position update
        for (const posData of data.positions) {
          // Skip local player
          if (posData.id === mockSocket.id) continue;
          
          const player = mockGame.playerManager.players.get(posData.id);
          if (!player) continue;
          
          // Update position and rotation
          player.position.set(posData.position.x, posData.position.y, posData.position.z);
          player.rotation.y = posData.rotation.y;
        }
        
        return true;
      });
      
      // Handle batch position update
      const result = networkManager.handleBatchPositionUpdate(batchData);
      
      // Verify players were updated
      expect(result).toBe(true);
      expect(player1.position.set).toHaveBeenCalledWith(10, 1, 10);
      expect(player1.rotation.y).toBe(45);
      expect(player2.position.set).toHaveBeenCalledWith(15, 1, 15);
      expect(player2.rotation.y).toBe(135);
    });
  });
  
  describe('Player State Synchronization', () => {
    test('should handle batch state updates for multiple players', () => {
      // Setup - add multiple players
      const player1Id = 'remote-player-1';
      const player2Id = 'remote-player-2';
      
      const player1 = {
        id: player1Id,
        position: new THREE.Vector3(0, 0, 0),
        rotation: { y: 0 },
        userData: { stats: {} }
      };
      
      const player2 = {
        id: player2Id,
        position: new THREE.Vector3(5, 0, 5),
        rotation: { y: 90 },
        userData: { stats: {} }
      };
      
      mockGame.playerManager.players.set(player1Id, player1);
      mockGame.playerManager.players.set(player2Id, player2);
      
      // Create batch state update data
      const batchData = {
        states: [
          {
            id: player1Id,
            path: 'light',
            karma: 80,
            maxKarma: 100,
            life: 90,
            maxLife: 100,
            mana: 70,
            maxMana: 100
          },
          {
            id: player2Id,
            path: 'dark',
            karma: 20,
            maxKarma: 100,
            life: 60,
            maxLife: 100,
            mana: 40,
            maxMana: 100
          }
        ],
        timestamp: Date.now()
      };
      
      // Mock handleBatchStateUpdate method
      networkManager.handleBatchStateUpdate = jest.fn().mockImplementation((data) => {
        if (!data || !data.states || !Array.isArray(data.states)) {
          return false;
        }
        
        // Process each state update
        for (const stateData of data.states) {
          // Skip local player
          if (stateData.id === mockSocket.id) continue;
          
          const player = mockGame.playerManager.players.get(stateData.id);
          if (!player) continue;
          
          // Update player stats
          if (!player.userData) player.userData = {};
          player.userData.path = stateData.path;
          
          if (!player.userData.stats) player.userData.stats = {};
          player.userData.stats.karma = stateData.karma;
          player.userData.stats.maxKarma = stateData.maxKarma;
          player.userData.stats.life = stateData.life;
          player.userData.stats.maxLife = stateData.maxLife;
          player.userData.stats.mana = stateData.mana;
          player.userData.stats.maxMana = stateData.maxMana;
          
          // Update visual effects based on path
          mockGame.playerManager.updatePlayerColor(player);
          
          // Update health bar
          mockGame.playerManager.updateHealthBar(player);
        }
        
        return true;
      });
      
      // Handle batch state update
      const result = networkManager.handleBatchStateUpdate(batchData);
      
      // Verify players were updated
      expect(result).toBe(true);
      expect(player1.userData.path).toBe('light');
      expect(player1.userData.stats.karma).toBe(80);
      expect(player1.userData.stats.life).toBe(90);
      expect(player1.userData.stats.mana).toBe(70);
      expect(player2.userData.path).toBe('dark');
      expect(player2.userData.stats.karma).toBe(20);
      expect(player2.userData.stats.life).toBe(60);
      expect(player2.userData.stats.mana).toBe(40);
      expect(mockGame.playerManager.updatePlayerColor).toHaveBeenCalledTimes(2);
      expect(mockGame.playerManager.updateHealthBar).toHaveBeenCalledTimes(2);
    });
    
    test('should handle world state updates', () => {
      // Setup - add multiple players
      const player1Id = 'remote-player-1';
      const player2Id = 'remote-player-2';
      
      const player1 = {
        id: player1Id,
        position: new THREE.Vector3(0, 0, 0),
        rotation: { y: 0 },
        userData: { stats: {} }
      };
      
      const player2 = {
        id: player2Id,
        position: new THREE.Vector3(5, 0, 5),
        rotation: { y: 90 },
        userData: { stats: {} }
      };
      
      mockGame.playerManager.players.set(player1Id, player1);
      mockGame.playerManager.players.set(player2Id, player2);
      
      // Create world state update data
      const worldData = {
        players: [
          {
            id: player1Id,
            position: { x: 10, y: 1, z: 10 },
            rotation: { y: 45 },
            path: 'light',
            karma: 80,
            life: 90,
            mana: 70
          },
          {
            id: player2Id,
            position: { x: 15, y: 1, z: 15 },
            rotation: { y: 135 },
            path: 'dark',
            karma: 20,
            life: 60,
            mana: 40
          }
        ],
        environment: {
          time: 12000, // noon
          weather: 'sunny'
        },
        timestamp: Date.now()
      };
      
      // Add environment manager to mockGame
      mockGame.environmentManager = {
        setTimeOfDay: jest.fn(),
        setWeather: jest.fn()
      };
      
      // Mock handleWorldStateUpdate method
      networkManager.handleWorldStateUpdate = jest.fn().mockImplementation((data) => {
        if (!data) return false;
        
        // Update players
        if (data.players && Array.isArray(data.players)) {
          for (const playerData of data.players) {
            // Skip local player
            if (playerData.id === mockSocket.id) continue;
            
            const player = mockGame.playerManager.players.get(playerData.id);
            if (!player) continue;
            
            // Update position and rotation
            player.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
            player.rotation.y = playerData.rotation.y;
            
            // Update player stats
            if (!player.userData) player.userData = {};
            player.userData.path = playerData.path;
            
            if (!player.userData.stats) player.userData.stats = {};
            player.userData.stats.karma = playerData.karma;
            player.userData.stats.life = playerData.life;
            player.userData.stats.mana = playerData.mana;
            
            // Update visual effects
            mockGame.playerManager.updatePlayerColor(player);
            mockGame.playerManager.updateHealthBar(player);
          }
        }
        
        // Update environment
        if (data.environment) {
          if (data.environment.time !== undefined && mockGame.environmentManager) {
            mockGame.environmentManager.setTimeOfDay(data.environment.time);
          }
          
          if (data.environment.weather !== undefined && mockGame.environmentManager) {
            mockGame.environmentManager.setWeather(data.environment.weather);
          }
        }
        
        return true;
      });
      
      // Handle world state update
      const result = networkManager.handleWorldStateUpdate(worldData);
      
      // Verify world state was updated
      expect(result).toBe(true);
      
      // Verify players were updated
      expect(player1.position.set).toHaveBeenCalledWith(10, 1, 10);
      expect(player1.rotation.y).toBe(45);
      expect(player1.userData.path).toBe('light');
      expect(player1.userData.stats.karma).toBe(80);
      expect(player1.userData.stats.life).toBe(90);
      expect(player1.userData.stats.mana).toBe(70);
      
      expect(player2.position.set).toHaveBeenCalledWith(15, 1, 15);
      expect(player2.rotation.y).toBe(135);
      expect(player2.userData.path).toBe('dark');
      expect(player2.userData.stats.karma).toBe(20);
      expect(player2.userData.stats.life).toBe(60);
      expect(player2.userData.stats.mana).toBe(40);
      
      // Verify environment was updated
      expect(mockGame.environmentManager.setTimeOfDay).toHaveBeenCalledWith(12000);
      expect(mockGame.environmentManager.setWeather).toHaveBeenCalledWith('sunny');
    });
  });
  
  describe('Pending Updates Handling', () => {
    test('should store updates for players not yet created', () => {
      // Setup
      const nonExistentPlayerId = 'not-yet-created-player';
      
      // Create update data for non-existent player
      const updateData = {
        type: 'lifeUpdate',
        data: {
          life: 80,
          maxLife: 100
        }
      };
      
      // Mock applyPendingUpdates method
      networkManager.storePendingUpdate = jest.fn().mockImplementation((playerId, update) => {
        if (!networkManager.pendingUpdates.has(playerId)) {
          networkManager.pendingUpdates.set(playerId, []);
        }
        
        networkManager.pendingUpdates.get(playerId).push(update);
        return true;
      });
      
      // Store pending update
      const result = networkManager.storePendingUpdate(nonExistentPlayerId, updateData);
      
      // Verify update was stored
      expect(result).toBe(true);
      expect(networkManager.pendingUpdates.has(nonExistentPlayerId)).toBe(true);
      expect(networkManager.pendingUpdates.get(nonExistentPlayerId)).toContainEqual(updateData);
    });
    
    test('should apply pending updates when player is created', () => {
      // Setup
      const newPlayerId = 'new-player-to-create';
      
      // Add pending updates for this player
      const pendingUpdates = [
        {
          type: 'lifeUpdate',
          data: {
            life: 80,
            maxLife: 100
          }
        },
        {
          type: 'manaUpdate',
          data: {
            mana: 60,
            maxMana: 100
          }
        }
      ];
      
      networkManager.pendingUpdates.set(newPlayerId, pendingUpdates);
      
      // Mock applyPendingUpdates method
      networkManager.applyPendingUpdates = jest.fn().mockImplementation((playerId) => {
        if (!networkManager.pendingUpdates.has(playerId)) {
          return false;
        }
        
        // Get the player
        const player = mockGame.playerManager.getPlayerById(playerId);
        if (!player) {
          return false;
        }
        
        // Process all pending updates for this player
        const updates = networkManager.pendingUpdates.get(playerId);
        for (const update of updates) {
          if (update.type === 'lifeUpdate') {
            if (!player.userData) player.userData = {};
            if (!player.userData.stats) player.userData.stats = {};
            
            player.userData.stats.life = update.data.life;
            player.userData.stats.maxLife = update.data.maxLife;
            
            mockGame.playerManager.updateHealthBar(player);
          } else if (update.type === 'manaUpdate') {
            if (!player.userData) player.userData = {};
            if (!player.userData.stats) player.userData.stats = {};
            
            player.userData.stats.mana = update.data.mana;
            player.userData.stats.maxMana = update.data.maxMana;
          }
        }
        
        // Clear pending updates for this player
        networkManager.pendingUpdates.delete(playerId);
        
        return true;
      });
      
      // Add getPlayerById method to mockGame.playerManager
      mockGame.playerManager.getPlayerById = jest.fn().mockImplementation((id) => {
        return mockGame.playerManager.players.get(id);
      });
      
      // Create the player
      const player = mockGame.playerManager.createPlayer(
        newPlayerId,
        { x: 0, y: 0, z: 0 },
        { y: 0 },
        false
      );
      
      // Apply pending updates
      const result = networkManager.applyPendingUpdates(newPlayerId);
      
      // Verify updates were applied
      expect(result).toBe(true);
      expect(player.userData.stats.life).toBe(80);
      expect(player.userData.stats.maxLife).toBe(100);
      expect(player.userData.stats.mana).toBe(60);
      expect(player.userData.stats.maxMana).toBe(100);
      expect(mockGame.playerManager.updateHealthBar).toHaveBeenCalledWith(player);
      expect(networkManager.pendingUpdates.has(newPlayerId)).toBe(false);
    });
  });
}); 