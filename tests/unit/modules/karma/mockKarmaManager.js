/**
 * Mock implementation of KarmaManager for testing
 */

export class MockKarmaManager {
  constructor(game) {
    this.game = game;
    this.karma = 50; // Default karma value (neutral)
    this.maxKarma = 100;
    this.minKarma = 0;
    this.karmaEffects = new Map();
    this.karmaAura = null;
    this.karmaIndicator = null;
    this.initialized = false;
    this.karmaChangeListeners = [];
    this.karmaThresholds = {
      good: 75,
      neutral: 40,
      evil: 25
    };
    this.karmaColors = {
      good: { r: 0.2, g: 0.8, b: 1.0 },
      neutral: { r: 0.8, g: 0.8, b: 0.8 },
      evil: { r: 1.0, g: 0.2, b: 0.2 }
    };
  }
  
  /**
   * Initialize the karma manager
   */
  init() {
    this.log('Initializing Karma Manager');
    
    // Create karma aura
    this.createKarmaAura();
    
    // Create karma indicator
    this.createKarmaIndicator();
    
    // Set initial karma state
    this.updateKarmaVisuals();
    
    this.initialized = true;
    return true;
  }
  
  /**
   * Create the visual karma aura
   */
  createKarmaAura() {
    this.karmaAura = {
      position: { set: jest.fn() },
      scale: { set: jest.fn() },
      material: { 
        color: { set: jest.fn() },
        opacity: 0.5,
        transparent: true
      },
      visible: true
    };
    
    // Add to scene if available
    if (this.game.scene) {
      this.game.scene.add(this.karmaAura);
    }
  }
  
  /**
   * Create the karma indicator UI element
   */
  createKarmaIndicator() {
    // Create a simple mock object instead of a DOM element
    this.karmaIndicator = {
      style: {},
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
        contains: jest.fn()
      },
      innerHTML: '',
      id: 'karma-indicator',
      parentNode: {
        removeChild: jest.fn()
      }
    };
    
    // No need to actually append to document in tests
  }
  
  /**
   * Update karma visuals based on current karma value
   */
  updateKarmaVisuals() {
    // Update aura color and size
    if (this.karmaAura) {
      const karmaState = this.getKarmaState();
      const color = this.karmaColors[karmaState];
      
      if (this.karmaAura.material && this.karmaAura.material.color) {
        this.karmaAura.material.color.set(color);
      }
      
      // Scale aura based on karma
      const scale = 1 + (this.karma / this.maxKarma) * 0.5;
      this.karmaAura.scale.set(scale, scale, scale);
    }
    
    // Update indicator text
    if (this.karmaIndicator) {
      this.karmaIndicator.innerHTML = `Karma: ${this.karma}`;
    }
  }
  
  /**
   * Get the current karma state (good, neutral, evil)
   * @returns {string} The karma state
   */
  getKarmaState() {
    if (this.karma >= this.karmaThresholds.good) {
      return 'good';
    } else if (this.karma <= this.karmaThresholds.evil) {
      return 'evil';
    } else {
      return 'neutral';
    }
  }
  
  /**
   * Adjust karma by the specified amount
   * @param {number} amount - The amount to adjust karma by
   * @param {string} reason - The reason for the karma change
   */
  adjustKarma(amount, reason = '') {
    const oldKarma = this.karma;
    
    // Calculate new karma value
    this.karma = Math.min(Math.max(this.karma + amount, this.minKarma), this.maxKarma);
    
    // Log the change
    this.log(`Local karma changed from ${oldKarma} to ${this.karma}`);
    
    // Update visuals
    this.updateKarmaVisuals();
    
    // Notify listeners
    this.notifyKarmaChangeListeners(oldKarma, this.karma, reason);
    
    // Apply karma effects
    this.applyKarmaEffects();
    
    return this.karma;
  }
  
  /**
   * Set karma to a specific value
   * @param {number} value - The value to set karma to
   * @param {string} reason - The reason for the karma change
   */
  setKarma(value, reason = '') {
    const oldKarma = this.karma;
    
    // Set new karma value
    this.karma = Math.min(Math.max(value, this.minKarma), this.maxKarma);
    
    // Log the change
    this.log(`Karma set from ${oldKarma} to ${this.karma}`);
    
    // Update visuals
    this.updateKarmaVisuals();
    
    // Notify listeners
    this.notifyKarmaChangeListeners(oldKarma, this.karma, reason);
    
    // Apply karma effects
    this.applyKarmaEffects();
    
    return this.karma;
  }
  
  /**
   * Apply effects based on current karma
   */
  applyKarmaEffects() {
    const karmaState = this.getKarmaState();
    
    // Apply effects based on karma state
    switch (karmaState) {
      case 'good':
        // Apply good karma effects
        break;
      case 'evil':
        // Apply evil karma effects
        break;
      default:
        // Apply neutral karma effects
        break;
    }
  }
  
  /**
   * Add a karma change listener
   * @param {Function} listener - The listener function
   */
  addKarmaChangeListener(listener) {
    if (typeof listener === 'function') {
      this.karmaChangeListeners.push(listener);
    }
  }
  
  /**
   * Remove a karma change listener
   * @param {Function} listener - The listener function to remove
   */
  removeKarmaChangeListener(listener) {
    const index = this.karmaChangeListeners.indexOf(listener);
    if (index !== -1) {
      this.karmaChangeListeners.splice(index, 1);
    }
  }
  
  /**
   * Notify all karma change listeners
   * @param {number} oldValue - The old karma value
   * @param {number} newValue - The new karma value
   * @param {string} reason - The reason for the change
   */
  notifyKarmaChangeListeners(oldValue, newValue, reason) {
    for (const listener of this.karmaChangeListeners) {
      listener(oldValue, newValue, reason);
    }
  }
  
  /**
   * Update the karma manager
   * @param {number} deltaTime - Time since last update
   */
  update(deltaTime) {
    if (!this.initialized) return;
    
    // Update karma aura position to follow player
    if (this.karmaAura && this.game.playerManager && this.game.playerManager.localPlayer) {
      const playerPos = this.game.playerManager.localPlayer.position;
      this.karmaAura.position.set(playerPos.x, playerPos.y, playerPos.z);
    }
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    // Remove karma aura from scene
    if (this.karmaAura && this.game.scene) {
      this.game.scene.remove(this.karmaAura);
    }
    
    // Clear listeners
    this.karmaChangeListeners = [];
    
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