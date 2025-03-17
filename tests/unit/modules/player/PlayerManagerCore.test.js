/**
 * PlayerManagerCore.test.js - Core functionality tests for PlayerManager
 */

// Import necessary modules
import { jest } from '@jest/globals';
import { MockPlayerManager } from './mockPlayerManager';
import { createMockGame, createMockPlayer } from './playerTestHelpers';

// Mock THREE and GLTFLoader
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
    Scene: jest.fn(),
    PerspectiveCamera: jest.fn(),
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
    Clock: jest.fn(),
    MathUtils: { lerp: jest.fn((a, b, t) => a + (b - a) * t) },
    CylinderGeometry: jest.fn(),
    SphereGeometry: jest.fn(),
    BoxGeometry: jest.fn(),
    MeshStandardMaterial: jest.fn(),
    MeshBasicMaterial: jest.fn(),
    Mesh: jest.fn(),
    Object3D: jest.fn(),
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

describe('PlayerManager Core', () => {
  let mockGame;
  let playerManager;
  let THREE;
  
  beforeEach(() => {
    // Get the mocked THREE
    THREE = require('three');
    
    // Create mock game
    mockGame = createMockGame();
    
    // Create player manager with mock game
    playerManager = new MockPlayerManager(mockGame);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Initialization', () => {
    test('should initialize with default values', () => {
      const pm = new MockPlayerManager(mockGame);
      expect(pm.game).toBe(mockGame);
      expect(pm.players).toBeInstanceOf(Map);
      expect(pm.players.size).toBe(0);
    });
    
    test('should initialize player manager', () => {
      const pm = new MockPlayerManager(mockGame);
      pm.init();
      expect(pm.initialized).toBe(true);
    });
  });
  
  describe('Player Creation', () => {
    test('should create a local player', () => {
      // Setup
      const playerId = 'local-player-id';
      const playerData = {
        id: playerId,
        position: { x: 10, y: 5, z: 20 },
        rotation: { y: 1.5 }
      };
      
      // Create local player
      const localPlayer = playerManager.createLocalPlayer(playerData);
      
      // Verify player was created
      expect(playerManager.localPlayer).toBeTruthy();
      expect(playerManager.localPlayer.id).toBe(playerId);
      expect(playerManager.players.has(playerId)).toBe(true);
      expect(playerManager.players.get(playerId)).toBe(playerManager.localPlayer);
      
      // Verify position was set
      expect(playerManager.localPlayer.position.x).toBe(10);
      expect(playerManager.localPlayer.position.y).toBe(5);
      expect(playerManager.localPlayer.position.z).toBe(20);
      
      // Verify rotation was set
      expect(playerManager.localPlayer.rotation.y).toBe(1.5);
      
      // Verify player was added to scene
      expect(mockGame.scene.add).toHaveBeenCalledWith(playerManager.localPlayer);
    });
    
    test('should create a network player', () => {
      // Setup
      const playerId = 'network-player-id';
      const playerData = {
        id: playerId,
        position: { x: 15, y: 0, z: 25 },
        rotation: { y: 0.5 }
      };
      
      // Create network player
      const networkPlayer = playerManager.createNetworkPlayer(playerData);
      
      // Verify player was created
      expect(playerManager.players.has(playerId)).toBe(true);
      const player = playerManager.players.get(playerId);
      expect(player.id).toBe(playerId);
      
      // Verify position was set
      expect(player.position.x).toBe(15);
      expect(player.position.y).toBe(0);
      expect(player.position.z).toBe(25);
      
      // Verify rotation was set
      expect(player.rotation.y).toBe(0.5);
      
      // Verify player was added to scene
      expect(mockGame.scene.add).toHaveBeenCalledWith(player);
    });
    
    test('should not create duplicate player with same ID', () => {
      // Setup
      const playerId = 'duplicate-player-id';
      const playerData = {
        id: playerId,
        position: { x: 10, y: 0, z: 10 }
      };
      
      // Create first player
      const firstPlayer = playerManager.createPlayer(playerId, playerData.position);
      
      // Try to create duplicate player
      const duplicatePlayer = playerManager.createPlayer(playerId, { x: 20, y: 0, z: 20 });
      
      // Verify only one player exists with that ID
      expect(playerManager.players.size).toBe(1);
      expect(duplicatePlayer).toBe(firstPlayer);
    });
  });
  
  describe('Player Removal', () => {
    test('should remove a player', () => {
      // Setup
      const playerId = 'player-to-remove';
      playerManager.createPlayer(playerId, { x: 0, y: 0, z: 0 });
      
      // Remove player
      playerManager.removePlayer(playerId);
      
      // Verify player was removed
      expect(playerManager.players.has(playerId)).toBe(false);
    });
    
    test('should handle removing a non-existent player', () => {
      // Attempt to remove non-existent player
      expect(() => {
        playerManager.removePlayer('non-existent-player');
      }).not.toThrow();
    });
  });
}); 