/**
 * Client-side MonsterManager.js
 * 
 * Manages client-side monster rendering and interaction
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class MonsterManager {
    constructor(game) {
        this.game = game;
        this.monsters = new Map();
        this.monsterModels = {};
        this.initialized = false;
        this.healthCheckInterval = null;
    }
    
    /**
     * Initialize the monster manager
     */
    async init() {
        console.log('Initializing Monster Manager');
        
        // Only initialize once
        if (this.initialized) {
            console.log('Monster Manager already initialized');
            return;
        }
        
        // Pre-load the monster model
        await this.preloadMonsterModels();
        
        // We no longer need to set up the attack handler here
        // as it's now handled in Game.js
        
        // Start the health check interval
        this.startHealthCheck();
        
        this.initialized = true;
        console.log('Monster Manager initialized');
    }
    
    /**
     * Preload monster models
     */
    async preloadMonsterModels() {
        console.log('Preloading monster models');
        
        // Create a simple fallback model immediately
        // This ensures we always have at least a basic model available
        const fallbackGeometry = new THREE.BoxGeometry(1, 2, 1);
        const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0xFF0000 });
        const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
        
        // Store fallback under both uppercase and lowercase keys
        this.monsterModels['FALLBACK'] = fallbackMesh;
        this.monsterModels['fallback'] = fallbackMesh;
        
        try {
            const loader = new GLTFLoader();
            
            // Load the cerberus monster model
            const cerberusMonster = await new Promise((resolve, reject) => {
                loader.load(
                    '/models/cerberus.glb',
                    (gltf) => {
                        console.log('Successfully loaded cerberus model');
                        resolve(gltf);
                    },
                    (progress) => {
                        console.log(`Loading cerberus model: ${(progress.loaded / progress.total * 100).toFixed(2)}%`);
                    },
                    (error) => {
                        console.warn('Error loading cerberus model:', error);
                        // Return the fallback model instead of trying to load another model
                        reject(error);
                    }
                );
            });
            
            // Store the model for later use - make sure we're using the correct key
            this.monsterModels['BASIC'] = cerberusMonster.scene;
            
            // Also store it under lowercase key for case-insensitive matching
            this.monsterModels['basic'] = cerberusMonster.scene;
            
            console.log('Monster models preloaded. Available models:', Object.keys(this.monsterModels));
        } catch (error) {
            console.error('Error preloading monster models:', error);
            
            // Use the fallback model for BASIC type
            console.log('Using fallback monster model for BASIC type');
            this.monsterModels['BASIC'] = this.monsterModels['FALLBACK'];
            this.monsterModels['basic'] = this.monsterModels['FALLBACK'];
        }
    }
    
    /**
     * Set up the attack key handler
     * This method is no longer used, as the key handler is in Game.js
     */
    setupAttackHandler() {
        // We've moved this functionality to Game.js
        // to avoid duplicate key handlers
    }
    
    /**
     * This method is deprecated. Skills are now handled by SkillsManager
     * It's kept here for backwards compatibility but skills should go through SkillsManager
     */
    handleAttack() {
        console.warn('MonsterManager.handleAttack is deprecated. Use SkillsManager.useSkillOnMonster instead');
        // For backward compatibility, redirect to the skill system
        const target = this.game.targetingManager?.currentTarget;
        if (target && target.type === 'monster') {
            this.game.skillsManager?.useSkillOnMonster(target.id);
        }
    }
    
    /**
     * Process monster data received from server
     * @param {Array} monsterData - Array of monster data objects from server
     */
    processServerMonsters(monsterData) {
        if (!monsterData || !Array.isArray(monsterData)) {
            console.error('Invalid monster data received from server:', monsterData);
            return;
        }
        
        // Flag to track if we're processing a batch of new monsters
        const startTime = Date.now();
        
        // Track existing monsters to find ones that should be removed
        const existingMonsterIds = new Set(this.monsters.keys());
        
        // Process each monster from the server data
        monsterData.forEach(monster => {
            // Remove from existingMonsterIds set to mark as still valid
            existingMonsterIds.delete(monster.id);
            
            if (this.monsters.has(monster.id)) {
                // Update existing monster
                this.updateMonster(monster);
            } else {
                // Create new monster
                const newMonster = this.createMonster(monster);
                
                // Mark creation time to prevent initial health bar flickering
                if (newMonster && newMonster.mesh) {
                    newMonster.mesh.userData.creationTime = startTime;
                    newMonster.mesh.userData.lastDamageTime = startTime;
                }
            }
        });
        
        // Remove monsters that no longer exist
        existingMonsterIds.forEach(id => {
            this.removeMonster(id);
        });
    }
    
    /**
     * Create a new monster instance based on server data
     * @param {Object} monsterData - Monster data from server
     */
    createMonster(monsterData) {
        console.log(`Creating monster: ${monsterData.type} with ID ${monsterData.id}`);
        
        // Default to 'BASIC' type if the specified type doesn't exist
        let monsterType = monsterData.type || 'BASIC';
        
        // Get the model for this monster type
        let modelTemplate = this.monsterModels[monsterType];
        
        // Try case-insensitive match if not found
        if (!modelTemplate) {
            // Try lowercase version
            modelTemplate = this.monsterModels[monsterType.toLowerCase()];
        }
        
        // Fall back to BASIC if still not found
        if (!modelTemplate) {
            console.warn(`No model found for monster type: ${monsterType}, using BASIC type`);
            modelTemplate = this.monsterModels['BASIC'];
        }
        
        // If still no model, use FALLBACK
        if (!modelTemplate) {
            console.warn(`No BASIC model found, using FALLBACK model`);
            modelTemplate = this.monsterModels['FALLBACK'];
        }
        
        // If all else fails, create a simple box model on the fly
        if (!modelTemplate) {
            console.warn(`Creating emergency fallback model for monster ${monsterData.id}`);
            const fallbackGeometry = new THREE.BoxGeometry(1, 2, 1);
            const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0xFF0000 });
            modelTemplate = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
        }
        
        // Clone the model to create a new instance
        const monsterModel = modelTemplate.clone();
        
        // Set position, rotation and scale
        monsterModel.position.set(
            monsterData.position.x,
            monsterData.position.y + 2.0, // Raise the model to prevent it from sinking into the ground
            monsterData.position.z
        );
        
        // Adjust rotation for cerberus model
        monsterModel.rotation.set(0, monsterData.rotation.y || 0, 0);
        
        // Adjust scale for cerberus model - make it much larger
        const modelScale = 3.0 * (monsterData.scale || 1); // Increased to 3.0 for a much larger appearance
        monsterModel.scale.set(modelScale, modelScale, modelScale);
        
        // Add shadow casting/receiving
        monsterModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                // Improve material quality for cerberus model
                if (child.material) {
                    child.material = child.material.clone(); // Clone to avoid affecting other instances
                    child.material.metalness = 0.6;
                    child.material.roughness = 0.4;
                }
            }
        });
        
        // Create a health bar for the monster
        const healthBar = this.createHealthBar(monsterData);
        monsterModel.add(healthBar);
        
        // Store a reference to the health bar for updates
        monsterModel.userData.healthBar = healthBar;
        monsterModel.userData.healthBarCanvas = healthBar.userData.canvas;
        monsterModel.userData.healthBarContext = healthBar.userData.context;
        
        // Add to scene
        this.game.scene.add(monsterModel);
        
        // Store monster reference with health info
        const monster = {
            id: monsterData.id,
            type: monsterData.type,
            mesh: monsterModel,
            health: monsterData.health || 100,
            maxHealth: monsterData.maxHealth || 100,
            position: monsterModel.position,
            collisionRadius: monsterData.collisionRadius || 1
        };
        
        // Store in monsters Map
        this.monsters.set(monsterData.id, monster);
        
        // Initialize the health bar
        this.updateHealthBar(monster);
        
        console.log(`Monster created with health: ${monster.health}/${monster.maxHealth}, health bar initialized`);
        
        return monster;
    }
    
    /**
     * Create a health bar for a monster
     */
    createHealthBar(monsterData) {
        // Create canvas for health bar
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 8;
        const context = canvas.getContext('2d');
        
        // Create sprite for health bar
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            sizeAttenuation: true, // Make the sprite maintain consistent size regardless of distance
            depthTest: false // Ensure it renders on top
        });
        
        const healthBarSprite = new THREE.Sprite(material);
        
        // Set size and position to match player health bars
        const healthBarWidth = 0.7;  // Same as player health bar
        const healthBarHeight = 0.08; // Same as player health bar
        healthBarSprite.scale.set(healthBarWidth, healthBarHeight, 1);
        
        // Position at the current optimal position (y=1.0)
        healthBarSprite.position.set(0, 1.0, 0);
        
        // Store references for updating
        healthBarSprite.userData.canvas = canvas;
        healthBarSprite.userData.context = context;
        
        return healthBarSprite;
    }
    
    /**
     * Update an existing monster with new data from server
     * @param {Object} monsterData - Updated monster data
     */
    updateMonster(monsterData) {
        const monster = this.monsters.get(monsterData.id);
        if (!monster) {
            console.warn(`Monster ${monsterData.id} not found for update`);
            return;
        }
        
        // Update position
        if (monsterData.position) {
            monster.mesh.position.set(
                monsterData.position.x,
                monsterData.position.y + 2.0, // Keep the height adjustment during updates
                monsterData.position.z
            );
        }
        
        // Update rotation
        if (monsterData.rotation) {
            monster.mesh.rotation.set(0, monsterData.rotation.y || 0, 0);
        }
        
        // Update health
        if (monsterData.health !== undefined) {
            // Store previous health for damage time tracking
            const prevHealth = monster.health;
            
            // CRITICAL FIX: Track this update with a unique ID to prevent duplicate updates
            const updateId = `${monsterData.id}-${monsterData.health}-${Date.now()}`;
            monster.lastHealthUpdateId = updateId;
            
            // Update health values
            monster.health = monsterData.health;
            monster.maxHealth = monsterData.maxHealth || monster.maxHealth;
            
            // Store server values for reference
            monster.serverHealth = monsterData.health;
            monster.serverMaxHealth = monsterData.maxHealth || monster.maxHealth;
            
            // Record the time of this server update
            monster.lastServerUpdateTime = Date.now();
            
            // If this was a damage event (health decreased), record it
            if (monsterData.health < prevHealth) {
                // Only log significant health changes
                if (Math.abs(prevHealth - monsterData.health) > 5) {
                    console.log(`Monster ${monsterData.id} health changed from ${prevHealth} to ${monsterData.health}`);
                }
                monster.mesh.userData.lastDamageTime = Date.now();
            }
            
            // Update the health bar, passing the update ID to prevent duplicates
            this.updateHealthBar(monster, updateId);
        }
    }
    
    /**
     * Update the visual health bar for a monster
     */
    updateHealthBar(monster, updateId) {
        if (!monster || !monster.mesh) return;
        
        const healthBarSprite = monster.mesh.userData.healthBar;
        if (!healthBarSprite) return;
        
        const canvas = healthBarSprite.userData.canvas;
        const context = healthBarSprite.userData.context;
        
        if (!canvas || !context) {
            console.warn('Missing canvas or context for monster health bar');
            return;
        }
        
        // CRITICAL FIX: Check if we're in a locked state to prevent flickering
        if (monster.mesh.userData.healthLocked) {
            // If we have an update ID and it matches the one that locked the health bar, 
            // this is a duplicate update - skip it
            if (updateId && monster.mesh.userData.lastHealthUpdateId === updateId) {
                return;
            }
            
            // If we're locked but this is a different update, proceed silently
            if (!updateId) {
                return; // No update ID and locked, so skip
            }
            
            // Otherwise, allow the update to proceed (different update ID)
        }
        
        // Store current health for next comparison
        monster.mesh.userData.lastHealth = monster.health;
        
        // Track the update ID that's being processed
        if (updateId) {
            monster.mesh.userData.lastHealthUpdateId = updateId;
        }
        
        // Calculate health percentage
        const healthPercent = Math.max(0, Math.min(1, monster.health / monster.maxHealth));
        
        // Only update for significant changes to prevent flickering
        if (monster.mesh.userData.lastHealthPercent !== undefined) {
            const diff = Math.abs(monster.mesh.userData.lastHealthPercent - healthPercent);
            
            // Different thresholds for different scenarios
            const isDamageUpdate = monster.health < (monster.mesh.userData.lastHealth || monster.maxHealth);
            const isHealing = monster.health > (monster.mesh.userData.lastHealth || 0);
            
            // For most updates, use 7.5% threshold
            const threshold = 0.075;
            
            // Only update if the change exceeds our threshold (skip for explicitly tracked updates)
            if (diff <= threshold && !updateId) {
                // Skip update for minor changes
                return;
            }
            
            // Special case: Check if this is a targeted monster in combat
            const currentTarget = this.game.targetingManager?.currentTarget;
            const isTargeted = currentTarget && 
                              currentTarget.type === 'monster' && 
                              currentTarget.id === monster.id;
                              
            // If this is the targeted monster in combat, ensure we don't update too frequently
            if (isTargeted && !updateId) { // Skip for explicitly tracked updates
                const now = Date.now();
                const lastUpdate = monster.mesh.userData.lastHealthBarUpdate || 0;
                
                // Limit updates to once every 300ms during combat for smoothness
                if (now - lastUpdate < 300) {
                    return;
                }
                
                // Track this update time
                monster.mesh.userData.lastHealthBarUpdate = now;
            }
        }
        
        // Store current health percentage for future comparison
        monster.mesh.userData.lastHealthPercent = healthPercent;
        
        // CRITICAL FIX: Lock health bar updates briefly to prevent flickering
        monster.mesh.userData.healthLocked = true;
        
        // Clear the canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw the background (dark backing) - same as player health bar
        context.fillStyle = '#222222';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Use red for health bar to match player health bar
        context.fillStyle = '#ff0000';
        const healthWidth = Math.floor(canvas.width * healthPercent);
        context.fillRect(0, 0, healthWidth, canvas.height);
        
        // Update the texture
        if (healthBarSprite.material && healthBarSprite.material.map) {
            healthBarSprite.material.map.needsUpdate = true;
        }
        
        // Unlock after a short delay to allow for new legitimate updates
        // Use a longer delay for targeted monsters to prevent flickering during combat
        const currentTarget = this.game.targetingManager?.currentTarget;
        const isTargeted = currentTarget && 
                          currentTarget.type === 'monster' && 
                          currentTarget.id === monster.id;
        
        // Automatically unlock when a new update comes in
        const unlockDelay = 3000; // Much longer delay to ensure we're not getting double updates
        
        setTimeout(() => {
            // Only unlock if we're still processing the same update
            if (!updateId || monster.mesh.userData.lastHealthUpdateId === updateId) {
                monster.mesh.userData.healthLocked = false;
            }
        }, unlockDelay);
    }
    
    /**
     * Process monster update data from server
     * @param {Object} updateData - Monster update data
     */
    processMonsterUpdate(updateData) {
        const monsterId = updateData.monsterId;
        if (!monsterId) return;
        
        const monster = this.monsters.get(monsterId);
        if (!monster) {
            console.warn(`Monster ${monsterId} not found for update`);
            return;
        }
        
        // Update health if provided - always use server values for authoritative state
        if (updateData.health !== undefined) {
            // Store previous health for logging
            const prevHealth = monster.health;
            
            // CRITICAL FIX: Generate a unique update ID to prevent duplicate updates
            const updateId = `${monsterId}-${updateData.health}-${Date.now()}`;
            
            // If this is the same health value that was just updated, skip to prevent double updates
            if (monster.health === updateData.health && 
                monster.lastHealthUpdateId && 
                Date.now() - monster.lastServerUpdateTime < 1000) {
                // Skip without logging
                return;
            }
            
            // Track this update
            monster.lastHealthUpdateId = updateId;
            
            // Store server values for reference
            monster.serverHealth = updateData.health;
            monster.serverMaxHealth = updateData.maxHealth || monster.maxHealth;
            
            // Record the time of this server health update
            monster.lastServerUpdateTime = Date.now();
            
            // Normal case - just apply the update directly
            // Apply the health change immediately
            monster.health = updateData.health;
            monster.maxHealth = updateData.maxHealth || monster.maxHealth;
            
            // Log significant health changes only for damage (important for debugging)
            if (monster.health < prevHealth && Math.abs(prevHealth - monster.health) > 5) {
                console.log(`Monster ${monsterId} health changed from ${prevHealth} to ${monster.health} (server authority)`);
                
                // If this is a damage event (health decreased), record it
                monster.mesh.userData.lastDamageTime = Date.now();
            }
            
            // Update the health bar, passing the update ID
            this.updateHealthBar(monster, updateId);
            
            // If this monster is currently targeted, update the target display
            const currentTarget = this.game.targetingManager?.currentTarget;
            if (currentTarget && currentTarget.type === 'monster' && currentTarget.id === monsterId) {
                if (monster.health <= 0) {
                    // When monster dies, immediately clear the target
                    this.game.targetingManager?.clearTarget();
                } else {
                    // Update the target display with new health
                    this.game.uiManager?.updateTargetDisplay(
                        `${monster.type} Monster`,
                        monster.health,
                        monster.maxHealth,
                        'monster',
                        1
                    );
                }
            }
        }
        
        // Handle monster death - server authoritative
        if (updateData.health <= 0 || updateData.isAlive === false) {
            // Keep the monster in the collection but visually indicate it's dead
            this.handleMonsterDeath(monsterId);
        }
    }
    
    /**
     * Handle monster death visually
     */
    handleMonsterDeath(monsterId) {
        const monster = this.monsters.get(monsterId);
        if (!monster) return;
        
        console.log(`Handling monster death: ${monsterId}`);
        
        // Set health to zero - server is authoritative
        monster.health = 0;
        monster.serverHealth = 0;
        
        // Update health bar to show zero health
        this.updateHealthBar(monster);
        
        // Visual indication of death - make the monster semi-transparent
        monster.mesh.traverse(child => {
            if (child.isMesh && child.material) {
                // Create a clone of the material to avoid affecting other instances
                if (Array.isArray(child.material)) {
                    child.material = child.material.map(m => m.clone());
                    child.material.forEach(m => {
                        m.transparent = true;
                        m.opacity = 0.5;
                    });
                } else {
                    child.material = child.material.clone();
                    child.material.transparent = true;
                    child.material.opacity = 0.5;
                }
            }
        });
        
        // Make health bar fade out too
        const healthBar = monster.mesh.userData.healthBar;
        if (healthBar && healthBar.material) {
            healthBar.material.opacity = 0.5;
        }
        
        // Schedule removal after fade animation - only on server confirmation
        setTimeout(() => {
            this.removeMonster(monsterId);
        }, 2000);
    }
    
    /**
     * Remove a monster from the scene
     */
    removeMonster(monsterId) {
        const monster = this.monsters.get(monsterId);
        if (!monster) return;
        
        console.log(`Removing monster: ${monsterId}`);
        
        // Remove from scene
        this.game.scene.remove(monster.mesh);
        
        // Remove from collection
        this.monsters.delete(monsterId);
    }
    
    /**
     * Get a monster by ID
     */
    getMonsterById(id) {
        return this.monsters.get(id);
    }
    
    /**
     * Update all monsters (billboarding health bars, etc.)
     */
    update(delta) {
        // Update each monster
        this.monsters.forEach(monster => {
            // Skip if monster has no mesh
            if (!monster.mesh) return;
            
            // Handle sprite-based health bar - sprites automatically face the camera
            const healthBar = monster.mesh.userData.healthBar;
            if (healthBar) {
                // Ensure the health bar is visible
                healthBar.visible = true;
                if (healthBar.material) {
                    healthBar.material.visible = true;
                }
            }
        });
    }
    
    /**
     * Clean up resources
     */
    cleanup() {
        console.log('Cleaning up Monster Manager');
        
        // Stop the health check interval
        this.stopHealthCheck();
        
        // Clear monster models
        this.monsterModels = {};
        
        // Remove all monsters from the scene
        this.removeAllMonsters();
        
        // Reset initialized flag
        this.initialized = false;
    }
    
    /**
     * Start a periodic health check to reconcile monster health values
     */
    startHealthCheck() {
        // Clear any existing interval
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        // We're disabling automatic health reconciliation for monsters
        // because it's causing the health bar flickering issue.
        // Server updates already provide authoritative health values.
        
        // Still set up a minimal interval just to verify monsters are properly
        // initialized and to log any significant discrepancies
        this.healthCheckInterval = setInterval(() => {
            // Check all monsters
            this.monsters.forEach((monster, monsterId) => {
                // Skip if monster doesn't have stored server values
                if (monster.serverHealth === undefined) {
                    return;
                }
                
                // Skip if monster mesh doesn't exist 
                if (!monster.mesh || !monster.mesh.userData) {
                    return;
                }
                
                // Skip monsters with locked health bars
                if (monster.mesh.userData.healthLocked) {
                    return;
                }
                
                // Skip targeted monsters
                const currentTarget = this.game.targetingManager?.currentTarget;
                if (currentTarget && currentTarget.type === 'monster' && currentTarget.id === monsterId) {
                    return;
                }
                
                // Only log significant discrepancies without correcting them
                if (monster.health !== monster.serverHealth) {
                    const diff = Math.abs(monster.health - monster.serverHealth);
                    const diffPercent = diff / monster.serverMaxHealth;
                    
                    if (diffPercent > 0.2) { // Only log very large discrepancies (20% instead of 10%)
                        console.log(`Health discrepancy for monster ${monsterId}: client=${monster.health}, server=${monster.serverHealth}`);
                    }
                }
            });
        }, 10000); // Check less frequently - just monitoring, not correcting
    }
    
    /**
     * Stop the health check interval
     */
    stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }
}

export default MonsterManager; 