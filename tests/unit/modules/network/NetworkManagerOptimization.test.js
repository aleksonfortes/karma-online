/**
 * NetworkManagerOptimization.test.js - Tests for optimization in NetworkManager
 * 
 * This file tests the optimization, throttling, and performance aspects
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

describe('NetworkManager Optimization', () => {
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
  
  describe('Update Throttling', () => {
    test('should throttle position updates', () => {
      // Setup
      networkManager.isConnected = true;
      networkManager.lastUpdateTime = 950; // 50ms ago
      networkManager.updateInterval = 100; // 100ms interval
      
      // Call update
      networkManager.update(1000);
      
      // Verify no update was sent (throttled)
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
    
    test('should send update after interval elapsed', () => {
      // Setup
      networkManager.isConnected = true;
      networkManager.lastUpdateTime = 850; // 150ms ago
      networkManager.updateInterval = 100; // 100ms interval
      mockGame.playerManager.localPlayer = {
        id: 'local-player',
        position: { x: 10, y: 0, z: 10 },
        rotation: { y: 1.5 }
      };
      
      // Call update
      networkManager.update(1000);
      
      // Verify update was sent
      expect(mockSocket.emit).toHaveBeenCalledWith('playerState', expect.any(Object));
      expect(networkManager.lastUpdateTime).toBe(1000);
    });
    
    test('should not send update when not connected', () => {
      // Setup
      networkManager.isConnected = false;
      networkManager.lastUpdateTime = 0; // Long time ago
      
      // Call update
      networkManager.update(1000);
      
      // Verify no update was sent
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });
  
  describe('Position Change Detection', () => {
    test('should detect significant position changes', () => {
      // Setup
      const oldPosition = { x: 0, y: 0, z: 0 };
      const newPosition = { x: 1, y: 0, z: 0 }; // Changed by 1 unit
      networkManager.positionUpdateThreshold = 0.5; // 0.5 unit threshold
      
      // Call method
      const hasChanged = networkManager.hasPositionChanged(oldPosition, newPosition);
      
      // Verify change was detected
      expect(hasChanged).toBe(true);
    });
    
    test('should ignore minor position changes', () => {
      // Setup
      const oldPosition = { x: 0, y: 0, z: 0 };
      const newPosition = { x: 0.1, y: 0, z: 0 }; // Changed by 0.1 unit
      networkManager.positionUpdateThreshold = 0.5; // 0.5 unit threshold
      
      // Call method
      const hasChanged = networkManager.hasPositionChanged(oldPosition, newPosition);
      
      // Verify change was ignored
      expect(hasChanged).toBe(false);
    });
    
    test('should detect significant rotation changes', () => {
      // Setup
      const oldRotation = { y: 0 };
      const newRotation = { y: 0.2 }; // Changed by 0.2 radians
      networkManager.rotationUpdateThreshold = 0.1; // 0.1 radian threshold
      
      // Call method
      const hasChanged = networkManager.hasRotationChanged(oldRotation, newRotation);
      
      // Verify change was detected
      expect(hasChanged).toBe(true);
    });
    
    test('should ignore minor rotation changes', () => {
      // Setup
      const oldRotation = { y: 0 };
      const newRotation = { y: 0.05 }; // Changed by 0.05 radians
      networkManager.rotationUpdateThreshold = 0.1; // 0.1 radian threshold
      
      // Call method
      const hasChanged = networkManager.hasRotationChanged(oldRotation, newRotation);
      
      // Verify change was ignored
      expect(hasChanged).toBe(false);
    });
  });
  
  describe('Server Reconciliation', () => {
    test('should apply server correction when difference exceeds threshold', () => {
      // Setup
      const serverPosition = { x: 10, y: 0, z: 10 };
      const clientPosition = { x: 8, y: 0, z: 10 }; // 2 units off in x
      networkManager.applyCorrection = true;
      
      // Mock player
      mockGame.playerManager.localPlayer = {
        id: 'local-player',
        position: { ...clientPosition, set: jest.fn() }
      };
      
      // Call method
      networkManager.reconcileWithServer('local-player', serverPosition);
      
      // Verify correction was applied
      expect(mockGame.playerManager.localPlayer.position.set).toHaveBeenCalledWith(
        serverPosition.x,
        serverPosition.y,
        serverPosition.z
      );
    });
    
    test('should not apply server correction when difference is within threshold', () => {
      // Setup
      const serverPosition = { x: 10, y: 0, z: 10 };
      const clientPosition = { x: 9.8, y: 0, z: 10 }; // 0.2 units off in x
      networkManager.applyCorrection = true;
      
      // Mock player
      mockGame.playerManager.localPlayer = {
        id: 'local-player',
        position: { ...clientPosition, set: jest.fn() }
      };
      
      // Call method
      networkManager.reconcileWithServer('local-player', serverPosition);
      
      // Verify no correction was applied
      expect(mockGame.playerManager.localPlayer.position.set).not.toHaveBeenCalled();
    });
    
    test('should not apply correction when disabled', () => {
      // Setup
      const serverPosition = { x: 10, y: 0, z: 10 };
      const clientPosition = { x: 5, y: 0, z: 10 }; // 5 units off in x
      networkManager.applyCorrection = false;
      
      // Mock player
      mockGame.playerManager.localPlayer = {
        id: 'local-player',
        position: { ...clientPosition, set: jest.fn() }
      };
      
      // Call method
      networkManager.reconcileWithServer('local-player', serverPosition);
      
      // Verify no correction was applied
      expect(mockGame.playerManager.localPlayer.position.set).not.toHaveBeenCalled();
    });
  });
  
  describe('Interpolation', () => {
    test('should interpolate player position', () => {
      // Setup
      const startPosition = { x: 0, y: 0, z: 0 };
      const targetPosition = { x: 10, y: 0, z: 0 };
      const factor = 0.5; // 50% interpolation
      
      // Mock player
      const player = {
        position: { ...startPosition, set: jest.fn() }
      };
      
      // Call method
      networkManager.interpolatePosition(player, targetPosition, factor);
      
      // Verify interpolation
      expect(player.position.set).toHaveBeenCalledWith(
        5, // x: 0 + (10-0)*0.5
        0, // y: unchanged
        0  // z: unchanged
      );
    });
    
    test('should interpolate player rotation', () => {
      // Setup
      const startRotation = { y: 0 };
      const targetRotation = { y: Math.PI }; // 180 degrees
      const factor = 0.5; // 50% interpolation
      
      // Mock player
      const player = {
        rotation: { ...startRotation, set: jest.fn() }
      };
      
      // Call method
      networkManager.interpolateRotation(player, targetRotation, factor);
      
      // Verify interpolation
      expect(player.rotation.set).toHaveBeenCalledWith(
        0, // x: unchanged
        Math.PI / 2, // y: 0 + (PI-0)*0.5
        0  // z: unchanged
      );
    });
  });
  
  describe('Bandwidth Optimization', () => {
    test('should only send changed properties', () => {
      // Setup
      networkManager.isConnected = true;
      mockGame.playerManager.localPlayer = {
        id: 'local-player',
        position: { x: 10, y: 0, z: 10 },
        rotation: { y: 1.5 },
        state: 'idle'
      };
      
      // Set last update values
      networkManager.lastPositionUpdate = { x: 10, y: 0, z: 10 }; // Same position
      networkManager.lastRotationUpdate = { y: 0 }; // Different rotation
      networkManager.lastState = 'running'; // Different state
      
      // Call method
      networkManager.sendPlayerState();
      
      // Verify only changed properties were sent
      expect(mockSocket.emit).toHaveBeenCalledWith('playerState', expect.objectContaining({
        rotation: { y: 1.5 },
        state: 'idle'
      }));
      expect(mockSocket.emit.mock.calls[0][1]).not.toHaveProperty('position');
    });
    
    test('should batch updates for efficiency', () => {
      // Setup
      const updates = [
        { id: 'player-1', type: 'position', data: { x: 1, y: 0, z: 1 } },
        { id: 'player-1', type: 'state', data: { state: 'idle' } },
        { id: 'player-2', type: 'position', data: { x: 2, y: 0, z: 2 } }
      ];
      
      // Add pending updates
      updates.forEach(update => {
        networkManager.addPendingUpdate(update.id, update);
      });
      
      // Verify updates were batched by player ID
      const pendingUpdates = networkManager.pendingUpdates;
      expect(pendingUpdates.size).toBe(2); // Two players
      expect(pendingUpdates.get('player-1').length).toBe(2); // Two updates for player-1
      expect(pendingUpdates.get('player-2').length).toBe(1); // One update for player-2
    });
  });
}); 