/**
 * Mock implementation of TerrainManager for testing
 */

export class MockTerrainManager {
  constructor(game) {
    this.game = game;
    this.terrain = {
      size: 250,
      segments: 128,
      geometry: {
        dispose: jest.fn()
      },
      material: {
        dispose: jest.fn()
      },
      mesh: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      }
    };
    this.ocean = {
      geometry: {
        dispose: jest.fn()
      },
      material: {
        dispose: jest.fn()
      },
      mesh: {
        position: { x: 0, y: -1, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      }
    };
    this.waveRings = [];
    this.waterTime = 0;
    this.waveSpeed = 0.01;
    this.initialized = false;
    this.terrainHeight = 3;
  }
  
  /**
   * Initialize the terrain manager
   */
  async init() {
    this.log('Initializing TerrainManager');
    
    // Create terrain and ocean
    this.createTerrain();
    
    this.initialized = true;
    return true;
  }
  
  /**
   * Create the terrain and related elements
   */
  createTerrain() {
    this.log('Creating terrain');
    
    // Generate terrain mesh
    this.generateTerrain();
    
    // Create ocean
    this.createOcean();
    
    // Set sky color
    if (this.game.renderer) {
      this.game.renderer.setClearColor(0x004488);
    }
    
    // Add lights
    this.createLights();
  }
  
  /**
   * Generate the terrain mesh
   */
  generateTerrain() {
    this.log('Generating terrain mesh');
    
    // Create a mock terrain mesh
    const terrainMesh = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
    
    // Add to scene
    if (this.game.scene) {
      this.game.scene.add(terrainMesh);
    }
    
    this.terrain.mesh = terrainMesh;
  }
  
