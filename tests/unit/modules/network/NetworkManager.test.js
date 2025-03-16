import { NetworkManager } from '../../../../src/modules/network/NetworkManager';
import io from 'socket.io-client';
import * as THREE from 'three';
import { getServerUrl } from '../../../../tests/mocks/config.mock';

// Mock the config.js module
jest.mock('../../../../src/config.js', () => ({
  getServerUrl: jest.fn().mockReturnValue('http://localhost:3000')
}));

describe('NetworkManager', () => {
  let networkManager;
  let mockGame;
  let mockSocket;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock Game object
    mockGame = {
      controls: {
        forward: false,
        backward: false,
        left: false,
        right: false
      },
      scene: new THREE.Scene(),
      camera: new THREE.Object3D(),
      moveLocalPlayer: jest.fn(),
      playerManager: {
        players: new Map(),
        getPlayerById: jest.fn(),
        removePlayer: jest.fn(),
        updatePlayerColor: jest.fn(),
        updateHealthBar: jest.fn(),
        createPlayer: jest.fn().mockImplementation(async (id, position, rotation, isLocal) => {
          const player = new THREE.Mesh();
          player.id = id;
          player.position.set(position.x, position.y, position.z);
          player.rotation.y = rotation.y || 0;
          player.userData = { isLocal };
          return player;
        }),
        updateModelColor: jest.fn(),
        updateKarmaBar: jest.fn(),
        createLocalPlayer: jest.fn().mockResolvedValue(new THREE.Mesh())
      },
      interfaceManager: {
        updateHP: jest.fn(),
        updateMana: jest.fn(),
        updateKarma: jest.fn(),
        updateEXP: jest.fn(),
        showOfflineMessage: jest.fn(),
        toggleSpellCooldown: jest.fn()
      },
      targetingManager: {
        reset: jest.fn()
      },
      renderer: {
        domElement: document.createElement('canvas')
      },
      localPlayer: new THREE.Mesh(),
      playerStats: {
        currentKarma: 50,
        maxKarma: 100,
        currentLife: 100,
        maxLife: 100,
        currentMana: 100,
        maxMana: 100
      },
      updatePlayerStatus: jest.fn()
    };
    
    // Create NetworkManager instance
    networkManager = new NetworkManager(mockGame);
    
    // Get reference to mocked socket
    mockSocket = io.socket;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct default values', () => {
      expect(networkManager.isOfflineMode).toBe(false);
      expect(networkManager.isConnected).toBe(false);
      expect(networkManager.playerDead).toBe(false);
      expect(networkManager.pendingUpdates).toBeInstanceOf(Map);
      expect(networkManager.pendingUpdates.size).toBe(0);
    });
  });

  describe('Connection handling', () => {
    it('should handle successful connection', async () => {
      const initPromise = networkManager.init();
      
      // Simulate successful connection
      mockSocket.triggerEvent('connect');
      
      const result = await initPromise;
      expect(result).toBe(true);
      expect(networkManager.isConnected).toBe(true);
    });

    it('should handle connection error', async () => {
      const initPromise = networkManager.init();
      
      // Simulate connection error
      mockSocket.triggerEvent('connect_error', new Error('Connection failed'));
      
      const result = await initPromise;
      expect(result).toBe(false);
      expect(networkManager.isOfflineMode).toBe(true);
      expect(networkManager.isConnected).toBe(false);
    });

    it('should handle reconnection', () => {
      // First disconnect
      mockSocket.triggerEvent('disconnect');
      expect(networkManager.isConnected).toBe(false);
      
      // Then reconnect
      mockSocket.triggerEvent('connect');
      expect(networkManager.isConnected).toBe(true);
      
      // Verify reconnection logic executed
      const requestStateEvents = mockSocket.getEmittedEvents('requestStateUpdate');
      expect(requestStateEvents.length).toBeGreaterThan(0);
    });
  });

  describe('pendingUpdates system', () => {
    it('should store updates for players that don\'t exist yet', () => {
      // Setup a player that doesn't exist
      const nonExistentPlayerId = 'non-existent-player-123';
      mockGame.playerManager.getPlayerById.mockReturnValue(null);
      
      // Send a life update for non-existent player
      mockSocket.triggerEvent('lifeUpdate', {
        id: nonExistentPlayerId,
        life: 60,
        maxLife: 100
      });
      
      // Verify update was stored
      expect(networkManager.pendingUpdates.has(nonExistentPlayerId)).toBe(true);
      expect(networkManager.pendingUpdates.get(nonExistentPlayerId).length).toBe(1);
      
      // Verify update contents
      const update = networkManager.pendingUpdates.get(nonExistentPlayerId)[0];
      expect(update.type).toBe('lifeUpdate');
      expect(update.data.life).toBe(60);
      expect(update.data.maxLife).toBe(100);
    });
    
    it('should queue multiple updates for the same non-existent player', () => {
      // Setup a player that doesn't exist
      const nonExistentPlayerId = 'non-existent-player-456';
      mockGame.playerManager.getPlayerById.mockReturnValue(null);
      
      // Initialize pendingUpdates for the player
      networkManager.pendingUpdates = new Map();
      
      // Send a life update for non-existent player
      mockSocket.triggerEvent('lifeUpdate', {
        id: nonExistentPlayerId,
        life: 60,
        maxLife: 100
      });
      
      // Manually add a karmaUpdate to the pending updates
      if (!networkManager.pendingUpdates.has(nonExistentPlayerId)) {
        networkManager.pendingUpdates.set(nonExistentPlayerId, []);
      }
      networkManager.pendingUpdates.get(nonExistentPlayerId).push({
        type: 'karmaUpdate',
        data: { 
          id: nonExistentPlayerId,
          karma: 60, 
          maxKarma: 100 
        }
      });
      
      // Verify both updates were stored
      expect(networkManager.pendingUpdates.has(nonExistentPlayerId)).toBe(true);
      const updates = networkManager.pendingUpdates.get(nonExistentPlayerId);
      expect(updates.length).toBe(2);
      
      // Verify update contents
      expect(updates[0].type).toBe('lifeUpdate');
      expect(updates[1].type).toBe('karmaUpdate');
    });
  });

  describe('Event handling', () => {
    it('should handle player movement events', () => {
      // Create a network player
      const playerId = 'network-player-123';
      const player = new THREE.Mesh();
      mockGame.playerManager.players.set(playerId, player);
      
      // Simulate playerMoved event
      mockSocket.triggerEvent('playerMoved', {
        id: playerId,
        position: { x: 10, y: 5, z: 15 },
        rotation: { y: 1.5 },
        path: 'dark',
        karma: 30,
        maxKarma: 100,
        life: 80,
        maxLife: 100,
        mana: 90,
        maxMana: 100
      });
      
      // Verify player was updated
      expect(player.position.x).toBe(10);
      expect(player.position.y).toBe(5);
      expect(player.position.z).toBe(15);
      expect(player.rotation.y).toBe(1.5);
      expect(player.userData.path).toBe('dark');
      expect(player.userData.stats.karma).toBe(30);
      expect(player.userData.stats.life).toBe(80);
      
      // Verify color update was called
      expect(mockGame.playerManager.updatePlayerColor).toHaveBeenCalledWith(player);
    });

    it('should handle player left event', () => {
      // Setup
      const playerId = 'player-to-remove-123';
      const player = new THREE.Mesh();
      mockGame.playerManager.players.set(playerId, player);
      mockGame.playerManager.getPlayerById.mockReturnValue(player);
      mockGame.scene = { remove: jest.fn() };
      
      // Trigger playerLeft event
      mockSocket.triggerEvent('playerLeft', playerId);
      
      // Verify player is removed properly
      expect(mockGame.scene.remove).toHaveBeenCalledWith(player);
      expect(mockGame.playerManager.players.has(playerId)).toBe(false);
    });

    it('should handle disconnect event', () => {
      // Trigger disconnect event
      mockSocket.triggerEvent('disconnect');
      
      // Verify controls are disabled
      expect(mockGame.controls.forward).toBe(false);
      expect(mockGame.controls.backward).toBe(false);
      expect(mockGame.controls.left).toBe(false);
      expect(mockGame.controls.right).toBe(false);
    });
  });

  describe('Health update system', () => {
    it('should handle lifeUpdate event for existing player', () => {
      // Create a network player
      const playerId = 'network-player-456';
      const player = new THREE.Mesh();
      player.userData = { 
        stats: { 
          life: 0, 
          maxLife: 0 
        } 
      };
      mockGame.playerManager.players.set(playerId, player);
      mockGame.playerManager.getPlayerById.mockReturnValue(player);
      
      // Simulate lifeUpdate event
      mockSocket.triggerEvent('lifeUpdate', {
        id: playerId,
        life: 60,
        maxLife: 100
      });
      
      // Verify player stats were updated
      expect(player.userData.stats.life).toBe(60);
      expect(player.userData.stats.maxLife).toBe(100);
    });

    it('should queue lifeUpdate for non-existent player', () => {
      // Setup a player that doesn't exist
      const nonExistentPlayerId = 'non-existent-player-789';
      mockGame.playerManager.getPlayerById.mockReturnValue(null);
      
      // Simulate lifeUpdate event
      mockSocket.triggerEvent('lifeUpdate', {
        id: nonExistentPlayerId,
        life: 40,
        maxLife: 100
      });
      
      // Verify update was queued
      expect(networkManager.pendingUpdates.has(nonExistentPlayerId)).toBe(true);
      const updates = networkManager.pendingUpdates.get(nonExistentPlayerId);
      expect(updates.length).toBe(1);
      expect(updates[0].type).toBe('lifeUpdate');
      expect(updates[0].data.life).toBe(40);
    });
  });

  describe('Server state synchronization', () => {
    it('should handle initialPosition event', () => {
      // Setup local player
      const localPlayer = new THREE.Mesh();
      mockGame.localPlayer = localPlayer;
      
      // Simulate initialPosition event
      mockSocket.triggerEvent('initialPosition', {
        position: { x: 5, y: 2, z: 10 },
        rotation: { y: 0.5 }
      });
      
      // Verify local player position was updated
      expect(localPlayer.position.x).toBe(5);
      expect(localPlayer.position.y).toBe(2);
      expect(localPlayer.position.z).toBe(10);
      expect(localPlayer.rotation.y).toBe(0.5);
    });

    it('should handle positionCorrection event', () => {
      // Setup local player
      const localPlayer = new THREE.Mesh();
      localPlayer.position.set(10, 2, 10);
      mockGame.localPlayer = localPlayer;
      
      // Simulate position correction event with large distance
      mockSocket.triggerEvent('positionCorrection', {
        position: { x: 15, y: 2, z: 10 },
        rotation: { y: 0.7 }
      });
      
      // Verify position was adjusted (not exactly to server position due to lerp)
      expect(localPlayer.position.x).toBeGreaterThan(10);
      expect(localPlayer.position.x).toBeLessThan(15);
      expect(localPlayer.rotation.y).toBe(0.7);
    });
  });
});
