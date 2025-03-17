/**
 * PlayerManagerHealth.test.js - Health and status management tests for PlayerManager
 */

// Import necessary modules
import { jest } from '@jest/globals';
import { MockPlayerManager } from './mockPlayerManager';
import { createMockGame, createMockPlayer, createPlayerTestSetup } from './playerTestHelpers';

// Mock THREE
jest.mock('three', () => {
  return {
    Group: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { y: 0, set: jest.fn() },
      add: jest.fn(),
      remove: jest.fn(),
      children: [],
      traverse: jest.fn(),
      userData: {}
    })),
    Vector3: jest.fn().mockImplementation((x, y, z) => ({ x: x || 0, y: y || 0, z: z || 0 })),
    Box3: jest.fn().mockImplementation(() => ({
      setFromObject: jest.fn().mockReturnThis(),
      min: { y: 0 },
      max: { y: 2 }
    })),
    CanvasTexture: jest.fn(),
    SpriteMaterial: jest.fn(),
    Sprite: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      scale: { set: jest.fn() }
    })),
    MathUtils: { lerp: jest.fn((a, b, t) => a + (b - a) * t) },
    Loader: class Loader {}
  };
});

jest.mock('three/examples/jsm/loaders/GLTFLoader.js', () => {
  const THREE = require('three');
  return {
    GLTFLoader: class GLTFLoader extends THREE.Loader {
      constructor() {
        super();
      }
      load() {
        return jest.fn();
      }
    }
  };
});

describe('PlayerManager Health System', () => {
  let mockGame;
  let playerManager;
  let THREE;
  
  beforeEach(() => {
    // Get the mocked THREE
    THREE = require('three');
    
    // Create test setup
    const setup = createPlayerTestSetup();
    mockGame = setup.mockGame;
    playerManager = setup.playerManager;
    
    // Set up players map
    playerManager.players = new Map();
    
    // Create a test player
    const playerId = 'test-player';
    const mockPlayer = createMockPlayer(THREE, playerId);
    playerManager.players.set(playerId, mockPlayer);
    
    // Set as local player
    playerManager.localPlayer = mockPlayer;
    mockGame.localPlayerId = playerId;
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Health Management', () => {
    test('should update player health', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      
      // Initial health
      expect(player.userData.stats.life).toBe(100);
      
      // Update health
      playerManager.updatePlayerHealth(playerId, 80);
      
      // Verify health was updated
      expect(player.userData.stats.life).toBe(80);
    });
    
    test('should handle damage to player', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      player.userData.stats.life = 100;
      
      // Apply damage
      playerManager.damagePlayer(playerId, 30);
      
      // Verify health was reduced
      expect(player.userData.stats.life).toBe(70);
      
      // Verify UI was updated
      expect(mockGame.uiManager.updateStatusBars).toHaveBeenCalled();
    });
    
    test('should handle player death', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      player.userData.stats.life = 20;
      
      // Apply fatal damage
      playerManager.damagePlayer(playerId, 30);
      
      // Verify player is dead
      expect(player.userData.stats.life).toBe(0);
      expect(player.userData.isDead).toBe(true);
      
      // Verify death screen shown for local player
      expect(mockGame.uiManager.showDeathScreen).toHaveBeenCalled();
    });
    
    test('should handle player respawn', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      player.userData.stats.life = 0;
      player.userData.isDead = true;
      
      // Respawn player
      playerManager.respawnPlayer(playerId, { x: 0, y: 0, z: 0 });
      
      // Verify player is alive
      expect(player.userData.stats.life).toBe(100);
      expect(player.userData.isDead).toBe(false);
      
      // Verify death screen hidden for local player
      expect(mockGame.uiManager.hideDeathScreen).toHaveBeenCalled();
    });
  });
  
  describe('Health and Status Update System', () => {
    test('should update status bars', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      
      // Update status
      playerManager.updateStatusBars(playerId);
      
      // Verify UI was updated
      expect(mockGame.uiManager.updateStatusBars).toHaveBeenCalledWith(
        player.userData.stats.life,
        player.userData.stats.maxLife,
        player.userData.stats.karma,
        player.userData.stats.maxKarma
      );
    });
    
    test('should update health bar position', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      player.position = { x: 10, y: 5, z: 20 };
      
      // Update health bar position
      playerManager.updateHealthBarPosition(player);
      
      // Verify health bar position was updated
      expect(player.healthBar.mesh.position.set).toHaveBeenCalled();
    });
    
    test('should update name tag position', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      player.position = { x: 10, y: 5, z: 20 };
      
      // Update name tag position
      playerManager.updateNameTagPosition(player);
      
      // Verify name tag position was updated
      expect(player.nameTag.mesh.position.set).toHaveBeenCalled();
    });
  });
  
  describe('Server Authority Health Updates', () => {
    test('should apply server health updates', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      player.userData.stats.life = 100;
      
      // Create update data from server
      const updateData = {
        type: 'health',
        life: 75,
        maxLife: 100
      };
      
      // Apply server update
      playerManager.applyServerUpdate(playerId, updateData);
      
      // Verify health was updated according to server
      expect(player.userData.stats.life).toBe(75);
      
      // Verify UI was updated
      expect(mockGame.uiManager.updateStatusBars).toHaveBeenCalled();
    });
    
    test('should handle server death notification', () => {
      // Setup
      const playerId = 'test-player';
      const player = playerManager.players.get(playerId);
      player.userData.stats.life = 50;
      player.userData.isDead = false;
      
      // Create death update from server
      const updateData = {
        type: 'death',
        isDead: true
      };
      
      // Apply server update
      playerManager.applyServerUpdate(playerId, updateData);
      
      // Verify player is marked as dead
      expect(player.userData.isDead).toBe(true);
      expect(player.userData.stats.life).toBe(0);
      
      // Verify death screen shown for local player
      expect(mockGame.uiManager.showDeathScreen).toHaveBeenCalled();
    });
  });
}); 