import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
        
        // Initialize players Map - exactly like original game
        this.players = new Map();
    }
    
    async init() {
        console.log('Initializing Player Manager');
        
        try {
            // Preload character model
            this.characterModel = await this.loadCharacterModel();
            
            // Create local player
            await this.createLocalPlayer();
            
            return true;
        } catch (error) {
            console.error('Failed to initialize PlayerManager:', error);
            return false;
        }
    }
    
    async loadCharacterModel() {
        try {
            // Load the character model
            return new Promise((resolve, reject) => {
                this.loader.load(
                    this.characterModelPath,
                    (gltf) => {
                        // Create a group to hold the model
                        const modelGroup = new THREE.Group();
                        modelGroup.add(gltf.scene);
                        
                        // Set up the model with larger scale exactly as in original
                        gltf.scene.scale.set(5, 5, 5);
                        gltf.scene.position.y = 0;
                        gltf.scene.rotation.y = 0;
                        
                        // Fix materials if needed
                        gltf.scene.traverse((child) => {
                            if (child.isMesh) {
                                // Convert any incompatible materials
                                if (child.material && child.material.type === 'MeshPhongMaterial' && child.material.roughness !== undefined) {
                                    const color = child.material.color ? child.material.color.clone() : new THREE.Color(0xffffff);
                                    const newMaterial = new THREE.MeshStandardMaterial({
                                        color: color,
                                        metalness: 0.1,
                                        roughness: 0.8
                                    });
                                    child.material = newMaterial;
                                }
                                
                                // Add shadows
                                child.castShadow = true;
                                child.receiveShadow = true;
                            }
                        });
                        
                        resolve(modelGroup);
                    },
                    // Use a simple progress callback to prevent excessive logging
                    (progress) => {
                        // Only log every 25%
                        if (progress.loaded / progress.total > 0.25 && progress.loaded / progress.total < 0.3) {
                            console.log('Character model 25% loaded');
                        } else if (progress.loaded / progress.total > 0.5 && progress.loaded / progress.total < 0.55) {
                            console.log('Character model 50% loaded');
                        } else if (progress.loaded / progress.total > 0.75 && progress.loaded / progress.total < 0.8) {
                            console.log('Character model 75% loaded');
                        } else if (progress.loaded / progress.total === 1) {
                            console.log('Character model 100% loaded');
                        }
                    },
                    (error) => {
                        console.error('Error loading model, falling back to basic character');
                        reject(error);
                    }
                );
            });
        } catch (error) {
            console.error('Error in loadCharacterModel, using fallback');
            // Fallback to basic character if loading fails
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
            console.warn('Local player already exists');
            return this.game.localPlayer;
        }
        // Create player at temple center
        const position = { x: 0, y: 3, z: 0 };
        const rotation = { y: 0 };
        const player = await this.createPlayer(socketId, position, rotation, true);
        if (player) {
            this.game.localPlayer = player;
            this.game.scene.add(player);
            this.players.set(socketId, player);
        }
        return player;
    }
    
    async createPlayer(id, position = { x: 0, y: 1.5, z: 0 }, rotation = { y: 0 }, isLocal = false) {
        if (this.players.has(id)) {
            console.warn(`Player with ID ${id} already exists.`);
            return this.players.get(id);
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
        
        // Set position
        if (position) {
            playerModel.position.set(position.x, position.y, position.z);
        } else {
            playerModel.position.set(0, 3, 0); // Default to temple center
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
        if (!player || !player.userData) return;
        
        // Mark as alive
        player.userData.isDead = false;
        
        // Reset life
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
        
        // Reset position to temple center
        player.position.set(0, 3, 0);
        
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
    
    update() {
        // Update player animations and effects
        this.updatePlayerAnimations();
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
                    player.userData.mixer.update(this.game.clock.getDelta());
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
    
    updatePlayerMovement(delta) {
        if (!this.game.localPlayer || !this.game.isAlive) return;

        const speed = 0.2;
        let moveX = 0;
        let moveZ = 0;

        // Store previous position for collision detection
        const previousPosition = this.game.localPlayer.position.clone();
        
        // Calculate movement direction based on key combinations
        if (this.game.controls.forward) moveZ = -1;  // W moves north (negative Z)
        if (this.game.controls.backward) moveZ = 1;  // S moves south (positive Z)
        if (this.game.controls.left) moveX = -1;    // A moves west (negative X)
        if (this.game.controls.right) moveX = 1;    // D moves east (positive X)

        // Apply movement if any keys are pressed
        if (moveX !== 0 || moveZ !== 0) {
            // Normalize diagonal movement
            const magnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
            moveX = (moveX / magnitude) * speed;
            moveZ = (moveZ / magnitude) * speed;
            
            // Calculate next position
            const nextPosition = this.game.localPlayer.position.clone();
            nextPosition.x += moveX;
            nextPosition.z += moveZ;

            // Check collisions
            if (this.checkCollision(nextPosition, previousPosition)) {
                // Update position if no collision
                this.game.localPlayer.position.copy(nextPosition);
                
                // Update height based on temple platform
                this.updatePlayerHeight(this.game.localPlayer.position);

                // Update rotation to face movement direction - matching original game
                const targetRotation = Math.atan2(moveX, moveZ);
                let currentRotation = this.game.localPlayer.rotation.y;
                const rotationDiff = targetRotation - currentRotation;
                
                // Normalize rotation difference to [-PI, PI]
                let normalizedDiff = rotationDiff;
                while (normalizedDiff > Math.PI) normalizedDiff -= 2 * Math.PI;
                while (normalizedDiff < -Math.PI) normalizedDiff += 2 * Math.PI;
                
                // Apply smooth rotation
                this.game.localPlayer.rotation.y += Math.sign(normalizedDiff) * 
                    Math.min(Math.abs(normalizedDiff), 0.15);

                // Send position update to server if enough time has passed
                const now = Date.now();
                if (now - this.lastPositionUpdate >= this.updateInterval) {
                    this.lastPositionUpdate = now;
                    if (this.game.networkManager && this.game.networkManager.socket) {
                        this.game.networkManager.sendPlayerState();
                    }
                }
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