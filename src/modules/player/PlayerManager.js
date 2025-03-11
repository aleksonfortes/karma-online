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
        // Check if there's a socket connection
        if (!this.game.networkManager?.socket?.id) {
            const localPlayer = await this.createOfflinePlayer();
            this.game.localPlayer = localPlayer;
            this.game.isAlive = true;
            return localPlayer;
        }
        
        // Get socket ID
        const socketId = this.game.networkManager.socket.id;
        
        // Create player at temple center
        const position = { x: 0, y: 3, z: 0 };
        const rotation = { y: 0 };
        
        // Create player using socket ID
        return this.createPlayer(socketId, position, rotation);
    }
    
    async createOfflinePlayer() {
        // For offline mode, create a player with a random ID
        const randomId = 'offline-' + Math.floor(Math.random() * 1000000);
        const position = { x: 0, y: 3, z: 0 };
        const rotation = { y: 0 };
        
        return this.createPlayer(randomId, position, rotation);
    }
    
    async createPlayer(id, position = { x: 0, y: 1.5, z: 0 }, rotation = { y: 0 }) {
        console.log('Creating player mesh for ID:', id);
        console.log('Position:', position);
        console.log('Rotation:', rotation);
        console.log('Is local player:', id === this.game.socket?.id);
        
        // Check if player already exists - don't create duplicates
        if (this.game.players.has(id)) {
            console.warn(`Player ${id} already exists, not creating another instance`);
            return this.game.players.get(id);
        }
        
        // Load detailed model for all players
        let playerModel;
        try {
            playerModel = await this.loadCharacterModel();
            
            // Use provided position for existing players, temple center for new local player
            if (id === this.game.socket?.id) {
                console.log('Setting local player position to temple center (0, 3, 0)');
                playerModel.position.set(0, 3, 0); // Start at temple height
            } else {
                console.log(`Setting remote player position to (${position.x}, ${position.y}, ${position.z})`);
                playerModel.position.set(
                    position.x,
                    position.y,
                    position.z
                );
            }
            
            playerModel.rotation.y = rotation.y || 0;
            
            // Create status bars group that will not inherit rotation
            const statusGroup = new THREE.Group();
            statusGroup.position.y = 2.0; // Position above player's head
            
            const barWidth = 1;
            const barHeight = 0.1;
            const barSpacing = 0.05;
            const barGeometry = new THREE.PlaneGeometry(barWidth, barHeight);

            // Create background bars
            const backgroundMaterial = new THREE.MeshBasicMaterial({
                color: 0x333333,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.7
            });

            // Create three status bars (life, mana, karma)
            const bars = ['life', 'mana', 'karma'].map((type, index) => {
                const background = new THREE.Mesh(barGeometry, backgroundMaterial.clone());
                const fillMaterial = new THREE.MeshBasicMaterial({
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.9
                });
                const fill = new THREE.Mesh(barGeometry, fillMaterial);
                
                // Set colors based on type
                if (type === 'life') {
                    fillMaterial.color = new THREE.Color(0xff0000); // Red for life
                } else if (type === 'mana') {
                    fillMaterial.color = new THREE.Color(0x0000ff); // Blue for mana
                } else if (type === 'karma') {
                    background.material.color = new THREE.Color(0xffffff); // White bg for karma
                    fillMaterial.color = new THREE.Color(0xffcc00); // Gold for karma
                }
                
                // Position bars vertically stacked with smaller spacing
                const yOffset = (barHeight + barSpacing) * (2 - index);
                background.position.y = yOffset;
                fill.position.y = yOffset;
                fill.position.z = 0.001; // Slightly in front
                
                // Set initial scale
                fill.scale.x = 1.0;
                
                // Center bars horizontally
                background.position.x = 0;
                fill.position.x = 0;

                statusGroup.add(background);
                statusGroup.add(fill);

                return {
                    background,
                    fill,
                    width: barWidth,
                    type
                };
            });
            
            // Store status bars and group in player model's userData
            playerModel.userData = playerModel.userData || {};
            playerModel.userData.statusBars = bars;
            playerModel.userData.statusGroup = statusGroup;
            playerModel.userData.isPlayer = true;
            playerModel.userData.id = id;
            playerModel.userData.createdAt = Date.now(); // Track when this player was created
            
            // Set the internal movement speed to match original
            playerModel.userData.movementSpeed = 0.1;

            // Add status group to scene
            this.game.scene.add(statusGroup);
            
            // Add shadow casting to all meshes in the model
            playerModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            // Add debug info for tracking player instances
            console.log(`Created player ${id} at position:`, playerModel.position);
            console.log(`Total players after creation: ${this.game.players.size + 1}`);
            
            return playerModel;
        } catch (error) {
            console.error('Failed to create player:', error);
            return this.createFallbackCharacterModel();
        }
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
            
            // Update status bar position to follow player
            if (player.userData.statusGroup) {
                const worldPosition = new THREE.Vector3();
                player.getWorldPosition(worldPosition);
                player.userData.statusGroup.position.set(
                    worldPosition.x,
                    worldPosition.y + 2.0,
                    worldPosition.z
                );
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
    
    // Helper method to create a status bar
    createStatusBar(color) {
        // Create a group for the status bar
        const barGroup = new THREE.Group();
        
        // Create background (dark gray)
        const barWidth = 1;
        const barHeight = 0.1;
        const barGeometry = new THREE.PlaneGeometry(barWidth, barHeight);
        const backgroundMaterial = new THREE.MeshBasicMaterial({
            color: 0x333333,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        });
        const background = new THREE.Mesh(barGeometry, backgroundMaterial);
        
        // Create foreground (colored fill)
        const fillMaterial = new THREE.MeshBasicMaterial({
            color: color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9
        });
        const fill = new THREE.Mesh(barGeometry, fillMaterial);
        fill.position.z = 0.001; // Slightly in front
        
        // Add to group
        barGroup.add(background);
        barGroup.add(fill);
        
        // Store references
        barGroup.userData = {
            background: background,
            fill: fill,
            width: barWidth
        };
        
        return barGroup;
    }
}