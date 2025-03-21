import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import GameConstants from '../../../server/src/config/GameConstants.js';

// Client-side constants that mirror server constants
const PLAYER_CONSTANTS = GameConstants.PLAYER;

export class PlayerManager {
    constructor(game) {
        this.game = game;
        this.loader = new GLTFLoader();
        this.characterModel = null;
        this.characterModelPath = '/models/scene.glb';
        this.defaultPlayerColor = 0x999999; // Neutral gray
        this.lightPathColor = 0x3366ff; // Blue for light path
        this.darkPathColor = 0x990000; // Red for dark path
        this.respawnDelay = 10000; // 10 seconds
        this.moveSpeed = 10;
        this.rotateSpeed = 3;
        this.lastPositionUpdate = 0;
        this.updateInterval = 50; // 20 updates per second
        this.lastFrameTime = Date.now();
        
        // Initialize players Map - exactly like original game
        this.players = new Map();
        
        // Flag to track if we're waiting for server position update
        this.pendingPositionUpdate = false;
        
        // Flag to track if model is currently being loaded
        this.isLoadingModel = false;
    }
    
    async init() {
        console.log('Initializing Player Manager');
        
        try {
            // Preload character model only if not already loaded
            if (!this.characterModel) {
                console.log('Preloading character model during initialization');
                this.characterModel = await this.loadCharacterModel();
                console.log('Character model preloaded and cached');
            }
            
            // Only create local player if it doesn't already exist and we're not in offline mode
            if (!this.game.localPlayer && this.game.networkManager && !this.game.networkManager.isOfflineMode) {
                console.log('PlayerManager: Creating local player');
                // Let NetworkManager handle local player creation to ensure proper synchronization
                // The actual player will be created when receiving server position
            }
            
            // Initialize health bars for all players
            this.initHealthBars();
            
            return true;
        } catch (error) {
            console.error('Failed to initialize PlayerManager:', error);
            return false;
        }
    }
    
    async loadCharacterModel() {
        try {
            // Check if the model is already loaded and cached
            if (this.characterModel) {
                return this.characterModel;
            }
            
            // If model is currently being loaded by another call, wait for it
            if (this.isLoadingModel) {
                console.log('Character model is already being loaded, waiting...');
                // Wait until the model is loaded (check every 100ms)
                while (this.isLoadingModel) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                // Once loaded, return the cached model
                return this.characterModel;
            }
            
            // Set loading flag to prevent duplicate loading
            this.isLoadingModel = true;
            
            // Only log once at the start of loading
            console.log('Loading character model...');
            
            return new Promise((resolve, reject) => {
                this.loader.load(
                    this.characterModelPath,
                    (gltf) => {
                        // Success message is fine to keep
                        console.log('Character model loaded successfully');
                        
                        // Create a group to hold the model
                        const modelGroup = new THREE.Group();
                        
                        // Set scale using the centralized configuration
                        const scale = GameConstants.PLAYER.MODEL_SCALE;
                        gltf.scene.scale.set(scale, scale, scale);
                        
                        // Position the model correctly within the group
                        // The model needs to be positioned lower to appear at ground level
                        // With the smaller scale (4.5 vs 5.0), we need to adjust the position slightly
                        gltf.scene.position.y = GameConstants.PLAYER.MODEL_POSITION_Y_OFFSET;
                        
                        // Add the model to the group after positioning
                        modelGroup.add(gltf.scene);
                        
                        // Apply material adjustments if needed
                        gltf.scene.traverse((child) => {
                            if (child.isMesh) {
                                // Enable shadows for all meshes
                                child.castShadow = true;
                                child.receiveShadow = true;
                                
                                // Set material properties
                                if (child.material) {
                                    child.material.metalness = 0.1;
                                    child.material.roughness = 0.8;
                                }
                            }
                        });
                        
                        // Make sure to set the class property before resolving
                        this.characterModel = modelGroup;
                        // Reset loading flag
                        this.isLoadingModel = false;
                        resolve(modelGroup);
                    },
                    (xhr) => {
                        // Only log progress at 25%, 50%, 75%, and 100% to reduce spam
                        const percentComplete = Math.round((xhr.loaded / xhr.total) * 100);
                        if (percentComplete === 25 || percentComplete === 50 || 
                            percentComplete === 75 || percentComplete === 100) {
                            console.log(`Loading character model: ${percentComplete}%`);
                        }
                    },
                    (error) => {
                        console.error('Error loading character model:', error);
                        // Reset loading flag on error
                        this.isLoadingModel = false;
                        reject(error);
                    }
                );
            });
        } catch (error) {
            console.error('Error in loadCharacterModel:', error);
            // Reset loading flag on error
            this.isLoadingModel = false;
            return this.createFallbackCharacterModel();
        }
    }
    
