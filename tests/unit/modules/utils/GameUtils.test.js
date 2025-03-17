/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock THREE.js
jest.mock('three', () => {
  return {
    CanvasTexture: jest.fn().mockImplementation(() => ({
      needsUpdate: false
    })),
    SpriteMaterial: jest.fn().mockImplementation(() => ({
      map: null,
      transparent: false
    })),
    Sprite: jest.fn().mockImplementation(() => ({
      scale: {
        set: jest.fn()
      }
    })),
    BoxGeometry: jest.fn(),
    SphereGeometry: jest.fn(),
    CylinderGeometry: jest.fn(),
    PlaneGeometry: jest.fn(),
    MeshPhongMaterial: jest.fn().mockImplementation(({ color }) => ({ color }))
  };
});

// Import GameUtils after mocking THREE.js
import { GameUtils } from '../../../../src/modules/utils/GameUtils.js';

describe('GameUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock document methods
    document.createElement = jest.fn().mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: jest.fn().mockReturnValue({
            fillStyle: '',
            fillRect: jest.fn(),
            font: '',
            textAlign: '',
            textBaseline: '',
            fillText: jest.fn()
          })
        };
      }
      return {};
    });
    
    // Mock window.requestAnimationFrame
    window.requestAnimationFrame = jest.fn().mockImplementation(cb => setTimeout(cb, 0));
    
    // Mock Date.now
    jest.spyOn(Date, 'now').mockReturnValue(1000);
  });
  
  test('calculateDistance should calculate distance between two points', () => {
    const posA = { x: 0, y: 0, z: 0 };
    const posB = { x: 3, y: 0, z: 4 };
    
    const distance = GameUtils.calculateDistance(posA, posB);
    
    expect(distance).toBe(5);
  });
  
  test('createSimpleText should create a canvas texture with text', () => {
    const texture = GameUtils.createSimpleText('Test Text', 24, '#ffffff', 'rgba(0, 0, 0, 0.5)');
    
    expect(document.createElement).toHaveBeenCalledWith('canvas');
    const canvas = document.createElement.mock.results[0].value;
    const context = canvas.getContext();
    
    expect(context.fillRect).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalled();
    expect(texture).toBeDefined();
  });
  
  test('createSprite should create a sprite with the given texture', () => {
    const mockTexture = {};
    const sprite = GameUtils.createSprite(mockTexture, 2, 0.5);
    
    expect(sprite).toBeDefined();
    expect(sprite.scale.set).toHaveBeenCalledWith(2, 0.5, 1);
  });
  
  test('clamp should limit a value between min and max', () => {
    expect(GameUtils.clamp(5, 0, 10)).toBe(5);
    expect(GameUtils.clamp(-5, 0, 10)).toBe(0);
    expect(GameUtils.clamp(15, 0, 10)).toBe(10);
  });
  
  test('lerp should interpolate between two values', () => {
    expect(GameUtils.lerp(0, 10, 0)).toBe(0);
    expect(GameUtils.lerp(0, 10, 0.5)).toBe(5);
    expect(GameUtils.lerp(0, 10, 1)).toBe(10);
  });
  
  test('generateRandomId should create a random string of specified length', () => {
    // Mock Math.random to return predictable values
    const originalRandom = Math.random;
    Math.random = jest.fn().mockReturnValue(0.5);
    
    const id = GameUtils.generateRandomId(10);
    
    expect(id.length).toBe(10);
    expect(typeof id).toBe('string');
    
    // Restore Math.random
    Math.random = originalRandom;
  });
  
  test('createBasicGeometries should return basic THREE.js geometries', () => {
    const geometries = GameUtils.createBasicGeometries();
    
    expect(geometries.box).toBeDefined();
    expect(geometries.sphere).toBeDefined();
    expect(geometries.cylinder).toBeDefined();
    expect(geometries.plane).toBeDefined();
  });
  
  test('createBasicMaterials should return basic THREE.js materials', () => {
    const materials = GameUtils.createBasicMaterials();
    
    expect(materials.red).toBeDefined();
    expect(materials.green).toBeDefined();
    expect(materials.blue).toBeDefined();
    expect(materials.white).toBeDefined();
    expect(materials.black).toBeDefined();
  });
  
  test('animate should call onFrame with progress values', () => {
    // Mock requestAnimationFrame
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    global.requestAnimationFrame = jest.fn(callback => {
      setTimeout(callback, 16); // Simulate 60fps (approximately 16ms per frame)
      return 1; // Return a request ID
    });
    
    // Set up fake timers
    jest.useFakeTimers();
    
    const onFrame = jest.fn();
    const duration = 1000;
    
    // Start animation
    GameUtils.animate(onFrame, duration);
    
    // Advance time by half the duration
    jest.advanceTimersByTime(500);
    
    // Check that onFrame was called with approximately 0.5 progress
    const calls = onFrame.mock.calls;
    const progressValues = calls.map(call => call[0]);
    
    // Find a call with progress close to 0.5
    const hasProgressNearHalf = progressValues.some(progress => 
      progress >= 0.45 && progress <= 0.55
    );
    
    expect(hasProgressNearHalf).toBe(true);
    
    // Advance time to complete the animation
    jest.advanceTimersByTime(500);
    
    // Check that onFrame was called with progress 1
    const finalCalls = onFrame.mock.calls;
    const finalProgressValues = finalCalls.map(call => call[0]);
    
    // Find a call with progress of 1
    const hasProgressOne = finalProgressValues.some(progress => 
      progress >= 0.95
    );
    
    expect(hasProgressOne).toBe(true);
    
    // Clean up
    jest.useRealTimers();
    global.requestAnimationFrame = originalRequestAnimationFrame;
  });
  
  test('fadeIn should animate opacity from 0 to 1', () => {
    const element = {
      style: {
        opacity: '1'
      }
    };
    
    // Mock animate to directly call the callback with progress 0.5
    jest.spyOn(GameUtils, 'animate').mockImplementation((callback) => {
      callback(0.5);
    });
    
    GameUtils.fadeIn(element, 500);
    
    expect(element.style.opacity).toBe('0.5');
    expect(GameUtils.animate).toHaveBeenCalled();
  });
  
  test('fadeOut should animate opacity from 1 to 0 and remove element', () => {
    const element = {
      style: {
        opacity: '1'
      },
      remove: jest.fn()
    };
    
    // Mock animate to directly call the callback with progress 1 (complete)
    jest.spyOn(GameUtils, 'animate').mockImplementation((callback) => {
      callback(1);
    });
    
    GameUtils.fadeOut(element, 500, true);
    
    expect(element.style.opacity).toBe('0');
    expect(element.remove).toHaveBeenCalled();
    expect(GameUtils.animate).toHaveBeenCalled();
  });
  
  test('fadeOut should not remove element if removeAfter is false', () => {
    const element = {
      style: {
        opacity: '1'
      },
      remove: jest.fn()
    };
    
    // Mock animate to directly call the callback with progress 1 (complete)
    jest.spyOn(GameUtils, 'animate').mockImplementation((callback) => {
      callback(1);
    });
    
    GameUtils.fadeOut(element, 500, false);
    
    expect(element.style.opacity).toBe('0');
    expect(element.remove).not.toHaveBeenCalled();
  });
}); 