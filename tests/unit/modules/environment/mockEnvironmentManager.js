/**
 * Mock implementation of EnvironmentManager for testing
 */

export class MockEnvironmentManager {
  constructor(game) {
    this.game = game;
    this.colliders = [];
    this.environmentEntities = [];
    this.initialized = false;
    this.environmentModels = new Map();
    this.terrainCollisionMesh = null;
    this.waterSurfaces = [];
    this.skybox = null;
    this.ambientLight = null;
    this.directionalLight = null;
    this.fogEnabled = true;
    this.fogParams = {
      color: 0xcccccc,
      near: 10,
      far: 100
    };
  }
  
  /**
   * Initialize the environment manager
   */
  async initialize() {
    this.log('Initializing environment manager');
    
    // Load environment models
    const { model, collision } = await this.loadEnvironmentModel('default-environment');
    
    // Add model to scene
    if (model && this.game.scene) {
      this.game.scene.add(model);
      this.environmentEntities.push(model);
    }
    
    // Add collision to colliders
    if (collision) {
      this.addCollider(collision);
    }
    
    // Set up lighting
    this.setupLighting();
    
    // Set up skybox
    this.setupSkybox();
    
    // Set up fog
    this.setupFog();
    
    this.initialized = true;
    return true;
  }
  
  /**
   * Load an environment model
   * @param {string} modelName - The name of the model to load
   * @returns {Promise<Object>} - The loaded model and collision data
   */
  async loadEnvironmentModel(modelName) {
    return new Promise((resolve) => {
      // Create mock model and collision
      const mockModel = {
        position: { set: jest.fn() },
        rotation: { set: jest.fn() },
        scale: { set: jest.fn() }
      };
      
      const mockCollision = {
        id: `${modelName}-collision`,
        position: { set: jest.fn() },
        rotation: { set: jest.fn() },
        scale: { set: jest.fn() }
      };
      
      // Store in environment models map
      this.environmentModels.set(modelName, {
        model: mockModel,
        collision: mockCollision
      });
      
      resolve({
        model: mockModel,
        collision: mockCollision
      });
    });
  }
  
  /**
   * Set up lighting for the environment
   */
  setupLighting() {
    // Create ambient light
    this.ambientLight = {
      intensity: 0.5,
      color: 0xffffff
    };
    
    // Create directional light
    this.directionalLight = {
      intensity: 0.8,
      color: 0xffffff,
      position: { set: jest.fn() },
      target: { position: { set: jest.fn() } },
      castShadow: true
    };
    
    // Add lights to scene
    if (this.game.scene) {
      this.game.scene.add(this.ambientLight);
      this.game.scene.add(this.directionalLight);
    }
  }
  
  /**
   * Set up skybox for the environment
   */
  setupSkybox() {
    // Create skybox
    this.skybox = {
      position: { set: jest.fn() },
      rotation: { set: jest.fn() },
      scale: { set: jest.fn() }
    };
    
    // Add skybox to scene
    if (this.game.scene) {
      this.game.scene.add(this.skybox);
    }
  }
  
  /**
   * Set up fog for the environment
   */
  setupFog() {
    if (this.fogEnabled && this.game.scene) {
      this.game.scene.fog = {
        color: this.fogParams.color,
        near: this.fogParams.near,
        far: this.fogParams.far
      };
    }
  }
  
  /**
   * Add a collider to the environment
   * @param {Object} collider - The collider to add
   */
  addCollider(collider) {
    this.colliders.push(collider);
  }
  
  /**
   * Get all colliders in the environment
   * @returns {Array} - Array of colliders
   */
  getColliders() {
    return this.colliders;
  }
  
  /**
   * Update the environment
   * @param {number} deltaTime - Time since last update
   */
  update(deltaTime) {
    if (!this.initialized) return;
    
    // Update environment entities if needed
    for (const entity of this.environmentEntities) {
      if (entity.update) {
        entity.update(deltaTime);
      }
    }
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    this.log('Cleaning up environment...');
    
    // Remove environment entities from scene
    if (this.game.scene) {
      for (const entity of this.environmentEntities) {
        this.game.scene.remove(entity);
      }
    }
    
    // Clear arrays
    this.environmentEntities = [];
    this.colliders = [];
    this.waterSurfaces = [];
    
    // Remove lights
    if (this.game.scene) {
      if (this.ambientLight) this.game.scene.remove(this.ambientLight);
      if (this.directionalLight) this.game.scene.remove(this.directionalLight);
      if (this.skybox) this.game.scene.remove(this.skybox);
    }
    
    // Clear fog
    if (this.game.scene) {
      this.game.scene.fog = null;
    }
    
    this.initialized = false;
  }
  
  /**
   * Log a message
   * @param {string} message - The message to log
   */
  log(message) {
    console.log(message);
  }
} 