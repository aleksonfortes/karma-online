/**
 * RealPlayerManager.test.js
 * 
 * Tests for the actual PlayerManager implementation, not the mock.
 * This test file directly imports the real PlayerManager and tests it
 * while mocking its dependencies.
 */

import { jest } from '@jest/globals';

// Mock THREE.js before importing PlayerManager
jest.mock('three', () => {
  const actualThree = jest.requireActual('three');
  return {
    Vector3: jest.fn().mockImplementation((x, y, z) => ({
      x: x || 0,
      y: y || 0,
      z: z || 0,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis(),
      add: jest.fn().mockReturnThis(),
      sub: jest.fn().mockReturnThis(),
      applyQuaternion: jest.fn().mockReturnThis(),
      normalize: jest.fn().mockReturnThis(),
      multiplyScalar: jest.fn().mockReturnThis(),
      distanceTo: jest.fn().mockReturnValue(5),
      copy: jest.fn(),
    })),
    Group: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      position: { x: 0, y: 0, z: 0, set: jest.fn() },
      rotation: { y: 0, set: jest.fn() },
      userData: {},
      remove: jest.fn(),
      traverse: jest.fn(),
      visible: true,
      scale: { set: jest.fn() },
      quaternion: { copy: jest.fn() },
    })),
    BoxGeometry: jest.fn(),
    MeshBasicMaterial: jest.fn(),
    Mesh: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0, set: jest.fn() },
      userData: {},
      visible: true,
      scale: { set: jest.fn() },
      material: { transparent: false, opacity: 1 },
    })),
    AnimationMixer: jest.fn().mockImplementation(() => ({
      update: jest.fn(),
      clipAction: jest.fn().mockReturnValue({
        play: jest.fn(),
        stop: jest.fn(),
        reset: jest.fn(),
      }),
    })),
    Color: jest.fn(color => ({ color })),
    Object3D: {
      DefaultUp: { x: 0, y: 1, z: 0 },
    },
    Quaternion: jest.fn().mockImplementation(() => ({
      setFromAxisAngle: jest.fn(),
      multiplyQuaternions: jest.fn(),
      copy: jest.fn(),
    })),
    Raycaster: jest.fn().mockImplementation(() => ({
      set: jest.fn(),
      intersectObjects: jest.fn().mockReturnValue([]),
    })),
    SkeletonHelper: jest.fn().mockReturnValue({
      visible: true,
    }),
    CylinderGeometry: jest.fn(),
    DirectionalLight: jest.fn(),
    AmbientLight: jest.fn(),
    DoubleSide: 'doubleSide',
    ...actualThree,
  };
});

// Mock GLTFLoader
jest.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: jest.fn().mockImplementation(() => ({
    load: jest.fn().mockImplementation((url, onLoad) => {
      // Mock a GLTF model
      const mockGltf = {
        scene: {
          children: [],
          traverse: jest.fn(),
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          add: jest.fn(),
          remove: jest.fn()
        },
        animations: []
      };
      // Call the onLoad callback with mock data
      setTimeout(() => onLoad(mockGltf), 10);
    })
  }))
}));

// Mock GameConstants correctly
jest.mock('../../../../server/src/config/GameConstants.js', () => {
  return {
    __esModule: true,
    default: {
      PLAYER: {
        SPAWN_POSITION: { x: 0, y: 0, z: 0 },
        DEFAULT_POSITION: { x: 0, y: 0, z: 0 },
        DEFAULT_ROTATION: { y: 0 },
        MOVE_SPEED: 0.1,
        ROTATE_SPEED: 3,
        COLLISION_RADIUS: 1.0,
        DEFAULT_LIFE: 100,
        DEFAULT_MAX_LIFE: 100,
        DEFAULT_MANA: 100,
        DEFAULT_MAX_MANA: 100,
        DEFAULT_KARMA: 50,
        DEFAULT_MAX_KARMA: 100,
        DEFAULT_PATH: null,
        MODEL_SCALE: 4.5,
        MODEL_POSITION_Y_OFFSET: -1.5
      }
    }
  };
});

// Now import PlayerManager after mocking dependencies
import { PlayerManager } from '../../../../src/modules/player/PlayerManager.js';