    createFallbackCharacterModel() {
        // Create a simple cylinder as fallback character model
        const group = new THREE.Group();
        
        // Body
        const geometry = new THREE.CylinderGeometry(0.5, 0.5, 3, 16);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x00aa00,
            metalness: 0.1,
            roughness: 0.8
        });
        const cylinder = new THREE.Mesh(geometry, material);
        cylinder.position.y = 1.5;
        cylinder.castShadow = true;
        cylinder.receiveShadow = true;
        group.add(cylinder);
        
        // Head
        const headGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xffcc99,
            metalness: 0.1,
            roughness: 0.8
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 3.5;
        head.castShadow = true;
        head.receiveShadow = true;
        group.add(head);
        
        return group;
    }
    
    async createLocalPlayer() {
        const socketId = this.game.networkManager.socket.id;
        if (!socketId) {
            console.error('Cannot create local player without socket connection');
            return null;
        }
        
        if (this.game.localPlayer) {
            console.warn('PlayerManager: Local player already exists, not creating a new one');
            return this.game.localPlayer;
        }
        
        // Create player with default position - actual position will be set by server
        const position = { ...GameConstants.PLAYER.DEFAULT_POSITION };
        // No need to adjust y position as it's already set to 0 in PLAYER_CONSTANTS
        const rotation = { ...GameConstants.PLAYER.DEFAULT_ROTATION };
        
        const player = await this.createPlayer(socketId, position, rotation, true);
        if (player) {
            this.game.localPlayer = player;
            this.game.scene.add(player);
            this.players.set(socketId, player);
            
            // Request initial position from server
            this.game.networkManager.socket.emit('requestInitialPosition');
        }
        return player;
    }
    
    async createPlayer(id, position = null, rotation = { y: 0 }, isLocal = false) {
        // Check if player already exists
        if (this.players.has(id)) {
            console.warn(`Player with ID ${id} already exists. Not creating a duplicate.`);
            
            // Return the existing player
            const existingPlayer = this.players.get(id);
            
            // If we're requesting a local player but the existing one isn't marked as local,
            // we might want to update that flag
            if (isLocal && existingPlayer.userData && !existingPlayer.userData.isLocal) {
                console.log(`Updating existing player ${id} to mark as local`);
                existingPlayer.userData.isLocal = true;
            }
            
            // Update position if specified and significantly different from current position
            if (position) {
                const distance = Math.sqrt(
                    Math.pow(existingPlayer.position.x - position.x, 2) + 
                    Math.pow(existingPlayer.position.z - position.z, 2)
                );
                
                // Only update if position differs by more than 1 unit
                if (distance > 1) {
                    console.log(`Updating existing player ${id} position: [${existingPlayer.position.x.toFixed(2)}, ${existingPlayer.position.z.toFixed(2)}] -> [${position.x.toFixed(2)}, ${position.z.toFixed(2)}]`);
                    existingPlayer.position.set(position.x, position.y, position.z);
                }
            }
            
            // Update rotation if needed
            if (rotation && Math.abs(existingPlayer.rotation.y - rotation.y) > 0.1) {
                existingPlayer.rotation.y = rotation.y;
            }
            
            return existingPlayer;
        }
        
        // Use default position if none provided
        if (!position) {
            position = { ...GameConstants.PLAYER.DEFAULT_POSITION };
        }
        
        const player = await this.createPlayerMesh(id, position, rotation);
        if (player) {
            // Set isLocal flag in userData
            if (!player.userData) player.userData = {};
            player.userData.isLocal = isLocal;
            
            // Store the player ID in userData for reference
            player.userData.playerId = id;
            
            this.players.set(id, player);
            this.game.scene.add(player);
            if (isLocal) {
                this.game.localPlayer = player;
                console.log(`Set local player to ${id}`);
            }
            
            // Create a health bar for the player
            this.createHealthBar(player);
        }
        return player;
    }
    
    async createPlayerMesh(id, position, rotation) {
        let playerMesh;
        
        try {
            // Check if the model is already loaded and cached
            if (!this.characterModel) {
                // Only log this once when we need to load the model
                console.log('Character model not cached, loading now...');
                await this.loadCharacterModel();
                // No need to assign to this.characterModel as loadCharacterModel now does this
            }
            
            // Clone the model
            playerMesh = this.characterModel.clone();
            playerMesh.position.set(position.x, position.y, position.z);
            playerMesh.rotation.y = rotation.y;
            
            // Set player metadata
            playerMesh.userData = {
                id: id,
                isLocal: false,
                stats: {
                    life: 100,
                    maxLife: 100,
                    mana: 100,
                    maxMana: 100,
                    karma: 50,
                    maxKarma: 100
                }
            };
        } catch (error) {
            console.error('Error creating player mesh:', error);
            playerMesh = this.createFallbackCharacterModel();
        }
        
        return playerMesh;
    }
    
    async createNetworkPlayer(id, position, stats) {
        // Create player model
        let playerModel;
        
        if (this.characterModel) {
            // Clone the preloaded model
            playerModel = this.characterModel.clone();
        } else {
            // Create fallback model if no model is loaded
            playerModel = this.createFallbackCharacterModel();
        }
        
        // Set position - for network players, always use the position provided by server
        if (position) {
            playerModel.position.set(position.x, position.y, position.z);
        } else {
            // If no position provided (shouldn't happen), use default
            playerModel.position.set(
                GameConstants.PLAYER.DEFAULT_POSITION.x,
                GameConstants.PLAYER.DEFAULT_POSITION.y,
                GameConstants.PLAYER.DEFAULT_POSITION.z
            );
        }
        
        // Add to scene
        this.game.scene.add(playerModel);
        
        // Store reference to player
        this.game.players.set(id, playerModel);
        
        // Add shadow casting
        playerModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Store player stats
        playerModel.userData = {
            id: id,
            stats: stats || {
                currentLife: 100,
                maxLife: 100,
                currentMana: 100,
                maxMana: 100,
                currentKarma: 50,
                maxKarma: 100,
                path: null
            },
            isDead: false
        };
        
        console.log('Network player created:', id);
        return playerModel;
    }
    
    update(deltaTime) {
        // Update player animations
        this.updatePlayerAnimations();
        
        // Only send position updates for local player at controlled intervals
        const now = Date.now();
        if (this.game.localPlayer && 
            now - this.lastPositionUpdate > this.updateInterval && 
            !this.pendingPositionUpdate && 
            this.game.networkManager && 
            this.game.networkManager.socket && 
            this.game.networkManager.socket.connected) {
            
            this.lastPositionUpdate = now;
            
            // Send position update to server
            this.game.networkManager.socket.emit('playerMovement', {
                position: {
                    x: this.game.localPlayer.position.x,
                    y: this.game.localPlayer.position.y,
                    z: this.game.localPlayer.position.z
                },
                rotation: {
                    y: this.game.localPlayer.rotation.y
                },
                // Include other player data...
                path: this.game.localPlayer.userData.path || null,
                karma: this.game.localPlayer.userData.stats?.karma || 50,
                maxKarma: this.game.localPlayer.userData.stats?.maxKarma || 100,
                mana: this.game.localPlayer.userData.stats?.mana || 100,
                maxMana: this.game.localPlayer.userData.stats?.maxMana || 100
            });
            
            // Set flag to wait for server confirmation
            this.pendingPositionUpdate = true;
            
            // Add timeout to reset flag in case server doesn't respond
            setTimeout(() => {
                this.pendingPositionUpdate = false;
            }, 1000); // 1 second timeout
        }
        
        // Update all health bars every frame to ensure they face the camera
        this.updateAllHealthBars();
    }
    
    updatePlayerAnimations() {
        // Update animations for all players
        this.game.players.forEach((player) => {
            // Skip if player is invalid
            if (!player || !player.userData) return;
            
            // Check if player is moving
            const isMoving = player.userData.isMoving || 
                (player.userData.targetPosition && 
                player.position.distanceToSquared(player.userData.targetPosition) > 0.01);
            
            // Update animation state
            if (player.userData.animations) {
                // Handle model-specific animations if they exist
                if (isMoving && player.userData.currentAnimation !== 'Running') {
                    // Change to running animation
                    const runAction = player.userData.animations['Running'];
                    if (runAction) {
                        if (player.userData.currentAction) {
                            player.userData.currentAction.fadeOut(0.2);
                        }
                        runAction.reset().fadeIn(0.2).play();
                        player.userData.currentAction = runAction;
                        player.userData.currentAnimation = 'Running';
                    }
                } else if (!isMoving && player.userData.currentAnimation !== 'Idle') {
                    // Change to idle animation
                    const idleAction = player.userData.animations['Idle'];
                    if (idleAction) {
                        if (player.userData.currentAction) {
                            player.userData.currentAction.fadeOut(0.2);
                        }
                        idleAction.reset().fadeIn(0.2).play();
                        player.userData.currentAction = idleAction;
                        player.userData.currentAnimation = 'Idle';
                    }
                }
                
                // Update animation mixer if it exists
                if (player.userData.mixer) {
                    player.userData.mixer.update(deltaTime);
                }
            }
        });
    }
    
    /**
     * Initialize health bars for all players
     */
    initHealthBars() {
        console.log('Initializing health bars for all players');
        
        // Create health bars for all existing players
        for (const [id, player] of this.players) {
            this.createHealthBar(player);
        }
    }
    
    /**
     * Create a health bar for a player
     * @param {THREE.Object3D} player - The player object
     */
    createHealthBar(player) {
        if (!player) return;
        
        // If player already has a health bar, remove it first to recreate it
        if (player.userData.healthBar) {
            player.remove(player.userData.healthBar);
            player.userData.healthBar = null;
        }
        
        // Store the player ID for debugging
        if (player.userData && player.userData.playerId) {
            player.userData.healthBarPlayerId = player.userData.playerId;
        }
        
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
        
        // Set size and position
        const healthBarWidth = 0.7;  // Smaller width
        const healthBarHeight = 0.08; // Smaller height
        healthBarSprite.scale.set(healthBarWidth, healthBarHeight, 1);
        
        // Calculate the proper height for positioning the health bar
        let playerHeight = 1.8; // Default height for a standard character
        
        // Try to determine actual player height from the mesh
        if (player.children && player.children.length > 0) {
            // Calculate bounding box to get actual height
            const bbox = new THREE.Box3().setFromObject(player);
            if (bbox.max.y !== Infinity && bbox.min.y !== -Infinity) {
                playerHeight = bbox.max.y - bbox.min.y;
            }
        } else if (player.geometry && player.geometry.parameters) {
            playerHeight = player.geometry.parameters.height || 1.8;
        } else if (player.userData.height) {
            playerHeight = player.userData.height;
        }
        
        // Position health bar above player's head
        healthBarSprite.position.y = playerHeight + 0.2; // Position above the head with some margin
        
        console.log(`Setting health bar position for player ${player.userData.playerId || 'unknown'} at height ${playerHeight + 0.2}`);
        
        // Store references in player userData
        player.userData.healthBarCanvas = canvas;
        player.userData.healthBarContext = context;
        player.userData.healthBar = healthBarSprite;
        
        // Add the health bar to the player
        player.add(healthBarSprite);
        
        // Initialize with default health if not set
        if (!player.userData.stats) {
            player.userData.stats = {
                life: 100,
                maxLife: 100
            };
        }
        
        // Update the health bar initially
        this.updateHealthBar(player);
        
        console.log(`Created health bar for player ${player.userData.healthBarPlayerId || player.userData.playerId || 'unknown'}`);
    }
    
    /**
     * Update a player's health bar
     * @param {THREE.Object3D} player - The player object
     */
    updateHealthBar(player) {
        if (!player || !player.userData) {
            return;
        }
        
        // CRITICAL FIX: Always use server values if available
        if (player.userData.serverLife !== undefined && player.userData.serverMaxLife !== undefined) {
            // Use updateHealthBarWithServerValues instead
            this.updateHealthBarWithServerValues(player);
            return;
        }
        
        // Create health bar if it doesn't exist
        if (!player.userData.healthBar) {
            this.createHealthBar(player);
            return;
        }
        
        const healthBarSprite = player.userData.healthBar;
        const canvas = player.userData.healthBarCanvas;
        const context = player.userData.healthBarContext;
        
        if (!canvas || !context) {
            console.warn('Missing canvas or context for health bar, recreating...');
            this.createHealthBar(player);
            return;
        }
        
        // Calculate health percentage
        let healthPercent = 1.0;
        if (player.userData.stats && player.userData.stats.life !== undefined && player.userData.stats.maxLife !== undefined) {
            // Store the current health values to prevent unexpected changes
            const currentLife = player.userData.stats.life;
            const maxLife = player.userData.stats.maxLife;
            
            // Calculate percentage with bounds checking
            healthPercent = Math.max(0, Math.min(1, currentLife / maxLife));
            
            // Get player ID for debugging
            const playerId = player.userData.healthBarPlayerId || player.userData.playerId || 'unknown';
            
            // Only log significant changes to reduce spam
            if (player.userData.lastHealthPercent === undefined || 
                Math.abs(player.userData.lastHealthPercent - healthPercent) > 0.05) {
                
                // Only log if this is a new value or a significant change
                if (player.userData.lastHealthPercent !== undefined) {
                    console.log(`Health bar updated for player ${playerId}: ${Math.round(player.userData.lastHealthPercent * 100)}% -> ${Math.round(healthPercent * 100)}%`);
                }
                
                // Store the current health percentage for comparison in future updates
                player.userData.lastHealthPercent = healthPercent;
                
                // Force the health bar to be visible
                if (healthBarSprite.material) {
                    healthBarSprite.material.visible = true;
                    healthBarSprite.visible = true;
                }
            } else {
                // No significant change, so don't update the visual
                return;
            }
        }
        
        // Clear the canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw the background (dark backing)
        context.fillStyle = '#222222';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Always use red for health bar to match original design
        context.fillStyle = '#ff0000';
        
        // Calculate health width - ensure it's a whole number of pixels for clean rendering
        const healthWidth = Math.floor(canvas.width * healthPercent);
        
        // Draw the health bar from left to right (linear decrease)
        context.fillRect(0, 0, healthWidth, canvas.height);
        
        // Update the texture
        if (healthBarSprite.material && healthBarSprite.material.map) {
            healthBarSprite.material.map.needsUpdate = true;
        }
    }
    
    /**
     * Update all players' health bars
     */
    updateAllHealthBars() {
        for (const [id, player] of this.players) {
            // Create a health bar if the player doesn't have one
            if (!player.userData.healthBar) {
                this.createHealthBar(player);
            }
            
            // Update the health bar
            this.updateHealthBar(player);
        }
    }
    
    // Update player color based on path
    updatePlayerColor(player) {
        if (!player) return;
        
        // Get the player's path
        const path = player.userData?.path;
        
        // Set color based on path
        let color = this.defaultPlayerColor; // Default neutral gray
        
        if (path === 'light') {
            color = this.lightPathColor; // Blue for light path
        } else if (path === 'dark') {
            color = this.darkPathColor; // Red for dark path
        }
        
        // Apply color to player model if it has a material
        if (player.children && player.children.length > 0) {
            player.traverse((child) => {
                if (child.isMesh && child.material) {
                    // If material is an array, update all materials
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            if (mat.color) mat.color.setHex(color);
                        });
                    } else if (child.material.color) {
                        child.material.color.setHex(color);
                    }
                }
            });
        }
        
        return color;
    }
    
    // Add a proper cleanup method
    cleanup() {
        console.log('PlayerManager: Cleaning up player references');
        
        // Remove any temporary local player
        if (this.localPlayer) {
            console.log('Removing local player model');
            if (this.game.scene && this.game.scene.children.includes(this.localPlayer)) {
                this.game.scene.remove(this.localPlayer);
            }
            this.localPlayer = null;
        }
        
        // Clear character model references
        this.characterModel = null;
        
        console.log('PlayerManager cleanup complete');
    }
    
    updatePlayerLife(player, currentLife, maxLife) {
        if (!player || !player.userData) return;
        
        // Update stats
        player.userData.stats = player.userData.stats || {};
        player.userData.stats.currentLife = currentLife;
        player.userData.stats.maxLife = maxLife;
        
        // Check for death
        if (currentLife <= 0 && !player.userData.isDead) {
            this.handlePlayerDeath(player);
        }
    }
    
    handlePlayerDeath(player) {
        if (!player) return;
        
        console.log(`==== PLAYER DEATH HANDLING ====`);
        console.log(`Handling death for player: ${player.userData.id || 'unknown'}`);
        
        // Save original player position for debugging
        const deathPosition = {
            x: player.position.x,
            y: player.position.y,
            z: player.position.z
        };
        console.log(`Player death position: ${JSON.stringify(deathPosition)}`);
        
        // Mark player as dead immediately to prevent further interaction
        player.userData.isDead = true;
        
        // IMPORTANT: Make player completely invisible immediately so monsters can't see/target them
        player.visible = false;
        console.log('Made player invisible at death location');
        
        // Track death count
        if (!player.userData.deathCount) {
            player.userData.deathCount = 0;
        }
        player.userData.deathCount++;
        console.log(`Player death count increased to: ${player.userData.deathCount}`);
        
        // If this is the local player, show death UI and handle game state
        if (player === this.game.localPlayer) {
            console.log('Local player died - updating game state and UI');
            
            // Update game state
            this.game.isAlive = false;
            
            // Track death in player stats if available
            if (this.game.playerStats) {
                if (!this.game.playerStats.deaths) {
                    this.game.playerStats.deaths = 0;
                }
                this.game.playerStats.deaths++;
                console.log(`Death count in player stats updated: ${this.game.playerStats.deaths}`);
            }
            
            // Disable controls while dead
            if (this.game.controlsManager && this.game.controlsManager.disableControls) {
                this.game.controlsManager.disableControls();
                console.log('Disabled player controls');
            }
            
            // Show death notification and UI
            if (this.game.uiManager) {
                this.game.uiManager.showNotification('You have died! Respawning soon...', '#ff0000');
                
                if (this.game.uiManager.showDeathScreen) {
                    this.game.uiManager.showDeathScreen();
                    console.log('Showed death screen with countdown');
                }
            }
        }
        console.log(`==== END PLAYER DEATH HANDLING ====`);
    }
    
    respawnPlayer(player) {
        if (!player) return;
        
        console.log(`==== PLAYER RESPAWN INITIATED ====`);
        
        // Current player position (should be far below ground)
        console.log(`Player position before respawn: ${JSON.stringify({
            x: player.position.x,
            y: player.position.y,
            z: player.position.z
        })}`);
        
        // Keep player invisible until server confirms respawn with temple position
        // The player will become visible only after being properly teleported to temple
        player.visible = false;
        console.log('Player kept invisible during respawn process');
        
        // For local player, request respawn position from server
        if (player === this.game.localPlayer) {
            console.log('Requesting respawn from server');
            this.game.networkManager.socket.emit('requestRespawn');
            
            // NOTE: The NetworkManager.respawnConfirmed event handler will:
            // 1. Teleport player to temple
            // 2. Reset camera position
            // 3. Make player visible at temple
            // 4. Update UI
            
            // Clear death screen UI
            if (this.game.uiManager) {
                this.game.uiManager.hideDeathScreen();
                console.log('Hiding death screen');
            }
        }
        
        console.log(`==== PLAYER RESPAWN REQUEST SENT ====`);
    }
    
    checkCollision(newPosition, previousPosition) {
        // This method is now just a stub that returns false
        // All collision detection is now handled by TerrainManager
        return false;
    }

    updatePlayerHeight(position) {
        // Removed
    }
    
    /**
     * Update a player's health bar using server values directly
     * This method ensures the health bar always reflects the server state
     * @param {THREE.Object3D} player - The player object
     */
    updateHealthBarWithServerValues(player) {
        if (!player || !player.userData) {
            return;
        }
        
        // Skip if no server values are available
        if (player.userData.serverLife === undefined || player.userData.serverMaxLife === undefined) {
            return;
        }
        
        // Create health bar if it doesn't exist
        if (!player.userData.healthBar) {
            this.createHealthBar(player);
            return;
        }
        
        const healthBarSprite = player.userData.healthBar;
        const canvas = player.userData.healthBarCanvas;
        const context = player.userData.healthBarContext;
        
        if (!canvas || !context) {
            console.warn('Missing canvas or context for health bar, recreating...');
            this.createHealthBar(player);
            return;
        }
        
        // Use server values directly
        const serverLife = player.userData.serverLife;
        const serverMaxLife = player.userData.serverMaxLife;
        
        // Calculate percentage with bounds checking
        const healthPercent = Math.max(0, Math.min(1, serverLife / serverMaxLife));
        
        // Get player ID for debugging
        const playerId = player.userData.healthBarPlayerId || player.userData.playerId || 'unknown';
        
        // Only log significant changes to reduce spam
        if (player.userData.lastHealthPercent === undefined || 
            Math.abs(player.userData.lastHealthPercent - healthPercent) > 0.05) {
            
            // Only log if this is a new value or a significant change
            if (player.userData.lastHealthPercent !== undefined) {
                console.log(`Health bar updated (server values) for player ${playerId}: ${Math.round(player.userData.lastHealthPercent * 100)}% -> ${Math.round(healthPercent * 100)}%`);
            }
            
            // Store the current health percentage for comparison in future updates
            player.userData.lastHealthPercent = healthPercent;
            
            // Force the health bar to be visible
            if (healthBarSprite.material) {
                healthBarSprite.material.visible = true;
                healthBarSprite.visible = true;
            }
        } else {
            // No significant change, so don't update the visual
            return;
        }
        
        // Clear the canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw the background (dark backing)
        context.fillStyle = '#222222';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Always use red for health bar to match original design
        context.fillStyle = '#ff0000';
        
        // Calculate health width - ensure it's a whole number of pixels for clean rendering
        const healthWidth = Math.floor(canvas.width * healthPercent);
        
        // Draw the health bar from left to right (linear decrease)
        context.fillRect(0, 0, healthWidth, canvas.height);
        
        // Update the texture
        if (healthBarSprite.material && healthBarSprite.material.map) {
            healthBarSprite.material.map.needsUpdate = true;
        }
    }
    
    // Check for collisions with other players
    // Returns true if there is a collision
    checkPlayerCollisions(position) {
        if (!this.players || this.players.size <= 1) {
            return false; // No other players to collide with
        }
        
        const playerRadius = 1.0; // Radius for player collision
        const spawnRadius = 3.0; // Radius around temple center where collisions are more lenient
        const isInSpawnArea = Math.abs(position.x) < spawnRadius && Math.abs(position.z) < spawnRadius;
        
        // Check collision with other players
        for (const [id, otherPlayer] of this.players.entries()) {
            // Skip self-collision check
            if (this.game.localPlayer && otherPlayer === this.game.localPlayer) continue;
            
            // Skip dead players
            if (otherPlayer.userData?.stats?.life <= 0 || otherPlayer.userData?.isDead) continue;
            
            const dx = position.x - otherPlayer.position.x;
            const dz = position.z - otherPlayer.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // If in spawn area, allow more movement to prevent getting stuck
            if (isInSpawnArea) {
                // Only collide if extremely close and moving closer
                if (distance < playerRadius && position.previousPosition) {
                    const prevDx = position.previousPosition.x - otherPlayer.position.x;
                    const prevDz = position.previousPosition.z - otherPlayer.position.z;
                    const prevDistance = Math.sqrt(prevDx * prevDx + prevDz * prevDz);
                    
                    // If moving away from other player, allow movement
                    if (distance >= prevDistance) {
                        continue;
                    }
                } else {
                    continue;
                }
            } else if (distance < playerRadius * 2) { // Normal collision outside spawn area
                if (position.previousPosition) {
                    // Push players apart
                    const angle = Math.atan2(dz, dx);
                    position.x = otherPlayer.position.x + (Math.cos(angle) * playerRadius * 2);
                    position.z = otherPlayer.position.z + (Math.sin(angle) * playerRadius * 2);
                }
                return true;
            }
        }
        
        return false;
    }

    /**
     * Get the local player (the player controlled by this user)
     * @returns {Object} The local player object
     */
    getLocalPlayer() {
        // If localPlayer is already set, return it
        if (this.localPlayer) {
            return this.localPlayer;
        }
        
        // If localPlayer is directly available in the game object, use that
        if (this.game.localPlayer) {
            this.localPlayer = this.game.localPlayer;
            return this.localPlayer;
        }
        
        // Otherwise, try to find it in the player collection
        if (this.game.networkManager && this.game.networkManager.socket) {
            const localPlayerId = this.game.networkManager.socket.id;
            if (localPlayerId && this.players.has(localPlayerId)) {
                this.localPlayer = this.players.get(localPlayerId);
                return this.localPlayer;
            }
        }
        
        console.warn('Could not find local player');
        return null;
    }

    /**
     * Get a player by ID
     * @param {string} id - The player's ID
     * @returns {Object} The player object if found, or null otherwise
     */
    getPlayerById(id) {
        // First check the players Map
        const playerMesh = this.players.get(id);
        
        if (!playerMesh) {
            console.log(`Player mesh not found for id: ${id}`);
            return null;
        }
        
        // Return a player object with the expected structure
        // based on player.userData.stats which is the format expected by SkillsManager/TargetingManager
        return {
            id: id,
            type: 'player',
            mesh: playerMesh,
            position: playerMesh.position,
            life: playerMesh.userData?.stats?.life || 100,
            maxLife: playerMesh.userData?.stats?.maxLife || 100,
            level: playerMesh.userData?.level || 1
        };
    }
}