  /**
   * Create the ocean
   */
  createOcean() {
    this.log('Creating ocean');
    
    // Create a mock ocean mesh
    const oceanMesh = {
      position: { x: 0, y: -1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
    
    // Add to scene
    if (this.game.scene) {
      this.game.scene.add(oceanMesh);
    }
    
    this.ocean.mesh = oceanMesh;
    
    // Create wave rings
    this.createWaveRings();
  }
  
  /**
   * Create wave rings for ocean animation
   */
  createWaveRings() {
    this.log('Creating wave rings');
    
    // Create mock wave rings
    for (let i = 0; i < 3; i++) {
      const ringMesh = {
        position: { x: 0, y: -0.5 - (i * 0.5), z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1 + i * 0.5, y: 1, z: 1 + i * 0.5 },
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
      
      // Add to scene
      if (this.game.scene) {
        this.game.scene.add(ringMesh);
      }
      
      // Add to wave rings array
      this.waveRings.push({
        mesh: ringMesh,
        baseY: -0.5 - (i * 0.5),
        phase: i * Math.PI / 3,
        amplitude: 0.1 / (i + 1)
      });
    }
  }
  
  /**
   * Create lights for the scene
   */
  createLights() {
    this.log('Creating lights');
    
    // Create ambient light
    const ambientLight = {
      intensity: 0.5,
      color: 0xffffff
    };
    
    // Create directional light
    const directionalLight = {
      intensity: 0.8,
      color: 0xffffff,
      position: { x: 50, y: 100, z: 50 },
      castShadow: true
    };
    
    // Create hemisphere light
    const hemisphereLight = {
      intensity: 0.6,
      color: 0xffffff,
      groundColor: 0x444444
    };
    
    // Add lights to scene
    if (this.game.scene) {
      this.game.scene.add(ambientLight);
      this.game.scene.add(directionalLight);
      this.game.scene.add(hemisphereLight);
    }
  }
  
  /**
   * Apply terrain height to a position
   * @param {Object} position - The position to adjust
   */
  applyTerrainHeight(position) {
    if (position) {
      position.y = this.terrainHeight;
    }
  }
  
  /**
   * Check if a position is outside terrain boundaries
   * @param {Object} position - The position to check
   * @returns {boolean} - Whether the position is outside boundaries
   */
  checkTerrainBoundaries(position) {
    if (!position) return false;
    
    const terrainSize = this.terrain.size;
    const buffer = 0.5;
    const maxX = (terrainSize / 2) - buffer;
    const maxZ = (terrainSize / 2) - buffer;
    
    return (
      position.x > maxX ||
      position.x < -maxX ||
      position.z > maxZ ||
      position.z < -maxZ
    );
  }
  
  /**
   * Handle terrain collision
   * @param {Object} position - The position to adjust
   * @returns {boolean} - Whether a collision occurred
   */
  handleTerrainCollision(position) {
    if (!position) return false;
    
    // Apply terrain height regardless of collision
    this.applyTerrainHeight(position);
    
    // Check for terrain boundary collision
    const isOutsideBoundaries = this.checkTerrainBoundaries(position);
    
    if (isOutsideBoundaries) {
      const terrainSize = this.terrain.size;
      const buffer = 0.5;
      const maxX = (terrainSize / 2) - buffer;
      const maxZ = (terrainSize / 2) - buffer;
      
      // Clamp position to terrain boundaries
      position.x = Math.min(Math.max(position.x, -maxX), maxX);
      position.z = Math.min(Math.max(position.z, -maxZ), maxZ);
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Check for collision with environment objects
   * @param {Object} position - The current position
   * @param {Object} previousPosition - The previous position
   * @returns {boolean} - Whether a collision occurred
   */
  checkCollision(position, previousPosition) {
    if (!position || !previousPosition) return false;
    
    // Check terrain collision first
    const terrainCollision = this.handleTerrainCollision(position);
    
    // Get environment colliders
    const colliders = this.game.environmentManager.getColliders();
    
    // Check for collisions with each collider
    for (const collider of colliders) {
      // Simple distance-based collision check
      const dx = position.x - collider.position.x;
      const dz = position.z - collider.position.z;
      const distanceSquared = dx * dx + dz * dz;
      
      // If distance is less than collider radius, collision occurred
      if (distanceSquared < (collider.radius * collider.radius)) {
        // Calculate direction from collider to position
        const distance = Math.sqrt(distanceSquared);
        const dirX = dx / distance;
        const dirZ = dz / distance;
        
        // Move position outside of collider radius
        const minDistance = collider.radius + 0.1;
        position.x = collider.position.x + dirX * minDistance;
        position.z = collider.position.z + dirZ * minDistance;
        
        return true;
      }
    }
    
    return terrainCollision;
  }
  
  /**
   * Update the terrain manager
   * @param {number} deltaTime - Time since last update
   */
  update(deltaTime = 0.016) {
    if (!this.initialized) return;
    
    // Update water animation
    this.updateWaterAnimation(deltaTime);
  }
  
  /**
   * Update water animation
   * @param {number} deltaTime - Time since last update
   */
  updateWaterAnimation(deltaTime) {
    // Increment water time
    this.waterTime += this.waveSpeed;
    
    // Update wave ring positions
    for (const ring of this.waveRings) {
      if (ring.mesh && ring.mesh.position) {
        ring.mesh.position.y = ring.baseY + Math.sin(this.waterTime + ring.phase) * ring.amplitude;
      }
    }
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    this.log('Cleaning up TerrainManager');
    
    // Dispose of terrain resources
    if (this.terrain) {
      if (this.terrain.geometry) {
        this.terrain.geometry.dispose();
      }
      if (this.terrain.material) {
        this.terrain.material.dispose();
      }
    }
    
    // Dispose of ocean resources
    if (this.ocean) {
      if (this.ocean.material) {
        this.ocean.material.dispose();
      }
    }
    
    // Dispose of wave rings
    for (const ring of this.waveRings) {
      if (ring.mesh) {
        if (ring.mesh.parent) {
          ring.mesh.parent.remove(ring.mesh);
        }
        if (ring.mesh.geometry) {
          ring.mesh.geometry.dispose();
        }
        if (ring.mesh.material) {
          ring.mesh.material.dispose();
        }
      }
    }
    
    // Clear wave rings array
    this.waveRings = [];
    
    this.initialized = false;
  }
  
  /**
   * Log a message
   * @param {string} message - The message to log
   */
  log(message) {
    console.log(message);
  }

  /**
   * Apply terrain updates from server
   * @param {Object} data - The terrain update data
   * @returns {boolean} - Whether the update was successfully applied
   */
  applyServerTerrainUpdate(data) {
    if (!data || !data.terrainPatches) {
      this.log('Invalid terrain update data');
      return false;
    }
    
    this.log(`Applying ${data.terrainPatches.length} terrain patches from server`);
    
    // Apply each terrain patch
    for (const patch of data.terrainPatches) {
      this.log(`Applying terrain patch at (${patch.x}, ${patch.z}) with height ${patch.height} and radius ${patch.radius}`);
      // In a real implementation, this would modify the terrain geometry
    }
    
    return true;
  }

  /**
   * Request terrain deformation from server
   * @param {Object} position - The position to deform
   * @param {number} radius - The radius of deformation
   * @param {number} height - The height change
   * @returns {boolean} - Whether the request was successfully sent
   */
  requestTerrainDeformation(position, radius, height) {
    if (!position) {
      this.log('Invalid position for terrain deformation');
      return false;
    }
    
    this.log(`Requesting terrain deformation at (${position.x}, ${position.z}) with radius ${radius} and height ${height}`);
    
    // In a real implementation, this would send a request to the server
    // and apply a temporary client-side prediction
    
    // Send request to server
    if (this.game.networkManager && this.game.networkManager.sendTerrainDeformationRequest) {
      this.game.networkManager.sendTerrainDeformationRequest({
        position,
        radius,
        height
      });
    }
    
    return true;
  }

  /**
   * Handle server response to terrain modification
   * @param {Object} response - The server response
   * @returns {boolean} - Whether the modification was successfully applied
   */
  handleServerTerrainResponse(response) {
    if (!response) {
      this.log('Invalid server terrain response');
      return false;
    }
    
    if (response.success) {
      this.log(`Server confirmed terrain modification: ${response.requestId}`);
      // Apply confirmed modification
      return true;
    } else {
      this.log(`Server rejected terrain modification: ${response.reason}`);
      // Revert client-side prediction
      return false;
    }
  }

  /**
   * Request full terrain state from server
   * @returns {boolean} - Whether the request was successfully sent
   */
  requestFullTerrainState() {
    this.log('Requesting full terrain state from server');
    
    // In a real implementation, this would request the full terrain state from the server
    
    // Send request to server
    if (this.game.networkManager && this.game.networkManager.requestFullTerrainState) {
      this.game.networkManager.requestFullTerrainState();
    }
    
    return true;
  }

  /**
   * Apply full terrain state from server
   * @param {Object} data - The terrain state data
   * @returns {boolean} - Whether the state was successfully applied
   */
  applyFullTerrainState(data) {
    if (!data || !data.terrainState) {
      this.log('Invalid terrain state data');
      return false;
    }
    
    this.log('Applying full terrain state from server');
    
    // Apply terrain state
    // In a real implementation, this would replace the entire terrain
    
    return true;
  }
} 