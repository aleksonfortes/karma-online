/**
 * PlayerManager.test.js - Main test file for PlayerManager
 * 
 * This file serves as an entry point for all PlayerManager tests.
 * The actual tests are organized into separate files by functionality:
 * - PlayerManagerCore.test.js - Core functionality tests
 * - PlayerManagerHealth.test.js - Health-related functionality tests
 * - PlayerManagerNetwork.test.js - Network-related functionality tests
 */

// Import necessary modules
import { jest } from '@jest/globals';

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

// Import the modular test files
import './PlayerManagerCore.test.js';
import './PlayerManagerHealth.test.js';
import './PlayerManagerNetwork.test.js';

// Note: This file doesn't contain any tests itself.
// It serves as an entry point that imports all the modular test files.
// This approach allows for better organization and maintenance of tests.
