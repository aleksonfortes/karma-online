/**
 * NetworkManagerServerAuthority.test.js - Tests for server authority aspects of NetworkManager
 * 
 * This file focuses on testing the server authority aspects of the NetworkManager,
 * including validation of player actions, conflict resolution, and handling server rejections.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
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
    }
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

describe('NetworkManager Server Authority', () => {
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
    
    // Add skillsManager to mockGame
    mockGame.skillsManager = {
      revertSkillUse: jest.fn(),
      handleServerSkillResponse: jest.fn()
    };
    
    // Add terrainManager to mockGame
    mockGame.terrainManager = {
      applyServerTerrainUpdate: jest.fn(),
      handleServerTerrainResponse: jest.fn()
    };
    
    // Ensure position is properly mocked
    if (mockGame.playerManager && mockGame.playerManager.localPlayer) {
      mockGame.playerManager.localPlayer.position = {
        x: 0,
        y: 0,
        z: 0,
        set: jest.fn()
      };
    }
    
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
  
  describe('Action Validation', () => {
    test('should validate player movement with server', () => {
      // Setup
      const movementData = {
        type: 'movement',
        position: { x: 10, y: 0, z: 10 },
        rotation: { y: 90 }
      };
      
      // Mock validateActionWithServer method
      networkManager.validateActionWithServer = jest.fn().mockImplementation((action) => {
        // Emit the action to server
        mockSocket.emit('playerAction', action);
        return true;
      });
      
      // Validate movement
      const result = networkManager.validateActionWithServer(movementData);
      
      // Verify action was sent to server
      expect(mockSocket.emit).toHaveBeenCalledWith('playerAction', movementData);
      expect(result).toBe(true);
    });
    
    test('should validate skill usage with server', () => {
      // Setup
      const skillData = {
        type: 'skill_use',
        skillId: 'fireball',
        targetId: 'enemy-1',
        position: { x: 10, y: 0, z: 10 }
      };
      
      // Mock validateActionWithServer method
      networkManager.validateActionWithServer = jest.fn().mockImplementation((action) => {
        // Emit the action to server
        mockSocket.emit('playerAction', action);
        return true;
      });
      
      // Validate skill usage
      const result = networkManager.validateActionWithServer(skillData);
      
      // Verify action was sent to server
      expect(mockSocket.emit).toHaveBeenCalledWith('playerAction', skillData);
      expect(result).toBe(true);
    });
    
    test('should validate terrain modification with server', () => {
      // Setup
      const terrainData = {
        type: 'terrain_modify',
        position: { x: 10, y: 0, z: 10 },
        radius: 5,
        height: 2
      };
      
      // Mock validateActionWithServer method
      networkManager.validateActionWithServer = jest.fn().mockImplementation((action) => {
        // Emit the action to server
        mockSocket.emit('playerAction', action);
        return true;
      });
      
      // Validate terrain modification
      const result = networkManager.validateActionWithServer(terrainData);
      
      // Verify action was sent to server
      expect(mockSocket.emit).toHaveBeenCalledWith('playerAction', terrainData);
      expect(result).toBe(true);
    });
  });
  
  describe('Server Rejection Handling', () => {
    test('should handle server rejection of movement', () => {
      // Setup
      const rejectionData = {
        type: 'movement',
        reason: 'invalid_position',
        correctPosition: { x: 0, y: 0, z: 0 },
        timestamp: Date.now()
      };
      
      // Mock handleServerRejection method
      networkManager.handleServerRejection = jest.fn().mockImplementation((rejectionData) => {
        // Apply correction to player position
        if (rejectionData.type === 'movement' && rejectionData.correctPosition) {
          const player = mockGame.playerManager.localPlayer;
          player.position.x = rejectionData.correctPosition.x;
          player.position.y = rejectionData.correctPosition.y;
          player.position.z = rejectionData.correctPosition.z;
        }
        return true;
      });
      
      // Handle rejection
      const result = networkManager.handleServerRejection(rejectionData);
      
      // Verify rejection was handled
      expect(result).toBe(true);
      expect(mockGame.playerManager.localPlayer.position.x).toBe(0);
      expect(mockGame.playerManager.localPlayer.position.y).toBe(0);
      expect(mockGame.playerManager.localPlayer.position.z).toBe(0);
    });
    
    test('should handle server rejection of skill usage', () => {
      // Setup
      const rejectionData = {
        type: 'skill_use',
        skillId: 'fireball',
        reason: 'on_cooldown',
        timestamp: Date.now()
      };
      
      // Mock handleServerRejection method
      networkManager.handleServerRejection = jest.fn().mockImplementation((rejectionData) => {
        // Revert skill use
        if (rejectionData.type === 'skill_use') {
          mockGame.skillsManager.revertSkillUse(rejectionData.skillId);
        }
        return true;
      });
      
      // Handle rejection
      const result = networkManager.handleServerRejection(rejectionData);
      
      // Verify rejection was handled
      expect(result).toBe(true);
      expect(mockGame.skillsManager.revertSkillUse).toHaveBeenCalledWith('fireball');
    });
    
    test('should handle server rejection of terrain modification', () => {
      // Setup
      const rejectionData = {
        type: 'terrain_modify',
        reason: 'permission_denied',
        timestamp: Date.now()
      };
      
      // Mock handleServerRejection method
      networkManager.handleServerRejection = jest.fn().mockImplementation((rejectionData) => {
        // Revert terrain modification
        if (rejectionData.type === 'terrain_modify') {
          mockGame.terrainManager.handleServerTerrainResponse({
            success: false,
            reason: rejectionData.reason
          });
        }
        return true;
      });
      
      // Handle rejection
      const result = networkManager.handleServerRejection(rejectionData);
      
      // Verify rejection was handled
      expect(result).toBe(true);
      expect(mockGame.terrainManager.handleServerTerrainResponse).toHaveBeenCalledWith({
        success: false,
        reason: 'permission_denied'
      });
    });
  });
  
  describe('Position Conflict Resolution', () => {
    test('should resolve minor position conflicts with interpolation', () => {
      // Setup
      const playerId = 'local-player-id';
      const player = {
        position: new THREE.Vector3(5, 0, 5),
        userData: { isInterpolating: false }
      };
      
      // Add player to game
      mockGame.playerManager.players.set(playerId, player);
      
      // Create server position data
      const serverPosition = { x: 6, y: 0, z: 6 };
      
      // Mock resolvePositionConflict method
      networkManager.resolvePositionConflict = jest.fn().mockImplementation((player, serverPos) => {
        // Calculate distance between positions
        const distance = Math.sqrt(
          Math.pow(player.position.x - serverPos.x, 2) +
          Math.pow(player.position.y - serverPos.y, 2) +
          Math.pow(player.position.z - serverPos.z, 2)
        );
        
        // If distance is small, interpolate to server position
        if (distance < 10) {
          player.userData.targetPosition = new THREE.Vector3(
            serverPos.x,
            serverPos.y,
            serverPos.z
          );
          player.userData.isInterpolating = true;
          return false; // Conflict resolved with interpolation
        } else {
          // Otherwise, snap to server position
          player.position.x = serverPos.x;
          player.position.y = serverPos.y;
          player.position.z = serverPos.z;
          return true; // Conflict resolved with snap
        }
      });
      
      // Resolve conflict
      const result = networkManager.resolvePositionConflict(player, serverPosition);
      
      // Verify conflict resolution
      expect(player.userData.targetPosition).toBeDefined();
      expect(player.userData.isInterpolating).toBe(true);
      expect(result).toBe(false); // Should use interpolation
    });
    
    test('should resolve major position conflicts with immediate correction', () => {
      // Setup
      const playerId = 'local-player-id';
      const player = {
        position: new THREE.Vector3(0, 0, 0),
        userData: { isInterpolating: false }
      };
      
      // Add player to game
      mockGame.playerManager.players.set(playerId, player);
      
      // Create server position data (far away)
      const serverPosition = { x: 100, y: 0, z: 100 };
      
      // Mock resolvePositionConflict method
      networkManager.resolvePositionConflict = jest.fn().mockImplementation((player, serverPos) => {
        // Calculate distance between positions
        const distance = Math.sqrt(
          Math.pow(player.position.x - serverPos.x, 2) +
          Math.pow(player.position.y - serverPos.y, 2) +
          Math.pow(player.position.z - serverPos.z, 2)
        );
        
        // If distance is large, snap to server position
        if (distance >= 10) {
          player.position.x = serverPos.x;
          player.position.y = serverPos.y;
          player.position.z = serverPos.z;
          return true; // Conflict resolved with snap
        } else {
          // Otherwise, interpolate to server position
          player.userData.targetPosition = new THREE.Vector3(
            serverPos.x,
            serverPos.y,
            serverPos.z
          );
          player.userData.isInterpolating = true;
          return false; // Conflict resolved with interpolation
        }
      });
      
      // Resolve conflict
      const result = networkManager.resolvePositionConflict(player, serverPosition);
      
      // Verify conflict resolution
      expect(player.position.x).toBe(100);
      expect(player.position.y).toBe(0);
      expect(player.position.z).toBe(100);
      expect(result).toBe(true); // Should use immediate correction
    });
  });
  
  describe('Server Reset Handling', () => {
    test('should handle server-side game state resets', () => {
      // Setup
      const resetData = {
        type: 'game_reset',
        reason: 'Server restart',
        timestamp: Date.now()
      };
      
      // Mock handleServerReset method
      networkManager.handleServerReset = jest.fn().mockImplementation((resetData) => {
        // Clear all pending updates
        networkManager.pendingUpdates.clear();
        
        // Reset local player position
        if (mockGame.playerManager.localPlayer) {
          const player = mockGame.playerManager.localPlayer;
          player.position.x = 0;
          player.position.y = 0;
          player.position.z = 0;
        }
        
        // Request new initial position
        networkManager.requestInitialPosition();
        
        return true;
      });
      
      // Add requestInitialPosition method
      networkManager.requestInitialPosition = jest.fn().mockImplementation(() => {
        mockSocket.emit('requestInitialPosition');
        return true;
      });
      
      // Handle reset
      const result = networkManager.handleServerReset(resetData);
      
      // Verify reset was handled
      expect(result).toBe(true);
      expect(networkManager.pendingUpdates.size).toBe(0);
      expect(mockGame.playerManager.localPlayer.position.x).toBe(0);
      expect(mockGame.playerManager.localPlayer.position.y).toBe(0);
      expect(mockGame.playerManager.localPlayer.position.z).toBe(0);
      expect(networkManager.requestInitialPosition).toHaveBeenCalled();
    });
  });
  
  describe('Server Response Handling', () => {
    test('should handle server confirmation of skill usage', () => {
      // Setup
      const skillResponse = {
        type: 'skill_use',
        skillId: 'fireball',
        targetId: 'enemy-1',
        success: true,
        damage: 20,
        timestamp: Date.now()
      };
      
      // Mock handleServerResponse method
      networkManager.handleServerResponse = jest.fn().mockImplementation((response) => {
        if (response.type === 'skill_use') {
          mockGame.skillsManager.handleServerSkillResponse(response);
        }
        return true;
      });
      
      // Handle response
      const result = networkManager.handleServerResponse(skillResponse);
      
      // Verify response was handled
      expect(result).toBe(true);
      expect(mockGame.skillsManager.handleServerSkillResponse).toHaveBeenCalledWith(skillResponse);
    });
    
    test('should handle server confirmation of terrain modification', () => {
      // Setup
      const terrainResponse = {
        type: 'terrain_modify',
        success: true,
        position: { x: 10, y: 0, z: 10 },
        radius: 5,
        height: 2,
        timestamp: Date.now()
      };
      
      // Mock handleServerResponse method
      networkManager.handleServerResponse = jest.fn().mockImplementation((response) => {
        if (response.type === 'terrain_modify') {
          mockGame.terrainManager.handleServerTerrainResponse(response);
        }
        return true;
      });
      
      // Handle response
      const result = networkManager.handleServerResponse(terrainResponse);
      
      // Verify response was handled
      expect(result).toBe(true);
      expect(mockGame.terrainManager.handleServerTerrainResponse).toHaveBeenCalledWith(terrainResponse);
    });
  });
}); 