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
    }
    
    async init() {
        console.log('Initializing Player Manager');
        
        try {
            // Preload character model
            this.characterModel = await this.loadCharacterModel();
            
            // Only create local player if it doesn't already exist and we're not in offline mode
            if (!this.game.localPlayer && this.game.networkManager && !this.game.networkManager.isOfflineMode) {
                console.log('PlayerManager: Creating local player');
                // Let NetworkManager handle local player creation to ensure proper synchronization
                // The actual player will be created when receiving server position
            }
            
            return true;
        } catch (error) {
            console.error('Failed to initialize PlayerManager:', error);
            return false;
        }
    }
    
    async loadCharacterModel() {
        try {
            console.log('Loading character model...');
            
            return new Promise((resolve, reject) => {
                this.loader.load(
                    this.characterModelPath,
                    (gltf) => {
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
                        
                        resolve(modelGroup);
                    },
                    (progress) => {
                        const percentComplete = Math.round((progress.loaded / progress.total) * 100);
                        console.log(`Loading character model: ${percentComplete}%`);
                    },
                    (error) => {
                        console.error('Error loading character model:', error);
                        reject(error);
                    }
                );
            });
        } catch (error) {
            console.error('Error in loadCharacterModel:', error);
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
        }
        return player;
    }
    
    async createPlayerMesh(id, position, rotation) {
        let playerMesh;
        
        try {
            // Ensure model is loaded
            if (!this.characterModel) {
                this.characterModel = await this.loadCharacterModel();
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
        if (this.game.localPlayer && now - this.lastPositionUpdate > this.updateInterval && !this.pendingPositionUpdate) {
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
                path: this.game.localPlayer.userData.path || 'neutral',
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
            
            // Show death screen
            if (this.game.uiManager) {
                this.game.uiManager.showDeathScreen();
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
}