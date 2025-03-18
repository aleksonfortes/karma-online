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
        
        this.initialized = true;
        console.log('Monster Manager initialized');
    }
    
    /**
     * Preload monster models
     */
    async preloadMonsterModels() {
        console.log('Preloading monster models');
        
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
                        console.warn('Error loading cerberus model, falling back to basic:', error);
                        // Try to load the basic model as fallback
                        loader.load(
                            '/models/monster_basic.glb',
                            (basicGltf) => {
                                console.log('Successfully loaded basic monster model as fallback');
                                resolve(basicGltf);
                            },
                            undefined,
                            (basicError) => {
                                console.error('Failed to load fallback model:', basicError);
                                reject(basicError);
                            }
                        );
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
            
            // Fallback to using a simple mesh if model loading fails
            console.log('Using fallback monster model');
            const fallbackGeometry = new THREE.BoxGeometry(1, 2, 1);
            const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0xFF0000 });
            const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
            
            // Store under both uppercase and lowercase keys for reliability
            this.monsterModels['BASIC'] = fallbackMesh;
            this.monsterModels['basic'] = fallbackMesh;
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
                this.createMonster(monster);
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
        
        if (!modelTemplate) {
            console.error(`No model found for monster type and no fallback available`);
            return;
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
        monsterModel.userData.healthBarInner = healthBar.children[0];
        
        // Add to scene
        this.game.scene.add(monsterModel);
        
        // Store monster reference
        const monster = {
            id: monsterData.id,
            type: monsterData.type,
            mesh: monsterModel,
            health: monsterData.health,
            maxHealth: monsterData.maxHealth,
            position: monsterModel.position,
            collisionRadius: monsterData.collisionRadius || 1
        };
        
        // Store in monsters Map
        this.monsters.set(monsterData.id, monster);
        
        return monster;
    }
    
    /**
     * Create a health bar for a monster
     */
    createHealthBar(monsterData) {
        // Create container
        const healthBarContainer = new THREE.Object3D();
        
        // Create background - make it wider for better visibility on larger model
        const backgroundGeometry = new THREE.PlaneGeometry(1.5, 0.15);
        const backgroundMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const background = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
        
        // Create health bar - match the wider size
        const healthGeometry = new THREE.PlaneGeometry(1.5, 0.15);
        const healthMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const healthBar = new THREE.Mesh(healthGeometry, healthMaterial);
        
        // Position the health bar slightly in front of the background to avoid z-fighting
        healthBar.position.set(0, 0, 0.01);
        
        // Add health bar to container
        healthBarContainer.add(background);
        healthBarContainer.add(healthBar);
        
        // Position above the monster - adjust height for the much larger cerberus model
        healthBarContainer.position.set(0, 8.0, 0); // Increased height for the larger model
        
        // Make sure the health bar always faces the camera
        healthBarContainer.userData.isBillboard = true;
        
        return healthBarContainer;
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
            monster.health = monsterData.health;
            monster.maxHealth = monsterData.maxHealth || monster.maxHealth;
            
            // Update health bar
            this.updateHealthBar(monster);
        }
    }
    
    /**
     * Update the visual health bar for a monster
     */
    updateHealthBar(monster) {
        const healthBar = monster.mesh.userData.healthBarInner;
        if (!healthBar) return;
        
        // Calculate health percentage
        const healthPercent = monster.health / monster.maxHealth;
        
        // Clamp between 0 and 1
        const clampedPercent = Math.max(0, Math.min(1, healthPercent));
        
        // Update health bar scale
        healthBar.scale.x = clampedPercent;
        
        // Center the scaling on the left edge
        healthBar.position.x = (clampedPercent - 1) / 2;
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
        
        // Update health if provided
        if (updateData.health !== undefined) {
            monster.health = updateData.health;
            this.updateHealthBar(monster);
            
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
        
        // Handle monster death
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
        
        // Set health to zero and update health bar
        monster.health = 0;
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
        
        // Schedule removal after fade animation
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
            // Make health bars face the camera
            const healthBar = monster.mesh.userData.healthBar;
            if (healthBar && healthBar.userData.isBillboard) {
                // Get camera position
                const camera = this.game.cameraManager.getCamera();
                if (camera) {
                    healthBar.lookAt(camera.position);
                }
            }
        });
    }
    
    /**
     * Clean up resources
     */
    cleanup() {
        // Remove all monsters from scene
        this.monsters.forEach(monster => {
            this.game.scene.remove(monster.mesh);
        });
        
        // Clear collections
        this.monsters.clear();
    }
}

export default MonsterManager; 