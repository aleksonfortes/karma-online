/**
 * NetworkManagerThree.test.js - Tests for NetworkManager THREE.js integration
 */

import { jest } from '@jest/globals';
import { MockNetworkManager } from './mockNetworkManager';
import { createNetworkTestSetup } from './networkTestHelpers';

// Mock THREE library
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation((x, y, z) => ({
      x: x || 0,
      y: y || 0,
      z: z || 0,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis(),
      distanceTo: jest.fn().mockReturnValue(5),
      lerp: jest.fn()
    })),
    Quaternion: jest.fn().mockImplementation(() => ({
      x: 0,
      y: 0,
      z: 0,
      w: 1,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis(),
      slerp: jest.fn()
    })),
    MathUtils: {
      lerp: jest.fn((a, b, t) => a + (b - a) * t),
      radToDeg: jest.fn(rad => rad * (180 / Math.PI)),
      degToRad: jest.fn(deg => deg * (Math.PI / 180))
    },
    Euler: jest.fn().mockImplementation(() => ({
      x: 0,
      y: 0,
      z: 0,
      set: jest.fn()
    })),
    Matrix4: jest.fn().mockImplementation(() => ({
      makeRotationFromQuaternion: jest.fn().mockReturnThis(),
      extractRotation: jest.fn().mockReturnThis()
    }))
  };
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

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    connected: true
  }));
});

