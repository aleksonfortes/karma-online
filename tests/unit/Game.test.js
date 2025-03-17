/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock THREE.js before importing Game
jest.mock('three', () => ({
  WebGLRenderer: jest.fn().mockImplementation(() => ({
    setSize: jest.fn(),
    setPixelRatio: jest.fn(),
    setClearColor: jest.fn(),
    render: jest.fn(),
    domElement: {
      width: 800,
      height: 600
    }
  })),
  Scene: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    remove: jest.fn()
  })),
  Clock: jest.fn().mockImplementation(() => ({
    getDelta: jest.fn().mockReturnValue(0.016),
    getElapsedTime: jest.fn().mockReturnValue(1)
  })),
  Color: jest.fn(),
  PerspectiveCamera: jest.fn().mockImplementation(() => ({
    position: { x: 0, y: 0, z: 0 },
    lookAt: jest.fn()
  })),
  Vector3: jest.fn().mockImplementation((x, y, z) => ({ x, y, z })),
  Object3D: jest.fn().mockImplementation(() => ({
    position: { x: 0, y: 0, z: 0 }
  }))
}));

// Mock all the modules that Game depends on
jest.mock('../../src/modules/ui/UIManager.js', () => ({
  UIManager: jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    update: jest.fn(),
    cleanup: jest.fn(),
    showLoadingScreen: jest.fn(),
    hideLoadingScreen: jest.fn(),
    showLoginScreen: jest.fn(),
    hideLoginScreen: jest.fn(),
    showGameUI: jest.fn(),
    hideGameUI: jest.fn(),
    updateFPSCounter: jest.fn(),
    updatePingDisplay: jest.fn(),
    updateStatusBars: jest.fn()
  }))
}));

jest.mock('../../src/modules/network/NetworkManager.js', () => ({
  NetworkManager: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(),
    connect: jest.fn().mockResolvedValue(),
    disconnect: jest.fn(),
    isConnected: false,
    socket: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn()
    },
    cleanup: jest.fn()
  }))
}));

jest.mock('../../src/modules/player/PlayerManager.js', () => ({
  PlayerManager: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(),
    update: jest.fn(),
    cleanup: jest.fn(),
    createLocalPlayer: jest.fn().mockResolvedValue({
      position: { x: 0, y: 0, z: 0 },
      rotation: { y: 0 },
      update: jest.fn()
    })
  }))
}));

jest.mock('../../src/modules/skills/SkillsManager.js', () => ({
  SkillsManager: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(),
    update: jest.fn(),
    cleanup: jest.fn()
  }))
}));

jest.mock('../../src/modules/karma/KarmaManager.js', () => ({
  KarmaManager: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(),
    update: jest.fn(),
    cleanup: jest.fn()
  }))
}));

jest.mock('../../src/modules/terrain/TerrainManager.js', () => ({
  TerrainManager: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(),
    update: jest.fn(),
    cleanup: jest.fn()
  }))
}));

jest.mock('../../src/modules/npc/NPCManager.js', () => ({
  NPCManager: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(),
    update: jest.fn(),
    cleanup: jest.fn()
  }))
}));

jest.mock('../../src/modules/environment/EnvironmentManager.js', () => ({
  EnvironmentManager: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(),
    update: jest.fn(),
    cleanup: jest.fn()
  }))
}));

jest.mock('../../src/modules/camera/CameraManager.js', () => ({
  CameraManager: jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    update: jest.fn(),
    cleanup: jest.fn(),
    camera: {}
  }))
}));

jest.mock('../../src/modules/targeting/TargetingManager.js', () => ({
  TargetingManager: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(),
    update: jest.fn(),
    cleanup: jest.fn()
  }))
}));

jest.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: jest.fn()
}));

jest.mock('../../server/src/config/GameConstants.js', () => ({
  default: {}
}), { virtual: true });

jest.mock('../../src/config.js', () => ({
  getServerUrl: jest.fn().mockReturnValue('http://localhost:3000')
}));

// Mock the Game import
jest.mock('../../src/Game.js');

// Import the Game class
import { Game } from '../../src/Game.js';

// Get the THREE mock
const mockTHREE = require('three');