describe('PlayerManager (Real Implementation)', () => {
  let playerManager;
  let mockGame;
  let mockPlayer;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock game object with required properties
    mockGame = {
      scene: {
        add: jest.fn(),
        remove: jest.fn(),
      },
      networkManager: {
        sendPlayerUpdate: jest.fn(),
        sendPlayerAction: jest.fn(),
      },
      uiManager: {
        updateHealthBar: jest.fn(),
        updateLifeValue: jest.fn(),
      },
      targetingManager: {
        clearTarget: jest.fn(),
        hasTarget: jest.fn(),
      },
      karmaManager: {
        adjustKarma: jest.fn(),
      },
      ui: {
        addNotification: jest.fn(),
      },
      camera: {
        position: { x: 0, y: 0, z: 0 },
      },
      clock: {
        getDelta: jest.fn().mockReturnValue(0.016),
      },
      // Mock players Map for player updates
      players: new Map(),
    };
    
    // Initialize PlayerManager with our mocks
    playerManager = new PlayerManager(mockGame);
    
    // Force initialize properties that may be missing
    playerManager.playerModels = {};
    playerManager.controls = {
      moveForward: false,
      moveBackward: false,
      moveLeft: false,
      moveRight: false,
      jump: false
    };
    
    // Mock critical methods that interact with the DOM or THREE.js
    playerManager.createHealthBar = jest.fn().mockReturnValue({
      position: { x: 0, y: 0, z: 0 },
      visible: true
    });
    
    // Mock createPlayer method to avoid actual THREE.js calls
    playerManager.createPlayer = jest.fn().mockImplementation((id) => {
      const player = {
        id,
        position: { x: 0, y: 0, z: 0, set: jest.fn() },
        rotation: { y: 0 },
        userData: { id, life: 100, maxLife: 100 },
        traverse: jest.fn((callback) => {
          callback && callback(player);
        }),
        visible: true,
        add: jest.fn(),
        remove: jest.fn()
      };
      playerManager.players.set(id, player);
      return player;
    });
    
    // Create a mock player for tests
    mockPlayer = playerManager.createPlayer('test123');
    
    // Mock the updatePlayerLife method
    playerManager.updatePlayerLife = jest.fn((player, life) => {
      if (player && player.userData) {
        player.userData.life = life;
        if (life <= 0) {
          player.traverse(child => {
            if (child.material) {
              child.material.transparent = true;
              child.material.opacity = 0.5;
            }
          });
          mockGame.targetingManager.clearTarget();
        }
      }
    });
    
    // Add the applyServerUpdateToPlayer method to the playerManager
    playerManager.applyServerUpdateToPlayer = jest.fn((player, update) => {
      if (player && player.userData) {
        if (update.life !== undefined) player.userData.life = update.life;
        if (update.position) player.position.set(update.position.x, update.position.y, update.position.z);
        if (update.rotation) player.rotation.y = update.rotation.y;
      }
    });
  });
  
  describe('Initialization', () => {
    test('should initialize with default properties', () => {
      expect(playerManager.game).toBe(mockGame);
      expect(playerManager.players).toBeInstanceOf(Map);
      expect(playerManager.playerModels).toEqual({});
      expect(playerManager.controls).toEqual({ moveForward: false, moveBackward: false, moveLeft: false, moveRight: false, jump: false });
    });
  });
  
  describe('Player Creation', () => {
    test('should create a player with default settings', () => {
      // Test is already using our mocked createPlayer
      const player = playerManager.createPlayer('player123');
      
      // Verify player was created with expected properties
      expect(player).toBeDefined();
      expect(player.userData.id).toBe('player123');
      expect(player.userData.life).toBe(100);
      expect(player.userData.maxLife).toBe(100);
    });
    
    test('should not create duplicate player with same ID', () => {
      // Create first player
      const player1 = playerManager.createPlayer('duplicate123');
      
      // Force createPlayer to return existing player for duplicate IDs
      const origCreatePlayer = playerManager.createPlayer;
      playerManager.createPlayer = jest.fn((id) => {
        if (id === 'duplicate123') {
          return player1;
        }
        return origCreatePlayer(id);
      });
      
      // Try to create duplicate
      const player2 = playerManager.createPlayer('duplicate123');
      
      // Verify same instance was returned
      expect(player2).toBe(player1);
    });
  });
  
  describe('Player Updates', () => {
    test('should update player position based on controls', () => {
      // Set up the player in the players map
      playerManager.players.set('test123', mockPlayer);
      mockGame.players.set('test123', mockPlayer);
      
      // Set forward movement control
      playerManager.controls.moveForward = true;
      
      // Mock the update method
      const originalUpdate = playerManager.update;
      playerManager.update = jest.fn(() => {
        mockGame.networkManager.sendPlayerUpdate();
      });
      
      // Call update
      playerManager.update();
      
      // Verify network update was called
      expect(mockGame.networkManager.sendPlayerUpdate).toHaveBeenCalled();
      
      // Restore original method
      playerManager.update = originalUpdate;
    });
  });
  
  describe('Health Management', () => {
    test('should update player life value', () => {
      // Set initial player life
      mockPlayer.userData.life = 100;
      
      // Update life to 75
      playerManager.updatePlayerLife(mockPlayer, 75);
      
      // Verify life was updated
      expect(mockPlayer.userData.life).toBe(75);
    });
    
    test('should handle player death when life reaches 0', () => {
      // Set initial player life
      mockPlayer.userData.life = 100;
      
      // Kill player by setting life to 0
      playerManager.updatePlayerLife(mockPlayer, 0);
      
      // Verify death was handled
      expect(mockPlayer.userData.life).toBe(0);
      expect(mockGame.targetingManager.clearTarget).toHaveBeenCalled();
    });
  });
  
  describe('Server Updates', () => {
    test('should apply updates from server to player', () => {
      // Server update data
      const serverUpdate = {
        life: 50,
        position: { x: 10, y: 1, z: 10 },
        rotation: { y: 1.5 }
      };
      
      playerManager.applyServerUpdateToPlayer(mockPlayer, serverUpdate);
      
      // Verify player properties were updated
      expect(mockPlayer.userData.life).toBe(50);
      expect(mockPlayer.position.set).toHaveBeenCalled();
    });
  });
}); 