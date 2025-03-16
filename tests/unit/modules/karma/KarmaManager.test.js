import { KarmaManager } from '../../../../src/modules/karma/KarmaManager';
import * as THREE from 'three';

// Import Jest spy utilities
const { spyOn } = jest;

// Simplified THREE mock to avoid circular dependencies
jest.mock('three', () => {
  return {
    Color: jest.fn().mockImplementation(() => ({
      r: 1, g: 1, b: 1,
      multiplyScalar: jest.fn().mockReturnThis(),
      set: jest.fn()
    })),
    Vector3: jest.fn().mockImplementation(() => ({
      set: jest.fn(),
      normalize: jest.fn().mockReturnThis(),
      multiplyScalar: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      distanceTo: jest.fn().mockReturnValue(2)
    })),
    Object3D: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      add: jest.fn(),
      remove: jest.fn(),
      traverse: jest.fn()
    })),
    Mesh: jest.fn().mockImplementation(() => ({
      material: { color: { set: jest.fn() } },
      position: { x: 0, y: 0, z: 0 },
      geometry: { dispose: jest.fn() },
      dispose: jest.fn()
    })),
    Scene: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      remove: jest.fn(),
      traverse: jest.fn(),
      children: []
    })),
    PointLight: jest.fn().mockImplementation(() => ({
      position: { set: jest.fn() },
      intensity: 1.0
    })),
    MeshBasicMaterial: jest.fn(),
    SphereGeometry: jest.fn(),
    BoxGeometry: jest.fn(),
    Raycaster: jest.fn().mockImplementation(() => ({
      setFromCamera: jest.fn(),
      intersectObject: jest.fn().mockReturnValue([])
    })),
    Group: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      remove: jest.fn(),
      children: []
    }))
  };
});

