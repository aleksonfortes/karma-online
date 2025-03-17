/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MockEnvironmentManager } from './mockEnvironmentManager';
import { 
  createEnvironmentTestSetup, 
  createMockCollider, 
  createMockGLTFModel 
} from './environmentTestHelpers';

// Mock GLTFLoader
jest.mock('three/examples/jsm/loaders/GLTFLoader', () => {
  return {
    GLTFLoader: jest.fn().mockImplementation(() => {
      return {
        load: jest.fn((url, onLoad) => {
          // Mock a basic GLTF scene
          const mockScene = {
            position: { set: jest.fn() },
            rotation: { set: jest.fn() },
            scale: { set: jest.fn() }
          };
          const mockGltf = {
            scene: mockScene,
            animations: []
          };
          // Call the onLoad callback with the mock data
          if (onLoad) onLoad(mockGltf);
        })
      };
    })
  };
});

describe('EnvironmentManager', () => {
  let environmentManager;
  let mockGame;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create test setup
    const setup = createEnvironmentTestSetup();
    mockGame = setup.mockGame;
    environmentManager = setup.environmentManager;
  });
  
  afterEach(() => {
    // Clean up
    jest.clearAllMocks();
    environmentManager.cleanup();
  });
  
  test('should initialize with correct properties', () => {
    expect(environmentManager.game).toBe(mockGame);
    expect(environmentManager.colliders).toEqual([]);
    expect(environmentManager.environmentEntities).toEqual([]);
    expect(environmentManager.initialized).toBe(false);
  });
  
  test('should load environment models during initialization', async () => {
    // Mock the loadEnvironmentModel method
    const loadSpy = jest.spyOn(environmentManager, 'loadEnvironmentModel')
      .mockResolvedValue({
        model: 'mockModel',
        collision: 'mockCollision'
      });
    
    // Initialize the environment
    await environmentManager.initialize();
    
    // Check if loadEnvironmentModel was called
    expect(loadSpy).toHaveBeenCalled();
    expect(environmentManager.initialized).toBe(true);
    
    // Restore original method
    loadSpy.mockRestore();
  });
  
  test('should load environment models correctly', async () => {
    // Call loadEnvironmentModel
    const result = await environmentManager.loadEnvironmentModel('test-model');
    
    // Check if model and collision were returned
    expect(result).toBeDefined();
    expect(result.model).toBeDefined();
    expect(result.collision).toBeDefined();
    expect(result.collision.id).toBe('test-model-collision');
  });
  
  test('should return colliders correctly', () => {
    // Set up a mock collider
    const mockCollider = createMockCollider('test-collider');
    environmentManager.colliders = [mockCollider];
    
    // Get colliders
    const colliders = environmentManager.getColliders();
    
    // Check result
    expect(colliders).toEqual([mockCollider]);
  });
  
  test('should add colliders correctly', () => {
    // Add a collider
    const mockCollider = createMockCollider('test-collider');
    environmentManager.addCollider(mockCollider);
    
    // Check if collider was added
    expect(environmentManager.colliders).toContain(mockCollider);
  });
  
  test('should clean up resources properly', () => {
    // Setup mock models to clean up
    const mockModel1 = { id: 'model1' };
    const mockModel2 = { id: 'model2' };
    
    // Add models to environment entities
    environmentManager.environmentEntities = [mockModel1, mockModel2];
    environmentManager.colliders = [createMockCollider('collider1')];
    
    // Call cleanup
    environmentManager.cleanup();
    
    // Verify resources were cleared
    expect(environmentManager.environmentEntities).toEqual([]);
    expect(environmentManager.colliders).toEqual([]);
    expect(environmentManager.initialized).toBe(false);
  });
  
  test('should update environment entities', () => {
    // Create mock entities with update method
    const mockEntity1 = { 
      update: jest.fn(),
      id: 'entity1'
    };
    const mockEntity2 = { 
      update: jest.fn(),
      id: 'entity2'
    };
    
    // Add entities to environment
    environmentManager.environmentEntities = [mockEntity1, mockEntity2];
    environmentManager.initialized = true;
    
    // Call update
    environmentManager.update(0.016);
    
    // Verify update was called on entities
    expect(mockEntity1.update).toHaveBeenCalledWith(0.016);
    expect(mockEntity2.update).toHaveBeenCalledWith(0.016);
  });
});
