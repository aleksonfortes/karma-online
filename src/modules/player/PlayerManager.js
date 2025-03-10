import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class PlayerManager {
    constructor(game) {
        this.game = game;
        this.loader = new GLTFLoader();
        this.characterModel = null;
        this.characterModelPath = '/models/character.glb';
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
        return new Promise((resolve, reject) => {
            this.loader.load(
                this.characterModelPath,
                (gltf) => {
                    console.log('Character model loaded successfully');
                    resolve(gltf.scene);
                },
                (progress) => {
                    console.log('Loading character model:', (progress.loaded / progress.total * 100) + '%');
                },
                (error) => {
                    console.error('Error loading character model:', error);
                    
                    // Create a fallback model if loading fails
                    console.log('Using fallback character model');
                    const fallbackModel = this.createFallbackCharacterModel();
                    resolve(fallbackModel);
                }
            );
        });
    }
    
    createFallbackCharacterModel() {
        // Create a simple character model as fallback
        const group = new THREE.Group();
        
        // Create body
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 32);
        const bodyMaterial = new THREE.MeshPhongMaterial({
            color: this.defaultPlayerColor,
            shininess: 0
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.75;
        body.name = 'body';
        group.add(body);
        
        // Create head
        const headGeometry = new THREE.SphereGeometry(0.3, 32, 32);
        const headMaterial = new THREE.MeshPhongMaterial({
            color: this.defaultPlayerColor,
            shininess: 0
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.65;
        head.name = 'head';
        group.add(head);
        
        return group;
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
        
        // Load detailed model for all players
        let playerModel = await this.loadCharacterModel();

        // Use provided position for existing players, temple center for new local player
        if (id === this.game.socket?.id) {
            playerModel.position.set(0, 3, 0); // Start at temple height
        } else {
            playerModel.position.set(
                position.x,
                position.y,
                position.z
            );
        }
        
        playerModel.rotation.y = rotation.y || 0;

        // Add shadow casting
        playerModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

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
            // Animation logic would go here
        });
    }
}