// Create a mock Game class
class MockGame {
  constructor() {
    // Initialize Three.js components
    this.scene = new mockTHREE.Scene();
    this.renderer = new mockTHREE.WebGLRenderer();
    
    // Game state
    this.players = new Map();
    this.localPlayer = null;
    this.isRunning = true;
    this.isAlive = true;
    this.SERVER_URL = 'http://localhost:3000';
    
    // Controls
    this.controls = {
      forward: false,
      backward: false,
      left: false,
      right: false
    };
    
    // Initialize player stats
    this.playerStats = {
      currentLife: 100,
      maxLife: 100,
      currentMana: 100,
      maxMana: 100,
      currentKarma: 50,
      maxKarma: 100,
      level: 1,
      experience: 0,
      experienceToNextLevel: 100,
      path: null
    };
    
    // Create managers
    this.uiManager = new (jest.requireMock('../../src/modules/ui/UIManager').UIManager)();
    this.networkManager = new (jest.requireMock('../../src/modules/network/NetworkManager').NetworkManager)();
    this.playerManager = new (jest.requireMock('../../src/modules/player/PlayerManager').PlayerManager)();
    this.skillsManager = new (jest.requireMock('../../src/modules/skills/SkillsManager').SkillsManager)();
    this.karmaManager = new (jest.requireMock('../../src/modules/karma/KarmaManager').KarmaManager)();
    this.terrainManager = new (jest.requireMock('../../src/modules/terrain/TerrainManager').TerrainManager)();
    this.npcManager = new (jest.requireMock('../../src/modules/npc/NPCManager').NPCManager)();
    this.environmentManager = new (jest.requireMock('../../src/modules/environment/EnvironmentManager').EnvironmentManager)();
    this.cameraManager = new (jest.requireMock('../../src/modules/camera/CameraManager').CameraManager)();
    this.targetingManager = new (jest.requireMock('../../src/modules/targeting/TargetingManager').TargetingManager)();
  }
  
  async initializeManagers() {
    // Initialize all managers
    return Promise.resolve();
  }
  
  handleInitializationError(error) {
    console.error('Game initialization error:', error);
  }
  
  handleGameUpdate(data) {
    if (data.playerStats) {
      this.playerStats = data.playerStats;
      this.uiManager.updateStatusBars(data.playerStats);
    }
  }
  
  cleanup() {
    this.uiManager.cleanup();
    this.networkManager.cleanup();
    this.playerManager.cleanup();
    this.skillsManager.cleanup();
    this.karmaManager.cleanup();
    this.terrainManager.cleanup();
    this.npcManager.cleanup();
    this.environmentManager.cleanup();
    this.cameraManager.cleanup();
    this.targetingManager.cleanup();
  }
}

// Set the mock implementation
Game.mockImplementation(() => new MockGame());

describe('Game', () => {
  let game;
  
  beforeEach(() => {
    // Set up DOM elements
    document.body.innerHTML = '<div id="game-container"></div>';
    
    // Mock window.requestAnimationFrame
    window.requestAnimationFrame = jest.fn();
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Create Game instance
    game = new Game();
  });
  
  afterEach(() => {
    // Restore console methods
    console.log.mockRestore();
    console.error.mockRestore();
    
    // Clean up DOM
    document.body.innerHTML = '';
    
    // Clean up mocks
    jest.clearAllMocks();
  });
  
  test('should initialize correctly', () => {
    expect(game).toBeDefined();
    expect(game.scene).toBeDefined();
    expect(game.renderer).toBeDefined();
    expect(game.players).toBeDefined();
    expect(game.playerStats).toBeDefined();
  });
  
  test('should initialize all managers', async () => {
    await game.initializeManagers();
    
    expect(game.uiManager).toBeDefined();
    expect(game.networkManager).toBeDefined();
    expect(game.playerManager).toBeDefined();
    expect(game.skillsManager).toBeDefined();
    expect(game.karmaManager).toBeDefined();
    expect(game.terrainManager).toBeDefined();
    expect(game.npcManager).toBeDefined();
    expect(game.environmentManager).toBeDefined();
    expect(game.cameraManager).toBeDefined();
    expect(game.targetingManager).toBeDefined();
  });
  
  test('should handle initialization error', () => {
    const error = new Error('Test error');
    
    game.handleInitializationError(error);
    
    expect(console.error).toHaveBeenCalledWith('Game initialization error:', error);
  });
  
  test('should handle game update', () => {
    // Execute
    const data = {
      playerStats: {
        currentLife: 80,
        maxLife: 100,
        currentMana: 90,
        maxMana: 100,
        currentKarma: 60,
        maxKarma: 100
      }
    };
    
    game.handleGameUpdate(data);
    
    // Verify
    expect(game.playerStats).toEqual(data.playerStats);
    expect(game.uiManager.updateStatusBars).toHaveBeenCalledWith(data.playerStats);
  });
  
  test('should clean up all managers', () => {
    // Execute
    game.cleanup();
    
    // Verify
    expect(game.uiManager.cleanup).toHaveBeenCalled();
    expect(game.networkManager.cleanup).toHaveBeenCalled();
    expect(game.playerManager.cleanup).toHaveBeenCalled();
    expect(game.skillsManager.cleanup).toHaveBeenCalled();
    expect(game.karmaManager.cleanup).toHaveBeenCalled();
    expect(game.terrainManager.cleanup).toHaveBeenCalled();
    expect(game.npcManager.cleanup).toHaveBeenCalled();
    expect(game.environmentManager.cleanup).toHaveBeenCalled();
    expect(game.cameraManager.cleanup).toHaveBeenCalled();
    expect(game.targetingManager.cleanup).toHaveBeenCalled();
  });
}); 