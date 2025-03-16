// Import modules
import { EnvironmentManager } from '../../../../src/modules/environment/EnvironmentManager';

// Create THREE mock before using it
const mockGroup = {
  position: { set: jest.fn() },
  rotation: { set: jest.fn() },
  scale: { set: jest.fn() }
};

// Mock GLTFLoader
jest.mock('three/examples/jsm/loaders/GLTFLoader', () => {
  return {
    GLTFLoader: jest.fn().mockImplementation(() => {
      return {
        load: jest.fn((url, onLoad) => {
          // Mock a basic GLTF scene
          const mockScene = mockGroup;
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
  let mockPlayerManager;
  let mockScene;
  
  beforeEach(() => {
    // Create mock scene with required methods
    mockScene = {
      add: jest.fn(),
      remove: jest.fn()
    };
    
    // Create mock player manager
    mockPlayerManager = {
      localPlayer: {
        position: { x: 0, y: 0, z: 0 }
      }
    };
    
    // Create mock game with required components
    mockGame = {
      scene: mockScene,
      playerManager: mockPlayerManager,
      debugMode: false
    };
    
    // Create environment manager
    environmentManager = new EnvironmentManager(mockGame);
  });
  
  describe('Initialization', () => {
    it('should initialize with correct properties', () => {
      expect(environmentManager.game).toBe(mockGame);
      expect(environmentManager.colliders).toEqual([]);
      expect(environmentManager.environmentEntities).toEqual([]);
      expect(environmentManager.initialized).toBe(false);
    });
    
    it('should load environment models during initialization', async () => {
      // Mock the loadEnvironmentModel method
      environmentManager.loadEnvironmentModel = jest.fn().mockResolvedValue({
        model: 'mockModel',
        collision: 'mockCollision'
      });
      
      // Initialize the environment
      await environmentManager.initialize();
      
      // Check if loadEnvironmentModel was called
      expect(environmentManager.loadEnvironmentModel).toHaveBeenCalled();
      expect(environmentManager.initialized).toBe(true);
    });
  });
  
  describe('Environment Model Loading', () => {
    it('should load environment models correctly', async () => {
      // Call loadEnvironmentModel
      const result = await environmentManager.loadEnvironmentModel('test-model');
      
      // Check if GLTFLoader was used correctly
      expect(result).toBeDefined();
    });
  });
  
  describe('Collider Management', () => {
    it('should return colliders correctly', () => {
      // Set up a mock collider
      const mockCollider = { id: 'test-collider' };
      environmentManager.colliders = [mockCollider];
      
      // Get colliders
      const colliders = environmentManager.getColliders();
      
      // Check result
      expect(colliders).toEqual([mockCollider]);
    });
    
    it('should add colliders correctly', () => {
      // Add a collider
      const mockCollider = { id: 'test-collider' };
      environmentManager.addCollider(mockCollider);
      
      // Check if collider was added
      expect(environmentManager.colliders).toContain(mockCollider);
    });
  });
  
  describe('Resource Cleanup', () => {
    it('should clean up resources properly', () => {
      // Setup mock models to clean up
      const mockModel1 = { id: 'model1' };
      const mockModel2 = { id: 'model2' };
      
      // Add models to environment entities
      environmentManager.environmentEntities = [mockModel1, mockModel2];
      environmentManager.colliders = [{ id: 'collider1' }];
      
      // Call cleanup
      environmentManager.cleanup();
      
      // Verify resources were cleared
      expect(environmentManager.environmentEntities).toEqual([]);
      expect(environmentManager.colliders).toEqual([]);
    });
  });
});
