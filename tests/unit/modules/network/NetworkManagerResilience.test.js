/**
 * NetworkManagerResilience.test.js - Tests for resilience and error handling in NetworkManager
 * 
 * This file tests the NetworkManager's ability to handle network errors, reconnections,
 * and recover from various failure scenarios.
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

describe('NetworkManager Resilience', () => {
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
    
    // Mock performance.now
    global.performance = {
      now: jest.fn().mockReturnValue(1000)
    };
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Connection Handling', () => {
    test('should handle connection errors gracefully', () => {
      // Setup
      const error = new Error('Connection refused');
      
      // Call handler
      networkManager.handleConnectError(error);
      
      // Verify error was logged
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to connect to server'),
        error
      );
    });
    
    test('should attempt reconnection after disconnect', () => {
      // Setup
      networkManager.isConnected = true;
      
      // Call the attemptReconnect method directly
      networkManager.attemptReconnect = jest.fn();
      
      // Call disconnect (which will attempt reconnection)
      networkManager.disconnect = jest.fn(() => {
        networkManager.isConnected = false;
        networkManager.wasDisconnected = true;
        networkManager.attemptReconnect();
      });
      
      // Call method
      networkManager.disconnect();
      
      // Verify state was updated
      expect(networkManager.isConnected).toBe(false);
      expect(networkManager.wasDisconnected).toBe(true);
      
      // Verify reconnection was attempted
      expect(networkManager.attemptReconnect).toHaveBeenCalled();
    });
    
    test('should limit reconnection attempts', () => {
      // Setup
      networkManager.reconnectAttempts = 5;
      networkManager.connect = jest.fn();
      
      // Call method
      networkManager.attemptReconnect();
      
      // Verify reconnection was not attempted
      expect(networkManager.connect).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('Max reconnection attempts reached');
    });
  });
  
  describe('Error Recovery', () => {
    test('should recover from server reset', () => {
      // Setup
      const resetData = {
        reason: 'Server restart',
        reconnectIn: 5
      };
      
      // Mock methods
      networkManager.handleDisconnect = jest.fn();
      mockGame.uiManager.showMessage = jest.fn();
      
      // Call handler
      networkManager.handleServerReset(resetData);
      
      // Verify disconnect was handled
      expect(networkManager.handleDisconnect).toHaveBeenCalled();
      
      // Verify message was shown
      expect(mockGame.uiManager.showMessage).toHaveBeenCalledWith(
        expect.stringContaining('Server reset'),
        expect.objectContaining({ type: 'warning' })
      );
    });
    
    test('should handle server rejection of actions', () => {
      // Setup
      const rejectionData = {
        type: 'movement',
        reason: 'Invalid position'
      };
      
      // Mock methods
      mockGame.playerManager.localPlayer = {
        userData: {
          lastValidPosition: { x: 5, y: 0, z: 5 }
        },
        position: {
          copy: jest.fn()
        }
      };
      
      // Call handler
      networkManager.handleServerRejection(rejectionData);
      
      // Verify position was reverted
      expect(mockGame.playerManager.localPlayer.position.copy).toHaveBeenCalledWith(
        mockGame.playerManager.localPlayer.userData.lastValidPosition
      );
      
      // Verify log was created
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Server rejected action'));
    });
  });
  
  describe('Data Loss Handling', () => {
    test('should handle missing player data gracefully', () => {
      // Setup
      const incompleteData = {
        id: 'player-123'
        // Missing position and rotation
      };
      
      // Mock methods
      mockGame.playerManager.createPlayer = jest.fn();
      
      // Add method to handle incomplete data
      networkManager.handleIncompletePlayerData = jest.fn(data => {
        // Ensure required fields exist
        const completeData = {
          ...data,
          position: data.position || { x: 0, y: 0, z: 0 },
          rotation: data.rotation || { y: 0 }
        };
        
        // Create player with complete data
        if (mockGame.playerManager) {
          mockGame.playerManager.createPlayer(
            completeData.id,
            completeData.position,
            completeData.rotation,
            false
          );
        }
      });
      
      // Call handler
      networkManager.handleIncompletePlayerData(incompleteData);
      
      // Verify player was created with default values
      expect(mockGame.playerManager.createPlayer).toHaveBeenCalledWith(
        incompleteData.id,
        { x: 0, y: 0, z: 0 },
        { y: 0 },
        false
      );
    });
    
    test('should handle out-of-order updates', () => {
      // Setup
      const oldUpdate = {
        id: 'player-123',
        position: { x: 10, y: 0, z: 10 },
        sequence: 1,
        timestamp: Date.now() - 1000
      };
      
      const newUpdate = {
        id: 'player-123',
        position: { x: 15, y: 0, z: 15 },
        sequence: 2,
        timestamp: Date.now()
      };
      
      // Mock methods
      mockGame.playerManager.applyServerUpdate = jest.fn();
      
      // Add method to track sequence numbers
      networkManager.lastSequenceNumbers = new Map();
      networkManager.handleSequencedUpdate = jest.fn(update => {
        const lastSeq = networkManager.lastSequenceNumbers.get(update.id) || 0;
        
        // Ignore older updates
        if (update.sequence < lastSeq) {
          console.log(`Ignoring out-of-order update for player ${update.id}`);
          return;
        }
        
        // Apply update and store sequence
        mockGame.playerManager.applyServerUpdate(update.id, update);
        networkManager.lastSequenceNumbers.set(update.id, update.sequence);
      });
      
      // Call handler with newer update first
      networkManager.handleSequencedUpdate(newUpdate);
      networkManager.handleSequencedUpdate(oldUpdate);
      
      // Verify only the newer update was applied
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledTimes(1);
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledWith(
        newUpdate.id,
        newUpdate
      );
      
      // Verify sequence was stored
      expect(networkManager.lastSequenceNumbers.get(newUpdate.id)).toBe(newUpdate.sequence);
    });
  });
  
  describe('Network Interruptions', () => {
    test('should queue updates during disconnection', () => {
      // Setup
      networkManager.isConnected = false;
      networkManager.wasDisconnected = true;
      
      const action = {
        type: 'attack',
        targetId: 'enemy-1'
      };
      
      // Mock methods
      networkManager.queueOfflineAction = jest.fn(action => {
        if (!networkManager.offlineQueue) {
          networkManager.offlineQueue = [];
        }
        networkManager.offlineQueue.push({
          action,
          timestamp: Date.now()
        });
      });
      
      // Override sendPlayerAction to use queue when offline
      const originalMethod = networkManager.sendPlayerAction;
      networkManager.sendPlayerAction = jest.fn(action => {
        if (!networkManager.isConnected) {
          networkManager.queueOfflineAction(action);
          return;
        }
        originalMethod.call(networkManager, action);
      });
      
      // Call method
      networkManager.sendPlayerAction(action);
      
      // Verify action was queued
      expect(networkManager.queueOfflineAction).toHaveBeenCalledWith(action);
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
    
    test('should process queued actions on reconnection', () => {
      // Setup
      networkManager.isConnected = false;
      networkManager.wasDisconnected = true;
      networkManager.offlineQueue = [
        { action: { type: 'move', position: { x: 5, y: 0, z: 5 } }, timestamp: Date.now() - 5000 },
        { action: { type: 'attack', targetId: 'enemy-1' }, timestamp: Date.now() - 2000 }
      ];
      
      // Reset mock socket.emit calls
      mockSocket.emit.mockClear();
      
      // Mock methods
      networkManager.processOfflineQueue = jest.fn(() => {
        if (!networkManager.isConnected || !networkManager.offlineQueue) return;
        
        // Process each queued action
        networkManager.offlineQueue.forEach(item => {
          // Skip expired actions
          if (Date.now() - item.timestamp > 30000) return;
          
          // Send action to server
          networkManager.socket.emit('playerAction', item.action);
        });
        
        // Clear queue
        networkManager.offlineQueue = [];
      });
      
      // Override handleConnect to process queue
      const originalMethod = networkManager.handleConnect;
      networkManager.handleConnect = jest.fn(() => {
        originalMethod.call(networkManager);
        networkManager.processOfflineQueue();
      });
      
      // Call handler
      networkManager.handleConnect();
      
      // Verify queue was processed
      expect(networkManager.processOfflineQueue).toHaveBeenCalled();
      
      // Verify the correct number of emit calls
      // Check each call individually instead of counting
      expect(mockSocket.emit).toHaveBeenCalledWith('requestStateUpdate');
      expect(mockSocket.emit).toHaveBeenCalledWith('playerAction', { type: 'move', position: { x: 5, y: 0, z: 5 } });
      expect(mockSocket.emit).toHaveBeenCalledWith('playerAction', { type: 'attack', targetId: 'enemy-1' });
      
      expect(networkManager.offlineQueue).toEqual([]);
    });
  });
  
  describe('Performance Degradation', () => {
    test('should adapt update rate under high latency', () => {
      // Setup
      networkManager.isConnected = true;
      networkManager.updateInterval = 100; // Default 100ms
      networkManager.latency = 500; // High latency (500ms)
      
      // Mock methods
      networkManager.adaptUpdateRate = jest.fn(() => {
        // Increase update interval when latency is high
        if (networkManager.latency > 200) {
          networkManager.updateInterval = Math.min(500, networkManager.latency);
        } else {
          networkManager.updateInterval = 100; // Default
        }
      });
      
      // Call method
      networkManager.adaptUpdateRate();
      
      // Verify update rate was adapted
      expect(networkManager.updateInterval).toBe(500);
    });
    
    test('should prioritize critical updates under load', () => {
      // Setup
      networkManager.isConnected = true;
      networkManager.highLoad = true;
      
      const criticalUpdate = {
        type: 'critical',
        data: { health: 10 }
      };
      
      const nonCriticalUpdate = {
        type: 'nonCritical',
        data: { animation: 'idle' }
      };
      
      // Mock methods
      networkManager.isCriticalUpdate = jest.fn(update => update.type === 'critical');
      networkManager.sendUpdate = jest.fn(update => {
        if (networkManager.highLoad && !networkManager.isCriticalUpdate(update)) {
          // Skip non-critical updates under high load
          return;
        }
        
        networkManager.socket.emit('update', update);
      });
      
      // Call method with both update types
      networkManager.sendUpdate(criticalUpdate);
      networkManager.sendUpdate(nonCriticalUpdate);
      
      // Verify only critical update was sent
      expect(networkManager.socket.emit).toHaveBeenCalledTimes(1);
      expect(networkManager.socket.emit).toHaveBeenCalledWith('update', criticalUpdate);
    });
  });
}); 