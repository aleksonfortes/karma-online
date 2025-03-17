import * as THREE from 'three';
import { UIManager } from './modules/ui/UIManager.js';
import { NetworkManager } from './modules/network/NetworkManager.js';
import { PlayerManager } from './modules/player/PlayerManager.js';
import { SkillsManager } from './modules/skills/SkillsManager.js';
import { KarmaManager } from './modules/karma/KarmaManager.js';
import { TerrainManager } from './modules/terrain/TerrainManager.js';
import { NPCManager } from './modules/npc/NPCManager.js';
import { EnvironmentManager } from './modules/environment/EnvironmentManager.js';
import { CameraManager } from './modules/camera/CameraManager.js';
import { TargetingManager } from './modules/targeting/TargetingManager.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import GameConstants from '../server/src/config/GameConstants.js';
import { getServerUrl } from './config.js';

export class Game {
    constructor() {
        // Initialize Three.js components
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        
        // Game state
        this.players = new Map();
        this.localPlayer = null;
        this.isRunning = true;
        this.isAlive = true;
        this.SERVER_URL = getServerUrl();
        
        // Controls
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false
        };
        
        // Initialize player stats
        this.playerStats = {
            currentLife: 100,
            maxLife: 100,
            currentMana: 100,
            maxMana: 100,
            currentKarma: 50,
            maxKarma: 100,
            level: 1,
            experience: 0,
            experienceToNextLevel: 100,
            path: null
        };
        
        // Skills system
        this.skills = {
            martial_arts: {
                name: 'Martial Arts',
                key: 'Space',
                slot: 1,
                damage: 75,
                range: 3,
                cooldown: 2000,
                lastUsed: 0,
                icon: '🥋'
            }
        };
        this.activeSkills = new Set();
        
        // Timing
        this.clock = new THREE.Clock();
        this.lastTime = 0;
        this.lastPositionLog = 0;
        this.logFrequency = 5000;
        
        // Initialize camera manager
        this.cameraManager = new CameraManager(this);
        
