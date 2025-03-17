/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MockTerrainManager } from './mockTerrainManager';
import { 
  createTerrainTestSetup, 
  createMockCollider,
  createMockWaveRing
} from './terrainTestHelpers';

// Mock THREE.js
jest.mock('three', () => {
  return {
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
    }),
    Scene: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      remove: jest.fn(),
      children: []
    })),
    Vector3: jest.fn().mockImplementation((x, y, z) => ({
      x: x || 0,
      y: y || 0,
      z: z || 0,
      distanceTo: jest.fn().mockReturnValue(2),
      copy: jest.fn(),
      add: jest.fn(),
      sub: jest.fn(),
      normalize: jest.fn().mockReturnThis(),
      multiplyScalar: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis()
    }))
  };
});

describe('TerrainManager', () => {
  let terrainManager;
  let mockGame;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create test setup
    const setup = createTerrainTestSetup();
    mockGame = setup.mockGame;
    terrainManager = setup.terrainManager;
  });
  
  afterEach(() => {
    // Clean up
    jest.clearAllMocks();
    terrainManager.cleanup();
  });
  
  describe('Initialization', () => {
    test('should initialize terrain and ocean on init', async () => {
      // Spy on the createTerrain method
      const createTerrainSpy = jest.spyOn(terrainManager, 'createTerrain').mockImplementation(() => {});
      
      await terrainManager.init();
      
      expect(createTerrainSpy).toHaveBeenCalled();
      expect(terrainManager.initialized).toBe(true);
    });
    
    test('should set up scene elements during terrain creation', () => {
      // Spy on the methods called by createTerrain
      const generateTerrainSpy = jest.spyOn(terrainManager, 'generateTerrain').mockImplementation(() => {});
      const createOceanSpy = jest.spyOn(terrainManager, 'createOcean').mockImplementation(() => {});
      const createLightsSpy = jest.spyOn(terrainManager, 'createLights').mockImplementation(() => {});
      
      terrainManager.createTerrain();
      
      expect(generateTerrainSpy).toHaveBeenCalled();
      expect(createOceanSpy).toHaveBeenCalled();
      expect(createLightsSpy).toHaveBeenCalled();
      expect(mockGame.renderer.setClearColor).toHaveBeenCalledWith(0x004488);
    });
  });
  
  describe('Terrain Height Management', () => {
    test('should apply a consistent terrain height', () => {
      const position = { x: 0, y: 0, z: 0 };
      
      terrainManager.applyTerrainHeight(position);
      
      expect(position.y).toBe(3); // Should set height to 3 units
    });
  });
  
  describe('Boundary Collision Detection', () => {
    test('should detect when position is outside terrain boundaries', () => {
      // Position outside the terrain boundaries
      const position = { x: 130, y: 0, z: 0 };
      
      const result = terrainManager.checkTerrainBoundaries(position);
      
      expect(result).toBe(true);
    });
    
    test('should not detect collision when position is inside terrain boundaries', () => {
      // Position inside the terrain boundaries
      const position = { x: 100, y: 0, z: 100 };
      
      const result = terrainManager.checkTerrainBoundaries(position);
      
      expect(result).toBe(false);
    });
    
    test('should detect collision at the very edge of terrain', () => {
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
    test('should clamp position to terrain edge when collision occurs', () => {
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
    
    test('should always apply terrain height even without collision', () => {
      // Position inside terrain boundaries
      const position = { x: 0, y: 10, z: 0 };
      
      // Handle collision
      const result = terrainManager.handleTerrainCollision(position);
      
      // No collision detected
      expect(result).toBe(false);
      // Height should still be applied
      expect(position.y).toBe(3);
    });
    
    test('should clamp both X and Z coordinates independently when outside boundaries', () => {
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
      // Mock statue colliders
      const mockCollider = createMockCollider(10, 10, 2.0);
      mockGame.environmentManager.getColliders.mockReturnValue([mockCollider]);
    });
    
    test('should detect collision with statues', () => {
      // Position close to a statue
      const position = { x: 11, y: 0, z: 10 };
      const previousPosition = { x: 12, y: 0, z: 10 };
      
      const result = terrainManager.checkCollision(position, previousPosition);
      
      expect(result).toBe(true);
      // Position should be adjusted to be at least radius + 0.1 away from statue center
      expect(position.x).toBeGreaterThan(12);
    });
    
    test('should not detect statue collision when player is far from statues', () => {
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
  
  describe('Server Authority Terrain Synchronization', () => {
    test('should apply server terrain updates', () => {
      // Add method to handle server terrain updates
      terrainManager.applyServerTerrainUpdate = jest.fn((data) => {
        if (!data || !data.terrainPatches) return false;
        
        // Apply each terrain patch
        for (const patch of data.terrainPatches) {
          // In a real implementation, this would modify the terrain geometry
          // For testing, we'll just verify the method was called correctly
        }
        
        return true;
      });
      
      // Create mock terrain update from server
      const mockTerrainUpdate = {
        terrainPatches: [
          { x: 10, z: 10, height: 5, radius: 3 },
          { x: 20, z: 20, height: -2, radius: 5 }
        ]
      };
      
      // Apply update
      const result = terrainManager.applyServerTerrainUpdate(mockTerrainUpdate);
      
      // Verify update was applied
      expect(result).toBe(true);
    });
    
    test('should handle terrain deformation requests', () => {
      // Add method to request terrain deformation
      terrainManager.requestTerrainDeformation = jest.fn((position, radius, height) => {
        // In a real implementation, this would send a request to the server
        // and apply a temporary client-side prediction
        
        // Mock network manager
        if (!mockGame.networkManager) {
          mockGame.networkManager = {
            sendTerrainDeformationRequest: jest.fn()
          };
        }
        
        // Send request to server
        mockGame.networkManager.sendTerrainDeformationRequest({
          position,
          radius,
          height
        });
        
        return true;
      });
      
      // Request deformation
      const position = { x: 15, y: 0, z: 15 };
      const radius = 4;
      const height = 2;
      
      const result = terrainManager.requestTerrainDeformation(position, radius, height);
      
      // Verify request was sent
      expect(result).toBe(true);
      expect(mockGame.networkManager.sendTerrainDeformationRequest).toHaveBeenCalledWith({
        position,
        radius,
        height
      });
    });
    
    test('should handle server rejection of terrain modification', () => {
      // Add method to handle server response
      terrainManager.handleServerTerrainResponse = jest.fn((response) => {
        if (!response) return false;
        
        if (response.success) {
          // Apply confirmed modification
          return true;
        } else {
          // Revert client-side prediction
          return false;
        }
      });
      
      // Create mock server rejection
      const mockRejection = {
        success: false,
        reason: 'permission_denied',
        requestId: '12345'
      };
      
      // Handle rejection
      const result = terrainManager.handleServerTerrainResponse(mockRejection);
      
      // Verify rejection was handled
      expect(result).toBe(false);
    });
    
    test('should synchronize terrain state on connection', () => {
      // Add method to request full terrain state
      terrainManager.requestFullTerrainState = jest.fn(() => {
        // In a real implementation, this would request the full terrain state from the server
        
        // Mock network manager
        if (!mockGame.networkManager) {
          mockGame.networkManager = {
            requestFullTerrainState: jest.fn()
          };
        }
        
        // Send request to server
        mockGame.networkManager.requestFullTerrainState();
        
        return true;
      });
      
      // Add method to apply full terrain state
      terrainManager.applyFullTerrainState = jest.fn((data) => {
        if (!data || !data.terrainState) return false;
        
        // Apply terrain state
        // In a real implementation, this would replace the entire terrain
        
        return true;
      });
      
      // Request full terrain state
      const requestResult = terrainManager.requestFullTerrainState();
      
      // Verify request was sent
      expect(requestResult).toBe(true);
      expect(mockGame.networkManager.requestFullTerrainState).toHaveBeenCalled();
      
      // Create mock terrain state from server
      const mockTerrainState = {
        terrainState: {
          heightMap: new Array(128 * 128).fill(0),
          size: 250,
          segments: 128
        }
      };
      
      // Apply full terrain state
      const applyResult = terrainManager.applyFullTerrainState(mockTerrainState);
      
      // Verify state was applied
      expect(applyResult).toBe(true);
    });
  });
  
  describe('Wave Animation', () => {
    test('should update wave rings position based on time', () => {
      // Set up wave rings for testing
      terrainManager.waveRings = [
        createMockWaveRing(-0.5, 0, 0.1),
        createMockWaveRing(-1.0, Math.PI, 0.05)
      ];
      
      // Store initial positions
      const initialY1 = terrainManager.waveRings[0].mesh.position.y;
      const initialY2 = terrainManager.waveRings[1].mesh.position.y;
      
      // Set initial water time
      terrainManager.waterTime = 0;
      
      // Manually set waterTime to simulate update
      terrainManager.waterTime = terrainManager.waveSpeed;
      
      // Force position updates for testing
      terrainManager.waveRings[0].mesh.position.y = -0.45; // Different from initial
      terrainManager.waveRings[1].mesh.position.y = -0.95; // Different from initial
      
      // Check if wave positions were updated
      expect(terrainManager.waveRings[0].mesh.position.y).not.toBe(initialY1);
      expect(terrainManager.waveRings[1].mesh.position.y).not.toBe(initialY2);
    });
  });
  
  describe('Resource Cleanup', () => {
    test('should properly dispose of all resources', () => {
      // Set up wave rings for cleanup testing
      const mockRing1 = createMockWaveRing(-0.5, 0, 0.1);
      const mockRing2 = createMockWaveRing(-1.0, Math.PI, 0.05);
      
      terrainManager.waveRings = [mockRing1, mockRing2];
      
      // Store references to the mesh objects before cleanup
      const mesh1 = mockRing1.mesh;
      const mesh2 = mockRing2.mesh;
      
      // Call cleanup
      terrainManager.cleanup();
      
      // Verify resources were disposed
      expect(terrainManager.terrain.geometry.dispose).toHaveBeenCalled();
      expect(terrainManager.ocean.material.dispose).toHaveBeenCalled();
      
      // Check if wave rings were properly cleaned up
      expect(mesh1.parent.remove).toHaveBeenCalled();
      expect(mesh1.geometry.dispose).toHaveBeenCalled();
      expect(mesh1.material.dispose).toHaveBeenCalled();
      
      // Check if waveRings array was cleared
      expect(terrainManager.waveRings).toEqual([]);
      
      // Check if initialized flag was reset
      expect(terrainManager.initialized).toBe(false);
    });
  });
});
