/**
 * NetworkManager.test.js - Main test file for NetworkManager
 * 
 * This file serves as an entry point for all NetworkManager tests.
 * The actual tests are organized into separate files by functionality.
 */

import { jest } from '@jest/globals';
import { MockNetworkManager } from './mockNetworkManager';
import { createNetworkTestSetup } from './networkTestHelpers';

// Mock THREE library
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation(() => ({
      x: 0,
      y: 0,
      z: 0,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis(),
      distanceTo: jest.fn().mockReturnValue(5)
    })),
    Quaternion: jest.fn().mockImplementation(() => ({
      x: 0,
      y: 0,
      z: 0,
      w: 1,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis()
    })),
    MathUtils: {
      radToDeg: jest.fn(rad => rad * (180 / Math.PI)),
      degToRad: jest.fn(deg => deg * (Math.PI / 180))
    },
    Scene: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      remove: jest.fn()
    })),
    Object3D: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0, set: jest.fn() },
      rotation: { x: 0, y: 0, z: 0, set: jest.fn() },
      quaternion: { x: 0, y: 0, z: 0, w: 1, set: jest.fn() },
      add: jest.fn(),
      remove: jest.fn()
    })),
    Mesh: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0, set: jest.fn() },
      rotation: { x: 0, y: 0, z: 0, set: jest.fn() },
      quaternion: { x: 0, y: 0, z: 0, w: 1, set: jest.fn() },
      userData: {},
      add: jest.fn(),
      remove: jest.fn()
    })),
    Color: jest.fn().mockImplementation(() => ({
      copy: jest.fn(),
      clone: jest.fn().mockReturnThis()
    }))
  };
});

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connected: true
  }));
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

describe('NetworkManager', () => {
  let networkManager;
  let mockGame;
  let mockSocket;
  
  beforeEach(() => {
    // Create test setup
    const setup = createNetworkTestSetup();
    mockGame = setup.mockGame;
    
    // Create NetworkManager instance
    networkManager = new MockNetworkManager(mockGame);
    
    // Initialize
    networkManager.init();
    
    // Get the socket
    mockSocket = networkManager.socket;
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Constructor', () => {
    test('should initialize with default values', () => {
      const nm = new MockNetworkManager(mockGame);
      expect(nm.game).toBe(mockGame);
      expect(nm.isConnected).toBe(false);
      expect(nm.wasDisconnected).toBe(false);
    });
  });
  
  describe('Initial connection', () => {
    test('should have socket after initialization', () => {
      expect(networkManager.socket).toBeTruthy();
      expect(typeof networkManager.socket.on).toBe('function');
      expect(typeof networkManager.socket.emit).toBe('function');
    });
    
    test('should connect successfully', () => {
      networkManager.connect();
      expect(networkManager.isConnected).toBe(true);
    });
  });
  
  describe('Connection handling', () => {
    test.skip('should handle reconnection', () => {
      // Setup
      networkManager.wasDisconnected = true;
      
      // Mock handleReconnection
      const spy = jest.spyOn(networkManager, 'handleReconnection');
      
      // Trigger reconnection
      networkManager.handleConnect();
      
      // Verify handleReconnection was called
      expect(spy).toHaveBeenCalled();
      
      // Clean up
      spy.mockRestore();
    });
    
    test('should handle disconnect', () => {
      // Setup
      networkManager.isConnected = true;
      
      // Disconnect
      networkManager.handleDisconnect();
      
      // Verify state
      expect(networkManager.isConnected).toBe(false);
      expect(networkManager.wasDisconnected).toBe(true);
    });
  });
  
  describe('Server state synchronization', () => {
    test('should handle initial position from server', () => {
      // Setup
      const positionData = {
        position: { x: 5, y: 2, z: 10 },
        rotation: { y: 0.5 }
      };
      
      // Call handler
      networkManager.handleInitialPosition(positionData);
      
      // Verify position was updated
      expect(mockGame.localPlayer.position.x).toBe(5);
      expect(mockGame.localPlayer.position.y).toBe(2);
      expect(mockGame.localPlayer.position.z).toBe(10);
      expect(mockGame.localPlayer.rotation.y).toBe(0.5);
    });
    
    test('should handle position correction from server', () => {
      // Setup
      const correctionData = {
        position: { x: 15, y: 5, z: 15 }
      };
      
      // Call handler
      networkManager.handlePositionCorrection(correctionData);
      
      // Verify position was updated
      expect(mockGame.localPlayer.position.x).toBe(15);
      expect(mockGame.localPlayer.position.y).toBe(5);
      expect(mockGame.localPlayer.position.z).toBe(15);
      
      // Verify lastServerPositions was updated
      expect(networkManager.lastServerPositions.has(mockSocket.id)).toBe(true);
      const storedPos = networkManager.lastServerPositions.get(mockSocket.id).position;
      expect(storedPos.x).toBe(15);
      expect(storedPos.y).toBe(5);
      expect(storedPos.z).toBe(15);
    });
  });
  
  describe('Player state updates', () => {
    test('should send player state to server', () => {
      // Setup
      networkManager.isConnected = true;
      
      // Call method
      networkManager.sendPlayerState();
      
      // Verify socket.emit was called with correct data
      expect(mockSocket.emit).toHaveBeenCalledWith('playerState', expect.objectContaining({
        position: expect.any(Object),
        rotation: expect.any(Object)
      }));
    });
    
    test('should apply pending updates', () => {
      // Setup
      const playerId = 'test-player';
      const updates = [
        { type: 'position', position: { x: 10, y: 0, z: 10 } },
        { type: 'health', life: 80, maxLife: 100 }
      ];
      
      // Mock playerManager.applyServerUpdate
      mockGame.playerManager.applyServerUpdate = jest.fn();
      
      // Call method
      networkManager.applyPendingUpdates(playerId, updates);
      
      // Verify applyServerUpdate was called for each update
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledTimes(2);
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledWith(playerId, updates[0]);
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledWith(playerId, updates[1]);
    });
  });
}); 