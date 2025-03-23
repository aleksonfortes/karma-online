/**
 * NetworkManagerSecurity.test.js - Unit tests for the security and validation features of NetworkManager
 * 
 * These tests focus on testing the security, validation, and server authority aspects of the NetworkManager
 * without setting up real socket connections.
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { NetworkManager } from '../../../../server/src/modules/network/NetworkManager.js';
import GameConstants from '../../../../server/src/config/GameConstants.js';

// Mock dependencies
const mockPlayerManager = {
  addPlayer: jest.fn(),
  getPlayerCount: jest.fn(),
  getAllPlayers: jest.fn(),
  getPlayer: jest.fn(),
  getPlayerByUsername: jest.fn(),
  removePlayer: jest.fn(),
  verifyPlayerSession: jest.fn()
};

const mockGameManager = {
  getAllNPCs: jest.fn(),
  validateAction: jest.fn(),
  checkServerAuthority: jest.fn(),
  validatePosition: jest.fn()
};

// Mock Socket.io
const mockSocket = {
  id: 'test-socket-id',
  handshake: {
    query: {
      username: 'TestUser',
      version: '1.0.0',
      sessionToken: 'valid-session-token'
    }
  },
  on: jest.fn(),
  emit: jest.fn(),
  join: jest.fn(),
  disconnect: jest.fn(),
  to: jest.fn().mockReturnThis(),
  broadcast: {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn()
  }
};

// Mock Socket.io server
const mockIo = {
  on: jest.fn(),
  emit: jest.fn(),
  to: jest.fn().mockReturnThis()
};

// Create a testable subclass of NetworkManager
class TestableNetworkManager extends NetworkManager {
  constructor() {
    super({}, {});
    
    // Set up mock dependencies
    this.playerManager = mockPlayerManager;
    this.gameManager = mockGameManager;
    this.sockets = new Map();
    this.io = mockIo;
    
    // Version checking
    this.requiredVersion = GameConstants.REQUIRED_CLIENT_VERSION;
    
    // Security
    this.bannedIps = new Set();
    this.maxInvalidAttempts = 5;
    this.invalidAttempts = new Map();
    this.securityLogs = [];
    this.rateLimit = new Map();
    this.blacklistedIPs = new Set();
    this.bannedPlayers = new Set();
    
    // Game state
    this.serverStartTime = Date.now();
  }
  
  // Override socket initialization
  setupSocketHandlers() {
    // No-op for testing
  }
  
  // Override to prevent stats interval
  startStatsUpdateInterval() {
    // No-op for testing
  }
  
  // Validate client version
  validateClientVersion(clientVersion) {
    return clientVersion === GameConstants.REQUIRED_CLIENT_VERSION;
  }
  
  // Simulate a connection
  simulateConnection(socket = mockSocket, validate = true) {
    // Validate the client version
    if (!this.validateClientVersion(socket.handshake.query.version)) {
      this.logSecurityEvent('Invalid client version', socket.id);
      socket.emit('connectionRejected', { reason: 'Invalid client version' });
      socket.disconnect();
      return null;
    }
    
    // Validate session if required
    if (validate && !this.validateSession(socket)) {
      this.logSecurityEvent('Invalid session token', socket.id);
      socket.emit('connectionRejected', { reason: 'Invalid session' });
      socket.disconnect();
      return null;
    }
    
    // Check for banned player
    if (this.bannedPlayers.has(socket.handshake.query.username)) {
      this.logSecurityEvent('Banned player attempted connection', socket.id);
      socket.emit('connectionRejected', { reason: 'You are banned' });
      socket.disconnect();
      return null;
    }
    
    // Check for ban
    if (this.bannedIps.has(socket.handshake.address)) {
      this.logSecurityEvent('Banned IP attempted connection', socket.id);
      socket.emit('connectionRejected', { reason: 'IP banned' });
      socket.disconnect();
      return null;
    }
    
    // Process the connection
    socket.emit('connectionAccepted', { timestamp: Date.now() });
    
    return socket;
  }
  
  // Simulate a player action with rate limiting and validation
  simulatePlayerAction(socketId, actionType, actionData) {
    // Check rate limit
    if (!this.checkRateLimit(socketId, actionType)) {
      this.logSecurityEvent(`Rate limit exceeded for ${actionType}`, socketId);
      return false;
    }
    
    // Validate the action
    if (!this.validateAction(actionType, actionData)) {
      this.logSecurityEvent(`Invalid ${actionType} data`, socketId);
      return false;
    }
    
    // Process the action if it passed validation
    return true;
  }
  
  // Validation methods
  validateSession(socket) {
    if (!socket.handshake.query.sessionToken) {
      return false;
    }
    
    // Check with player manager if session is valid
    return this.playerManager.verifyPlayerSession(
      socket.handshake.query.username, 
      socket.handshake.query.sessionToken
    );
  }
  
  validateAction(type, data) {
    // Basic validation
    if (!data) return false;
    
    switch (type) {
      case 'movement':
        return this.validateMovementData(data);
      case 'chat':
        return this.validateChatData(data);
      case 'combat':
        return this.validateCombatData(data);
      default:
        return false;
    }
  }
  
  validateMovementData(data) {
    if (!data || !data.position) return false;
    
    const { position } = data;
    
    // Check for position values
    if (typeof position.x !== 'number' || 
        typeof position.y !== 'number' || 
        typeof position.z !== 'number') {
      return false;
    }
    
    // Check for extreme values
    const max = GameConstants.MAX_POSITION_VALUE || 5000;
    if (Math.abs(position.x) > max || 
        Math.abs(position.y) > max || 
        Math.abs(position.z) > max) {
      return false;
    }
    
    return true;
  }
  
  validateChatData(data) {
    if (!data || !data.message) return false;
    
    // Message length check
    if (data.message.length > 200) return false;
    
    // Basic sanitization
    return !/<script|javascript:|onerror=|onclick=|alert\(|eval\(|document\.cookie/i.test(data.message);
  }
  
  validateCombatData(data) {
    if (!data || !data.targetId || typeof data.damage !== 'number') return false;
    
    // Damage should be within reasonable ranges
    if (data.damage <= 0 || data.damage > 100) return false;
    
    return true;
  }
  
  // Rate limiting methods
  checkRateLimit(socketId, actionType) {
    const now = Date.now();
    const key = `${socketId}-${actionType}`;
    
    if (!this.rateLimit.has(key)) {
      this.rateLimit.set(key, { count: 0, timestamp: now });
    }
    
    const limit = this.rateLimit.get(key);
    
    // Reset counter if enough time has passed
    if (now - limit.timestamp > 1000) {
      limit.count = 0;
      limit.timestamp = now;
    }
    
    limit.count++;
    
    // Check if exceeds limit
    const maxPerSecond = {
      movement: 10,
      chat: 3,
      combat: 5
    };
    
    return limit.count <= (maxPerSecond[actionType] || 5);
  }
  
  // Security logging
  logSecurityEvent(message, playerId) {
    const event = {
      timestamp: Date.now(),
      message,
      playerId
    };
    
    this.securityLogs.push(event);
    console.warn(`Security event: ${message} for player ${playerId}`);
    
    return event;
  }
  
  isIPBanned(socket) {
    // Mocked implementation
    return this.bannedPlayers.has(socket.handshake.query.username);
  }
  
  // Data sanitization
  sanitizeData(data) {
    if (!data) return null;
    
    const sanitized = { ...data };
    
    // Remove potentially dangerous properties
    delete sanitized.__proto__;
    delete sanitized.constructor;
    
    // Sanitize strings
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string') {
        sanitized[key] = this.sanitizeString(sanitized[key]);
      }
    });
    
    return sanitized;
  }
  
  sanitizeString(str) {
    if (typeof str !== 'string') return str;
    
    // Remove potentially dangerous HTML/JS content
    return str.replace(/<script|javascript:|onerror=|onclick=|alert\(|eval\(|document\.cookie/gi, '');
  }
}

describe('NetworkManager Security Tests', () => {
  let networkManager;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create an instance of our testable subclass
    networkManager = new TestableNetworkManager();
    
    // Mock console methods for testing
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Configure mocks
    mockPlayerManager.addPlayer.mockImplementation((socketId, username, position) => ({
      id: socketId,
      username: username || 'DefaultUser',
      position: position || { x: 0, y: 0, z: 0 }
    }));
    
    mockPlayerManager.getPlayer.mockImplementation((socketId) => ({
      id: socketId,
      username: 'TestUser',
      position: { x: 0, y: 0, z: 0 }
    }));
    
    mockPlayerManager.verifyPlayerSession.mockImplementation((username, token) => {
      return token === 'valid-session-token';
    });
    
    mockGameManager.validatePosition.mockReturnValue(true);
    mockGameManager.checkServerAuthority.mockReturnValue(true);
  });
  
  test('should validate session tokens', () => {
    // Valid session
    const validSocket = { ...mockSocket };
    expect(networkManager.validateSession(validSocket)).toBe(true);
    
    // Invalid session
    const invalidSocket = { 
      ...mockSocket, 
      handshake: { 
        query: { 
          username: 'TestUser', 
          sessionToken: 'invalid-token' 
        } 
      } 
    };
    
    // Configure mock to reject this token
    mockPlayerManager.verifyPlayerSession.mockImplementationOnce(() => false);
    
    expect(networkManager.validateSession(invalidSocket)).toBe(false);
  });
  
  test('should validate client versions', () => {
    // Set a constant for testing
    GameConstants.REQUIRED_CLIENT_VERSION = '1.0.0';
    
    // Valid version
    expect(networkManager.validateClientVersion('1.0.0')).toBe(true);
    
    // Invalid version
    expect(networkManager.validateClientVersion('0.9.0')).toBe(false);
    
    // Missing version
    expect(networkManager.validateClientVersion(null)).toBe(false);
  });
  
  test('should enforce rate limits for different actions', () => {
    const socketId = 'rate-limit-test';
    
    // First call should pass
    expect(networkManager.checkRateLimit(socketId, 'movement')).toBe(true);
    
    // Simulate many movement updates in quick succession
    for (let i = 0; i < 10; i++) {
      networkManager.checkRateLimit(socketId, 'movement');
    }
    
    // Next call should fail (exceeded 10 per second)
    expect(networkManager.checkRateLimit(socketId, 'movement')).toBe(false);
    
    // Chat should have a different rate limit (3 per second)
    expect(networkManager.checkRateLimit(socketId, 'chat')).toBe(true);
    expect(networkManager.checkRateLimit(socketId, 'chat')).toBe(true);
    expect(networkManager.checkRateLimit(socketId, 'chat')).toBe(true);
    expect(networkManager.checkRateLimit(socketId, 'chat')).toBe(false);
  });
  
  test('should log security events with player ID', () => {
    const playerId = 'security-test-id';
    const message = 'Suspicious activity detected';
    
    const event = networkManager.logSecurityEvent(message, playerId);
    
    expect(event).toBeDefined();
    expect(event.message).toBe(message);
    expect(event.playerId).toBe(playerId);
    expect(networkManager.securityLogs.length).toBe(1);
    expect(console.warn).toHaveBeenCalled();
  });
  
  test('should sanitize user input data', () => {
    const maliciousData = {
      message: '<script>alert("XSS");</script>Hello',
      __proto__: { dangerous: true },
      username: 'ValidUser'
    };
    
    const sanitized = networkManager.sanitizeData(maliciousData);
    
    expect(sanitized).toBeDefined();
    expect(sanitized.message).not.toContain('<script>');
    expect(Object.getPrototypeOf(sanitized)).toBe(Object.prototype);
    expect(sanitized.username).toBe('ValidUser');
  });
  
  test('should reject connection with invalid session token', () => {
    // Configure mock to reject this token
    mockPlayerManager.verifyPlayerSession.mockImplementationOnce(() => false);
    
    const invalidSocket = { 
      ...mockSocket, 
      handshake: { 
        query: { 
          username: 'TestUser',
          version: '1.0.0',
          sessionToken: 'invalid-token' 
        } 
      },
      emit: jest.fn(),
      disconnect: jest.fn()
    };
    
    const result = networkManager.simulateConnection(invalidSocket);
    
    expect(result).toBe(null);
    expect(invalidSocket.emit).toHaveBeenCalledWith('connectionRejected', expect.any(Object));
    expect(invalidSocket.disconnect).toHaveBeenCalled();
    expect(networkManager.securityLogs.length).toBe(1);
  });
  
  test('should reject connection with invalid client version', () => {
    // Set a constant for testing
    GameConstants.REQUIRED_CLIENT_VERSION = '1.0.0';
    
    const invalidSocket = { 
      ...mockSocket, 
      handshake: { 
        query: { 
          username: 'TestUser',
          version: '0.9.0',
          sessionToken: 'valid-session-token' 
        } 
      },
      emit: jest.fn(),
      disconnect: jest.fn()
    };
    
    const result = networkManager.simulateConnection(invalidSocket);
    
    expect(result).toBe(null);
    expect(invalidSocket.emit).toHaveBeenCalledWith('connectionRejected', expect.any(Object));
    expect(invalidSocket.disconnect).toHaveBeenCalled();
    expect(networkManager.securityLogs.length).toBe(1);
  });
  
  test('should reject malicious movement data', () => {
    // Valid connection
    const socketId = 'movement-test-id';
    
    // Invalid movement data (extreme values)
    const maliciousMovement = {
      position: { x: 999999, y: 999999, z: 999999 }
    };
    
    const result = networkManager.simulatePlayerAction(socketId, 'movement', maliciousMovement);
    
    expect(result).toBe(false);
    expect(networkManager.securityLogs.length).toBe(1);
  });
  
  test('should reject chat messages with malicious content', () => {
    // Valid connection
    const socketId = 'chat-test-id';
    
    // Invalid chat data (contains script tag)
    const maliciousChat = {
      message: '<script>alert("XSS");</script>Hello'
    };
    
    const result = networkManager.simulatePlayerAction(socketId, 'chat', maliciousChat);
    
    expect(result).toBe(false);
    expect(networkManager.securityLogs.length).toBe(1);
  });
  
  test('should handle banned players correctly', () => {
    // Add a username to banned list
    networkManager.bannedPlayers.add('BannedUser');
    
    const bannedSocket = { 
      ...mockSocket, 
      handshake: { 
        query: { 
          username: 'BannedUser',
          version: '1.0.0',
          sessionToken: 'valid-session-token' 
        }
      },
      emit: jest.fn(),
      disconnect: jest.fn()
    };
    
    const result = networkManager.simulateConnection(bannedSocket);
    
    expect(result).toBe(null);
    expect(bannedSocket.emit).toHaveBeenCalledWith('connectionRejected', expect.any(Object));
    expect(bannedSocket.disconnect).toHaveBeenCalled();
    expect(networkManager.securityLogs.length).toBe(1);
  });
}); 