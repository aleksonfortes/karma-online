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
        this.respawnDelay = 5000; // 5 seconds
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
        if (this.players.has(id)) {
            console.warn(`Player with ID ${id} already exists.`);
            return this.players.get(id);
        }
        
        // Use default position if none provided
        if (!position) {
            position = { ...GameConstants.PLAYER.DEFAULT_POSITION };
        }
        
        const player = await this.createPlayerMesh(id, position, rotation);
        if (player) {
            this.players.set(id, player);
            this.game.scene.add(player);
            if (isLocal) {
                this.game.localPlayer = player;
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
                
                // CRITICAL FIX: Lock the health value to prevent oscillation
                // This ensures that once we've updated to a value, we don't update again for a short period
                if (!player.userData.healthLocked) {
                    player.userData.healthLocked = true;
                    
                    // Unlock after a delay to allow for new legitimate updates
                    setTimeout(() => {
                        player.userData.healthLocked = false;
                    }, 1000); // 1 second lock to prevent oscillation
                } else {
                    // If we're locked, don't update the visual
                    return;
                }
            } else {
                // No significant change, so don't update the visual
                return;
            }
        }
        
        // CRITICAL FIX: Check for final health update flag
        // If this player has a final health update, use the server values directly
        if (player.userData.finalHealthUpdate && player.userData.serverLife !== undefined) {
            // Use server values directly for final updates
            const serverLife = player.userData.serverLife;
            const serverMaxLife = player.userData.serverMaxLife || 100;
            
            // Recalculate health percentage using server values
            healthPercent = Math.max(0, Math.min(1, serverLife / serverMaxLife));
            
            // Log this special case
            console.log(`Using final health update for player ${player.userData.playerId}: ${Math.round(healthPercent * 100)}%`);
        }
        
        // Clear the canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw the background (dark backing)
        context.fillStyle = '#222222';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Always use red for health bar to match original design
        context.fillStyle = '#ff0000';
        const healthWidth = Math.floor(canvas.width * healthPercent);
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
        if (!player || !player.userData) return;
        
        // Mark as dead
        player.userData.isDead = true;
        
        // Visual changes for dead player
        player.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.transparent = true;
                child.material.opacity = 0.5;
            }
        });
        
        // Lower to ground
        player.position.y = 0.1;
        
        // Rotate to lie down
        player.rotation.x = Math.PI / 2;
        
        // If this is the local player, handle death UI
        if (player === this.game.localPlayer) {
            this.game.isAlive = false;
            
            // Show death message using the UI manager
            if (this.game.uiManager) {
                // Check if showDeathScreen exists, otherwise use showNotification
                if (typeof this.game.uiManager.showDeathScreen === 'function') {
                    this.game.uiManager.showDeathScreen();
                } else if (typeof this.game.uiManager.showNotification === 'function') {
                    this.game.uiManager.showNotification('You have died! Respawning in ' + (this.respawnDelay / 1000) + ' seconds...', '#ff0000');
                } else {
                    console.warn('No UI method available to show death message');
                }
            }
            
            // Notify server
            if (this.game.socket && this.game.socket.connected) {
                this.game.socket.emit('playerDeath', {
                    id: this.game.socket.id
                });
            }
            
            // Set respawn timer
            setTimeout(() => {
                this.respawnPlayer(player);
            }, this.respawnDelay);
        }
    }
    
    respawnPlayer(player) {
        if (!player) return;
        
        // Reset player stats
        if (player.userData.stats) {
            player.userData.stats.currentLife = player.userData.stats.maxLife;
            this.updatePlayerLife(player, player.userData.stats.currentLife, player.userData.stats.maxLife);
        }
        
        // Visual changes for respawned player
        player.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.transparent = false;
                child.material.opacity = 1.0;
            }
        });
        
        // For local player, request respawn position from server
        if (player === this.game.localPlayer) {
            this.game.networkManager.socket.emit('requestRespawn');
            
            // Set temporary position until server responds
            player.position.set(
                GameConstants.PLAYER.DEFAULT_POSITION.x,
                GameConstants.PLAYER.DEFAULT_POSITION.y,
                GameConstants.PLAYER.DEFAULT_POSITION.z
            );
        }
        // For network players, position will be updated by server
        
        // Reset rotation
        player.rotation.set(0, 0, 0);
        
        // If this is the local player, handle respawn UI
        if (player === this.game.localPlayer) {
            this.game.isAlive = true;
            
            // Hide death screen
            if (this.game.uiManager) {
                this.game.uiManager.hideDeathScreen();
            }
            
            // Notify server
            if (this.game.socket && this.game.socket.connected) {
                this.game.socket.emit('playerRespawn', {
                    id: this.game.socket.id,
                    position: {
                        x: player.position.x,
                        y: player.position.y,
                        z: player.position.z
                    },
                    stats: player.userData.stats
                });
            }
        }
    }
    
    checkCollision(newPosition, previousPosition) {
        const templeRadius = 15; // Temple platform radius
        const templeCenter = new THREE.Vector3(0, 0, 0);
        
        // Check if player is on temple platform
        const distanceFromTemple = newPosition.distanceTo(templeCenter);
        const wasOnTemple = previousPosition.distanceTo(templeCenter) <= templeRadius;
        
        // Check for temple cross shape with precise dimensions
        const isOnVertical = Math.abs(newPosition.x) <= 4.5 && Math.abs(newPosition.z) <= 12.5;
        const isOnHorizontal = Math.abs(newPosition.x) <= 12.5 && Math.abs(newPosition.z) <= 4.5;
        
        if (distanceFromTemple <= templeRadius || isOnVertical || isOnHorizontal) {
            // On temple platform - set height to 3
            newPosition.y = 3;
            return true;
        } else {
            // On grass - set height to 1.5
            newPosition.y = 1.5;
            return true;
        }
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
        
        // CRITICAL FIX: Check if we're in a locked state
        if (player.userData.healthLocked) {
            return;
        }
        
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
            
            // CRITICAL FIX: Lock the health value to prevent oscillation
            player.userData.healthLocked = true;
            
            // Unlock after a delay to allow for new legitimate updates
            setTimeout(() => {
                player.userData.healthLocked = false;
            }, 2000); // 2 second lock to prevent oscillation
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
        const healthWidth = Math.floor(canvas.width * healthPercent);
        context.fillRect(0, 0, healthWidth, canvas.height);
        
        // Update the texture
        if (healthBarSprite.material && healthBarSprite.material.map) {
            healthBarSprite.material.map.needsUpdate = true;
        }
    }
}