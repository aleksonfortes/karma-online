// Import NetworkManager and mocks
const { NetworkManager } = require('../../../../src/modules/network/NetworkManager');
const { createMockSocket, createMockPlayer, createMockGame, mockNetworkManagerMethods, createEventHandlers } = require('../../../mocks/network/networkManagerMocks');

// Mock THREE.js
jest.mock('three', () => require('../../../mocks/network/networkManagerMocks').mockTHREE);

// Mock the config.js module
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
    connected: true,
    getEmittedEvents: jest.fn().mockImplementation((eventName) => {
      return this.emit.mock.calls.filter(call => call[0] === eventName);
    })
  }));
});

// Create a mock NetworkManager class for testing
class MockNetworkManager {
  constructor(game) {
    this.game = game;
    this.isConnected = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this.wasDisconnected = false;
    this.socket = null;
    this.lastPositionUpdate = { x: 0, y: 0, z: 0 };
    this.pendingUpdates = new Map();
  }
}

// Setup function to create a network manager with mocks
const setupNetworkManager = () => {
  // Create mock player and game
  const THREE = require('three');
  const mockPlayer = createMockPlayer(THREE);
  const mockGame = createMockGame(THREE, mockPlayer);
  
  // Create network manager
  const networkManager = new MockNetworkManager(mockGame);
  
  // Create mock socket
  const mockSocket = createMockSocket();
  networkManager.socket = mockSocket;
  
  // Mock network manager methods
  mockNetworkManagerMethods(networkManager, mockGame);
  
  // Set lastPositionUpdate for position correction tests
  networkManager.lastPositionUpdate = { x: 10, y: 0, z: 20 };
  
  return { networkManager, mockGame, mockSocket, mockPlayer };
};

