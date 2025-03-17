/**
 * NetworkManagerConnection.test.js - Tests for connection handling in NetworkManager
 * 
 * This file tests the connection handling, socket events, and reconnection logic
 * of the NetworkManager class.
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
    }
  };
});

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connected: true,
    id: 'mock-socket-id'
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

describe('NetworkManager Connection Handling', () => {
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

    // Mock console methods
    global.console.log = jest.fn();
    global.console.error = jest.fn();
    global.console.warn = jest.fn();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Connection Events', () => {
    test('should handle connect event', () => {
      // Setup
      networkManager.isConnected = false;
      networkManager.wasDisconnected = false;
      networkManager.startPeriodicHealthCheck = jest.fn();
      
      // Trigger connect event
      networkManager.handleConnect();
      
      // Verify state changes
      expect(networkManager.isConnected).toBe(true);
      expect(networkManager.reconnecting).toBe(false);
      expect(networkManager.reconnectAttempts).toBe(0);
      expect(mockSocket.emit).toHaveBeenCalledWith('requestStateUpdate');
      expect(networkManager.startPeriodicHealthCheck).toHaveBeenCalled();
    });
    
    test('should handle connect_error event', () => {
      // Setup
      const error = new Error('Connection failed');
      
      // Trigger connect_error event
      networkManager.handleConnectError(error);
      
      // Verify error was logged
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to connect'), error);
    });
    
    test('should handle disconnect event', () => {
      // Setup
      networkManager.isConnected = true;
      networkManager.stopPeriodicHealthCheck = jest.fn();
      
      // Trigger disconnect event
      networkManager.handleDisconnect();
      
      // Verify state changes
      expect(networkManager.isConnected).toBe(false);
      expect(networkManager.wasDisconnected).toBe(true);
      expect(networkManager.stopPeriodicHealthCheck).toHaveBeenCalled();
    });
  });
  
  describe('Reconnection Logic', () => {
    test('should handle reconnection', () => {
      // Setup
      networkManager.wasDisconnected = true;
      networkManager.isConnected = false;
      networkManager.applyPendingUpdates = jest.fn();
      mockGame.playerManager.createLocalPlayer = jest.fn();
      
      // Trigger reconnection
      networkManager.handleConnect();
      
      // Verify reconnection was handled
      expect(networkManager.wasDisconnected).toBe(false);
      expect(mockSocket.emit).toHaveBeenCalledWith('requestPlayerList');
      expect(mockSocket.emit).toHaveBeenCalledWith('requestStateUpdate');
      expect(networkManager.applyPendingUpdates).toHaveBeenCalled();
      expect(mockGame.playerManager.createLocalPlayer).toHaveBeenCalled();
    });
    
    test('should handle reconnection attempts', () => {
      // Setup
      networkManager.reconnecting = true;
      networkManager.reconnectAttempts = 2;
      networkManager.connect = jest.fn();
      
      // Trigger reconnection attempt
      networkManager.attemptReconnect();
      
      // Verify reconnection attempt
      expect(networkManager.reconnectAttempts).toBe(3);
      expect(networkManager.connect).toHaveBeenCalled();
    });
    
    test('should handle max reconnection attempts', () => {
      // Setup
      networkManager.reconnecting = true;
      networkManager.reconnectAttempts = 5; // Max attempts
      networkManager.connect = jest.fn();
      
      // Trigger reconnection attempt
      networkManager.attemptReconnect();
      
      // Verify reconnection was stopped
      expect(networkManager.reconnecting).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Max reconnection attempts'));
      expect(networkManager.connect).not.toHaveBeenCalled();
    });
  });
  
  describe('Health Check System', () => {
    test('should start periodic health check', () => {
      // Mock setInterval
      jest.useFakeTimers();
      global.setInterval = jest.fn().mockReturnValue(123);
      
      // Call method
      networkManager.startPeriodicHealthCheck();
      
      // Verify interval was set
      expect(global.setInterval).toHaveBeenCalled();
      expect(networkManager.healthCheckInterval).toBe(123);
      
      // Restore timers
      jest.useRealTimers();
    });
    
    test('should stop periodic health check', () => {
      // Mock clearInterval
      global.clearInterval = jest.fn();
      
      // Setup
      networkManager.healthCheckInterval = 123;
      
      // Call method
      networkManager.stopPeriodicHealthCheck();
      
      // Verify interval was cleared
      expect(global.clearInterval).toHaveBeenCalledWith(123);
      expect(networkManager.healthCheckInterval).toBeNull();
    });
    
    test('should perform health check', () => {
      // Setup
      networkManager.isConnected = true;
      mockGame.playerManager.localPlayer = {
        id: 'local-player',
        life: 80,
        maxLife: 100
      };
      
      // Call method
      networkManager.performHealthCheck();
      
      // Verify health check was sent
      expect(mockSocket.emit).toHaveBeenCalledWith('healthCheck', {
        id: 'local-player',
        life: 80,
        maxLife: 100
      });
    });
    
    test('should not perform health check when disconnected', () => {
      // Setup
      networkManager.isConnected = false;
      
      // Call method
      networkManager.performHealthCheck();
      
      // Verify health check was not sent
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });
  
  describe('Server Message Handling', () => {
    test('should handle server message', () => {
      // Setup
      mockGame.uiManager.showMessage = jest.fn();
      const message = {
        type: 'info',
        text: 'Server is restarting in 5 minutes'
      };
      
      // Call method
      networkManager.handleServerMessage(message);
      
      // Verify message was shown
      expect(mockGame.uiManager.showMessage).toHaveBeenCalledWith(
        message.text,
        expect.any(Object)
      );
    });
    
    test('should handle server reset', () => {
      // Setup
      networkManager.handleDisconnect = jest.fn();
      mockGame.uiManager.showMessage = jest.fn();
      const resetData = {
        reason: 'Server restart',
        reconnectIn: 10
      };
      
      // Call method
      networkManager.handleServerReset(resetData);
      
      // Verify reset was handled
      expect(networkManager.handleDisconnect).toHaveBeenCalled();
      expect(mockGame.uiManager.showMessage).toHaveBeenCalledWith(
        expect.stringContaining(resetData.reason),
        expect.any(Object)
      );
    });
  });
  
  describe('Cleanup', () => {
    test('should clean up properly', () => {
      // Setup
      networkManager.stopPeriodicHealthCheck = jest.fn();
      mockSocket.disconnect = jest.fn();
      
      // Call method
      networkManager.cleanup();
      
      // Verify cleanup
      expect(networkManager.stopPeriodicHealthCheck).toHaveBeenCalled();
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });
}); 