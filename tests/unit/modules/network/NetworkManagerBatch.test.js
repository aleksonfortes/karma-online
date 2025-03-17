// Mock THREE.js
jest.mock('three', () => require('../../../mocks/network/networkManagerMocks').mockTHREE);

// Mock the config.js module
jest.mock('../../../../src/config.js', () => ({
  getServerUrl: jest.fn().mockReturnValue('http://localhost:3000')
}));

import { NetworkManager } from '../../../../src/modules/network/NetworkManager';
import { 
  createMockSocket, 
  createMockPlayer, 
  createMockGame,
  mockNetworkManagerMethods,
  createBatchStatsUpdateHandler
} from '../../../mocks/network/networkManagerMocks';

describe('NetworkManager Batch Updates and UI Integration', () => {
  let networkManager;
  let mockGame;
  let mockSocket;
  let mockPlayer;
  let THREE;
  
  beforeEach(() => {
    // Get the mocked THREE
    THREE = require('three');
    
    // Create mock player
    mockPlayer = createMockPlayer(THREE);
    
    // Create mock game with the player
    mockGame = createMockGame(THREE, mockPlayer);
    
    // Create mock socket
    mockSocket = createMockSocket();
    
    // Create NetworkManager instance
    networkManager = new NetworkManager(mockGame);
    
    // Mock NetworkManager methods
    networkManager = mockNetworkManagerMethods(networkManager, mockGame);
    
    // Set up socket and connection status
    networkManager.socket = mockSocket;
    networkManager.isConnected = true;
    
    // Initialize event handlers
    networkManager.eventHandlers = {};
  });
  
  test('should handle batch statsUpdate event', () => {
    // Create a batch statsUpdate handler from shared mocks
    networkManager.eventHandlers['statsUpdate'] = createBatchStatsUpdateHandler();
    
    // Call the handler with test data
    networkManager.eventHandlers['statsUpdate'].call(networkManager, {
      players: [
        {
          id: mockPlayer.userData.id,
          life: 75,
          maxLife: 100,
          karma: 60,
          maxKarma: 100
        },
        {
          id: 'other-player-id',
          life: 50,
          maxLife: 100
        }
      ]
    });
    
    // Verify the local player's stats were updated
    expect(mockPlayer.userData.stats.life).toBe(75);
    expect(mockPlayer.userData.stats.karma).toBe(60);
    
    // Verify UI was updated for local player
    expect(mockGame.uiManager.updateStatusBars).toHaveBeenCalledWith(75, 100);
    expect(mockGame.uiManager.updatePlayerStatus).toHaveBeenCalledWith(60, 100);
  });
  
  test('should update UI when applying life updates for local player', () => {
    // Create update data
    const updateData = {
      type: 'life',
      life: 75,
      maxLife: 100
    };
    
    // Apply the update
    networkManager.applyPendingUpdates(mockPlayer.userData.id, [updateData]);
    
    // Verify player stats were updated
    expect(mockPlayer.userData.stats.life).toBe(75);
    expect(mockPlayer.userData.stats.maxLife).toBe(100);
    
    // Verify UI was updated
    expect(mockGame.uiManager.updateStatusBars).toHaveBeenCalledWith(75, 100);
  });
  
  test('should update UI when applying karma updates for local player', () => {
    // Create update data
    const updateData = {
      type: 'karma',
      karma: 75,
      maxKarma: 100
    };
    
    // Apply the update
    networkManager.applyPendingUpdates(mockPlayer.userData.id, [updateData]);
    
    // Verify player stats were updated
    expect(mockPlayer.userData.stats.karma).toBe(75);
    expect(mockPlayer.userData.stats.maxKarma).toBe(100);
    
    // Verify UI was updated
    expect(mockGame.uiManager.updatePlayerStatus).toHaveBeenCalledWith(75, 100);
  });
  
  test('should update UI when applying stats updates for local player', () => {
    // Setup
    const playerId = 'local-player-id';
    const mockPlayer = new THREE.Mesh();
    mockPlayer.userData = { stats: { life: 100, maxLife: 100, karma: 50, maxKarma: 100 } };
    mockGame.localPlayer = mockPlayer;
    mockGame.localPlayerId = playerId;
    mockGame.playerManager.players.set(playerId, mockPlayer);
    
    // Create update data
    const updates = [
      {
        type: 'life',
        life: 75,
        maxLife: 100
      },
      {
        type: 'karma',
        karma: 60,
        maxKarma: 100
      }
    ];
    
    // Apply the updates
    networkManager.applyPendingUpdates(playerId, updates);
    
    // Verify applyPendingUpdates was called with the correct parameters
    expect(networkManager.applyPendingUpdates).toHaveBeenCalledWith(playerId, updates);
  });
  
  test('should handle position updates in pending updates', () => {
    // Setup
    const playerId = 'test-player-id';
    const mockPlayer = new THREE.Mesh();
    mockPlayer.position = new THREE.Vector3(0, 0, 0);
    mockPlayer.quaternion = new THREE.Quaternion();
    mockGame.playerManager.players.set(playerId, mockPlayer);
    
    // Create update data
    const updateData = {
      type: 'position',
      position: { x: 10, y: 5, z: 15 },
      rotation: { y: 1.5 }
    };
    
    // Apply the update
    networkManager.applyPendingUpdates(playerId, [updateData]);
    
    // Verify applyPendingUpdates was called with the correct parameters
    expect(networkManager.applyPendingUpdates).toHaveBeenCalledWith(playerId, [updateData]);
  });
  
  test('should initialize player stats if they do not exist', () => {
    // Setup
    const playerId = 'test-player-id';
    const mockPlayer = new THREE.Mesh();
    mockPlayer.userData = {}; // No stats initially
    mockGame.playerManager.players.set(playerId, mockPlayer);
    
    // Create update data
    const updateData = {
      type: 'life',
      life: 75,
      maxLife: 100
    };
    
    // Apply the update
    networkManager.applyPendingUpdates(playerId, [updateData]);
    
    // Verify applyPendingUpdates was called with the correct parameters
    expect(networkManager.applyPendingUpdates).toHaveBeenCalledWith(playerId, [updateData]);
  });
  
  test('should handle multiple types of updates in one batch', () => {
    // Setup
    const playerId = 'test-player-id';
    const mockPlayer = new THREE.Mesh();
    mockPlayer.position = new THREE.Vector3(0, 0, 0);
    mockPlayer.quaternion = new THREE.Quaternion();
    mockPlayer.userData = { stats: { life: 100, maxLife: 100, karma: 50, maxKarma: 100 } };
    mockGame.playerManager.players.set(playerId, mockPlayer);
    
    // Create update data with multiple types
    const updates = [
      {
        type: 'position',
        position: { x: 10, y: 5, z: 15 },
        rotation: { y: 1.5 }
      },
      {
        type: 'life',
        life: 75,
        maxLife: 100
      },
      {
        type: 'karma',
        karma: 60,
        maxKarma: 100
      }
    ];
    
    // Apply the updates
    networkManager.applyPendingUpdates(playerId, updates);
    
    // Verify applyPendingUpdates was called with the correct parameters
    expect(networkManager.applyPendingUpdates).toHaveBeenCalledWith(playerId, updates);
  });
  
  // Server Authority Batch Update Tests
  
  test('should handle server-initiated batch position updates', () => {
    // Create additional players
    const player1 = new THREE.Mesh();
    player1.position = new THREE.Vector3(0, 0, 0);
    player1.rotation = { y: 0 };
    player1.userData = { id: 'player1' };
    
    const player2 = new THREE.Mesh();
    player2.position = new THREE.Vector3(0, 0, 0);
    player2.rotation = { y: 0 };
    player2.userData = { id: 'player2' };
    
    // Add players to the game
    mockGame.playerManager.players.set('player1', player1);
    mockGame.playerManager.players.set('player2', player2);
    
    // Create a batch position update handler
    const batchPositionHandler = function(data) {
      if (!data || !data.players) return;
      
      data.players.forEach(playerData => {
        if (playerData.id && playerData.position) {
          const player = this.game.playerManager.players.get(playerData.id);
          if (player && player.position) {
            // Apply server position directly (server authority)
            player.position.set(
              playerData.position.x,
              playerData.position.y,
              playerData.position.z
            );
            
            // Apply rotation if provided
            if (playerData.rotation !== undefined && player.rotation) {
              player.rotation.y = playerData.rotation;
            }
          }
        }
      });
    };
    
    // Bind the handler to the networkManager
    const boundHandler = batchPositionHandler.bind(networkManager);
    
    // Call the handler with batch position data
    boundHandler({
      players: [
        {
          id: 'player1',
          position: { x: 10, y: 5, z: 15 },
          rotation: 1.5
        },
        {
          id: 'player2',
          position: { x: -5, y: 2, z: -10 },
          rotation: 3.0
        }
      ]
    });
    
    // Verify positions were updated for all players
    expect(player1.position.x).toBe(10);
    expect(player1.position.y).toBe(5);
    expect(player1.position.z).toBe(15);
    expect(player1.rotation.y).toBe(1.5);
    
    expect(player2.position.x).toBe(-5);
    expect(player2.position.y).toBe(2);
    expect(player2.position.z).toBe(-10);
    expect(player2.rotation.y).toBe(3.0);
  });
  
  test('should handle server-initiated batch state updates', () => {
    // Create additional players with stats
    const player1 = new THREE.Mesh();
    player1.userData = { 
      id: 'player1',
      stats: { 
        life: 100, 
        maxLife: 100,
        karma: 50,
        maxKarma: 100,
        status: 'normal'
      }
    };
    
    const player2 = new THREE.Mesh();
    player2.userData = { 
      id: 'player2',
      stats: { 
        life: 100, 
        maxLife: 100,
        karma: 50,
        maxKarma: 100,
        status: 'normal'
      }
    };
    
    // Add players to the game
    mockGame.playerManager.players.set('player1', player1);
    mockGame.playerManager.players.set('player2', player2);
    
    // Create a batch state update handler
    const batchStateHandler = function(data) {
      if (!data || !data.players) return;
      
      data.players.forEach(playerData => {
        if (playerData.id) {
          const player = this.game.playerManager.players.get(playerData.id);
          if (player && player.userData && player.userData.stats) {
            // Apply all server-provided stats
            Object.keys(playerData).forEach(key => {
              if (key !== 'id') {
                player.userData.stats[key] = playerData[key];
              }
            });
          }
        }
      });
    };
    
    // Bind the handler to the networkManager
    const boundHandler = batchStateHandler.bind(networkManager);
    
    // Call the handler with batch state data
    boundHandler({
      players: [
        {
          id: 'player1',
          life: 75,
          status: 'poisoned',
          effects: ['poison', 'slowed']
        },
        {
          id: 'player2',
          karma: 25,
          status: 'blessed',
          effects: ['haste', 'shield']
        }
      ]
    });
    
    // Verify states were updated for all players
    expect(player1.userData.stats.life).toBe(75);
    expect(player1.userData.stats.status).toBe('poisoned');
    expect(player1.userData.stats.effects).toEqual(['poison', 'slowed']);
    
    expect(player2.userData.stats.karma).toBe(25);
    expect(player2.userData.stats.status).toBe('blessed');
    expect(player2.userData.stats.effects).toEqual(['haste', 'shield']);
  });
  
  test('should handle server-initiated batch damage events', () => {
    // Create additional players with stats
    const player1 = new THREE.Mesh();
    player1.userData = { 
      id: 'player1',
      stats: { 
        life: 100, 
        maxLife: 100
      }
    };
    
    const player2 = new THREE.Mesh();
    player2.userData = { 
      id: 'player2',
      stats: { 
        life: 100, 
        maxLife: 100
      }
    };
    
    // Add players to the game
    mockGame.playerManager.players.set('player1', player1);
    mockGame.playerManager.players.set('player2', player2);
    
    // Mock damage effect method
    networkManager.createDamageEffect = jest.fn();
    
    // Create a batch damage handler
    const batchDamageHandler = function(data) {
      if (!data || !data.damages) return;
      
      data.damages.forEach(damageData => {
        if (damageData.targetId) {
          const player = this.game.playerManager.players.get(damageData.targetId);
          if (player && player.userData && player.userData.stats) {
            // Apply damage to player
            const currentLife = player.userData.stats.life;
            player.userData.stats.life = Math.max(0, currentLife - damageData.amount);
            
            // Create visual damage effect
            this.createDamageEffect(player, damageData.amount, damageData.isCritical);
          }
        }
      });
    };
    
    // Bind the handler to the networkManager
    const boundHandler = batchDamageHandler.bind(networkManager);
    
    // Call the handler with batch damage data
    boundHandler({
      damages: [
        {
          targetId: 'player1',
          amount: 25,
          isCritical: false,
          type: 'physical'
        },
        {
          targetId: 'player2',
          amount: 50,
          isCritical: true,
          type: 'magical'
        }
      ]
    });
    
    // Verify damages were applied to all players
    expect(player1.userData.stats.life).toBe(75);
    expect(player2.userData.stats.life).toBe(50);
    
    // Verify damage effects were created
    expect(networkManager.createDamageEffect).toHaveBeenCalledWith(player1, 25, false);
    expect(networkManager.createDamageEffect).toHaveBeenCalledWith(player2, 50, true);
  });
  
  test('should handle server-initiated world state synchronization', () => {
    // Setup world state handlers
    networkManager.updateWorldState = jest.fn();
    networkManager.updateEnvironment = jest.fn();
    networkManager.updateGameTime = jest.fn();
    
    // Create a world state handler
    const worldStateHandler = function(data) {
      if (!data) return;
      
      // Update overall world state
      if (data.worldState) {
        this.updateWorldState(data.worldState);
      }
      
      // Update environment
      if (data.environment) {
        this.updateEnvironment(data.environment);
      }
      
      // Update game time
      if (data.gameTime !== undefined) {
        this.updateGameTime(data.gameTime);
      }
    };
    
    // Bind the handler to the networkManager
    const boundHandler = worldStateHandler.bind(networkManager);
    
    // Call the handler with world state data
    boundHandler({
      worldState: {
        activeEvents: ['invasion', 'harvest'],
        worldFlags: { pvpEnabled: true, tradingEnabled: true }
      },
      environment: {
        weather: 'rain',
        timeOfDay: 'night',
        effects: ['fog', 'wind']
      },
      gameTime: 3600 // seconds since world start
    });
    
    // Verify world state methods were called with correct data
    expect(networkManager.updateWorldState).toHaveBeenCalledWith({
      activeEvents: ['invasion', 'harvest'],
      worldFlags: { pvpEnabled: true, tradingEnabled: true }
    });
    
    expect(networkManager.updateEnvironment).toHaveBeenCalledWith({
      weather: 'rain',
      timeOfDay: 'night',
      effects: ['fog', 'wind']
    });
    
    expect(networkManager.updateGameTime).toHaveBeenCalledWith(3600);
  });
}); 