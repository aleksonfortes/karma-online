import { TerrainManager } from '../../../../src/modules/terrain/TerrainManager';
import * as THREE from 'three';

// Mock THREE.TextureLoader
jest.mock('three', () => {
  const actualTHREE = jest.requireActual('three');
  return {
    ...actualTHREE,
    TextureLoader: jest.fn().mockImplementation(() => {
      return {
        load: jest.fn().mockImplementation(() => {
          return {
            wrapS: null,
            wrapT: null,
            repeat: {
              set: jest.fn()
            }
          };
        })
      };
    })
  };
});

describe('TerrainManager', () => {
  let terrainManager;
  let mockGame;
  let mockScene;
  
  beforeEach(() => {
    // Create a mock scene
    mockScene = new THREE.Scene();
    
    // Create mock game with required methods and properties
    mockGame = {
      scene: mockScene,
      renderer: {
        setClearColor: jest.fn()
      },
      environmentManager: {
        getColliders: jest.fn().mockReturnValue([])
      }
    };
    
    // Create terrain manager
    terrainManager = new TerrainManager(mockGame);
    
    // Mock the add method of the scene
    mockScene.add = jest.fn();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Initialization', () => {
    it('should initialize terrain and ocean on init', async () => {
      // Spy on the createTerrain method
      const createTerrainSpy = jest.spyOn(terrainManager, 'createTerrain').mockImplementation(() => {});
      
      await terrainManager.init();
      
      expect(createTerrainSpy).toHaveBeenCalled();
    });
    
    it('should set up scene elements during terrain creation', () => {
      // Spy on the methods called by createTerrain
      const generateTerrainSpy = jest.spyOn(terrainManager, 'generateTerrain').mockImplementation(() => {});
      const createOceanSpy = jest.spyOn(terrainManager, 'createOcean').mockImplementation(() => {});
      
      terrainManager.createTerrain();
      
      expect(generateTerrainSpy).toHaveBeenCalled();
      expect(createOceanSpy).toHaveBeenCalled();
      expect(mockGame.renderer.setClearColor).toHaveBeenCalledWith(0x004488);
      expect(mockScene.add).toHaveBeenCalledTimes(3); // ambientLight + directionalLight + hemisphereLight
    });
  });
  
  describe('Terrain Height Management', () => {
    it('should apply a consistent terrain height', () => {
      const position = { x: 0, y: 0, z: 0 };
      
      terrainManager.applyTerrainHeight(position);
      
      expect(position.y).toBe(3); // Should set height to 3 units
    });
  });
  
  describe('Boundary Collision Detection', () => {
    beforeEach(() => {
      // Set up terrain data for testing
      terrainManager.terrain = {
        size: 250,
        segments: 128
      };
    });
    
    it('should detect when position is outside terrain boundaries', () => {
      // Position outside the terrain boundaries
      const position = { x: 130, y: 0, z: 0 };
      
      const result = terrainManager.checkTerrainBoundaries(position);
      
      expect(result).toBe(true);
    });
    
    it('should not detect collision when position is inside terrain boundaries', () => {
      // Position inside the terrain boundaries
      const position = { x: 100, y: 0, z: 100 };
      
      const result = terrainManager.checkTerrainBoundaries(position);
      
      expect(result).toBe(false);
    });
    
    it('should detect collision at the very edge of terrain', () => {
      // Position exactly at the edge (minus buffer)
      const terrainSize = terrainManager.terrain.size;
      const buffer = 0.5;
      const maxX = (terrainSize / 2) - buffer;
      
      // Position just beyond the edge
      const position = { x: maxX + 0.1, y: 0, z: 0 };
      
      const result = terrainManager.checkTerrainBoundaries(position);
      
      expect(result).toBe(true);
    });
  });
  
  describe('Terrain Collision Handling', () => {
    beforeEach(() => {
      // Set up terrain data for testing
      terrainManager.terrain = {
        size: 250,
        segments: 128
      };
    });
    
    it('should clamp position to terrain edge when collision occurs', () => {
      // Set up the test
      const terrainSize = terrainManager.terrain.size;
      const buffer = 0.5;
      const maxX = (terrainSize / 2) - buffer;
      
      // Position outside terrain boundaries
      const position = { 
        x: maxX + 10, 
        y: 0, 
        z: 0,
        previousPosition: { x: maxX - 5, y: 0, z: 0 } 
      };
      
      // Handle collision
      terrainManager.handleTerrainCollision(position);
      
      // Position should be clamped to the edge
      expect(position.x).toBe(maxX);
      expect(position.y).toBe(3); // Height should be set
    });
    
    it('should always apply terrain height even without collision', () => {
      // Position inside terrain boundaries
      const position = { x: 0, y: 10, z: 0 };
      
      // Handle collision
      const result = terrainManager.handleTerrainCollision(position);
      
      // No collision detected
      expect(result).toBe(false);
      // Height should still be applied
      expect(position.y).toBe(3);
    });
    
    it('should clamp both X and Z coordinates independently when outside boundaries', () => {
      // Set up the test
      const terrainSize = terrainManager.terrain.size;
      const buffer = 0.5;
      const maxX = (terrainSize / 2) - buffer;
      const maxZ = (terrainSize / 2) - buffer;
      
      // Position outside terrain boundaries in both X and Z
      const position = { 
        x: maxX + 10, 
        y: 0, 
        z: maxZ + 20,
        previousPosition: { x: maxX - 5, y: 0, z: maxZ - 5 } 
      };
      
      // Handle collision
      terrainManager.handleTerrainCollision(position);
      
      // Position should be clamped to the edge in both axes
      expect(position.x).toBe(maxX);
      expect(position.z).toBe(maxZ);
    });
  });
  
  describe('Statue Collision Detection', () => {
    beforeEach(() => {
      // Set up terrain data for testing
      terrainManager.terrain = {
        size: 250,
        segments: 128
      };
      
      // Mock statue colliders
      mockGame.environmentManager.getColliders.mockReturnValue([
        {
          position: new THREE.Vector3(10, 0, 10),
          radius: 2.0
        }
      ]);
    });
    
    it('should detect collision with statues', () => {
      // Position close to a statue
      const position = { x: 11, y: 0, z: 10 };
      const previousPosition = { x: 12, y: 0, z: 10 };
      
      const result = terrainManager.checkCollision(position, previousPosition);
      
      expect(result).toBe(true);
      // Position should be adjusted to be at least radius + 0.1 away from statue center
      expect(position.x).toBeGreaterThan(12);
    });
    
    it('should not detect statue collision when player is far from statues', () => {
      // Mock terrain collision to return false
      jest.spyOn(terrainManager, 'handleTerrainCollision').mockReturnValue(false);
      
      // Position far from any statue
      const position = { x: 20, y: 0, z: 20 };
      const previousPosition = { x: 19, y: 0, z: 19 };
      
      const result = terrainManager.checkCollision(position, previousPosition);
      
      expect(result).toBe(false);
      // Position should remain unchanged in x and z (y is set by applyTerrainHeight)
      expect(position.x).toBe(20);
      expect(position.z).toBe(20);
    });
  });
  
  describe('Wave Animation', () => {
    it('should update wave rings position based on time', () => {
      // Set up wave rings for testing
      terrainManager.waveRings = [
        {
          mesh: { position: { y: 0 } },
          baseY: -0.5,
          phase: 0,
          amplitude: 0.1
        },
        {
          mesh: { position: { y: 0 } },
          baseY: -1.0,
          phase: Math.PI,
          amplitude: 0.05
        }
      ];
      
      // Set initial water time
      terrainManager.waterTime = 0;
      
      // Update animation
      terrainManager.update();
      
      // Check if wave positions were updated
      expect(terrainManager.waveRings[0].mesh.position.y).not.toBe(0);
      expect(terrainManager.waveRings[1].mesh.position.y).not.toBe(0);
      
      // Check if water time was incremented
      expect(terrainManager.waterTime).toBe(terrainManager.waveSpeed);
    });
  });
  
  describe('Resource Cleanup', () => {
    it('should properly dispose of all resources', () => {
      // Set up resources for cleanup testing
      terrainManager.terrain = {
        geometry: {
          dispose: jest.fn()
        }
      };
      
      terrainManager.ocean = {
        material: {
          dispose: jest.fn()
        }
      };
      
      // Properly initialize waveRings to match structure in implementation
      const mockMesh = {
        parent: {
          remove: jest.fn()
        },
        geometry: {
          dispose: jest.fn()
        },
        material: {
          dispose: jest.fn()
        }
      };
      
      terrainManager.waveRings = [
        { mesh: mockMesh }
      ];
      
      // Call cleanup
      terrainManager.cleanup();
      
      // Verify resources were disposed
      expect(terrainManager.terrain.geometry.dispose).toHaveBeenCalled();
      expect(terrainManager.ocean.material.dispose).toHaveBeenCalled();
      
      // Store original wave ring for later assertions
      const originalWaveRing = mockMesh;
      
      // Check if wave ring was properly cleaned up
      expect(originalWaveRing.parent.remove).toHaveBeenCalled();
      expect(originalWaveRing.geometry.dispose).toHaveBeenCalled();
      expect(originalWaveRing.material.dispose).toHaveBeenCalled();
      
      // Check if waveRings array was cleared
      expect(terrainManager.waveRings).toEqual([]);
    });
  });
});
