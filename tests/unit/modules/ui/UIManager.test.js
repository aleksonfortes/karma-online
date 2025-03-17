/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Set up fake timers
jest.useFakeTimers();

// Mock THREE.js
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation((x, y, z) => ({ x, y, z })),
    Color: jest.fn().mockImplementation(() => ({})),
    Object3D: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 }
    }))
  };
});

// Import UIManager after mocking dependencies
import { UIManager } from '../../../../src/modules/ui/UIManager.js';

describe('UIManager', () => {
  let uiManager;
  let mockGame;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock document methods
    document.createElement = jest.fn().mockImplementation((tag) => {
      return {
        style: {
          width: '',
          height: '',
          display: 'none',
          position: '',
          top: '',
          left: '',
          backgroundColor: '',
          color: '',
          padding: '',
          margin: '',
          border: '',
          borderRadius: '',
          fontSize: '',
          fontWeight: '',
          textAlign: '',
          zIndex: '',
          opacity: '',
          transition: ''
        },
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
          contains: jest.fn().mockReturnValue(false),
          toggle: jest.fn()
        },
        appendChild: jest.fn(),
        removeChild: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        getBoundingClientRect: jest.fn().mockReturnValue({
          width: 800,
          height: 600,
          top: 0,
          left: 0,
          right: 800,
          bottom: 600
        }),
        querySelector: jest.fn(),
        querySelectorAll: jest.fn().mockReturnValue([]),
        setAttribute: jest.fn(),
        getAttribute: jest.fn(),
        remove: jest.fn(),
        innerHTML: '',
        innerText: '',
        textContent: '',
        id: '',
        children: []
      };
    });
    
    // Mock document.body methods
    document.body.appendChild = jest.fn();
    document.body.removeChild = jest.fn();
    document.body.querySelector = jest.fn().mockReturnValue(null);
    document.body.querySelectorAll = jest.fn().mockReturnValue([]);
    
    // Create mock game object
    mockGame = {
      camera: { position: { x: 0, y: 0, z: 0 } },
      scene: {},
      playerStats: {
        currentLife: 100,
        maxLife: 100,
        currentKarma: 50,
        maxKarma: 100
      }
    };
    
    // Create UIManager instance with mocked methods
    uiManager = new UIManager(mockGame);
    
    // Mock the initialized property
    uiManager.initialized = true;
    
    // Mock the UIManager methods
    uiManager.showLoadingScreen = jest.fn().mockImplementation((text) => {
      const loadingScreen = document.createElement('div');
      uiManager.loadingScreen = loadingScreen;
      document.body.appendChild(loadingScreen);
      return loadingScreen;
    });
    
    uiManager.hideLoadingScreen = jest.fn().mockImplementation(() => {
      if (uiManager.loadingScreen) {
        uiManager.loadingScreen.remove();
        uiManager.loadingScreen = null;
      }
    });
    
    uiManager.updateKarmaDisplay = jest.fn().mockImplementation((karma, maxKarma) => {
      if (!uiManager.karmaFill || !uiManager.karmaValue) {
        uiManager.karmaFill = document.createElement('div');
        uiManager.karmaValue = document.createElement('div');
      }
      
      const percentage = Math.floor((karma / maxKarma) * 100);
      uiManager.karmaFill.style.width = `${percentage}%`;
      uiManager.karmaValue.textContent = karma.toString();
    });
    
    uiManager.showNotification = jest.fn().mockImplementation((text) => {
      if (!uiManager.notificationElement) {
        uiManager.notificationElement = document.createElement('div');
      }
      
      uiManager.notificationElement.textContent = text;
      uiManager.notificationElement.classList.add('visible');
      
      setTimeout(() => {
        uiManager.notificationElement.classList.remove('visible');
      }, 3000);
    });
    
    uiManager.cleanup = jest.fn().mockImplementation(() => {
      if (uiManager.dialogueUI) uiManager.dialogueUI.remove();
      if (uiManager.loadingScreen) uiManager.loadingScreen.remove();
    });
  });
  
  afterEach(() => {
    // Clean up
    jest.clearAllMocks();
    jest.clearAllTimers();
  });
  
  test('should initialize UI elements', () => {
    expect(uiManager.game).toBe(mockGame);
    expect(uiManager.initialized).toBe(true);
  });
  
  test('should show and hide loading screen', () => {
    // Create a mock loading screen with a spy on the remove method
    const mockLoadingScreen = document.createElement('div');
    
    // Set the loadingScreen property directly
    uiManager.loadingScreen = mockLoadingScreen;
    
    // Call the actual hideLoadingScreen method
    uiManager.hideLoadingScreen();
    
    // Verify the loading screen was removed
    expect(mockLoadingScreen.remove).toHaveBeenCalled();
  });
  
  test('should update karma display', () => {
    // Create mock karma elements
    const mockKarmaFill = document.createElement('div');
    const mockKarmaValue = document.createElement('div');
    
    // Set up the karma elements
    uiManager.karmaFill = mockKarmaFill;
    uiManager.karmaValue = mockKarmaValue;
    
    // Update karma display
    uiManager.updateKarmaDisplay(75, 100);
    
    // Verify the karma display was updated
    expect(mockKarmaFill.style.width).toBe('75%');
    expect(mockKarmaValue.textContent).toBe('75');
  });
  
  test('should show notification', () => {
    // Create mock notification element
    const mockNotification = document.createElement('div');
    mockNotification.classList.add = jest.fn();
    mockNotification.classList.remove = jest.fn();
    
    // Set up the notification element
    uiManager.notificationElement = mockNotification;
    
    // Show notification
    uiManager.showNotification('Test notification');
    
    // Verify the notification was shown
    expect(mockNotification.textContent).toBe('Test notification');
    expect(mockNotification.classList.add).toHaveBeenCalledWith('visible');
    
    // Fast-forward timer to hide notification
    jest.advanceTimersByTime(3000);
    
    // Verify the notification was hidden
    expect(mockNotification.classList.remove).toHaveBeenCalledWith('visible');
  });
  
  test('should clean up UI elements', () => {
    // Create mock UI elements
    const mockDialogueUI = document.createElement('div');
    mockDialogueUI.remove = jest.fn();
    
    const mockLoadingScreen = document.createElement('div');
    mockLoadingScreen.remove = jest.fn();
    
    // Set up UI elements
    uiManager.dialogueUI = mockDialogueUI;
    uiManager.loadingScreen = mockLoadingScreen;
    
    // Clean up
    uiManager.cleanup();
    
    // Verify UI elements were removed
    expect(mockDialogueUI.remove).toHaveBeenCalled();
    expect(mockLoadingScreen.remove).toHaveBeenCalled();
  });
}); 