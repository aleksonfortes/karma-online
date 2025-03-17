/**
 * Mock implementation of SkillsManager for testing
 */

export class MockSkillsManager {
  constructor(game) {
    this.game = game;
    this.skills = {
      martial_arts: {
        id: 'martial_arts',
        name: 'Martial Arts',
        description: 'A basic melee attack',
        cooldown: 2000,
        range: 2,
        damage: 10,
        lastUsed: 0,
        animation: 'attack',
        type: 'physical',
        icon: 'martial_arts.png'
      },
      fireball: {
        id: 'fireball',
        name: 'Fireball',
        description: 'A ranged fire attack',
        cooldown: 5000,
        range: 10,
        damage: 20,
        lastUsed: 0,
        animation: 'cast',
        type: 'magical',
        icon: 'fireball.png'
      },
      heal: {
        id: 'heal',
        name: 'Heal',
        description: 'Restore health to self or ally',
        cooldown: 8000,
        range: 5,
        healing: 30,
        lastUsed: 0,
        animation: 'cast',
        type: 'magical',
        icon: 'heal.png'
      }
    };
    this.initialized = false;
    this.activeEffects = new Set();
  }
  
  /**
   * Initialize the skills manager
   */
  init() {
    this.log('Initializing SkillsManager');
    
    // Ensure game has activeSkills set
    if (!this.game.activeSkills) {
      this.game.activeSkills = new Set();
    }
    
    this.initialized = true;
    return true;
  }
  
  /**
   * Add a skill to the player's available skills
   * @param {string} skillId - The ID of the skill to add
   */
  addSkill(skillId) {
    if (this.skills[skillId]) {
      this.log(`Added skill: ${skillId}`);
      return true;
    }
    return false;
  }
  
  /**
   * Remove a skill from the player's available skills
   * @param {string} skillId - The ID of the skill to remove
   */
  removeSkill(skillId) {
    if (this.skills[skillId]) {
      this.log(`Removed skill: ${skillId}`);
      return true;
    }
    return false;
  }
  
  /**
   * Check if a skill is on cooldown
   * @param {string} skillId - The ID of the skill to check
   * @returns {boolean} - Whether the skill is on cooldown
   */
  isOnCooldown(skillId) {
    const skill = this.skills[skillId];
    if (!skill) return false;
    
    const now = Date.now();
    const timeSinceLastUse = now - skill.lastUsed;
    return timeSinceLastUse < skill.cooldown;
  }
  
  /**
   * Get the cooldown percentage for a skill
   * @param {string} skillId - The ID of the skill to check
   * @returns {number} - The cooldown percentage (0-1)
   */
  getCooldownPercent(skillId) {
    const skill = this.skills[skillId];
    if (!skill) return 0;
    
    const now = Date.now();
    const timeSinceLastUse = now - skill.lastUsed;
    
    if (timeSinceLastUse >= skill.cooldown) {
      return 0; // Not on cooldown
    }
    
    return timeSinceLastUse / skill.cooldown;
  }
  
  /**
   * Check if a target is in range for a skill
   * @param {string} targetId - The ID of the target
   * @param {string} skillId - The ID of the skill
   * @returns {boolean} - Whether the target is in range
   */
  isTargetInRange(targetId, skillId) {
    const skill = this.skills[skillId];
    if (!skill) return false;
    
    // Get target and player positions
    const target = this.game.playerManager.getPlayerById(targetId);
    if (!target) return false;
    
    const player = this.game.playerManager.localPlayer;
    if (!player) return false;
    
    // Calculate distance
    const distance = 2; // Mock distance for testing
    
    return distance <= skill.range;
  }
  
  /**
   * Use a skill on the current target
   * @param {string} skillId - The ID of the skill to use
   * @param {string} targetId - The ID of the target
   * @returns {boolean} - Whether the skill was used successfully
   */
  useSkill(skillId, targetId) {
    const skill = this.skills[skillId];
    if (!skill) {
      this.log(`Skill not found: ${skillId}`);
      return false;
    }
    
    // Check if skill is on cooldown
    if (this.isOnCooldown(skillId)) {
      this.log(`Skill on cooldown: ${skillId}`);
      return false;
    }
    
    // Get current target if not provided
    if (!targetId) {
      targetId = this.game.targetingManager.getTargetId();
    }
    
    if (!targetId) {
      this.log(`No target selected for skill: ${skillId}`);
      return false;
    }
    
    // Check if target is in range
    if (!this.isTargetInRange(targetId, skillId)) {
      this.log(`Target out of range for skill: ${skillId}`);
      return false;
    }
    
    // Set skill as used
    skill.lastUsed = Date.now();
    
    // Set player animation
    this.game.playerManager.setPlayerAnimationState(skill.animation);
    
    // Send skill use to server for validation
    if (this.game.networkManager && this.game.networkManager.validateActionWithServer) {
      this.game.networkManager.validateActionWithServer({
        type: 'skill_use',
        skillId,
        targetId,
        position: this.game.playerManager.localPlayer.position
      });
    } else if (this.game.networkManager && this.game.networkManager.useSkill) {
      // Fallback to old method for backward compatibility
      this.game.networkManager.useSkill(targetId, skillId);
    }
    
    this.log(`Used skill ${skillId} on target ${targetId}`);
    
    // Create skill effect
    const sourcePosition = this.game.playerManager.localPlayer.position;
    const targetPosition = this.game.playerManager.getPlayerById(targetId).position;
    this.createSkillEffect(skillId, sourcePosition, targetPosition);
    
    return true;
  }
  
