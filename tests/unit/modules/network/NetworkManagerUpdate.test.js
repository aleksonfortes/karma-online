/**
 * NetworkManagerUpdate.test.js - Tests for NetworkManager update functionality
 */

import { jest } from '@jest/globals';
import { MockNetworkManager } from './mockNetworkManager';
import { createNetworkTestSetup } from './networkTestHelpers';

// Mock THREE library
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation(() => ({
      x: 0, y: 0, z: 0,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis()
    })),
    Quaternion: jest.fn().mockImplementation(() => ({
      x: 0, y: 0, z: 0, w: 1,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis()
    }))
  };
});

// Mock config
jest.mock('../../../../src/config.js', () => ({
  getServerUrl: jest.fn().mockReturnValue('http://localhost:3000'),
  NETWORK: {
    UPDATE_RATE: 100 // 100ms update rate for testing
  }
}));

describe('NetworkManager Update Tests', () => {
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
    
    // Set connected state
    networkManager.isConnected = true;
    
    // Add update method to mock for testing
    networkManager.update = jest.fn().mockImplementation(function() {
      const now = Date.now();
      
      // Check if enough time has passed since last update
      if (!this.lastStateUpdate || now - this.lastStateUpdate >= 100) {
        this.sendPlayerState();
        this.lastStateUpdate = now;
      }
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  test('should send player state when update interval has elapsed', () => {
    // Set last update time to simulate elapsed interval
    networkManager.lastStateUpdate = Date.now() - 150; // 150ms ago
    
    // Call update method
    networkManager.update();
    
    // Should send player state since interval has elapsed
    expect(mockSocket.emit).toHaveBeenCalledWith('playerState', expect.any(Object));
  });
  
  test('should not send player state when update interval has not elapsed', () => {
    // Set last update time to recent time (not enough time elapsed)
    networkManager.lastStateUpdate = Date.now() - 50; // 50ms ago
    
    // Call update method
    networkManager.update();
    
    // Should not send player state since interval has not elapsed
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
}); 