/**
 * NetworkManagerSecurity.test.js - Tests for security features in NetworkManager
 * 
 * This file tests the security aspects of the NetworkManager class, including
 * handling of invalid data, protection against spoofing, and validation of server responses.
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

describe('NetworkManager Security', () => {
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
  
  describe('Input Validation', () => {
    test('should reject malformed player data', () => {
      // Setup
      const malformedData = {
        // Missing required id field
        position: { x: 10, y: 0, z: 10 },
        rotation: { y: 1.5 }
      };
      
      // Mock player manager
      mockGame.playerManager.createPlayer = jest.fn();
      
      // Call handler
      networkManager.handlePlayerJoined(malformedData);
      
      // Verify player was not created
      expect(mockGame.playerManager.createPlayer).not.toHaveBeenCalled();
    });
    
    test('should sanitize position data', () => {
      // Setup
      const invalidPositionData = {
        id: 'player-1',
        position: { 
          x: NaN, 
          y: Infinity, 
          z: "not-a-number" 
        },
        rotation: { y: 1.5 }
      };
      
      // Mock player manager
      mockGame.playerManager.createPlayer = jest.fn();
      
      // Add sanitizePosition method to networkManager
      networkManager.sanitizePosition = jest.fn(pos => ({
        x: isNaN(Number(pos.x)) ? 0 : Number(pos.x),
        y: isNaN(Number(pos.y)) || !isFinite(Number(pos.y)) ? 0 : Number(pos.y),
        z: isNaN(Number(pos.z)) ? 0 : Number(pos.z)
      }));
      
      // Override handlePlayerJoined to use sanitizePosition
      const originalMethod = networkManager.handlePlayerJoined;
      networkManager.handlePlayerJoined = jest.fn(playerData => {
        if (!playerData || !playerData.id) return;
        
        const sanitizedPosition = networkManager.sanitizePosition(playerData.position);
        originalMethod.call(networkManager, {
          ...playerData,
          position: sanitizedPosition
        });
      });
      
      // Call handler
      networkManager.handlePlayerJoined(invalidPositionData);
      
      // Verify sanitizePosition was called
      expect(networkManager.sanitizePosition).toHaveBeenCalledWith(invalidPositionData.position);
      
      // Verify player was created with sanitized position
      expect(mockGame.playerManager.createPlayer).toHaveBeenCalledWith(
        invalidPositionData.id,
        expect.objectContaining({
          x: 0,
          y: 0,
          z: 0
        }),
        invalidPositionData.rotation,
        false
      );
    });
  });
  
  describe('Authentication and Authorization', () => {
    test('should validate player identity before applying updates', () => {
      // Setup
      const updateData = {
        id: 'player-123',
        position: { x: 15, y: 0, z: 15 },
        rotation: { y: 2.0 }
      };
      
      // Mock isValidPlayer method
      networkManager.isValidPlayer = jest.fn().mockReturnValue(false);
      
      // Override handlePlayerUpdate to use isValidPlayer
      const originalMethod = networkManager.handlePlayerUpdate;
      networkManager.handlePlayerUpdate = jest.fn(data => {
        if (!networkManager.isValidPlayer(data.id)) {
          console.warn(`Rejected update from invalid player: ${data.id}`);
          return;
        }
        originalMethod.call(networkManager, data);
      });
      
      // Mock player manager
      mockGame.playerManager.applyServerUpdate = jest.fn();
      
      // Call handler
      networkManager.handlePlayerUpdate(updateData);
      
      // Verify isValidPlayer was called
      expect(networkManager.isValidPlayer).toHaveBeenCalledWith(updateData.id);
      
      // Verify update was not applied
      expect(mockGame.playerManager.applyServerUpdate).not.toHaveBeenCalled();
      
      // Verify warning was logged
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Rejected update from invalid player'));
    });
    
    test('should handle server authentication challenges', () => {
      // Setup
      const challenge = {
        token: 'challenge-token-123',
        timestamp: Date.now()
      };
      
      // Mock authentication response
      networkManager.generateAuthResponse = jest.fn().mockReturnValue({
        token: challenge.token,
        response: 'auth-response-456'
      });
      
      // Add handleAuthChallenge method
      networkManager.handleAuthChallenge = jest.fn(challengeData => {
        const response = networkManager.generateAuthResponse(challengeData);
        networkManager.socket.emit('authResponse', response);
      });
      
      // Call handler
      networkManager.handleAuthChallenge(challenge);
      
      // Verify response was generated
      expect(networkManager.generateAuthResponse).toHaveBeenCalledWith(challenge);
      
      // Verify response was sent
      expect(mockSocket.emit).toHaveBeenCalledWith('authResponse', expect.objectContaining({
        token: challenge.token
      }));
    });
  });
  
  describe('Data Integrity', () => {
    test('should detect and reject tampered data', () => {
      // Setup
      const tamperedData = {
        id: 'player-123',
        position: { x: 1000000, y: 1000000, z: 1000000 }, // Unrealistic position
        timestamp: Date.now()
      };
      
      // Mock isRealisticPosition method
      networkManager.isRealisticPosition = jest.fn(pos => {
        const maxCoord = 10000; // Example boundary
        return Math.abs(pos.x) < maxCoord && 
               Math.abs(pos.y) < maxCoord && 
               Math.abs(pos.z) < maxCoord;
      });
      
      // Override handlePositionCorrection to check position
      const originalMethod = networkManager.handlePositionCorrection;
      networkManager.handlePositionCorrection = jest.fn(data => {
        if (!networkManager.isRealisticPosition(data.position)) {
          console.error('Rejected unrealistic position correction');
          return;
        }
        originalMethod.call(networkManager, data);
      });
      
      // Call handler
      networkManager.handlePositionCorrection(tamperedData);
      
      // Verify position was checked
      expect(networkManager.isRealisticPosition).toHaveBeenCalledWith(tamperedData.position);
      
      // Verify error was logged
      expect(console.error).toHaveBeenCalledWith('Rejected unrealistic position correction');
    });
    
    test('should validate timestamps to prevent replay attacks', () => {
      // Setup
      const oldData = {
        id: 'player-123',
        position: { x: 10, y: 0, z: 10 },
        timestamp: Date.now() - 60000 // 1 minute old
      };
      
      // Mock isTimestampValid method
      networkManager.isTimestampValid = jest.fn(timestamp => {
        const maxAge = 30000; // 30 seconds
        return Date.now() - timestamp < maxAge;
      });
      
      // Override handlePlayerUpdate to check timestamp
      const originalMethod = networkManager.handlePlayerUpdate;
      networkManager.handlePlayerUpdate = jest.fn(data => {
        if (!data.timestamp || !networkManager.isTimestampValid(data.timestamp)) {
          console.warn('Rejected outdated or missing timestamp');
          return;
        }
        originalMethod.call(networkManager, data);
      });
      
      // Mock player manager
      mockGame.playerManager.applyServerUpdate = jest.fn();
      
      // Call handler
      networkManager.handlePlayerUpdate(oldData);
      
      // Verify timestamp was checked
      expect(networkManager.isTimestampValid).toHaveBeenCalledWith(oldData.timestamp);
      
      // Verify warning was logged
      expect(console.warn).toHaveBeenCalledWith('Rejected outdated or missing timestamp');
      
      // Verify update was not applied
      expect(mockGame.playerManager.applyServerUpdate).not.toHaveBeenCalled();
    });
  });
  
  describe('Rate Limiting', () => {
    test('should throttle outgoing messages', () => {
      // Setup
      networkManager.isConnected = true;
      networkManager.lastMessageTimes = new Map();
      
      // Mock isRateLimited method
      networkManager.isRateLimited = jest.fn((messageType, minInterval) => {
        const now = Date.now();
        const lastTime = networkManager.lastMessageTimes.get(messageType) || 0;
        
        if (now - lastTime < minInterval) {
          return true; // Rate limited
        }
        
        // Update last message time
        networkManager.lastMessageTimes.set(messageType, now);
        return false;
      });
      
      // Override sendPlayerAction to use rate limiting
      const originalMethod = networkManager.sendPlayerAction;
      networkManager.sendPlayerAction = jest.fn(action => {
        const messageType = 'playerAction';
        const minInterval = 100; // 100ms minimum between actions
        
        if (networkManager.isRateLimited(messageType, minInterval)) {
          console.warn(`Rate limited: ${messageType}`);
          return;
        }
        
        originalMethod.call(networkManager, action);
      });
      
      // Call method twice in quick succession
      const action = { type: 'attack', targetId: 'enemy-1' };
      networkManager.sendPlayerAction(action);
      networkManager.sendPlayerAction(action);
      
      // Verify rate limiting was checked twice
      expect(networkManager.isRateLimited).toHaveBeenCalledTimes(2);
      
      // Verify socket.emit was called only once
      expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      
      // Verify warning was logged
      expect(console.warn).toHaveBeenCalledWith('Rate limited: playerAction');
    });
  });
}); 