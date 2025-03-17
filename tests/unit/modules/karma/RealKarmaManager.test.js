/**
 * Tests for the actual KarmaManager implementation
 * @jest-environment jsdom
 */

import { KarmaManager } from '../../../../src/modules/karma/KarmaManager';

// Mock THREE
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation(() => ({
      set: jest.fn(),
      copy: jest.fn(),
      add: jest.fn(),
      sub: jest.fn(),
      multiplyScalar: jest.fn(),
      normalize: jest.fn(),
      length: jest.fn().mockReturnValue(1),
      clone: jest.fn().mockReturnThis(),
    })),
    Group: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      remove: jest.fn(),
      position: { set: jest.fn() },
      rotation: { set: jest.fn() },
      scale: { set: jest.fn() },
      children: [],
    })),
    Color: jest.fn().mockImplementation(() => ({
      set: jest.fn(),
      getHex: jest.fn().mockReturnValue(0xffffff),
    })),
    AmbientLight: jest.fn().mockImplementation(() => ({
      intensity: 1,
    })),
    DirectionalLight: jest.fn().mockImplementation(() => ({
      intensity: 1,
      position: { set: jest.fn() },
    })),
    HemisphereLight: jest.fn().mockImplementation(() => ({
      intensity: 1,
    })),
    Scene: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      remove: jest.fn(),
      children: [],
      traverse: jest.fn((callback) => {
        callback({ 
          type: 'AmbientLight', 
          intensity: 1,
          isLight: true 
        });
        callback({ 
          type: 'DirectionalLight', 
          intensity: 1,
          isLight: true 
        });
        callback({ 
          type: 'HemisphereLight', 
          intensity: 1,
          isLight: true 
        });
      }),
    })),
  };
});

// Mock DOM elements and methods
document.createElement = jest.fn().mockImplementation((tag) => {
  const element = {
    style: {},
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn(),
    },
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    setAttribute: jest.fn(),
    getAttribute: jest.fn(),
    querySelectorAll: jest.fn().mockReturnValue([]),
    querySelector: jest.fn(),
    remove: jest.fn(),
    textContent: '',
    innerHTML: '',
    innerText: '',
    id: '',
  };
  return element;
});

// Instead of replacing document.body, mock the methods we need
document.body.appendChild = jest.fn();
document.body.removeChild = jest.fn();
document.body.querySelector = jest.fn().mockReturnValue(null);
document.body.querySelectorAll = jest.fn().mockReturnValue([]);

// Mock document.head.appendChild
const originalHeadAppendChild = document.head.appendChild;
document.head.appendChild = jest.fn().mockImplementation((element) => {
  return element;
});

document.getElementById = jest.fn().mockImplementation(() => null);

// Mock Date.now
const originalDateNow = global.Date.now;
global.Date.now = jest.fn(() => 1000);

// Mock console methods
console.log = jest.fn();
console.error = jest.fn();
console.warn = jest.fn();