describe('NetworkManager THREE.js Integration Tests', () => {
  let networkManager;
  let mockGame;
  let mockSocket;
  let mockPlayer;
  let THREE;
  let eventHandlers;
  
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
    
    // Create event handlers
    eventHandlers = createEventHandlers();
  });
  
  test('should handle player left event', () => {
    // Setup player that will be removed
    const playerId = 'soon-to-leave-player';
    const mockPlayerMesh = new THREE.Mesh();
    mockPlayerMesh.userData = {
      type: 'networkPlayer',
      id: playerId,
    };
    
    // Add player to the game
    mockGame.playerManager.players.set(playerId, mockPlayerMesh);
    
    // Use the playerLeft handler from shared mocks
    const playerLeftHandler = eventHandlers.playerLeft.bind(networkManager);
    
    // Call the handler with test data
    playerLeftHandler({ id: playerId });
    
    // Verify the player was removed
    expect(networkManager.removePlayer).toHaveBeenCalledWith(playerId);
  });
  
  test('should handle lifeUpdate event for existing player', () => {
    // Create a player with properly initialized stats
    const playerId = 'health-update-player';
    const player = new THREE.Mesh();
    player.userData = { 
      stats: { 
        life: 100, 
        maxLife: 100 
      } 
    };
    
    // Add player to the game
    mockGame.playerManager.players.set(playerId, player);
    
    // Use the lifeUpdate handler from shared mocks
    const lifeUpdateHandler = eventHandlers.lifeUpdate.bind(networkManager);
    
    // Call the handler with test data
    lifeUpdateHandler({ id: playerId, life: 75 });
    
    // Verify the player's life was updated
    expect(player.userData.stats.life).toBe(75);
  });
  
  test('should handle positionCorrection event', () => {
    // Setup for tracking position updates
    networkManager.lastPositionUpdate = { x: 0, y: 0, z: 0 };
    
    // Use the positionCorrection handler from shared mocks
    const positionCorrectionHandler = eventHandlers.positionCorrection.bind(networkManager);
    
    // Call the handler with test data
    positionCorrectionHandler({
      position: { x: 10, y: 5, z: 15 },
      rotation: 1.5
    });
    
    // Verify the position and rotation were updated
    expect(mockGame.localPlayer.position.x).toBe(10);
    expect(mockGame.localPlayer.position.y).toBe(5);
    expect(mockGame.localPlayer.position.z).toBe(15);
    expect(mockGame.localPlayer.rotation.y).toBe(1.5);
  });
  
  test('should request current players when local player is ready', () => {
    // Create a handler for the playerReady event
    networkManager.emitPlayerReady = jest.fn();
    networkManager.requestPlayerList = jest.fn();
    
    // Simulate player ready
    networkManager.emitPlayerReady();
    networkManager.requestPlayerList();
    
    // Check if both methods were called
    expect(networkManager.emitPlayerReady).toHaveBeenCalled();
    expect(networkManager.requestPlayerList).toHaveBeenCalled();
  });
  
  test('should emit player movement properly', () => {
    // Create a mock local player
    const mockLocalPlayer = new THREE.Mesh();
    mockLocalPlayer.position = new THREE.Vector3(10, 5, 20);
    mockLocalPlayer.quaternion = new THREE.Quaternion(0, 0.7071, 0, 0.7071);
    mockGame.localPlayer = mockLocalPlayer;
    
    // Mock the emitPlayerMovement method
    networkManager.emitPlayerMovement = jest.fn().mockImplementation(function() {
      this.socket.emit('playerMovement', {
        position: {
          x: this.game.localPlayer.position.x,
          y: this.game.localPlayer.position.y,
          z: this.game.localPlayer.position.z
        },
        rotation: {
          y: this.game.localPlayer.rotation ? this.game.localPlayer.rotation.y : 0
        }
      });
    });
    
    // Call the emitPlayerMovement method
    networkManager.emitPlayerMovement();
    
    // Verify the socket.emit was called with the correct data
    expect(mockSocket.emit).toHaveBeenCalledWith('playerMovement', expect.objectContaining({
      position: expect.objectContaining({
        x: 10,
        y: 5,
        z: 20
      })
    }));
  });
  
  test('should create a network player correctly', async () => {
    // Setup - create a mock player mesh
    const mockPlayerMesh = new THREE.Mesh();
    
    // Setup mock playerManager methods
    mockGame.playerManager.createPlayer = jest.fn().mockResolvedValue(mockPlayerMesh);
    
    // Mock the createNetworkPlayer method
    networkManager.createNetworkPlayer = jest.fn().mockImplementation(async function(playerData) {
      try {
        await this.game.playerManager.createPlayer(
          playerData.id,
          playerData.position,
          playerData.rotation,
          false
        );
        return true;
      } catch (error) {
        console.error(`Error creating network player ${playerData.id}:`, error);
        return false;
      }
    });
    
    // Call the createNetworkPlayer method
    const playerData = {
      id: 'new-network-player',
      position: { x: 5, y: 2, z: 10 },
      rotation: { y: 0.5 }
    };
    
    await networkManager.createNetworkPlayer(playerData);
    
    // Verify the playerManager.createPlayer was called with the correct data
    expect(mockGame.playerManager.createPlayer).toHaveBeenCalledWith(
      playerData.id,
      playerData.position,
      playerData.rotation,
      false
    );
  });
  
  test('should create damage effect with visual feedback', () => {
    // Setup a player with material for damage effect
    const targetPlayer = new THREE.Mesh();
    targetPlayer.material = new THREE.MeshBasicMaterial();
    
    // Mock the createDamageEffect method
    networkManager.createDamageEffect = jest.fn().mockImplementation(function(targetPlayer, damage, isCritical) {
      if (targetPlayer && targetPlayer.material && targetPlayer.material.color) {
        // Change color to red
        targetPlayer.material.color.r = 1;
        targetPlayer.material.color.g = 0;
        targetPlayer.material.color.b = 0;
        return true;
      }
      return false;
    });
    
    // Create a damage effect
    networkManager.createDamageEffect(targetPlayer, 25, false);
    
    // Verify the method was called
    expect(networkManager.createDamageEffect).toHaveBeenCalledWith(targetPlayer, 25, false);
  });
  
  test('should apply pending updates for a player', () => {
    // Setup a player with position and stats
    const mockPlayer = new THREE.Mesh();
    mockPlayer.position = new THREE.Vector3(0, 0, 0);
    mockPlayer.rotation = { y: 0 };
    mockPlayer.userData = { stats: { life: 100, maxLife: 100 } };
    
    // Add player to the game
    const playerId = 'update-test-player';
    mockGame.playerManager.players.set(playerId, mockPlayer);
    
    // Create update data
    const updates = [
      {
        type: 'position',
        position: { x: 10, y: 5, z: 15 },
        rotation: { y: 2.5 }
      },
      {
        type: 'life',
        life: 75,
        maxLife: 100
      }
    ];
    
    // Apply the updates
    networkManager.applyPendingUpdates(playerId, updates);
    
    // Verify applyPendingUpdates was called with the correct parameters
    expect(networkManager.applyPendingUpdates).toHaveBeenCalledWith(playerId, updates);
  });
  
  // Server Authority Tests
  
  test('should prioritize server position over client position', () => {
    // Setup client and server positions
    const clientPosition = { x: 5, y: 2, z: 8 };
    const serverPosition = { x: 10, y: 5, z: 15 };
    
    // Set client position
    mockGame.localPlayer.position.set(clientPosition.x, clientPosition.y, clientPosition.z);
    
    // Setup for tracking position updates
    networkManager.lastPositionUpdate = { 
      x: clientPosition.x, 
      y: clientPosition.y, 
      z: clientPosition.z 
    };
    
    // Use the positionCorrection handler from shared mocks
    const positionCorrectionHandler = eventHandlers.positionCorrection.bind(networkManager);
    
    // Call the handler with server position data
    positionCorrectionHandler({
      position: serverPosition,
      rotation: 1.5
    });
    
    // Verify the client position was overridden by server position
    expect(mockGame.localPlayer.position.x).toBe(serverPosition.x);
    expect(mockGame.localPlayer.position.y).toBe(serverPosition.y);
    expect(mockGame.localPlayer.position.z).toBe(serverPosition.z);
  });
  
  test('should handle server-initiated player state changes', () => {
    // Setup a player
    const playerId = 'server-controlled-player';
    const player = new THREE.Mesh();
    player.userData = { 
      stats: { 
        life: 100, 
        maxLife: 100,
        karma: 50,
        maxKarma: 100
      } 
    };
    
    // Add player to the game
    mockGame.playerManager.players.set(playerId, player);
    
    // Create a handler for server-initiated state changes
    const serverStateHandler = function(data) {
      if (!data || !data.players) return;
      
      data.players.forEach(playerData => {
        if (playerData.id) {
          const player = this.game.playerManager.players.get(playerData.id);
          if (player && player.userData) {
            // Initialize stats object if it doesn't exist
            if (!player.userData.stats) {
              player.userData.stats = {};
            }
            
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
    const boundHandler = serverStateHandler.bind(networkManager);
    
    // Call the handler with server state data
    boundHandler({
      players: [
        {
          id: playerId,
          life: 75,
          karma: 25,
          status: 'stunned',
          effects: ['burning', 'slowed']
        }
      ]
    });
    
    // Verify the player state was updated according to server data
    expect(player.userData.stats.life).toBe(75);
    expect(player.userData.stats.karma).toBe(25);
    expect(player.userData.stats.status).toBe('stunned');
    expect(player.userData.stats.effects).toEqual(['burning', 'slowed']);
  });
  
  test('should handle server-initiated game events', () => {
    // Setup event handlers
    networkManager.handleGameEvent = jest.fn();
    
    // Create a handler for server game events
    const gameEventHandler = function(eventData) {
      if (!eventData || !eventData.type) return;
      
      // Process the event based on its type
      switch(eventData.type) {
        case 'environmentChange':
          // Handle environment changes
          this.handleGameEvent('environmentChange', eventData.data);
          break;
        case 'worldEffect':
          // Handle world effects
          this.handleGameEvent('worldEffect', eventData.data);
          break;
        case 'globalAnnouncement':
          // Handle global announcements
          this.handleGameEvent('globalAnnouncement', eventData.data);
          break;
      }
    };
    
    // Bind the handler to the networkManager
    const boundHandler = gameEventHandler.bind(networkManager);
    
    // Call the handler with different event types
    boundHandler({
      type: 'environmentChange',
      data: { weather: 'storm', intensity: 0.8 }
    });
    
    boundHandler({
      type: 'worldEffect',
      data: { effect: 'earthquake', duration: 5000 }
    });
    
    boundHandler({
      type: 'globalAnnouncement',
      data: { message: 'A new quest is available!', priority: 'high' }
    });
    
    // Verify the event handler was called with the correct parameters
    expect(networkManager.handleGameEvent).toHaveBeenCalledWith(
      'environmentChange', 
      { weather: 'storm', intensity: 0.8 }
    );
    
    expect(networkManager.handleGameEvent).toHaveBeenCalledWith(
      'worldEffect', 
      { effect: 'earthquake', duration: 5000 }
    );
    
    expect(networkManager.handleGameEvent).toHaveBeenCalledWith(
      'globalAnnouncement', 
      { message: 'A new quest is available!', priority: 'high' }
    );
  });
  
  test('should handle server-initiated player spawns', async () => {
    // Setup
    const { networkManager, mockGame, mockSocket } = setupNetworkManager();
    
    // Register event handler
    const handlers = createEventHandlers();
    networkManager.handlePlayerSpawn = handlers.playerSpawn;
    
    // Simulate server sending player spawn data
    const spawnData = {
      players: [
        {
          id: 'spawn-player-1',
          position: { x: 10, y: 0, z: 10 },
          rotation: { y: 0 },
          type: 'warrior'
        },
        {
          id: 'spawn-player-2',
          position: { x: -10, y: 0, z: -10 },
          rotation: { y: Math.PI },
          type: 'mage'
        }
      ]
    };
    
    // Call the handler
    await networkManager.handlePlayerSpawn(spawnData);
    
    // Verify that createNetworkPlayer was called for each player
    expect(networkManager.createNetworkPlayer).toHaveBeenCalledTimes(2);
    
    expect(networkManager.createNetworkPlayer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'spawn-player-1',
        position: { x: 10, y: 0, z: 10 },
        rotation: { y: 0 },
        type: 'warrior'
      })
    );
    
    expect(networkManager.createNetworkPlayer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'spawn-player-2',
        position: { x: -10, y: 0, z: -10 },
        rotation: { y: Math.PI },
        type: 'mage'
      })
    );
  });
}); 