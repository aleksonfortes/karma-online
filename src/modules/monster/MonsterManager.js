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
        this.lastDebugTime = undefined;
        this.lastProcessLogTime = 0;
        this.DEBUG_MONSTER_VERBOSE = false; // Set to false to reduce console spam
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
            
            // Use the same cerberus model for Typhon boss monster
            this.monsterModels['TYPHON'] = cerberusMonster.scene;
            this.monsterModels['typhon'] = cerberusMonster.scene;
            
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
        // Limit logging to once every 10 seconds to reduce console spam
        const now = Date.now();
        const shouldLog = this.DEBUG_MONSTER_VERBOSE || (now - this.lastProcessLogTime > 10000);
        
        if (shouldLog) {
            console.log('Processing server monsters data:', monsterData ? monsterData.length : 0, 'monsters received');
            this.lastProcessLogTime = now;
        }
        
        if (!monsterData || !Array.isArray(monsterData)) {
            console.error('Invalid monster data received from server:', monsterData);
            return;
        }
        
        // CRITICAL: If we received empty monster data but have monsters, this is likely a bug
        // We should NOT clear all monsters unless explicitly told to do so
        if (monsterData.length === 0 && this.monsters.size > 0) {
            console.error('Received empty monster data with existing monsters. This is likely a bug - preserving current monsters.');
            return;
        }
        
        // Create a map of monster IDs for faster lookup
        const monsterDataMap = new Map();
        monsterData.forEach(monster => {
            if (monster && monster.id) {
                monsterDataMap.set(monster.id, monster);
            }
        });
        
        // Flag to track if we're processing a batch of new monsters
        const startTime = Date.now();
        
        // Track existing monsters to find ones that should be removed
        const existingMonsterIds = new Set(this.monsters.keys());
        if (shouldLog) {
            console.log('Current client monsters before update:', existingMonsterIds.size);
        }
        
        // Track IDs of monsters we know are dead to prevent resurrection
        const knownDeadMonsterIds = new Set();
        
        // Process each monster from the server data
        monsterData.forEach(monster => {
            // Skip invalid monster data
            if (!monster || !monster.id) {
                console.warn('Received invalid monster data without ID:', monster);
                return;
            }
            
            // CRITICAL FIX: Handle inconsistent dead/alive states in the data
            // Explicitly check for BOTH health and isAlive status
            const hasZeroHealth = monster.health !== undefined && monster.health <= 0;
            const isExplicitlyDead = monster.isAlive === false;
            
            // Resolve conflicts - if either condition indicates death, monster should be dead
            // This fixes the conflict where health=0 but isAlive=true
            if (hasZeroHealth) {
                // Override any inconsistent alive status
                monster.isAlive = false;
                if (this.DEBUG_MONSTER_VERBOSE) {
                    console.log(`Fixing inconsistent monster state for ${monster.id}: Had 0 health but was marked alive, correcting to dead`);
                }
            }
            
            // Define death status one single time to avoid inconsistency
            const isDead = monster.isAlive === false || hasZeroHealth;
            
            // Add confirmed dead monsters to our known dead set
            if (isDead) {
                knownDeadMonsterIds.add(monster.id);
            }
            
            // Remove from existingMonsterIds set to mark as still valid
            existingMonsterIds.delete(monster.id);
            
            if (this.monsters.has(monster.id)) {
                const existingMonster = this.monsters.get(monster.id);
                
                // CRITICAL FIX: Monster is already dead in our client
                if (existingMonster.isAlive === false) {
                    // If we think it's dead but server says it's alive and has health, only respawn if
                    // we don't have this in our confirmed dead monsters set (prevents resurrection bug)
                    if (monster.isAlive === true && monster.health > 0 && !knownDeadMonsterIds.has(monster.id)) {
                        if (this.DEBUG_MONSTER_VERBOSE) {
                            console.log(`Monster ${monster.id} was locally dead but server says it's alive (health=${monster.health}) - respawning`);
                        }
                        this.removeMonster(monster.id);
                        const newMonster = this.createMonster(monster);
                        
                        // Mark creation time to prevent initial health bar flickering
                        if (newMonster && newMonster.mesh) {
                            newMonster.mesh.userData.creationTime = startTime;
                            newMonster.mesh.userData.lastDamageTime = startTime;
                        }
                    } else if (isDead) {
                        // Both client and server agree monster is dead - just maintain death state
                        if (this.DEBUG_MONSTER_VERBOSE) {
                            console.log(`Monster ${monster.id} is confirmed dead by both client and server`);
                        }
                        
                        // Just ensure health is set to 0
                        existingMonster.health = 0;
                        existingMonster.isAlive = false;
                        
                        // CRITICAL FIX: Notify server we're maintaining this monster as dead
                        // to prevent repeated resurrections
                        if (this.game.networkManager && this.game.networkManager.socket) {
                            this.game.networkManager.socket.emit('client_monster_state', {
                                monsterId: monster.id,
                                clientState: {
                                    isAlive: false,
                                    health: 0,
                                    deathTime: Date.now()
                                }
                            });
                        }
                    }
                } 
                // CRITICAL FIX: Monster is alive in our client
                else if (existingMonster.isAlive === true) {
                    if (isDead || knownDeadMonsterIds.has(monster.id)) {
                        // Server says it's dead, or we know it's dead, so kill it
                        if (this.DEBUG_MONSTER_VERBOSE) {
                            console.log(`Monster ${monster.id} was alive in client but server says it's dead - killing it`);
                        }
                        this.handleMonsterDeath(monster.id);
                    } else {
                        // Both agree it's alive - normal update
                        this.updateMonster(monster);
                    }
                }
            } else {
                // Skip creating monsters that we know are dead
                if (knownDeadMonsterIds.has(monster.id)) {
                    if (this.DEBUG_MONSTER_VERBOSE) {
                        console.log(`Skipping creation of monster ${monster.id} because it's known to be dead`);
                    }
                    return;
                }
                
                // Create new monster
                if (this.DEBUG_MONSTER_VERBOSE) {
                    console.log(`Creating new monster ${monster.id} from server data, isDead=${isDead}`);
                }
                const newMonster = this.createMonster(monster);
                
                // Mark creation time to prevent initial health bar flickering
                if (newMonster && newMonster.mesh) {
                    newMonster.mesh.userData.creationTime = startTime;
                    newMonster.mesh.userData.lastDamageTime = startTime;
                }
                
                // If the new monster should be dead, handle it immediately
                if (isDead) {
                    if (this.DEBUG_MONSTER_VERBOSE) {
                        console.log(`Newly created monster ${monster.id} should be dead - handling death`);
                    }
                    this.handleMonsterDeath(monster.id);
                }
            }
        });
        
        // CRITICAL: Only remove monsters that we're sure should be removed
        // Protect against empty updates that would erroneously remove all monsters
        if (monsterData.length > 0) {
            // Remove monsters that no longer exist
            let removedCount = 0;
            existingMonsterIds.forEach(id => {
                if (this.DEBUG_MONSTER_VERBOSE) {
                    console.log(`Removing monster ${id} - not in server data anymore`);
                }
                this.removeMonster(id);
                removedCount++;
            });
            
            if (removedCount > 0 && shouldLog) {
                console.log(`Removed ${removedCount} monsters not present in server data. Remaining monsters: ${this.monsters.size}`);
            }
        } else {
            if (shouldLog) {
                console.warn('Did not remove any monsters because received data was empty.');
            }
        }
        
        if (shouldLog) {
            console.log('Monster processing complete. Current monster count:', this.monsters.size);
        }
    }
    
    /**
     * Create a monster from server data
     * @param {Object} monsterData - Monster data from server
     * @returns {Object|null} The created monster or null if failed
     */
    createMonster(monsterData) {
        try {
            if (!monsterData || !monsterData.id) {
                console.error('Invalid monster data:', monsterData);
                return null;
            }
            
            const id = monsterData.id;
            const monsterType = monsterData.type || 'BASIC';
            
            // Log monster creation - only in verbose mode
            if (this.DEBUG_MONSTER_VERBOSE) {
                console.log(`Creating monster ${id} of type ${monsterType}`);
            }
            
            // Skip if monster is already known to be dead
            if (monsterData.isAlive === false || (monsterData.health !== undefined && monsterData.health <= 0)) {
                if (this.DEBUG_MONSTER_VERBOSE) {
                    console.log(`Monster ${id} is already dead, not creating visual representation`);
                }
                // Still create a data entry so we can track it
                const deadMonster = {
                    id,
                    type: monsterType,
                    position: { ...monsterData.position },
                    health: 0,
                    maxHealth: monsterData.maxHealth || 100,
                    isAlive: false
                };
                this.monsters.set(id, deadMonster);
                return deadMonster;
            }
            
            // Get model for this monster type, falling back to fallback model if needed
            let modelTemplate = this.monsterModels[monsterType];
            if (!modelTemplate) {
                console.warn(`No model found for monster type ${monsterType}, using fallback`);
                modelTemplate = this.monsterModels['FALLBACK'];
            }
            
            if (!modelTemplate) {
                console.error(`No fallback model available, cannot create monster ${id}`);
                return null;
            }
            
            // Clone the model so we can have multiple instances
            let monsterMesh;
            if (modelTemplate.isObject3D) {
                // Handle GLTF models which are Object3D
                monsterMesh = modelTemplate.clone(true);
            } else {
                // Handle simple geometry models
                monsterMesh = new THREE.Mesh(
                    modelTemplate.geometry.clone(),
                    modelTemplate.material.clone()
                );
            }
            
            // Set position from server data with height adjustment
            monsterMesh.position.set(
                monsterData.position.x, 
                monsterData.position.y + 2.0, // Adding height to raise from ground
                monsterData.position.z
            );
            
            // Set rotation if provided
            if (monsterData.rotation) {
                monsterMesh.rotation.y = monsterData.rotation.y || 0;
            }
            
            // Set scale for this monster type
            const scale = monsterData.scale || 1.0;
            if (monsterType === 'TYPHON') {
                // Make Typhon larger - use original 3.0 base scale
                monsterMesh.scale.set(scale * 3.0, scale * 3.0, scale * 3.0); // Restore original scale for Typhon
            } else {
                // Regular Cerberus - use original 3.0 base scale 
                monsterMesh.scale.set(scale * 3.0, scale * 3.0, scale * 3.0); // Restore original 3.0 scale
            }
            
            // CRITICAL: Ensure monster is visible
            monsterMesh.visible = true;
            if (this.DEBUG_MONSTER_VERBOSE) {
                console.log(`Setting monster ${id} visibility to true`);
            }
            
            // Add shadow casting/receiving
            monsterMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // CRITICAL: Ensure all child meshes are visible too
                    child.visible = true;
                    
                    // Improve material quality for cerberus model
                    if (child.material) {
                        child.material = child.material.clone(); // Clone to avoid affecting other instances
                        child.material.metalness = 0.6;
                        child.material.roughness = 0.4;
                    }
                }
            });
            
            // Set up health bar
            const healthBar = this.createHealthBar();
            
            // Position health bar above the monster
            const healthBarHeight = 4.0; // Units above the monster
            healthBar.position.set(
                monsterMesh.position.x,
                monsterMesh.position.y + healthBarHeight,
                monsterMesh.position.z
            );
            
            // Store original height for billboarding
            healthBar.userData.height = healthBarHeight;
            
            // Add mesh and health bar to the scene
            this.game.scene.add(monsterMesh);
            this.game.scene.add(healthBar);
            
            // Store collision radius from the server data or use a default
            const collisionRadius = monsterData.collisionRadius || 1.0;
            
            // Create monster object
            const monster = {
                id,
                type: monsterType,
                mesh: monsterMesh,
                healthBar: healthBar,
                position: { ...monsterData.position }, // Store original position for reference
                health: monsterData.health || 100,
                maxHealth: monsterData.maxHealth || 100,
                isAlive: monsterData.isAlive !== false, // Default to alive if not specified
                collisionRadius: collisionRadius,
                lastUpdateTime: Date.now()
            };
            
            // Add to monsters map
            this.monsters.set(id, monster);
            
            // Debug - only in verbose mode
            if (this.DEBUG_MONSTER_VERBOSE) {
                console.log(`Monster ${id} successfully created and added to scene. Visibility: ${monsterMesh.visible}`);
            }
            
            // Update health bar with initial health
            this.updateHealthBar(monster);
            
            return monster;
        } catch (error) {
            console.error('Error creating monster:', error);
            return null;
        }
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
     * Update a monster's health bar to reflect current health
     * @param {Object} monster - The monster object
     */
    updateHealthBar(monster) {
        if (!monster || !monster.healthBar || monster.health === undefined) {
            return;
        }
        
        // Get the canvas and context stored in userData
        const canvas = monster.healthBar.userData.canvas;
        const context = monster.healthBar.userData.context;
        
        if (!canvas || !context) {
            return;
        }
        
        // Clear canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Calculate health percentage
        const healthPercentage = Math.max(0, Math.min(1, monster.health / monster.maxHealth));
        
        // Draw background - using dark gray like original
        context.fillStyle = '#222222';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw health bar - using red like original
        if (healthPercentage > 0) {
            context.fillStyle = '#ff0000';
            context.fillRect(0, 0, canvas.width * healthPercentage, canvas.height);
        }
        
        // Update texture
        monster.healthBar.material.map.needsUpdate = true;
        
        // Hide health bar if monster is dead
        monster.healthBar.visible = monster.isAlive !== false && monster.health > 0;
    }
    
    /**
     * Update health bar orientation to face the camera
     * @param {Object} monster - The monster object
     */
    updateHealthBarOrientation(monster) {
        if (!monster || !monster.healthBar || !monster.mesh) {
            return;
        }
        
        // Skip if monster is dead
        if (monster.isAlive === false || monster.health <= 0) {
            monster.healthBar.visible = false;
            return;
        }
        
        // Update health bar position to be above the monster
        const healthBarHeight = monster.healthBar.userData.height || 4.0;
        monster.healthBar.position.set(
            monster.mesh.position.x,
            monster.mesh.position.y + healthBarHeight,
            monster.mesh.position.z
        );
        
        // Get camera
        const camera = this.game.camera;
        if (!camera) return;
        
        // Make health bar face camera (billboarding)
        monster.healthBar.quaternion.copy(camera.quaternion);
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
        
        // CRITICAL: Handle death state first and foremost
        // If monster is marked as not alive or health is 0, handle death immediately
        if (updateData.isAlive === false || (updateData.health !== undefined && updateData.health <= 0)) {
            console.log(`Monster ${monsterId} received death update (isAlive: ${updateData.isAlive}, health: ${updateData.health})`);
            monster.isAlive = false;
            this.handleMonsterDeath(monsterId);
            return; // Skip further processing for dead monsters
        }
        
        // If monster is already marked as dead in our client, don't update it
        if (monster.isAlive === false) {
            console.log(`Ignoring update for dead monster ${monsterId}`);
            return;
        }
        
        // Update isAlive status if provided
        if (updateData.isAlive !== undefined) {
            monster.isAlive = updateData.isAlive;
        }
        
        // Skip updates for dead monsters
        if (monster.isAlive === false) {
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
            
            // Apply the health change immediately
            monster.health = updateData.health;
            monster.maxHealth = updateData.maxHealth || monster.maxHealth;
            
            // Log significant health changes only for damage (important for debugging)
            if (monster.health < prevHealth && Math.abs(prevHealth - monster.health) > 5) {
                console.log(`Monster ${monsterId} health changed from ${prevHealth} to ${monster.health} (server authority)`);
                
                // If this is a damage event (health decreased), record it
                monster.mesh.userData.lastDamageTime = Date.now();
            }
            
            // Check if monster died from this update
            if (monster.health <= 0 && prevHealth > 0) {
                console.log(`Monster ${monsterId} died from health update (${prevHealth} -> ${monster.health})`);
                monster.isAlive = false;
                this.handleMonsterDeath(monsterId);
                return;
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
                    // Format the monster name nicely (Typhon instead of TYPHON Monster, Cerberus instead of BASIC Monster)
                    let name;
                    const monsterTypeName = monster.type || 'Unknown';
                    
                    if (monsterTypeName === 'TYPHON') {
                        name = 'Typhon';
                    } else if (monsterTypeName === 'BASIC') {
                        name = 'Cerberus';
                    } else {
                        // For any other monster types, just use the type name
                        name = monsterTypeName.charAt(0).toUpperCase() + monsterTypeName.slice(1).toLowerCase();
                    }
                    
                    // Update the target display with new health
                    this.game.uiManager?.updateTargetDisplay(
                        name,
                        monster.health,
                        monster.maxHealth,
                        'monster',
                        this.getMonsterLevel(monster.type)
                    );
                }
            }
        }
    }
    
    /**
     * Get the level of a monster from its type
     * @param {string} monsterType - The type of monster
     * @returns {number} - The monster's level (defaults to 1)
     */
    getMonsterLevel(monsterType) {
        if (monsterType && this.game.gameConstants && this.game.gameConstants.MONSTER && 
            this.game.gameConstants.MONSTER[monsterType] && 
            this.game.gameConstants.MONSTER[monsterType].LEVEL) {
            return this.game.gameConstants.MONSTER[monsterType].LEVEL;
        }
        return 1; // Default level if not specified
    }
    
    /**
     * Handle monster death visually
     */
    handleMonsterDeath(monsterId) {
        const monster = this.monsters.get(monsterId);
        if (!monster) return;
        
        // If the monster is already marked as dead, skip reprocessing
        if (monster.isAlive === false) {
            console.log(`Monster ${monsterId} already marked as dead, skipping duplicate death handling`);
            return;
        }
        
        console.log(`Handling monster death: ${monsterId}`);
        
        // IMPORTANT: Mark monster as dead to prevent any updates
        monster.isAlive = false;
        
        // Set health to zero - server is authoritative
        monster.health = 0;
        monster.serverHealth = 0;
        
        // CRITICAL FIX: Completely disable the monster's ability to attack or move
        if (monster.mesh) {
            // Remove any collision capabilities
            if (monster.mesh.userData) {
                monster.mesh.userData.isAlive = false;
                monster.mesh.userData.isDead = true;  
                monster.mesh.userData.canAttack = false;
                monster.mesh.userData.canMove = false;
                monster.mesh.userData.isInterpolating = false;
                monster.mesh.userData.interpStart = null;
                monster.mesh.userData.interpTarget = null;
                monster.mesh.userData.interpProgress = 0;
                monster.mesh.userData.isMoving = false;
                monster.mesh.userData.isAttacking = false;
                
                // Add a timestamp for when the monster died
                monster.mesh.userData.deathTime = Date.now();
            }
            
            // ENHANCED FIX: Completely disable monster mesh
            monster.mesh.visible = false;        // Hide it completely
            monster.mesh.userData.enabled = false; // Mark as disabled
            
            // CRITICAL FIX: Disable collision detection by moving the monster's collision
            // detection point far below the world
            if (this.game.physics && this.game.physics.excludeObject) {
                this.game.physics.excludeObject(monster.mesh);
            }
            
            // Alternatively, move it out of the world
            monster.mesh.position.y = -1000; // Move far below the scene so it can't collide
            
            // CRITICAL BUGFIX: Make sure monster has a valid position before cloning
            const visualPosition = monster.position && typeof monster.position.clone === 'function' 
                ? monster.position.clone()
                : monster.mesh.position.clone();
                
            visualPosition.y += 0.5; // Lower height adjustment for better visual effect
            
            // Create a copy of the monster mesh for visual purposes only
            if (!monster.visualMesh) {
                // Create a simplified visual mesh for dead monster
                monster.visualMesh = monster.mesh.clone();
                monster.visualMesh.position.copy(visualPosition);
                monster.visualMesh.rotation.x = Math.PI / 2; // Rotate to lay flat
                this.game.scene.add(monster.visualMesh);
                
                // Apply visual death effects to the visual mesh
                this.applyDeathVisuals({ mesh: monster.visualMesh });
            }
        }
        
        // Apply visual death effects to the original mesh (just in case)
        this.applyDeathVisuals(monster);
        
        // Update health bar to show zero health
        this.updateHealthBar(monster);
        
        // Log monster death for debugging
        console.log(`Monster ${monsterId} marked as dead, isAlive=${monster.isAlive}`);
        
        // CRITICAL FIX: Tell the server we know this monster is dead
        if (this.game.networkManager && this.game.networkManager.socket) {
            this.game.networkManager.socket.emit('client_monster_state', {
                monsterId: monsterId,
                clientState: {
                    isAlive: false,
                    health: 0,
                    deathTime: Date.now()
                }
            });
            
            // Send a second time after a short delay to ensure delivery
            setTimeout(() => {
                if (this.game.networkManager && this.game.networkManager.socket) {
                    this.game.networkManager.socket.emit('client_monster_state', {
                        monsterId: monsterId,
                        clientState: {
                            isAlive: false,
                            health: 0,
                            deathTime: Date.now()
                        }
                    });
                }
            }, 500);
        }
        
        // Schedule removal after fade animation - only on server confirmation
        setTimeout(() => {
            // Verify monster still exists before removing
            if (this.monsters.has(monsterId)) {
                // Check if monster got respawned before removal
                const monsterBeforeRemoval = this.monsters.get(monsterId);
                if (monsterBeforeRemoval.isAlive === true) {
                    console.log(`Monster ${monsterId} was respawned before removal timer, keeping alive`);
                    return;
                }
                this.removeMonster(monsterId);
            }
        }, 2000);
    }
    
    /**
     * Remove a monster from the scene
     */
    removeMonster(monsterId) {
        const monster = this.monsters.get(monsterId);
        if (!monster) {
            console.log(`Monster ${monsterId} not found for removal`);
            return;
        }
        
        console.log(`Removing monster: ${monsterId}`);
        
        try {
            // ENHANCED CLEANUP: Aggressively remove all resources
            
            // 1. Make sure the monster is marked as dead
            monster.isAlive = false;
            monster.health = 0;
            
            // 2. Remove the main mesh from scene
            if (monster.mesh) {
                // Hide immediately to prevent any visual glitches
                monster.mesh.visible = false;
                
                // Cache position for potential use in cleanup - safely
                let lastPosition = null;
                if (monster.position && typeof monster.position.clone === 'function') {
                    lastPosition = monster.position.clone();
                } else if (monster.mesh.position) {
                    lastPosition = monster.mesh.position.clone();
                }
                
                // Remove from scene
                this.game.scene.remove(monster.mesh);
                
                // Dispose of geometries and materials to prevent memory leaks
                monster.mesh.traverse(child => {
                    if (child.geometry) {
                        child.geometry.dispose();
                    }
                    
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(material => material.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
                
                // Clear any references in userData
                if (monster.mesh.userData) {
                    // Save the monster ID for logging
                    const mId = monster.mesh.userData.monsterId;
                    
                    // Clear all userData properties
                    for (const prop in monster.mesh.userData) {
                        monster.mesh.userData[prop] = null;
                    }
                    
                    // Just keep the ID for debugging
                    monster.mesh.userData.monsterId = mId;
                    monster.mesh.userData.wasRemoved = true;
                }
                
                // Clear mesh reference
                monster.mesh = null;
            }
            
            // 3. Remove any visual mesh that was created for dead monsters
            if (monster.visualMesh) {
                // Hide immediately
                monster.visualMesh.visible = false;
                this.game.scene.remove(monster.visualMesh);
                
                // Also dispose of visual mesh resources
                monster.visualMesh.traverse(child => {
                    if (child.geometry) {
                        child.geometry.dispose();
                    }
                    
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(material => material.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
                
                // Clear reference
                monster.visualMesh = null;
            }
            
            // 4. Ensure any physics/collision handling is removed
            if (this.game.physics) {
                if (this.game.physics.removeObject) {
                    this.game.physics.removeObject(monster.mesh);
                }
                if (this.game.physics.excludeObject) {
                    this.game.physics.excludeObject(monster.mesh);
                }
            }
            
            // 5. Clear targeting if this monster is the current target
            if (this.game.targetingManager && 
                this.game.targetingManager.currentTarget && 
                this.game.targetingManager.currentTarget.id === monsterId) {
                console.log(`Clearing targeting for removed monster ${monsterId}`);
                this.game.targetingManager.clearTarget();
            }
            
            // 6. Notify the server that we've removed this monster from our client
            if (this.game.networkManager && this.game.networkManager.socket) {
                this.game.networkManager.socket.emit('client_monster_removed', {
                    monsterId: monsterId
                });
            }
            
            // 7. Finally remove from collection
            this.monsters.delete(monsterId);
            
            console.log(`Monster ${monsterId} completely removed from the game`);
        } catch (error) {
            console.error(`Error removing monster ${monsterId}:`, error);
            
            // Even if there's an error, make sure the monster is removed from the collection
            this.monsters.delete(monsterId);
        }
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
        
        // Debug: Log monster count during update - limit frequency to reduce spam
        const now = Date.now();
        const logInterval = 5000; // Log only every 5 seconds
        
        if (this.game.DEBUG_MONSTERS && (!this.lastDebugTime || now - this.lastDebugTime > logInterval)) {
            console.log(`Monster update: ${this.monsters.size} monsters in scene`);
            this.lastDebugTime = now;
        }
        
        // Update monsters
        this.monsters.forEach((monster) => {
            // Skip updates for dead monsters - strict check
            if (monster.isAlive === false || monster.health <= 0) {
                // For debugging purposes, ensure the monster is fully marked as dead
                if (monster.health <= 0 && monster.isAlive !== false) {
                    console.log(`Monster ${monster.id} has 0 health but isAlive is not false, forcing death state`);
                    this.handleMonsterDeath(monster.id);
                }
                return;
            }
            
            // CRITICAL: Ensure monster mesh is visible
            if (monster.mesh && monster.mesh.visible === false) {
                console.log(`Monster ${monster.id} visibility was false, resetting to true`);
                monster.mesh.visible = true;
                
                // Also ensure all child meshes are visible
                monster.mesh.traverse(child => {
                    if (child.isMesh || child.isObject3D) {
                        child.visible = true;
                    }
                });
            }
            
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
     * Apply visual death effects to a monster without triggering full death handling
     */
    applyDeathVisuals(monster) {
        if (!monster || !monster.mesh) return;
        
        // Get the mesh to apply effects to
        const targetMesh = monster.visualMesh || monster.mesh;
        
        // CRITICAL ENHANCEMENT: Make dead monsters VERY clearly dead visually
        
        // 1. Make the monster semi-transparent and grayscale
        targetMesh.traverse(child => {
            if (child.isMesh && child.material) {
                // Create a clone of the material to avoid affecting other instances
                if (Array.isArray(child.material)) {
                    child.material = child.material.map(m => {
                        const newMat = m.clone();
                        newMat.transparent = true;
                        newMat.opacity = 0.5;
                        // Add grayscale effect via color adjustment
                        if (newMat.color) {
                            const color = newMat.color.getHSL({});
                            newMat.color.setHSL(0, 0, color.l * 0.7); // Remove saturation and darken
                        }
                        return newMat;
                    });
                } else {
                    child.material = child.material.clone();
                    child.material.transparent = true;
                    child.material.opacity = 0.5;
                    // Add grayscale effect via color adjustment
                    if (child.material.color) {
                        const color = child.material.color.getHSL({});
                        child.material.color.setHSL(0, 0, color.l * 0.7); // Remove saturation and darken
                    }
                }
            }
        });
        
        // 2. Make health bar fade out and turn gray
        const healthBar = targetMesh.userData.healthBar;
        if (healthBar && healthBar.material) {
            healthBar.material.opacity = 0.3;
            // Make the health bar gray if it's a sprite
            if (healthBar.material.map) {
                // Update the canvas to show a gray health bar
                const canvas = healthBar.userData.canvas;
                const context = healthBar.userData.context;
                
                if (canvas && context) {
                    // Clear the canvas
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    
                    // Fill with dark gray background
                    context.fillStyle = '#333333';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    
                    // Update the texture
                    healthBar.material.map.needsUpdate = true;
                }
            }
        }
        
        // 3. Optional: Add "death" effect (if we have particle effects system)
        if (this.game.effectsManager && this.game.effectsManager.createDeathEffect) {
            // Position the effect at the monster's position
            const position = monster.position ? monster.position.clone() : 
                            (targetMesh.position ? targetMesh.position.clone() : null);
            
            if (position) {
                position.y += 1.0; // Offset slightly upward
                this.game.effectsManager.createDeathEffect(position);
            }
        }
        
        // 4. Set a flag that this monster has had death visuals applied
        if (targetMesh.userData) {
            targetMesh.userData.deathVisualsApplied = true;
        }
    }

    /**
     * Check player collision with monsters and resolve
     * @param {Object} playerPosition - Player position to check
     * @param {Object} previousPosition - Previous player position for resolution
     * @returns {boolean} - Whether there was a collision
     */
    checkMonsterCollisions(playerPosition, previousPosition) {
        // Skip if not fully initialized
        if (!this.initialized || !this.monsters || this.monsters.size === 0) {
            return false;
        }
        
        let collision = false;
        
        // Check collision with each monster
        this.monsters.forEach((monster) => {
            // Skip collision checks with dead monsters
            if (monster.isAlive === false || monster.health <= 0) {
                return;
            }
            
            // Skip if the monster doesn't have a mesh or position
            if (!monster.mesh || !monster.position) {
                return;
            }
            
            // Calculate distance from player to monster
            const dx = playerPosition.x - monster.position.x;
            const dz = playerPosition.z - monster.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Use proper collision radius from the monster's config or default to 1.0
            const collisionRadius = monster.collisionRadius || 1.0;
            
            // Player has their own collision radius of about 0.5 units
            const playerRadius = 0.5;
            
            // Combined collision radius
            const combinedRadius = collisionRadius + playerRadius; 
            
            // Check if distance is less than combined radius
            if (distance < combinedRadius) {
                collision = true;
                
                // If we have a previous position, push the player away from monster
                if (previousPosition) {
                    // Calculate push vector
                    const angle = Math.atan2(dx, dz);
                    
                    // Push player to the edge of the combined collision radius
                    playerPosition.x = monster.position.x + Math.sin(angle) * (combinedRadius + 0.1); // Add a small buffer
                    playerPosition.z = monster.position.z + Math.cos(angle) * (combinedRadius + 0.1);
                }
            }
        });
        
        return collision;
    }

    /**
     * Add debug visualization for monster collision radius
     * @param {THREE.Object3D} monsterMesh - The monster's mesh
     * @param {number} radius - The collision radius
     */
    addCollisionDebugVisuals(monsterMesh, radius) {
        // Disabled - no debug visuals as per user request
        return;
    }
}

export default MonsterManager; 