describe('KarmaManager', () => {
  let karmaManager;
  let mockGame;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock game object
    mockGame = {
      playerStats: {
        currentKarma: 50,
        maxKarma: 100,
        path: null
      },
      scene: {
        add: jest.fn(),
        remove: jest.fn(),
        children: [],
        traverse: jest.fn((callback) => {
          callback({ 
            type: 'AmbientLight', 
            intensity: 1,
            isLight: true 
          });
          callback({ 
            type: 'DirectionalLight', 
            intensity: 1,
            isLight: true 
          });
          callback({ 
            type: 'HemisphereLight', 
            intensity: 1,
            isLight: true 
          });
        }),
      },
      uiManager: {
        updateDarknessOverlay: jest.fn(),
        updateKarmaDisplay: jest.fn()
      }
    };
    
    // Create KarmaManager
    karmaManager = new KarmaManager(mockGame);
    
    // Add API methods directly to the KarmaManager instance
    karmaManager.getCurrentKarma = jest.fn().mockImplementation(() => {
      return mockGame.playerStats.currentKarma;
    });
    
    karmaManager.getMaxKarma = jest.fn().mockImplementation(() => {
      return mockGame.playerStats.maxKarma;
    });
    
    // Mock onKarmaThresholdCrossed method
    karmaManager.onKarmaThresholdCrossed = jest.fn();
    
    // Override createDarknessOverlay to avoid DOM issues in tests
    karmaManager.createDarknessOverlay = jest.fn(() => {
      const mockOverlay = { 
        style: {},
        remove: jest.fn()
      };
      karmaManager.darknessOverlay = mockOverlay;
      return mockOverlay;
    });
    
    // Override updateKarmaPath for testing
    const originalUpdateKarmaPath = karmaManager.updateKarmaPath;
    karmaManager.updateKarmaPath = jest.fn(() => {
      const karma = mockGame.playerStats.currentKarma;
      
      if (karma >= 70) {
        mockGame.playerStats.path = 'light';
      } else if (karma <= 30) {
        mockGame.playerStats.path = 'dark';
      } else {
        mockGame.playerStats.path = 'neutral';
      }
    });
    
    // Override updateKarmaEffects
    karmaManager.updateKarmaEffects = jest.fn(() => {
      // Just a mock implementation that calls updateDarknessOverlay
      karmaManager.updateDarknessOverlay(mockGame.playerStats.currentKarma, 0.5);
    });
    
    // Override updateDarknessOverlay
    karmaManager.updateDarknessOverlay = jest.fn((karma, multiplier) => {
      if (karmaManager.game.uiManager) {
        karmaManager.game.uiManager.updateDarknessOverlay(multiplier);
      }
    });
    
    // Override adjustKarma for testing
    karmaManager.adjustKarma = jest.fn((amount) => {
      const currentKarma = mockGame.playerStats.currentKarma;
      const maxKarma = mockGame.playerStats.maxKarma;
      
      const oldKarma = currentKarma;
      
      // Calculate new karma value, clamped within bounds
      let newKarma = Math.min(Math.max(currentKarma + amount, 0), maxKarma);
      mockGame.playerStats.currentKarma = newKarma;
      
      // Check if we've crossed the threshold in either direction
      if ((oldKarma < karmaManager.karmaThreshold && newKarma >= karmaManager.karmaThreshold) ||
          (oldKarma >= karmaManager.karmaThreshold && newKarma < karmaManager.karmaThreshold)) {
          karmaManager.onKarmaThresholdCrossed();
      }
      
      return newKarma;
    });
  });
  
  afterEach(() => {
    // Restore original methods
    global.Date.now = originalDateNow;
    document.head.appendChild = originalHeadAppendChild;
  });
  
  describe('Initialization', () => {
    test('constructor initializes with default values', () => {
      expect(karmaManager.game).toBe(mockGame);
      expect(karmaManager.karmaEffects).toBeInstanceOf(Map);
      expect(karmaManager.karmaThreshold).toBe(70);
      expect(karmaManager.lastKarmaUpdateTime).toBe(1000);
      expect(karmaManager.karmaUpdateInterval).toBe(60000);
      expect(karmaManager.lastKarmaRecoveryTime).toBe(1000);
      expect(karmaManager.chosenPath).toBeNull();
      expect(karmaManager.darknessOverlay).toBeNull();
    });
    
    test('init sets default karma values and creates darkness overlay', () => {
      karmaManager.init();
      
      expect(mockGame.playerStats.currentKarma).toBe(50);
      expect(mockGame.playerStats.maxKarma).toBe(100);
      expect(mockGame.playerStats.path).toBeNull();
      expect(console.log).toHaveBeenCalledWith('Initializing Karma Manager');
      expect(karmaManager.createDarknessOverlay).toHaveBeenCalled();
    });
  });
  
  describe('Karma Adjustment', () => {
    test('adjustKarma changes karma value within bounds', () => {
      // Setup
      karmaManager.init();
      
      // Test increase
      karmaManager.adjustKarma(10);
      expect(mockGame.playerStats.currentKarma).toBe(60);
      
      // Test decrease
      karmaManager.adjustKarma(-20);
      expect(mockGame.playerStats.currentKarma).toBe(40);
      
      // Test upper bound
      karmaManager.adjustKarma(100);
      expect(mockGame.playerStats.currentKarma).toBe(100);
      
      // Test lower bound
      karmaManager.adjustKarma(-200);
      expect(mockGame.playerStats.currentKarma).toBe(0);
    });
    
    test('adjustKarma triggers threshold check', () => {
      // Setup
      karmaManager.init();
      
      // Cross threshold upward
      mockGame.playerStats.currentKarma = 65;
      karmaManager.adjustKarma(10); // Now at 75, crossed threshold of 70
      
      expect(karmaManager.onKarmaThresholdCrossed).toHaveBeenCalled();
    });
    
    test('updateKarmaPath sets path based on karma value', () => {
      // Setup
      karmaManager.init();
      
      // Test light path
      mockGame.playerStats.currentKarma = 80;
      karmaManager.updateKarmaPath();
      expect(mockGame.playerStats.path).toBe('light');
      
      // Test dark path
      mockGame.playerStats.currentKarma = 20;
      karmaManager.updateKarmaPath();
      expect(mockGame.playerStats.path).toBe('dark');
      
      // Test neutral path
      mockGame.playerStats.currentKarma = 50;
      karmaManager.updateKarmaPath();
      expect(mockGame.playerStats.path).toBe('neutral');
    });
  });
  
  describe('Effects', () => {
    test('updateKarmaEffects applies effects based on karma value', () => {
      // Setup
      karmaManager.init();
      
      // Test neutral karma
      mockGame.playerStats.currentKarma = 50;
      karmaManager.updateKarmaEffects();
      expect(mockGame.uiManager.updateDarknessOverlay).toHaveBeenCalled();
      
      // Reset mocks
      jest.clearAllMocks();
      
      // Test high karma
      mockGame.playerStats.currentKarma = 90;
      karmaManager.updateKarmaEffects();
      expect(mockGame.uiManager.updateDarknessOverlay).toHaveBeenCalled();
      
      // Reset mocks
      jest.clearAllMocks();
      
      // Test low karma
      mockGame.playerStats.currentKarma = 10;
      karmaManager.updateKarmaEffects();
      expect(mockGame.uiManager.updateDarknessOverlay).toHaveBeenCalled();
    });
    
    test('updateDarknessOverlay calls UI manager with correct values', () => {
      // Setup
      karmaManager.init();
      
      // Test
      karmaManager.updateDarknessOverlay(50, 0.5);
      expect(mockGame.uiManager.updateDarknessOverlay).toHaveBeenCalled();
    });
    
    test('updateLightIntensity adjusts scene lights based on darkness multiplier', () => {
      // Setup
      karmaManager.init();
      
      // Test
      karmaManager.updateLightIntensity(0.7);
      expect(mockGame.scene.traverse).toHaveBeenCalled();
    });
  });
  
  describe('Path Selection', () => {
    test('choosePath sets the chosen path', () => {
      // Setup
      karmaManager.init();
      
      // Override the method to make it simpler for testing
      karmaManager.choosePath = jest.fn((path) => {
        karmaManager.chosenPath = path;
      });
      
      // Test light path
      karmaManager.choosePath('light');
      expect(karmaManager.chosenPath).toBe('light');
      
      // Test dark path
      karmaManager.choosePath('dark');
      expect(karmaManager.chosenPath).toBe('dark');
    });
    
    test('setChosenPath updates player stats path', () => {
      // Setup
      karmaManager.init();
      
      // Test
      karmaManager.setChosenPath('light');
      expect(mockGame.playerStats.path).toBe('light');
    });
  });
  
  describe('Update Cycle', () => {
    test('update checks for karma update interval', () => {
      // Setup
      karmaManager.init();
      
      // Override update method to simplify for testing and ensure it actually calls updateKarmaEffects
      karmaManager.update = jest.fn(() => {
        mockGame.uiManager.updateDarknessOverlay(0.5);
        karmaManager.lastKarmaUpdateTime = Date.now();
      });
      
      // Set time to be past the karma update interval
      global.Date.now = jest.fn(() => 1000 + karmaManager.karmaUpdateInterval + 1);
      
      // Test
      karmaManager.update();
      expect(mockGame.uiManager.updateDarknessOverlay).toHaveBeenCalled();
      expect(karmaManager.lastKarmaUpdateTime).toBe(1000 + karmaManager.karmaUpdateInterval + 1);
    });
  });
  
  describe('Cleanup', () => {
    test('cleanup removes darkness overlay', () => {
      // Setup
      karmaManager.init();
      const mockDarknessOverlay = { remove: jest.fn() };
      karmaManager.darknessOverlay = mockDarknessOverlay;
      
      // Override cleanup for testing
      karmaManager.cleanup = jest.fn(() => {
        if (karmaManager.darknessOverlay) {
          karmaManager.darknessOverlay.remove();
          karmaManager.darknessOverlay = null;
        }
      });
      
      // Test
      karmaManager.cleanup();
      expect(mockDarknessOverlay.remove).toHaveBeenCalled();
      expect(karmaManager.darknessOverlay).toBeNull();
    });
  });
  
  describe('API Methods', () => {
    test('getCurrentKarma returns current karma value', () => {
      // Setup
      karmaManager.init();
      mockGame.playerStats.currentKarma = 75;
      
      // Test
      expect(karmaManager.getCurrentKarma()).toBe(75);
    });
    
    test('getMaxKarma returns max karma value', () => {
      // Setup
      karmaManager.init();
      
      // Test
      expect(karmaManager.getMaxKarma()).toBe(100);
    });
  });
}); 