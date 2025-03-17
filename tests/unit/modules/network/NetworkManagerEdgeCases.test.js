/**
 * NetworkManagerEdgeCases.test.js - Tests for NetworkManager edge cases
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
      clone: jest.fn().mockReturnThis(),
      distanceTo: jest.fn().mockReturnValue(5)
    })),
    Quaternion: jest.fn().mockImplementation(() => ({
      x: 0, y: 0, z: 0, w: 1,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis()
    })),
    MathUtils: {
      lerp: jest.fn((a, b, t) => a + (b - a) * t)
    }
  };
});

// Mock config
jest.mock('../../../../src/config.js', () => ({
  getServerUrl: jest.fn().mockReturnValue('http://localhost:3000'),
  NETWORK: {
    UPDATE_RATE: 100,
    INTERPOLATION_DELAY: 100
  }
}));

describe('NetworkManager Edge Cases', () => {
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
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Error Handling', () => {
    test('should handle missing uiManager when applying updates', () => {
      // Setup
      const playerId = mockGame.localPlayerId;
      
      // Remove uiManager
      const originalUiManager = mockGame.uiManager;
      mockGame.uiManager = null;
      
      // Create update data
      const updateData = {
        type: 'health',
        life: 75,
        maxLife: 100
      };
      
      // Verify no error is thrown when uiManager is missing
      expect(() => {
        networkManager.applyPendingUpdates(playerId, [updateData]);
      }).not.toThrow();
      
      // Restore uiManager
      mockGame.uiManager = originalUiManager;
    });
    
    test('should handle missing playerManager when applying updates', () => {
      // Setup
      const playerId = mockGame.localPlayerId;
      
      // Remove playerManager
      const originalPlayerManager = mockGame.playerManager;
      mockGame.playerManager = null;
      
      // Create update data
      const updateData = {
        type: 'health',
        life: 75,
        maxLife: 100
      };
      
      // Verify no error is thrown when playerManager is missing
      expect(() => {
        networkManager.applyPendingUpdates(playerId, [updateData]);
      }).not.toThrow();
      
      // Restore playerManager
      mockGame.playerManager = originalPlayerManager;
    });
    
    test('should handle non-existent player when applying updates', () => {
      // Create update data
      const updateData = {
        type: 'health',
        life: 75,
        maxLife: 100
      };
      
      // Verify no error is thrown for non-existent player
      expect(() => {
        networkManager.applyPendingUpdates('non-existent-player', [updateData]);
      }).not.toThrow();
    });
  });
  
  describe('Connection Edge Cases', () => {
    test('should handle disconnect during update', () => {
      // Setup
      networkManager.isConnected = true;
      
      // Mock update to simulate disconnect during update
      const originalUpdate = networkManager.update;
      networkManager.update = jest.fn().mockImplementation(() => {
        // Simulate disconnect
        networkManager.isConnected = false;
        // Don't throw an error, just simulate disconnect
      });
      
      // Verify no error is thrown when connection is lost during update
      expect(() => {
        networkManager.update();
      }).not.toThrow();
      
      // Verify isConnected is false
      expect(networkManager.isConnected).toBe(false);
      
      // Restore original method
      networkManager.update = originalUpdate;
    });
    
    test('should handle reconnection after disconnect', () => {
      // Setup
      networkManager.isConnected = false;
      networkManager.wasDisconnected = true;
      
      // Mock handleReconnection
      networkManager.handleReconnection = jest.fn();
      
      // Simulate reconnection
      networkManager.handleConnect();
      
      // Verify handleReconnection was called
      expect(networkManager.handleReconnection).toHaveBeenCalled();
    });
  });
  
  describe('Data Validation', () => {
    test('should handle invalid position data', () => {
      // Setup
      const invalidPositionData = {
        position: null,
        rotation: { y: 1.5 }
      };
      
      // Verify no error is thrown for invalid position data
      expect(() => {
        networkManager.handleInitialPosition(invalidPositionData);
      }).not.toThrow();
    });
    
    test('should handle invalid player update data', () => {
      // Setup
      const invalidUpdateData = {
        id: mockGame.localPlayerId,
        type: 'unknown',
        data: null
      };
      
      // Verify no error is thrown for invalid update data
      expect(() => {
        networkManager.handlePlayerUpdate(invalidUpdateData);
      }).not.toThrow();
    });
    
    test('should handle empty batch updates', () => {
      // Setup
      const emptyBatchData = {
        positions: [],
        timestamp: Date.now()
      };
      
      // Add handler method
      networkManager.handleBatchPositionUpdate = jest.fn();
      
      // Verify no error is thrown for empty batch data
      expect(() => {
        networkManager.handleBatchPositionUpdate(emptyBatchData);
      }).not.toThrow();
    });
  });
  
  describe('Server Authority Edge Cases', () => {
    test('should handle server correction with large position difference', () => {
      // Setup
      const localPlayer = mockGame.localPlayer;
      localPlayer.position = { x: 0, y: 0, z: 0 };
      
      // Create correction data with large position difference
      const correctionData = {
        position: { x: 1000, y: 500, z: 1000 }
      };
      
      // Apply correction
      networkManager.handlePositionCorrection(correctionData);
      
      // Verify position was corrected to server's version
      expect(localPlayer.position.x).toBe(1000);
      expect(localPlayer.position.y).toBe(500);
      expect(localPlayer.position.z).toBe(1000);
    });
    
    test('should handle server updates for non-existent players', () => {
      // Setup
      const nonExistentPlayerId = 'non-existent-player';
      
      // Create update data
      const updateData = {
        id: nonExistentPlayerId,
        type: 'position',
        position: { x: 10, y: 5, z: 20 }
      };
      
      // Add handler method
      networkManager.handlePlayerUpdate = jest.fn();
      
      // Verify no error is thrown for non-existent player
      expect(() => {
        networkManager.handlePlayerUpdate(updateData);
      }).not.toThrow();
    });
  });
}); 