        // Initialize the game
        this.initialize();
    }

    async initialize() {
        try {
            console.log('Initializing game...');
            
            // Create Three.js scene
            this.setupScene();
            
            // Initialize managers in the correct order
            await this.initializeManagers();
            
            // Setup input handling
            this.setupInputHandlers();
            
            // Start the game loop
            this.startGameLoop();
            
            console.log('Game initialization complete');
        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.handleInitializationError(error);
        }
    }

    async initializeManagers() {
        try {
            // Create all managers
            this.uiManager = new UIManager(this);
            this.networkManager = new NetworkManager(this);
            this.playerManager = new PlayerManager(this);
            this.skillsManager = new SkillsManager(this);
            this.karmaManager = new KarmaManager(this);
            this.cameraManager = new CameraManager(this);
            this.targetingManager = new TargetingManager(this);
            
            // Initialize UI first so we can show loading indicators
            await this.uiManager.init();
            this.uiManager.showLoadingScreen('Connecting to server...');
            
            // Initialize network first - required for game to work
            const networkInitialized = await this.networkManager.init();
            if (!networkInitialized) {
                throw new Error('Failed to connect to server');
            }
            
            // Initialize player - this already loads the character model
            await this.playerManager.init();
            
            // Initialize other systems that depend on player
            await this.skillsManager.init();
            await this.karmaManager.init();
            
            // Initialize environment
            this.environmentManager = new EnvironmentManager(this);
            await this.environmentManager.init();
            
            // Initialize terrain
            this.terrainManager = new TerrainManager(this);
            await this.terrainManager.init();
            
            // Initialize NPCManager last
            this.npcManager = new NPCManager(this);
            await this.npcManager.init();
            
            // Initialize TargetingManager
            await this.targetingManager.init();
            
            // Now that everything is loaded, hide loading screen and show game UI
            this.uiManager.hideLoadingScreen();
            this.uiManager.createUI();
        } catch (error) {
            console.error('Failed to initialize managers:', error);
            this.handleInitializationError(error);
        }
    }

    // Handle network-related events from NetworkManager
    onNetworkEvent(eventName, data) {
        console.log(`Network event: ${eventName}`, data);
        
        switch (eventName) {
            case 'gameUpdate':
                // Handle game state update from server
                this.handleGameUpdate(data);
                break;
                
            default:
                console.log('Unhandled network event:', eventName);
        }
    }

    // Handle events from PlayerManager
    onPlayerEvent(eventName) {
        console.log(`Player event: ${eventName}`);
        
        switch (eventName) {
            case 'characterLoaded':
                // Character is ready to be shown in scene
                console.log('Character loaded and ready');
                break;
                
            default:
                console.log('Unhandled player event:', eventName);
        }
    }

    handleInitializationError(error) {
        console.error('Game initialization error:', error);
        
        // Show error message to the user
        this.uiManager.hideLoadingScreen();
        this.uiManager.showErrorScreen(`Failed to initialize game: ${error.message}`);
    }

    handleGameUpdate(data) {
        // Process game state updates from server
        
        // Update karma if provided
        if (data.karma !== undefined && this.playerManager && this.karmaManager) {
            this.playerManager.playerStats.currentKarma = data.karma;
            this.karmaManager.updateKarmaEffects();
            this.uiManager.updateStatusBars();
        }
    }

    setupScene() {
        console.log('Setting up scene...');
        
        // Setup renderer
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.setClearColor(0x004488); // Ocean blue background
        document.body.appendChild(this.renderer.domElement);
        
        // Add fog to the scene
        this.scene.fog = new THREE.Fog(0x004488, 150, 400);
        
        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(5, 15, 8);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
        
        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x0066aa, 0.6);
        this.scene.add(hemisphereLight);
        
        console.log('Scene setup complete');
    }

    setupInputHandlers() {
        console.log('Setting up input handlers...');
        
        // Keyboard events for movement
        document.addEventListener('keydown', (event) => {
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
            
            switch (event.code) {
                case 'KeyW': this.controls.forward = true; break;
                case 'KeyS': this.controls.backward = true; break;
                case 'KeyA': this.controls.left = true; break;
                case 'KeyD': this.controls.right = true; break;
                case 'Space': 
                    if (this.isAlive) this.skillsManager?.useMartialArts();
                    break;
                case 'KeyE':
                    if (this.isAlive) this.npcManager?.handleInteraction();
                    break;
                case 'Escape':
                    // Clear current target when pressing Escape
                    this.targetingManager?.clearTarget();
                    break;
                case 'KeyK':
                    // Test karma - increase karma (dark path)
                    if (this.isAlive && this.karmaManager) {
                        console.log('Increasing karma - moving toward dark path (testing)');
                        this.karmaManager.adjustKarma(10);
                        this.uiManager?.showNotification('Karma increased by 10 (more debt)', '#444444');
                    }
                    break;
                case 'KeyJ':
                    // Test karma - decrease karma (light path)
                    if (this.isAlive && this.karmaManager) {
                        console.log('Decreasing karma - moving toward light path (testing)');
                        this.karmaManager.adjustKarma(-10);
                        this.uiManager?.showNotification('Karma decreased by 10 (less debt)', '#ffffff');
                    }
                    break;
                case 'Digit8':
                    // Test karma - reset karma to default
                    if (this.isAlive && this.karmaManager) {
                        console.log('Resetting karma to default (testing)');
                        // Calculate amount needed to reset to 50
                        const resetAmount = 50 - this.playerStats.currentKarma;
                        this.karmaManager.adjustKarma(resetAmount);
                        this.uiManager?.showNotification('Karma reset to default (50)', '#ffffff');
                    }
                    break;
            }
        });
        
        document.addEventListener('keyup', (event) => {
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
            
            switch (event.code) {
                case 'KeyW': this.controls.forward = false; break;
                case 'KeyS': this.controls.backward = false; break;
                case 'KeyA': this.controls.left = false; break;
                case 'KeyD': this.controls.right = false; break;
            }
        });
        
        // Mouse click event for targeting
        this.renderer.domElement.addEventListener('click', (event) => {
            if (!this.isAlive) return;
            
            console.log('Mouse click detected');
            
            // Log player information
            console.log('Local player:', this.localPlayer ? {
                id: this.localPlayer.userData?.id || 'unknown',
                position: this.localPlayer.position ? 
                    `(${this.localPlayer.position.x.toFixed(2)}, ${this.localPlayer.position.y.toFixed(2)}, ${this.localPlayer.position.z.toFixed(2)})` : 'N/A'
            } : 'No local player');
            
            console.log('All players in game:', Array.from(this.players.entries()).map(([id, player]) => {
                return {
                    id: id,
                    isLocalPlayer: player === this.localPlayer,
                    position: player.position ? 
                        `(${player.position.x.toFixed(2)}, ${player.position.y.toFixed(2)}, ${player.position.z.toFixed(2)})` : 'N/A'
                };
            }));
            
            // Calculate mouse position in normalized device coordinates (-1 to +1)
            const rect = this.renderer.domElement.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            console.log(`Mouse click at screen coordinates: (${event.clientX}, ${event.clientY})`);
            console.log(`Normalized coordinates: (${x.toFixed(4)}, ${y.toFixed(4)})`);
            console.log(`Canvas rect: left=${rect.left.toFixed(0)}, top=${rect.top.toFixed(0)}, width=${rect.width.toFixed(0)}, height=${rect.height.toFixed(0)}`);
            
            // Check if targeting manager exists
            if (this.targetingManager) {
                console.log('Targeting manager exists, handling targeting');
                const mousePosition = new THREE.Vector2(x, y);
                this.targetingManager.handleTargeting(mousePosition);
            } else {
                console.warn('No targeting manager available');
            }
        });
        
        console.log('Input handlers setup complete');
    }

    startGameLoop() {
        console.log('Starting game loop...');
        
        const animate = () => {
            if (!this.isRunning) return;
            
            requestAnimationFrame(animate);
            
            try {
                const delta = this.clock.getDelta();
                this.update(delta);
                this.renderer.render(this.scene, this.cameraManager.getCamera());
            } catch (error) {
                console.error('Error in animation loop:', error);
            }
        };
        
        animate();
        console.log('Game loop started');
    }

    update(delta) {
        // Update player movement if we have a local player
        if (this.localPlayer && this.isAlive) {
            this.updatePlayerMovement(delta);
        }
        
        // Update all managers
        this.networkManager?.update(delta);
        this.playerManager?.update(delta);
        this.skillsManager?.update(delta);
        this.karmaManager?.update(delta);
        this.npcManager?.update(delta);
        this.uiManager?.update(delta);
        this.environmentManager?.update(delta);
        this.cameraManager?.update(delta);
        this.targetingManager?.update(delta);
        
        // Continuous collision check - ensure player is never inside a pillar
        if (this.localPlayer && this.environmentManager) {
            // Force check statue collisions every frame
            this.environmentManager.checkStatueCollisions(
                this.localPlayer.position,
                this.localPlayer.position.clone() // Use current position as previous
            );
            
            // Always apply terrain height after collision checks
            if (this.terrainManager) {
                this.terrainManager.applyTerrainHeight(this.localPlayer.position);
            }
        }
        
        // Update camera
        if (this.localPlayer) {
            this.cameraManager.update(delta);
        }
    }

    updatePlayerMovement(delta) {
        if (!this.localPlayer || !this.isAlive) return;

        const moveSpeed = 0.2;
        let moveX = 0;
        let moveZ = 0;
        let didMove = false;

        // Calculate movement direction
        if (this.controls.forward) { moveZ = -moveSpeed; didMove = true; }
        if (this.controls.backward) { moveZ = moveSpeed; didMove = true; }
        if (this.controls.left) { moveX = -moveSpeed; didMove = true; }
        if (this.controls.right) { moveX = moveSpeed; didMove = true; }

        if (didMove) {
            // Store previous position for collision detection
            const previousPosition = this.localPlayer.position.clone();
            
            // Calculate target rotation based on movement direction
            const targetRotation = Math.atan2(moveX, moveZ);
            
            // Set player rotation immediately to face movement direction
            this.localPlayer.rotation.y = targetRotation;
            
            // Move in the direction the player is facing
            this.localPlayer.position.x += moveX;
            this.localPlayer.position.z += moveZ;
            
            // Store previous position reference for terrain boundary handling
            this.localPlayer.position.previousPosition = previousPosition;
            
            let collision = false;
            
            // Check for collisions with each system
            // Each manager is responsible for its own collision detection
            
            // 1. Check terrain boundaries and apply height
            if (this.terrainManager) {
                const terrainCollision = this.terrainManager.handleTerrainCollision(this.localPlayer.position);
                if (terrainCollision) {
                    collision = true;
                }
            }
            
            // 2. Check statue collisions
            if (this.environmentManager) {
                const statueCollision = this.environmentManager.checkStatueCollisions(
                    this.localPlayer.position, 
                    previousPosition
                );
                if (statueCollision) {
                    collision = true;
                    // Ensure height is correct after statue collision resolution
                    if (this.terrainManager) {
                        this.terrainManager.applyTerrainHeight(this.localPlayer.position);
                    }
                }
            }
            
            // 3. Check NPC collisions
            if (!collision && this.npcManager) {
                const npcCollision = this.npcManager.checkNPCCollisions(
                    this.localPlayer.position, 
                    previousPosition
                );
                if (npcCollision) {
                    collision = true;
                    // Ensure height is correct after NPC collision resolution
                    if (this.terrainManager) {
                        this.terrainManager.applyTerrainHeight(this.localPlayer.position);
                    }
                }
            }
            
            // 4. Check player collisions
            if (!collision && this.playerManager) {
                const playerCollision = this.playerManager.checkPlayerCollisions(
                    this.localPlayer.position
                );
                if (playerCollision) {
                    collision = true;
                    // Ensure height is correct after player collision resolution
                    if (this.terrainManager) {
                        this.terrainManager.applyTerrainHeight(this.localPlayer.position);
                    }
                }
            }
            
            // If there was a collision, reset position
            if (collision) {
                this.localPlayer.position.copy(previousPosition);
                // Ensure height is correct after position reset
                if (this.terrainManager) {
                    this.terrainManager.applyTerrainHeight(this.localPlayer.position);
                }
            }
            
            // Send position update to server
            this.networkManager?.sendPlayerState({
                x: this.localPlayer.position.x,
                y: this.localPlayer.position.y,
                z: this.localPlayer.position.z,
                rotation: {
                    y: this.localPlayer.rotation.y
                }
            });
        }
    }

    /**
     * Choose a path for the player and notify the server
     * @param {string} path - The path to choose ('light' or 'dark')
     */
    choosePath(path) {
        if (this.playerStats.path) {
            console.log(`Already chosen path: ${this.playerStats.path}`);
            return false;
        }
        
        // Set path locally
        this.playerStats.path = path;
        
        // Notify server about path choice
        if (this.networkManager) {
            this.networkManager.sendPathChoice(path);
        }
        
        console.log(`Path chosen: ${path}`);
        return true;
    }
}