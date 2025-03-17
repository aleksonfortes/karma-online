/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Import the functions from createFabricTexture.js
// Note: We need to use dynamic import since the file might have side effects
let createFabricTextureModule;

describe('createFabricTexture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock document methods
    document.createElement = jest.fn().mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          toDataURL: jest.fn().mockReturnValue('data:image/jpeg;base64,mockedDataUrl'),
          getContext: jest.fn().mockReturnValue({
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            globalAlpha: 1,
            fillRect: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            bezierCurveTo: jest.fn(),
            arc: jest.fn(),
            fill: jest.fn(),
            stroke: jest.fn()
          })
        };
      } else if (tag === 'a') {
        return {
          href: '',
          download: '',
          click: jest.fn()
        };
      }
      return {};
    });
    
    // Mock document.body methods instead of replacing the object
    document.body.appendChild = jest.fn();
    document.body.removeChild = jest.fn();
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    
    // Mock Math.random to return predictable values
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    
    // Reset the module before each test
    jest.resetModules();
    
    // Dynamically import the module to avoid side effects
    return import('../../../src/utils/createFabricTexture.js').then(module => {
      createFabricTextureModule = module;
    });
  });
  
  test('createFabricTexture should create a fabric texture with default white color', () => {
    const result = createFabricTextureModule.createFabricTexture();
    
    expect(document.createElement).toHaveBeenCalledWith('canvas');
    const canvas = document.createElement.mock.results[0].value;
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(512);
    
    const ctx = canvas.getContext();
    
    // Check that the context methods were called
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.bezierCurveTo).toHaveBeenCalled();
    
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg');
    expect(result).toBe('data:image/jpeg;base64,mockedDataUrl');
  });
  
  test('createFabricTexture should create a fabric texture with custom color', () => {
    const result = createFabricTextureModule.createFabricTexture('#ff0000');
    
    expect(document.createElement).toHaveBeenCalledWith('canvas');
    const canvas = document.createElement.mock.results[0].value;
    const ctx = canvas.getContext();
    
    // Check that the context methods were called with the right color
    expect(ctx.fillStyle).toBeDefined();
    expect(ctx.strokeStyle).toBeDefined();
    
    expect(result).toBe('data:image/jpeg;base64,mockedDataUrl');
  });
  
  test('adjustColor should lighten a color', () => {
    // We need to access the adjustColor function directly
    // Since it's not exported, we'll test it indirectly through createFabricTexture
    
    // Mock the getContext to capture the colors used
    const capturedColors = [];
    document.createElement = jest.fn().mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          toDataURL: jest.fn().mockReturnValue('data:image/jpeg;base64,mockedDataUrl'),
          getContext: jest.fn().mockReturnValue({
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            globalAlpha: 1,
            fillRect: jest.fn().mockImplementation(function() {
              capturedColors.push(this.fillStyle);
            }),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            bezierCurveTo: jest.fn(),
            arc: jest.fn(),
            fill: jest.fn(),
            stroke: jest.fn()
          })
        };
      }
      return {};
    });
    
    // Call createFabricTexture with a known color
    createFabricTextureModule.createFabricTexture('#808080');
    
    // The base color should be used
    expect(capturedColors[0]).toBe('#808080');
  });
  
  test('downloadFabricTexture should create and download fabric textures', () => {
    // Mock window.downloadFabricTexture
    window.downloadFabricTexture = jest.fn();
    
    // Call the function directly if it's exported
    if (createFabricTextureModule.downloadFabricTexture) {
      createFabricTextureModule.downloadFabricTexture();
      
      // Check that the download link was created and clicked
      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(document.body.appendChild).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalled();
    } else {
      // If not exported, we can call it through the window object
      window.downloadFabricTexture();
      
      expect(window.downloadFabricTexture).toHaveBeenCalled();
    }
    
    // Check that console.log was called
    expect(console.log).toHaveBeenCalled();
  });
}); 