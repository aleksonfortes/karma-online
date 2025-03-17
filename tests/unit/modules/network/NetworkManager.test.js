import { NetworkManager } from '../../../../src/modules/network/NetworkManager';
import io from 'socket.io-client';
import * as THREE from 'three';
import { getServerUrl } from '../../../../tests/mocks/config.mock';
import {
  createInitialPositionHandler,
  createConnectHandler,
  createPositionCorrectionHandler,
  createNetworkTestSetup
} from './networkTestHelpers';

// Mock THREE library
global.THREE = {
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
    mockSocket = setup.mockSocket;
    
    // Create NetworkManager instance
    networkManager = new NetworkManager(mockGame);
    
    // Mock methods
    networkManager.createSocket = jest.fn().mockReturnValue(mockSocket);
    networkManager.handleReconnection = jest.fn();
    networkManager.applyPendingUpdates = jest.fn();
    networkManager.removePlayer = jest.fn();
    networkManager.createNetworkPlayer = jest.fn();
    
    // Initialize
    networkManager.init();
    networkManager.isConnected = true;
    networkManager.lastServerPositions = new Map();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Constructor', () => {
    test('should initialize with default values', () => {
      const nm = new NetworkManager(mockGame);
      expect(nm.game).toBe(mockGame);
      expect(nm.isConnected).toBe(false);
      expect(nm.wasDisconnected).toBe(false);
    });
  });
  
  describe('Initial connection', () => {
    test('should have socket after initialization', () => {
      // The socket should be set in the beforeEach
      expect(networkManager.socket).toBeTruthy();
      expect(typeof networkManager.socket.on).toBe('function');
      expect(typeof networkManager.socket.emit).toBe('function');
      expect(typeof networkManager.socket.once).toBe('function');
    });
  });
  
  describe('Connection handling', () => {
    test('should handle reconnection', () => {
      networkManager.wasDisconnected = true;
      
      // Create handler using helper
      const connectHandler = createConnectHandler(networkManager, mockSocket);
      
      // Call the handler
      connectHandler();
      
      // Verify handleReconnection was called
      expect(networkManager.handleReconnection).toHaveBeenCalled();
    });
  });
  
  describe('Server state synchronization', () => {
    test('should handle initial position from server', () => {
      // Setup
      const positionData = {
        position: { x: 5, y: 2, z: 10 },
        rotation: { y: 0.5 }
      };
      
      // Create handler using helper
      const initialPositionHandler = createInitialPositionHandler(mockGame);
      
      // Call the handler
      initialPositionHandler(positionData);
      
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
      
      // Create handler using helper
      const positionCorrectionHandler = createPositionCorrectionHandler(
        networkManager, 
        mockGame, 
        mockSocket
      );
      
      // Set applyCorrection flag
      networkManager.applyCorrection = true;
      
      // Call the handler
      positionCorrectionHandler(correctionData);
      
      // Verify position was updated
      expect(mockGame.localPlayer.position.x).toBe(15);
      expect(mockGame.localPlayer.position.y).toBe(5);
      expect(mockGame.localPlayer.position.z).toBe(15);
    });
  });
}); 