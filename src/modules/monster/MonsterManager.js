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
        
        // Store the current position
        const currentPosition = {
            x: monster.mesh.position.x,
            y: monster.mesh.position.y,
            z: monster.mesh.position.z
        };
        
        // Calculate position difference to detect large changes
        let positionChanged = false;
        if (monsterData.position) {
            const dx = monsterData.position.x - currentPosition.x;
            const dy = (monsterData.position.y + 2.0) - currentPosition.y; // Include the height adjustment
            const dz = monsterData.position.z - currentPosition.z;
            const distanceDelta = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            // Only update position if the change is significant
            // This prevents small server corrections from causing visual glitches
            if (distanceDelta > 0.1) {
                positionChanged = true;
                
                // For large changes, use linear interpolation to smooth transition
                if (distanceDelta > 1.0 && !monster.mesh.userData.teleporting) {
                    // Set a flag to track that this is a deliberate position update
                    monster.mesh.userData.updatingPosition = true;
                    
                    // Calculate new position with smoothing 
                    monster.mesh.position.set(
                        monsterData.position.x,
                        monsterData.position.y + 2.0, // Keep height adjustment consistent
                        monsterData.position.z
                    );
                } else {
                    // Normal position update for small changes
                    monster.mesh.position.set(
                        monsterData.position.x,
                        monsterData.position.y + 2.0, // Keep height adjustment consistent
                        monsterData.position.z
                    );
                }
                
                // Update the monster's stored position
                monster.position = monster.mesh.position.clone();
            }
        }
        
        // Update rotation
        if (monsterData.rotation) {
            monster.mesh.rotation.set(0, monsterData.rotation.y || 0, 0);
        }
        
        // Update health and health bar
        if (monsterData.health !== undefined) {
            monster.health = monsterData.health;
            monster.maxHealth = monsterData.maxHealth || monster.maxHealth;
            this.updateHealthBar(monster);
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
        
        // Calculate health percentage 
        const healthPercent = Math.max(0, Math.min(1, monster.health / monster.maxHealth));
        
        // Only update for significant changes to prevent flickering
        if (monster.mesh.userData.lastHealthPercent !== undefined) {
            const diff = Math.abs(monster.mesh.userData.lastHealthPercent - healthPercent);
            
            // Only update if the change exceeds our threshold (skip for explicitly tracked updates)
            if (diff <= 0.05 && !updateId) {
                // Skip update for minor changes
                return;
            }
        }
        
        // Store current health percentage for future comparison
        monster.mesh.userData.lastHealthPercent = healthPercent;
        
        // Clear the canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw the background (dark backing) - same as player health bar
        context.fillStyle = '#222222';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Use red for health bar to match player health bar
        context.fillStyle = '#ff0000';
        
        // Calculate health width for linear decrease
        const healthWidth = Math.floor(canvas.width * healthPercent);
        
        // Draw health bar from left to right
        context.fillRect(0, 0, healthWidth, canvas.height);
        
        // Update the texture
        if (healthBarSprite.material && healthBarSprite.material.map) {
            healthBarSprite.material.map.needsUpdate = true;
        }
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
    update(deltaTime) {
        // Skip if not fully initialized
        if (!this.initialized || !this.monsters) return;
        
        // Get current time
        const now = Date.now();
        
        // Update monsters
        this.monsters.forEach((monster) => {
            // Update animations
            this.updateMonsterAnimation(monster, deltaTime);
            
            // Update health bars to face camera
            this.updateHealthBarOrientation(monster);
            
            // Smoothly interpolate monster positions if needed
            this.interpolateMonsterPosition(monster, deltaTime);
        });
    }
    
    /**
     * Smoothly interpolate monster positions to prevent sudden jumps
     * @param {Object} monster - The monster to update
     * @param {number} deltaTime - Time since last frame in seconds
     */
    interpolateMonsterPosition(monster, deltaTime) {
        if (!monster || !monster.mesh) return;
        
        // If monster has target position from a sync update
        if (monster.mesh.userData.syncUpdate) {
            // Clear the sync update flag
            monster.mesh.userData.syncUpdate = false;
            
            // Store current position as the start position for interpolation
            if (!monster.mesh.userData.interpStart) {
                monster.mesh.userData.interpStart = {
                    x: monster.mesh.position.x,
                    y: monster.mesh.position.y,
                    z: monster.mesh.position.z
                };
                
                // Target position is already set in monster.position
                monster.mesh.userData.interpTarget = {
                    x: monster.position.x,
                    y: monster.position.y + 2.0, // Keep height adjustment
                    z: monster.position.z
                };
                
                // Start interpolation
                monster.mesh.userData.isInterpolating = true;
                monster.mesh.userData.interpProgress = 0;
            }
        }
        
        // If we're in the middle of interpolation
        if (monster.mesh.userData.isInterpolating) {
            // Advance interpolation progress
            monster.mesh.userData.interpProgress += deltaTime * 5; // Adjust speed factor as needed
            
            // Clamp progress to 0-1 range
            const progress = Math.min(1, monster.mesh.userData.interpProgress);
            
            // Apply interpolated position
            if (progress < 1 && monster.mesh.userData.interpStart && monster.mesh.userData.interpTarget) {
                monster.mesh.position.set(
                    monster.mesh.userData.interpStart.x + (monster.mesh.userData.interpTarget.x - monster.mesh.userData.interpStart.x) * progress,
                    monster.mesh.userData.interpStart.y + (monster.mesh.userData.interpTarget.y - monster.mesh.userData.interpStart.y) * progress,
                    monster.mesh.userData.interpStart.z + (monster.mesh.userData.interpTarget.z - monster.mesh.userData.interpStart.z) * progress
                );
            } else {
                // Interpolation complete
                monster.mesh.userData.isInterpolating = false;
                monster.mesh.userData.interpStart = null;
                monster.mesh.userData.interpTarget = null;
                monster.mesh.userData.interpProgress = 0;
            }
        }
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

    /**
     * Update a monster's animation based on its state
     * @param {Object} monster - The monster object to update
     * @param {number} deltaTime - Time since last frame in seconds
     */
    updateMonsterAnimation(monster, deltaTime) {
        if (!monster || !monster.mesh) return;
        
        // Add subtle animation to make monster movement more natural
        if (monster.mesh.userData.lastPosition) {
            const oldPos = monster.mesh.userData.lastPosition;
            const currentPos = monster.mesh.position;
            
            // If the monster has moved significantly since last frame
            const dx = currentPos.x - oldPos.x;
            const dz = currentPos.z - oldPos.z;
            const hasMoved = Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01;
            
            if (hasMoved) {
                // Make the monster bob up and down slightly while moving
                const time = Date.now() / 1000;
                const bobHeight = Math.sin(time * 4) * 0.1; // Subtle bobbing effect
                
                // Apply the bobbing motion if not interpolating
                if (!monster.mesh.userData.isInterpolating) {
                    monster.mesh.position.y += bobHeight;
                }
                
                // If the model has moving parts, animate them here
                monster.mesh.traverse((child) => {
                    if (child.name === 'leg' || child.name.includes('leg')) {
                        // Animate legs if they exist
                        child.rotation.x = Math.sin(time * 8) * 0.2;
                    }
                });
            }
        }
        
        // Store current position for next frame
        monster.mesh.userData.lastPosition = monster.mesh.position.clone();
    }

    /**
     * Update health bar to always face the camera
     * @param {Object} monster - The monster object
     */
    updateHealthBarOrientation(monster) {
        if (!monster || !monster.mesh) return;
        
        // Handle sprite-based health bar - sprites automatically face the camera
        const healthBar = monster.mesh.userData.healthBar;
        if (healthBar) {
            // Ensure the health bar is visible
            healthBar.visible = true;
            
            if (healthBar.material) {
                healthBar.material.visible = true;
            }
        }
    }
}

export default MonsterManager; 