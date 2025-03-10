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
            console.log('Starting to load character model...');
            
            return new Promise((resolve, reject) => {
                this.loader.load(
                    this.characterModelPath,
                    (gltf) => {
                        console.log('Model loaded successfully:', gltf);
                        
                        // Create a group to hold the model
                        const modelGroup = new THREE.Group();
                        modelGroup.add(gltf.scene);
                        
                        // Set up the model with larger scale exactly as in original
                        gltf.scene.scale.set(5, 5, 5);
                        gltf.scene.position.y = 0;
                        gltf.scene.rotation.y = 0;
                        
                        console.log('Model setup complete');
                        resolve(modelGroup);
                    },
                    (progress) => console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%'),
                    (error) => {
                        console.error('Error loading model:', error);
                        reject(error);
                    }
                );
            });
        } catch (error) {
            console.error('Error in loadCharacterModel:', error);
            // Fallback to basic character if loading fails
            return this.createFallbackCharacterModel();
        }
    }
    
    createFallbackCharacterModel() {
        console.log('Creating fallback character model');
        const playerGroup = new THREE.Group();
        
        // Create shared geometries if they don't exist
        if (!this.game.sharedGeometries) {
            this.game.sharedGeometries = {
                playerBase: new THREE.BoxGeometry(0.8, 1.2, 0.5),
                playerHead: new THREE.SphereGeometry(0.3, 16, 16)
            };
        }
        
        // Create shared materials if they don't exist
        if (!this.game.sharedMaterials) {
            this.game.sharedMaterials = {
                playerBody: new THREE.MeshPhongMaterial({
                    color: this.defaultPlayerColor,
                    shininess: 10
                })
            };
        }
        
        // Use shared geometries and materials
        const body = new THREE.Mesh(
            this.game.sharedGeometries.playerBase, 
            this.game.sharedMaterials.playerBody.clone()
        );
        body.castShadow = true;
        body.receiveShadow = true;
        playerGroup.add(body);

        const head = new THREE.Mesh(
            this.game.sharedGeometries.playerHead, 
            this.game.sharedMaterials.playerBody.clone()
        );
        head.position.y = 0.75;
        head.castShadow = true;
        head.receiveShadow = true;
        playerGroup.add(head);

        return playerGroup;
    }
    
    async createLocalPlayer() {
        // Create player model
        let playerModel;
        
        if (this.characterModel) {
            // Clone the preloaded model
            playerModel = this.characterModel.clone();
        } else {
            // Create fallback model if no model is loaded
            playerModel = this.createFallbackCharacterModel();
        }
        
        // Set initial position
        playerModel.position.set(0, 0, 0);
        
        // Add to scene
        this.game.scene.add(playerModel);
        
        // Store reference to local player
        this.game.localPlayer = playerModel;
        
        // Add to players map with socket ID as key (if connected)
        if (this.game.socket && this.game.socket.id) {
            this.game.players.set(this.game.socket.id, playerModel);
        }
        
        // Add shadow casting
        playerModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        console.log('Local player created');
        return playerModel;
    }
    
    async createPlayer(id, position = { x: 0, y: 1.5, z: 0 }, rotation = { y: 0 }) {
        console.log('Creating player mesh for ID:', id);
        console.log('Position:', position);
        console.log('Rotation:', rotation);
        console.log('Is local player:', id === this.game.socket?.id);
        
        // Load detailed model for all players - this now returns a Group with scene inside
        let playerModel = await this.loadCharacterModel();
        console.log('Player model loaded:', playerModel);

        // Use provided position for existing players, temple center for new local player
        if (id === this.game.socket?.id) {
            // Don't override position for local player, use the provided position
            playerModel.position.set(
                position.x,
                position.y,
                position.z
            );
        } else {
            playerModel.position.set(
                position.x,
                position.y,
                position.z
            );
        }
        
        playerModel.rotation.y = rotation.y || 0;

        // Add shadow casting to all meshes in the model
        playerModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

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

        // Add status group to scene
        this.game.scene.add(statusGroup);

        // Set initial values and update status bars immediately
        const initialStats = id === this.game.socket?.id ? {
            life: this.game.playerStats.currentLife || 100,
            maxLife: this.game.playerStats.maxLife || 100,
            mana: this.game.playerStats.currentMana || 100,
            maxMana: this.game.playerStats.maxMana || 100,
            karma: this.game.playerStats.currentKarma || 50,
            maxKarma: this.game.playerStats.maxKarma || 100
        } : {
            life: 100,
            maxLife: 100,
            mana: 100,
            maxMana: 100,
            karma: 50,
            maxKarma: 100
        };

        // Store initial stats in userData
        playerModel.userData.stats = initialStats;
        
        // Add player to scene
        this.game.scene.add(playerModel);
        
        // Store in players map
        this.game.players.set(id, playerModel);
        
        // If this is the local player, store the reference
        if (id === this.game.socket?.id) {
            this.game.localPlayer = playerModel;
            this.localPlayer = playerModel;
            this.game.isAlive = true;
        }
        
        // Force immediate update of status bars
        this.game.updatePlayerStatus(playerModel, initialStats);

        return playerModel;
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
            playerModel.position.set(0, 0, 0);
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
        
        // Reset position
        player.position.set(0, 0, 0);
        
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
}