  /**
   * Create a visual effect for a skill
   * @param {string} skillId - The ID of the skill
   * @param {Object} sourcePosition - The position of the source
   * @param {Object} targetPosition - The position of the target
   * @returns {Object} - The created effect
   */
  createSkillEffect(skillId, sourcePosition, targetPosition) {
    let effect;
    
    switch (skillId) {
      case 'martial_arts':
        effect = this.createMartialArtsEffect(sourcePosition, targetPosition);
        break;
      case 'fireball':
        effect = this.createFireballEffect(sourcePosition, targetPosition);
        break;
      case 'heal':
        effect = this.createHealEffect(sourcePosition, targetPosition);
        break;
      default:
        this.log(`No effect for skill: ${skillId}`);
        return null;
    }
    
    if (effect) {
      // Add to scene and active skills
      if (this.game.scene) {
        this.game.scene.add(effect);
      }
      
      this.game.activeSkills.add(effect);
      this.log(`Created effect for skill: ${skillId}`);
    }
    
    return effect;
  }
  
  /**
   * Create a martial arts effect
   * @param {Object} sourcePosition - The position of the source
   * @param {Object} targetPosition - The position of the target
   * @returns {Object} - The created effect
   */
  createMartialArtsEffect(sourcePosition, targetPosition) {
    return {
      userData: { 
        lifetime: 0, 
        maxLifetime: 500,
        type: 'martial_arts'
      },
      position: { 
        copy: jest.fn(),
        set: jest.fn()
      },
      scale: { set: jest.fn() },
      material: { 
        opacity: 1,
        needsUpdate: false
      },
      dispose: jest.fn(),
      update: jest.fn()
    };
  }
  
  /**
   * Create a fireball effect
   * @param {Object} sourcePosition - The position of the source
   * @param {Object} targetPosition - The position of the target
   * @returns {Object} - The created effect
   */
  createFireballEffect(sourcePosition, targetPosition) {
    return {
      userData: { 
        lifetime: 0, 
        maxLifetime: 1000,
        type: 'fireball'
      },
      position: { 
        copy: jest.fn(),
        set: jest.fn()
      },
      scale: { set: jest.fn() },
      material: { 
        opacity: 1,
        needsUpdate: false
      },
      dispose: jest.fn(),
      update: jest.fn()
    };
  }
  
  /**
   * Create a heal effect
   * @param {Object} sourcePosition - The position of the source
   * @param {Object} targetPosition - The position of the target
   * @returns {Object} - The created effect
   */
  createHealEffect(sourcePosition, targetPosition) {
    return {
      userData: { 
        lifetime: 0, 
        maxLifetime: 1500,
        type: 'heal'
      },
      position: { 
        copy: jest.fn(),
        set: jest.fn()
      },
      scale: { set: jest.fn() },
      material: { 
        opacity: 1,
        needsUpdate: false
      },
      dispose: jest.fn(),
      update: jest.fn()
    };
  }
  
  /**
   * Remove an effect
   * @param {Object} effect - The effect to remove
   */
  removeEffect(effect) {
    if (effect) {
      // Remove from scene
      if (this.game.scene) {
        this.game.scene.remove(effect);
      }
      
      // Dispose resources
      if (effect.dispose) {
        effect.dispose();
      }
      
      // Remove from active skills
      this.game.activeSkills.delete(effect);
      
      this.log(`Removed effect: ${effect.userData?.type || 'unknown'}`);
    }
  }
  