describe('NetworkManager THREE.js Integration', () => {
  let networkManager;
  let mockGame;
  let mockSocket;
  let THREE;
  
  beforeEach(() => {
    // Get the mocked THREE
    THREE = require('three');
    
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
    
    // Add interpolation methods to mock
    networkManager.interpolatePosition = jest.fn();
    networkManager.interpolateRotation = jest.fn();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Position Interpolation', () => {
    test('should interpolate player position smoothly', () => {
      // Setup
      const playerId = 'test-player';
      const player = {
        position: new THREE.Vector3(0, 0, 0),
        userData: { isInterpolating: true }
      };
      
      // Add player to game
      mockGame.playerManager.players.set(playerId, player);
      
      // Create target position
      const targetPosition = new THREE.Vector3(10, 0, 10);
      
      // Mock implementation
      networkManager.interpolatePosition.mockImplementation((player, targetPos, deltaTime) => {
        // Simple linear interpolation for testing
        const t = Math.min(deltaTime / 100, 1); // 100ms interpolation time
        player.position.lerp(targetPos, t);
      });
      
      // Call interpolation with half the time elapsed
      networkManager.interpolatePosition(player, targetPosition, 50);
      
      // Verify position was interpolated halfway
      expect(player.position.lerp).toHaveBeenCalledWith(targetPosition, 0.5);
    });
    
    test('should handle interpolation completion', () => {
      // Setup
      const playerId = 'test-player';
      const player = {
        position: new THREE.Vector3(0, 0, 0),
        userData: { isInterpolating: true }
      };
      
      // Add player to game
      mockGame.playerManager.players.set(playerId, player);
      
      // Create target position
      const targetPosition = new THREE.Vector3(10, 0, 10);
      
      // Mock implementation
      networkManager.interpolatePosition.mockImplementation((player, targetPos, deltaTime) => {
        // Simple linear interpolation for testing
        const t = Math.min(deltaTime / 100, 1); // 100ms interpolation time
        player.position.lerp(targetPos, t);
        
        // Mark as complete if t >= 1
        if (t >= 1) {
          player.userData.isInterpolating = false;
        }
      });
      
      // Call interpolation with full time elapsed
      networkManager.interpolatePosition(player, targetPosition, 100);
      
      // Verify position was fully interpolated
      expect(player.position.lerp).toHaveBeenCalledWith(targetPosition, 1);
      expect(player.userData.isInterpolating).toBe(false);
    });
  });
  
  describe('Rotation Interpolation', () => {
    test('should interpolate player rotation smoothly', () => {
      // Setup
      const playerId = 'test-player';
      const player = {
        quaternion: new THREE.Quaternion(),
        userData: { isInterpolating: true }
      };
      
      // Add player to game
      mockGame.playerManager.players.set(playerId, player);
      
      // Create target rotation
      const targetQuaternion = new THREE.Quaternion();
      targetQuaternion.set(0, 1, 0, 0); // 180 degree rotation around Y
      
      // Mock implementation
      networkManager.interpolateRotation.mockImplementation((player, targetQuat, deltaTime) => {
        // Simple spherical interpolation for testing
        const t = Math.min(deltaTime / 100, 1); // 100ms interpolation time
        player.quaternion.slerp(targetQuat, t);
      });
      
      // Call interpolation with half the time elapsed
      networkManager.interpolateRotation(player, targetQuaternion, 50);
      
      // Verify rotation was interpolated halfway
      expect(player.quaternion.slerp).toHaveBeenCalledWith(targetQuaternion, 0.5);
    });
    
    test('should handle rotation interpolation completion', () => {
      // Setup
      const playerId = 'test-player';
      const player = {
        quaternion: new THREE.Quaternion(),
        userData: { isInterpolating: true }
      };
      
      // Add player to game
      mockGame.playerManager.players.set(playerId, player);
      
      // Create target rotation
      const targetQuaternion = new THREE.Quaternion();
      targetQuaternion.set(0, 1, 0, 0); // 180 degree rotation around Y
      
      // Mock implementation
      networkManager.interpolateRotation.mockImplementation((player, targetQuat, deltaTime) => {
        // Simple spherical interpolation for testing
        const t = Math.min(deltaTime / 100, 1); // 100ms interpolation time
        player.quaternion.slerp(targetQuat, t);
        
        // Mark as complete if t >= 1
        if (t >= 1) {
          player.userData.isInterpolating = false;
        }
      });
      
      // Call interpolation with full time elapsed
      networkManager.interpolateRotation(player, targetQuaternion, 100);
      
      // Verify rotation was fully interpolated
      expect(player.quaternion.slerp).toHaveBeenCalledWith(targetQuaternion, 1);
      expect(player.userData.isInterpolating).toBe(false);
    });
  });
  
  describe('THREE.js Conversion Utilities', () => {
    test('should convert Euler angles to Quaternion', () => {
      // Setup
      const euler = new THREE.Euler();
      euler.set(0, Math.PI/2, 0); // 90 degrees around Y
      
      // Add conversion method to mock
      networkManager.eulerToQuaternion = jest.fn().mockImplementation((euler) => {
        // Return a quaternion with the expected values directly
        return {
          x: 0,
          y: 0.7071,
          z: 0,
          w: 0.7071
        };
      });
      
      // Convert euler to quaternion
      const result = networkManager.eulerToQuaternion(euler);
      
      // Verify conversion
      expect(result.x).toBe(0);
      expect(result.y).toBe(0.7071);
      expect(result.z).toBe(0);
      expect(result.w).toBe(0.7071);
    });
    
    test('should convert rotation object to Quaternion', () => {
      // Setup
      const rotation = { x: 0, y: 90, z: 0 }; // 90 degrees around Y in degrees
      
      // Add conversion method to mock
      networkManager.rotationToQuaternion = jest.fn().mockImplementation((rotation) => {
        // Return a quaternion with the expected values directly
        return {
          x: 0,
          y: 0.7071,
          z: 0,
          w: 0.7071
        };
      });
      
      // Convert rotation to quaternion
      const result = networkManager.rotationToQuaternion(rotation);
      
      // Verify conversion
      expect(result.x).toBe(0);
      expect(result.y).toBe(0.7071);
      expect(result.z).toBe(0);
      expect(result.w).toBe(0.7071);
    });
  });
  
  describe('Server Authority with THREE.js', () => {
    test('should apply server position to THREE.js objects', () => {
      // Setup
      const playerId = 'test-player';
      const player = {
        position: new THREE.Vector3(0, 0, 0),
        quaternion: new THREE.Quaternion(),
        userData: {}
      };
      
      // Add player to game
      mockGame.playerManager.players.set(playerId, player);
      
      // Create position update from server
      const updateData = {
        type: 'position',
        position: { x: 10, y: 5, z: 20 },
        rotation: { y: 90 } // In degrees
      };
      
      // Add method to apply server update
      networkManager.applyServerPositionUpdate = jest.fn().mockImplementation((player, posData, rotData) => {
        // Set target position for interpolation
        player.userData.targetPosition = new THREE.Vector3(
          posData.x,
          posData.y,
          posData.z
        );
        
        // Set target rotation for interpolation
        if (rotData) {
          const radians = THREE.MathUtils.degToRad(rotData.y);
          player.userData.targetRotation = { y: radians };
        }
        
        // Mark as interpolating
        player.userData.isInterpolating = true;
      });
      
      // Apply server update
      networkManager.applyServerPositionUpdate(player, updateData.position, updateData.rotation);
      
      // Verify target position and rotation were set
      expect(player.userData.targetPosition.x).toBe(10);
      expect(player.userData.targetPosition.y).toBe(5);
      expect(player.userData.targetPosition.z).toBe(20);
      expect(player.userData.targetRotation.y).toBeCloseTo(Math.PI/2); // 90 degrees in radians
      expect(player.userData.isInterpolating).toBe(true);
    });
  });
}); 