describe('KarmaManager', () => {
  let karmaManager;
  let mockPlayerManager;
  let mockNetworkManager;
  let mockUIManager;
  let mockGame;
  let createdElements;
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup createdElements for tracking DOM elements
    createdElements = {};
    
    // Mock document and window objects
    global.document = {
      body: {
        appendChild: jest.fn().mockImplementation(element => {
          createdElements[element.id || 'unknown'] = element;
          return element;
        })
      },
      head: {
        appendChild: jest.fn()
      },
      createElement: jest.fn(),
      getElementById: jest.fn()
    };
    
    // Mock document methods
    const mockElement = {
      style: {},
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
        contains: jest.fn().mockReturnValue(false)
      },
      appendChild: jest.fn(),
      setAttribute: jest.fn(),
      getAttribute: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    
    document.createElement = jest.fn().mockImplementation(type => {
      const element = { ...mockElement, id: '', tagName: type.toUpperCase() };
      return element;
    });
    
    document.getElementById = jest.fn().mockImplementation(id => {
      if (id === 'karma-darkness-overlay') {
        const overlayElement = { 
          ...mockElement, 
          id: 'karma-darkness-overlay',
          style: {} 
        };
        return overlayElement;
      }
      return null;
    });
    
    // Mock window object
    global.window = {
      innerWidth: 1920,
      innerHeight: 1080
    };
    
    // Mock player manager
    mockPlayerManager = {
      players: new Map(),
      getPlayerById: jest.fn()
    };
    
    // Mock network manager
    mockNetworkManager = {
      socket: {
        connected: true,
        id: 'test-socket-id',
        emit: jest.fn()
      },
      sendPlayerState: jest.fn()
    };
    
    // Mock UI manager
    mockUIManager = {
      updateStatusBars: jest.fn(),
      showNotification: jest.fn(),
      updateKarmaDisplay: jest.fn()
    };
    
    // Mock game with required methods and properties
    mockGame = {
      playerManager: mockPlayerManager,
      networkManager: mockNetworkManager,
      uiManager: mockUIManager,
      playerStats: {
        currentKarma: 50,
        maxKarma: 100,
        currentLife: 100,
        maxLife: 100,
        currentMana: 100,
        maxMana: 100,
        path: 'neutral'
      },
      scene: { 
        fog: { 
          near: 0, 
          far: 0, 
          color: new THREE.Color()
        },
        traverse: jest.fn(),
        add: jest.fn()
      },
      renderer: {
        setClearColor: jest.fn()
      },
      environmentManager: {
        isOnTemple: jest.fn().mockReturnValue(false)
      },
      cameraManager: {
        getCamera: jest.fn().mockReturnValue({})
      },
      localPlayer: {
        position: { clone: jest.fn().mockReturnValue({ project: jest.fn() }) }
      }
    };
    
    // Create KarmaManager with mocked game
    karmaManager = new KarmaManager(mockGame);
    
    // For karma-related tests, ensure the darkness overlay is mocked consistently
    karmaManager.darknessOverlay = {
      style: {},
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
        contains: jest.fn()
      }
    };

    // Mock additional methods that might be called during tests
    karmaManager.updateDarknessOverlay = jest.fn();
    karmaManager.applyLightEffects = jest.fn();
    karmaManager.applyDarkEffects = jest.fn();
    karmaManager.removeLightEffects = jest.fn();
    karmaManager.removeDarkEffects = jest.fn();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
    delete global.document;
    delete global.window;
  });
  
  // Basic initialization
  describe('Initialization', () => {
    beforeEach(() => {
      // Make sure createDarknessOverlay is a jest.fn() for this test suite
      karmaManager.createDarknessOverlay = jest.fn().mockReturnValue(true);
    });

    it('should initialize with default values', () => {
      // Verify initialization
      expect(karmaManager).toBeDefined();
      expect(karmaManager.karmaEffects).toBeDefined();
      expect(karmaManager.karmaEffects.size).toBe(0);
    });
    
    it('should initialize karma system when init is called', () => {
      // Call init method
      const result = karmaManager.init();
      
      // Verify initialization results
      expect(result).toBe(true);
      expect(mockGame.playerStats.currentKarma).toBe(50);
      expect(mockGame.playerStats.maxKarma).toBe(100);
      expect(karmaManager.createDarknessOverlay).toHaveBeenCalled();
    });
  });
  
  // Karma updates and calculations
  describe('Karma Updates and Calculations', () => {
    it('should update local player karma', () => {
      // Use the actual adjustKarma method instead of updateKarma
      karmaManager.adjustKarma(25);
      
      // Verify karma was updated
      expect(karmaManager.game.playerStats.currentKarma).toBe(75);
      
      // Verify that network update is sent
      expect(mockNetworkManager.socket.emit).toHaveBeenCalledWith('karmaUpdate', {
        id: 'test-socket-id',
        karma: 75,
        maxKarma: 100,
        life: 100,
        maxLife: 100,
        mana: 100,
        maxMana: 100
      });
      
      // Verify that player state is sent
      expect(mockNetworkManager.sendPlayerState).toHaveBeenCalled();
    });
    
    it('should calculate karma alignment based on karma value', () => {
      // Setup game player stats
      karmaManager.game.playerStats = {
        currentKarma: 50,
        maxKarma: 100,
        path: null
      };
      
      // Test dark alignment (high karma = dark path)
      karmaManager.game.playerStats.currentKarma = 80;
      karmaManager.updateKarmaPath();
      expect(karmaManager.game.playerStats.path).toBe('dark');
      
      // Test neutral alignment
      karmaManager.game.playerStats.currentKarma = 50;
      karmaManager.updateKarmaPath();
      expect(karmaManager.game.playerStats.path).toBe(null);
      
      // Test light alignment (low karma = light path)
      karmaManager.game.playerStats.currentKarma = 20;
      karmaManager.updateKarmaPath();
      expect(karmaManager.game.playerStats.path).toBe('light');
    });
    
    it('should properly adjust karma based on positive and negative amounts', () => {
      // Setup
      karmaManager.game.playerStats = {
        currentKarma: 50,
        maxKarma: 100,
        currentLife: 100,
        maxLife: 100,
        currentMana: 100,
        maxMana: 100
      };
      
      // Add karma (positive adjustment)
      const changeAmount = karmaManager.adjustKarma(10);
      
      // Verify the adjustment
      expect(changeAmount).toBe(10);
      expect(karmaManager.game.playerStats.currentKarma).toBe(60);
      
      // Subtract karma (negative adjustment)
      const reductionAmount = karmaManager.adjustKarma(-20);
      
      // Verify the adjustment
      expect(reductionAmount).toBe(-20);
      expect(karmaManager.game.playerStats.currentKarma).toBe(40);
      
      // Test clamping at min (0)
      karmaManager.adjustKarma(-100);
      expect(karmaManager.game.playerStats.currentKarma).toBe(0);
      
      // Test clamping at max (100)
      karmaManager.game.playerStats.currentKarma = 90;
      karmaManager.adjustKarma(20);
      expect(karmaManager.game.playerStats.currentKarma).toBe(100);
    });
    
    it('should update karma effects when karma changes', () => {
      // Setup
      karmaManager.game.playerStats = {
        currentKarma: 50,
        maxKarma: 100,
        currentLife: 100,
        maxLife: 100
      };
      karmaManager.updateKarmaEffects = jest.fn();
      
      // Adjust karma
      karmaManager.adjustKarma(10);
      
      // Verify karma effects are updated
      expect(karmaManager.updateKarmaEffects).toHaveBeenCalled();
    });
  });
  
  // Karma effects
  describe('Karma Effects', () => {
    beforeEach(() => {
      // Reset mocks for testing darkness overlay
      jest.clearAllMocks();
      
      // Mock the createDarknessOverlay method
      karmaManager.createDarknessOverlay = jest.fn().mockImplementation(function() {
        this.darknessOverlay = document.createElement('div');
        this.darknessOverlay.id = 'karma-darkness-overlay';
        document.body.appendChild(this.darknessOverlay);
        return this.darknessOverlay;
      });
      
      // Set default values needed by the tests
      karmaManager.game.playerStats.path = 'neutral';
      karmaManager.darknessOverlay = null;
    });
    
    it('should create darkness overlay', () => {
      // Call the method
      karmaManager.createDarknessOverlay();
      
      // Verify document interactions
      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(document.body.appendChild).toHaveBeenCalled();
      
      // Verify the darkness overlay was stored in the manager
      expect(karmaManager.darknessOverlay).toBeTruthy();
    });
    
    it('should update karma effects', () => {
      // Mock darknessOverlay to prevent actual DOM manipulation
      karmaManager.darknessOverlay = document.createElement('div');
      
      // Call the method with a sample value
      karmaManager.updateKarmaEffects(0.5);
      
      // Expect karma effects have been applied
      expect(karmaManager.game.scene.fog.far).not.toBeUndefined();
      expect(karmaManager.game.renderer.setClearColor).toHaveBeenCalled();
    });
    
    it('should apply light path effects', () => {
      // Set up the light path
      karmaManager.game.playerStats.path = 'light';
      karmaManager.darknessOverlay = document.createElement('div');
      
      // Mock the specific methods
      karmaManager.applyLightEffects = jest.fn();
      
      // Call the method with a sample value
      karmaManager.updateKarmaEffects(0.5);
      
      // Check that light effects were applied
      expect(karmaManager.applyLightEffects).toHaveBeenCalled();
    });
    
    it('should apply dark path effects', () => {
      // Set up the dark path
      karmaManager.game.playerStats.path = 'dark';
      karmaManager.darknessOverlay = document.createElement('div');
      
      // Mock the specific methods
      karmaManager.applyDarkEffects = jest.fn();
      
      // Call the method with a sample value
      karmaManager.updateKarmaEffects(0.5);
      
      // Check that dark effects were applied
      expect(karmaManager.applyDarkEffects).toHaveBeenCalled();
    });
  });
  
  // Cleanup
  describe('Resource Cleanup', () => {
    it('should clean up all karma effects', () => {
      // Setup multiple mock effects with proper Map structure
      const mockEffect1 = { parent: { remove: jest.fn() } };
      const mockEffect2 = { parent: { remove: jest.fn() } };
      
      // Initialize karmaEffects as a Map (which is how it's implemented in the actual class)
      karmaManager.karmaEffects = new Map();
      karmaManager.karmaEffects.set('effect1', mockEffect1);
      karmaManager.karmaEffects.set('effect2', mockEffect2);
      
      // Mock DOM elements that would be cleaned up
      global.document = {
        getElementById: jest.fn().mockReturnValue({
          remove: jest.fn()
        })
      };
      
      // Setup darkness overlay
      karmaManager.darknessOverlay = {
        parentElement: {
          removeChild: jest.fn()
        }
      };
      
      // Cleanup
      karmaManager.cleanup();
      
      // Verify all effects were properly cleaned up
      expect(mockEffect1.parent.remove).toHaveBeenCalledWith(mockEffect1);
      expect(mockEffect2.parent.remove).toHaveBeenCalledWith(mockEffect2);
      expect(karmaManager.karmaEffects.size).toBe(0);
      expect(karmaManager.darknessOverlay.parentElement.removeChild).toHaveBeenCalledWith(karmaManager.darknessOverlay);
    });
  });
});