  /**
   * Update active effects
   * @param {number} deltaTime - Time since last update in milliseconds
   */
  updateActiveEffects(deltaTime) {
    // Convert delta to milliseconds
    const deltaMsec = deltaTime * 1000;
    
    // Update each active effect
    for (const effect of this.game.activeSkills) {
      // Update lifetime
      effect.userData.lifetime += deltaMsec;
      
      // Check if effect should be removed
      if (effect.userData.lifetime >= effect.userData.maxLifetime) {
        this.removeEffect(effect);
        continue;
      }
      
      // Update effect properties
      if (effect.update) {
        effect.update(deltaTime);
      } else {
        // Default update behavior
        const progress = effect.userData.lifetime / effect.userData.maxLifetime;
        const scale = 1 + progress;
        
        if (effect.scale && effect.scale.set) {
          effect.scale.set(scale, scale, scale);
        }
        
        if (effect.material) {
          effect.material.opacity = 1 - progress;
          effect.material.needsUpdate = true;
        }
      }
    }
  }
  
  /**
   * Update the skills manager
   * @param {number} deltaTime - Time since last update in seconds
   */
  update(deltaTime) {
    if (!this.initialized) return;
    
    // Update active effects
    this.updateActiveEffects(deltaTime);
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    this.log('Cleaning up SkillsManager');
    
    // Remove all active effects
    for (const effect of this.game.activeSkills) {
      this.removeEffect(effect);
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
  
  /**
   * Handle server response to skill use
   * @param {Object} response - The server response
   * @returns {boolean} - Whether the skill was successfully applied
   */
  handleServerSkillResponse(response) {
    if (!response) return false;
    
    if (response.success) {
      this.log(`Server confirmed skill ${response.skillId} on target ${response.targetId}`);
      // Apply confirmed damage or effects
      return true;
    } else {
      this.log(`Server rejected skill ${response.skillId}: ${response.reason}`);
      // Handle rejection (e.g., revert any client-side predictions)
      return false;
    }
  }
  
  /**
   * Handle remote skill effect from another player
   * @param {Object} data - The skill effect data
   * @returns {boolean} - Whether the effect was successfully applied
   */
  handleRemoteSkillEffect(data) {
    if (!data || !data.sourceId || !data.targetId || !data.skillId) {
      this.log('Invalid remote skill effect data');
      return false;
    }
    
    // Get player positions
    const source = this.game.playerManager.getPlayerById(data.sourceId);
    const target = this.game.playerManager.getPlayerById(data.targetId);
    
    if (!source || !target) {
      this.log(`Could not find players for remote skill effect: ${data.sourceId} -> ${data.targetId}`);
      return false;
    }
    
    // Create visual effect
    this.log(`Creating remote skill effect: ${data.skillId} from ${data.sourceId} to ${data.targetId}`);
    this.createSkillEffect(data.skillId, source.position, target.position);
    
    return true;
  }
  
  /**
   * Get karma variant of a skill
   * @param {string} skillId - The base skill ID
   * @returns {string} - The karma variant skill ID
   */
  getKarmaVariantSkill(skillId) {
    const path = this.game.karmaManager?.chosenPath || 'neutral';
    
    // Apply karma variants
    if (path === 'light' && skillId === 'fireball') {
      return 'light_fireball';
    } else if (path === 'dark' && skillId === 'fireball') {
      return 'dark_fireball';
    }
    
    return skillId;
  }
  
  /**
   * Create a dark fireball effect
   * @param {Object} sourcePosition - The position of the source
   * @param {Object} targetPosition - The position of the target
   * @returns {Object} - The created effect
   */
  createDarkFireballEffect(sourcePosition, targetPosition) {
    return {
      userData: { 
        lifetime: 0, 
        maxLifetime: 1200,
        type: 'dark_fireball'
      },
      position: { 
        copy: jest.fn(),
        set: jest.fn()
      },
      scale: { set: jest.fn() },
      material: { 
        opacity: 1,
        needsUpdate: false,
        color: 0x330022 // Dark purple color
      },
      dispose: jest.fn(),
      update: jest.fn()
    };
  }
  
  /**
   * Create a light fireball effect
   * @param {Object} sourcePosition - The position of the source
   * @param {Object} targetPosition - The position of the target
   * @returns {Object} - The created effect
   */
  createLightFireballEffect(sourcePosition, targetPosition) {
    return {
      userData: { 
        lifetime: 0, 
        maxLifetime: 1200,
        type: 'light_fireball'
      },
      position: { 
        copy: jest.fn(),
        set: jest.fn()
      },
      scale: { set: jest.fn() },
      material: { 
        opacity: 1,
        needsUpdate: false,
        color: 0xFFFFAA // Bright yellow color
      },
      dispose: jest.fn(),
      update: jest.fn()
    };
  }
} 