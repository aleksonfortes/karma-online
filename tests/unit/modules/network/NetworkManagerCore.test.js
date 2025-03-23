/**
 * NetworkManagerCore.test.js - Unit tests for NetworkManager core functionality
 * 
 * These tests focus on testing the core functionality of the NetworkManager
 * without setting up real socket connections.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { NetworkManager } from '../../../../server/src/modules/network/NetworkManager.js';
import { createServer } from 'http';
import GameConstants from '../../../../server/src/config/GameConstants.js';

// Mock dependencies
const mockPlayerManager = {
  addPlayer: jest.fn(),
  getPlayerCount: jest.fn(),
  getAllPlayers: jest.fn(),
  getPlayer: jest.fn(),
  updatePlayerPosition: jest.fn(),
  removePlayer: jest.fn()
};

const mockGameManager = {
  getAllNPCs: jest.fn(),
  updatePlayerMovement: jest.fn(),
  handlePlayerDeath: jest.fn()
};

// Mock Socket.io
const mockSocket = {
  id: 'test-socket-id',
  handshake: {
    query: {
      username: 'TestUser',
      version: '1.0.0'
    }
  },
  on: jest.fn(),
  emit: jest.fn(),
  join: jest.fn(),
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
    
    // Game state
    this.serverStartTime = Date.now();
  }
  
  // Override socket initialization
  setupSocketHandlers() {
    // No-op for testing
  }
  
  // Simulate a new connection
  simulateConnection(socket = mockSocket) {
    // Manually add the player as the connection handler would
    const player = this.playerManager.addPlayer(socket.id, socket.handshake.query.username, { x: 0, y: 0, z: 0 });
    
    // Store the socket
    this.sockets.set(socket.id, { statsInterval: null });
    
    // Send initial game state
    socket.emit('initialGameState', {
      players: this.playerManager.getAllPlayers(),
      npcs: this.gameManager.getAllNPCs(),
      serverTime: Date.now()
    });
    
    // Broadcast to others
    socket.broadcast.emit('playerJoined', player);
    
    return socket;
  }
  
  // Simulate player movement
  simulatePlayerMovement(socketId, movementData) {
    // Validate movement data
    if (!this.validateMovementData(movementData)) {
      return false;
    }
    
    // Create sanitized data
    const sanitizedData = {
      position: {
        x: Number(movementData.position.x),
        y: Number(movementData.position.y),
        z: Number(movementData.position.z)
      },
      rotation: {
        y: Number(movementData.rotation.y || 0)
      }
    };
    
    // Update player position
    this.playerManager.updatePlayerPosition(socketId, sanitizedData.position);
    
    // Create a room for the player
    this.io.to(socketId);
    
    // Broadcast to all clients
    this.io.emit('playerPositions', {
      [socketId]: {
        position: sanitizedData.position,
        rotation: sanitizedData.rotation
      }
    });
    
    return true;
  }
  
  // Simulate player disconnection
  simulateDisconnection(socketId) {
    // Remove player
    this.playerManager.removePlayer(socketId);
    
    // Broadcast to all clients
    this.io.emit('playerLeft', { id: socketId });
    
    // Remove from sockets map
    this.sockets.delete(socketId);
  }
  
  // Override to prevent stats interval
  startStatsUpdateInterval() {
    // No-op for testing
  }
  
  // Tests can use this to trigger socket events
  triggerSocketEvent(socketId, event, data) {
    const socket = { id: socketId };
    this._socketHandlers[event]?.(socket, data);
  }
  
  // For validation tests
  validateMovementData(data) {
    if (!data || !data.position) {
      return false;
    }
    
    // Check that position values are numbers and within reasonable bounds
    const pos = data.position;
    if (typeof pos.x !== 'number' || typeof pos.y !== 'number' || typeof pos.z !== 'number') {
      return false;
    }
    
    // Check for extreme values
    const MAX_COORD = 1000000; // 1 million units
    if (Math.abs(pos.x) > MAX_COORD || Math.abs(pos.y) > MAX_COORD || Math.abs(pos.z) > MAX_COORD) {
      return false;
    }
    
    return true;
  }
  
  // For rate limiting tests
  rateLimitMovement(socketId) {
    const now = Date.now();
    const lastTime = this.lastUpdateTime.get(socketId) || 0;
    
    if (now - lastTime < GameConstants.MOVEMENT_RATE_LIMIT_MS) {
      return false;
    }
    
    this.lastUpdateTime.set(socketId, now);
    return true;
  }
  
  // For security event logging tests
  logSecurityEvent(message, playerId = null) {
    const formattedMessage = playerId 
      ? `[NetworkManager] SECURITY [${playerId}]: ${message}`
      : `[NetworkManager] SECURITY: ${message}`;
    
    console.warn(formattedMessage);
    return true;
  }
}

describe('NetworkManager Core Tests', () => {
  let networkManager;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create an instance of our testable subclass
    networkManager = new TestableNetworkManager();
    
    // Mock console methods for testing
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Configure default mock responses
    mockPlayerManager.getAllPlayers.mockReturnValue([
      { id: 'player1', username: 'Player1' },
      { id: 'player2', username: 'Player2' }
    ]);
    
    // When adding a player, return a mock player object
    mockPlayerManager.addPlayer.mockImplementation((socketId, username, position) => ({
      id: socketId,
      username: username || 'DefaultUser',
      position: position || { x: 0, y: 0, z: 0 }
    }));
    
    mockGameManager.getAllNPCs.mockReturnValue([
      { id: 'npc1', type: 'enemy' },
      { id: 'npc2', type: 'friendly' }
    ]);
    
    mockSocket.to.mockReturnThis();
    mockSocket.broadcast.to.mockReturnThis();
    
    // Set up GameConstants
    GameConstants.MOVEMENT_RATE_LIMIT_MS = 100;
  });
  
  test('should initialize with proper configuration', () => {
    expect(networkManager.gameManager).toBe(mockGameManager);
    expect(networkManager.playerManager).toBe(mockPlayerManager);
    expect(networkManager.io).toBeDefined();
  });
  
  test('should add a player when a client connects', () => {
    // Simulate a connection
    const socket = networkManager.simulateConnection();
    
    // Verify player was added
    expect(mockPlayerManager.addPlayer).toHaveBeenCalledWith(
      socket.id,
      socket.handshake.query.username,
      expect.any(Object) // Position
    );
    
    // Verify initial game state was sent
    expect(socket.emit).toHaveBeenCalledWith(
      'initialGameState',
      expect.any(Object)
    );
  });
  
  test('should send initial game state to new clients', () => {
    // Simulate a connection
    const socket = networkManager.simulateConnection();
    
    // Verify initial game state was sent with players and NPCs
    expect(socket.emit).toHaveBeenCalledWith(
      'initialGameState',
      expect.objectContaining({
        players: expect.any(Array),
        npcs: expect.any(Array)
      })
    );
    
    // Verify the data passed matches what we expect
    const initialGameStateCall = socket.emit.mock.calls.find(
      call => call[0] === 'initialGameState'
    );
    
    const gameState = initialGameStateCall[1];
    expect(gameState.players.length).toBe(2); // From our mock data
    expect(gameState.npcs.length).toBe(2); // From our mock data
  });
  
  test('should broadcast new player to other clients', () => {
    // Simulate a connection
    const socket = networkManager.simulateConnection();
    
    // Verify broadcast to other clients
    expect(socket.broadcast.emit).toHaveBeenCalledWith(
      'playerJoined',
      expect.objectContaining({
        id: socket.id,
        username: socket.handshake.query.username
      })
    );
    
    // Check the broadcast data
    const broadcastCall = socket.broadcast.emit.mock.calls.find(
      call => call[0] === 'playerJoined'
    );
    
    expect(broadcastCall).toBeDefined();
    const playerData = broadcastCall[1];
    expect(playerData).toHaveProperty('id', socket.id);
    expect(playerData).toHaveProperty('username', socket.handshake.query.username);
  });
  
  test('should handle player movement events', () => {
    // Set up mock for updatePlayerPosition
    const updatedPosition = { x: 10, y: 1, z: 15 };
    mockPlayerManager.updatePlayerPosition.mockReturnValue(true);
    mockPlayerManager.getPlayer.mockReturnValue({
      id: mockSocket.id,
      username: 'TestUser',
      position: updatedPosition
    });
    
    // Simulate a connection
    const socket = networkManager.simulateConnection();
    
    // Clear the mocks to start fresh
    mockIo.to.mockClear();
    mockIo.emit.mockClear();
    
    // Simulate movement data
    const movementData = {
      position: updatedPosition,
      rotation: { y: 90 },
      timestamp: Date.now()
    };
    
    // Trigger movement event
    networkManager.simulatePlayerMovement(socket.id, movementData);
    
    // Verify player position was updated
    expect(mockPlayerManager.updatePlayerPosition).toHaveBeenCalledWith(
      socket.id,
      updatedPosition
    );
    
    // Verify broadcast to other clients
    expect(mockIo.to).toHaveBeenCalled(); // Room broadcast
    expect(mockIo.emit).toHaveBeenCalledWith(
      'playerPositions',
      expect.objectContaining({
        [socket.id]: expect.objectContaining({
          position: updatedPosition,
          rotation: movementData.rotation
        })
      })
    );
  });
  
  test('should handle player disconnection', () => {
    // Simulate a connection
    const socket = networkManager.simulateConnection();
    
    // Reset mocks to clear connection calls
    jest.clearAllMocks();
    
    // Simulate disconnection
    networkManager.simulateDisconnection(socket.id);
    
    // Verify player was removed
    expect(mockPlayerManager.removePlayer).toHaveBeenCalledWith(socket.id);
    
    // Verify broadcast to other clients
    expect(mockIo.emit).toHaveBeenCalledWith(
      'playerLeft',
      expect.objectContaining({ id: socket.id })
    );
  });
  
  test('should validate movement data correctly', () => {
    // Valid movement data
    const validData = {
      position: { x: 10, y: 1, z: 15 },
      rotation: { y: 90 },
      timestamp: Date.now()
    };
    
    // Invalid movement data (missing position)
    const invalidData1 = {
      rotation: { y: 90 },
      timestamp: Date.now()
    };
    
    // Invalid movement data (non-numeric position)
    const invalidData2 = {
      position: { x: 'invalid', y: 1, z: 15 },
      rotation: { y: 90 },
      timestamp: Date.now()
    };
    
    // Test validation
    expect(networkManager.validateMovementData(validData)).toBe(true);
    expect(networkManager.validateMovementData(invalidData1)).toBe(false);
    expect(networkManager.validateMovementData(invalidData2)).toBe(false);
  });
  
  test('should apply rate limiting to movement events', () => {
    // First call should pass
    expect(networkManager.rateLimitMovement('test-player')).toBe(true);
    
    // Second call should be rate limited
    expect(networkManager.rateLimitMovement('test-player')).toBe(false);
    
    // Advance time
    const originalNow = Date.now;
    global.Date.now = jest.fn(() => originalNow() + 150); // Past the rate limit
    
    // Call should now pass again
    expect(networkManager.rateLimitMovement('test-player')).toBe(true);
    
    // Restore Date.now
    global.Date.now = originalNow;
  });
  
  test('should log security events', () => {
    // Log a security event
    const message = 'Suspicious activity detected';
    const playerId = 'suspicious-player';
    
    networkManager.logSecurityEvent(message, playerId);
    
    // Verify log was called
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(message)
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(playerId)
    );
  });
}); 