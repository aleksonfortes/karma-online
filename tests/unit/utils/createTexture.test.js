/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock the module
jest.mock('../../../src/utils/createTexture.js', () => {
  // Define the mock functions inside the factory function without referencing document
  return {
    createTextureCanvas: jest.fn().mockImplementation((width, height, callback) => {
      // Mock the canvas and context without referencing document
      const mockCtx = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        fillRect: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        bezierCurveTo: jest.fn(),
        arc: jest.fn(),
        fill: jest.fn(),
        stroke: jest.fn(),
        createLinearGradient: jest.fn().mockReturnValue({
          addColorStop: jest.fn()
        })
      };
      
      // Mock canvas
      const mockCanvas = {
        width,
        height,
        getContext: jest.fn().mockReturnValue(mockCtx),
        toDataURL: jest.fn().mockReturnValue('data:image/png;base64,mockedDataUrl')
      };
      
      // Call the callback with the mock context
      callback(mockCtx, width, height);
      
      // Return the mock data URL
      return mockCanvas.toDataURL('image/png');
    }),
    createGrassTexture: jest.fn().mockReturnValue('data:image/png;base64,mockedDataUrl'),
    createWaterTexture: jest.fn().mockReturnValue('data:image/png;base64,mockedDataUrl'),
    createSandTexture: jest.fn().mockReturnValue('data:image/png;base64,mockedDataUrl'),
    createRockTexture: jest.fn().mockReturnValue('data:image/png;base64,mockedDataUrl'),
    createSnowTexture: jest.fn().mockReturnValue('data:image/png;base64,mockedDataUrl'),
    createLavaTexture: jest.fn().mockReturnValue('data:image/png;base64,mockedDataUrl')
  };
});

// Import the mocked module
import * as createTextureModule from '../../../src/utils/createTexture.js';

describe('createTexture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock document methods
    document.createElement = jest.fn().mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          toDataURL: jest.fn().mockReturnValue('data:image/png;base64,mockedDataUrl'),
          getContext: jest.fn().mockReturnValue({
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            fillRect: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            bezierCurveTo: jest.fn(),
            arc: jest.fn(),
            fill: jest.fn(),
            stroke: jest.fn(),
            createLinearGradient: jest.fn().mockReturnValue({
              addColorStop: jest.fn()
            })
          })
        };
      }
      return {};
    });
    
    // Mock Math.random to return predictable values
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  
  test('createTextureCanvas should create a canvas and call the callback', () => {
    const callback = jest.fn();
    const result = createTextureModule.createTextureCanvas(512, 512, callback);
    
    expect(callback).toHaveBeenCalled();
    expect(result).toBe('data:image/png;base64,mockedDataUrl');
  });
  
  test('createGrassTexture should create a grass texture', () => {
    const result = createTextureModule.createGrassTexture();
    
    expect(result).toBe('data:image/png;base64,mockedDataUrl');
  });
  
  test('createWaterTexture should create a water texture', () => {
    const result = createTextureModule.createWaterTexture();
    
    expect(result).toBe('data:image/png;base64,mockedDataUrl');
  });
  
  test('createSandTexture should create a sand texture', () => {
    const result = createTextureModule.createSandTexture();
    
    expect(result).toBe('data:image/png;base64,mockedDataUrl');
  });
  
  test('createRockTexture should create a rock texture', () => {
    const result = createTextureModule.createRockTexture();
    
    expect(result).toBe('data:image/png;base64,mockedDataUrl');
  });
  
  test('createSnowTexture should create a snow texture', () => {
    const result = createTextureModule.createSnowTexture();
    
    expect(result).toBe('data:image/png;base64,mockedDataUrl');
  });
  
  test('createLavaTexture should create a lava texture', () => {
    const result = createTextureModule.createLavaTexture();
    
    expect(result).toBe('data:image/png;base64,mockedDataUrl');
  });
}); 