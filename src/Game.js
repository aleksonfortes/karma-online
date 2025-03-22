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
import { MonsterManager } from './modules/monster/MonsterManager.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import GameConstants from '../server/src/config/GameConstants.js';
import { getServerUrl } from './config.js';

export class Game {
    constructor(serverUrl) {
        // Initialize Three.js components
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        
        // Enable debug flags
        this.DEBUG_MONSTERS = false; // Disable monster debugging by default to reduce console spam
        
        // Game state
        this.players = new Map();
        this.localPlayer = null;
        this.isRunning = true;
        this.isAlive = true;
        this.isInitialized = false;
        this.isOfflineMode = false;
        this.isPaused = false;
        this.SERVER_URL = serverUrl || getServerUrl();
        this.currentTime = 0;
        
        // Add game constants for use by other modules
        this.gameConstants = GameConstants;
        
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
            
            // Mark game as fully initialized
            this.isInitialized = true;
            
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
            this.monsterManager = new MonsterManager(this);
            
            // Initialize UI first so we can show loading indicators
            await this.uiManager.init();
            this.uiManager.showLoadingScreen('Connecting to server...');
            
            // Initialize network with retry logic
            let networkInitialized = false;
            let retryCount = 0;
            const MAX_RETRIES = 3;
            
            while (!networkInitialized && retryCount < MAX_RETRIES) {
                try {
                    this.uiManager.updateLoadingScreen(`Connecting to server (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
                    networkInitialized = await this.networkManager.init();
                    
                    if (!networkInitialized) {
                        retryCount++;
                        if (retryCount < MAX_RETRIES) {
                            // Wait before retrying
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                    }
                } catch (err) {
                    console.error('Network connection error:', err);
                    retryCount++;
                    if (retryCount < MAX_RETRIES) {
                        // Wait before retrying
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }
            
            if (!networkInitialized) {
                // Don't proceed if we can't connect to the server
                console.error('Failed to connect to server. The game requires a server connection to run.');
                this.handleInitializationError(new Error('Server connection required'));
                throw new Error('Server connection required');
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
            
            // Initialize MonsterManager after NPCs
            await this.monsterManager.init();
            
            // Now that everything is loaded, hide loading screen and show game UI
            this.uiManager.hideLoadingScreen();
            this.uiManager.createUI();
        } catch (error) {
            console.error('Failed to initialize managers:', error);
            this.handleInitializationError(error);
            throw error; // Rethrow to stop initialization
        }
    }

    // Handle network-related events from NetworkManager
    onNetworkEvent(eventName, data) {
        console.log(`Network event received: ${eventName}`);
        
        // Forward to appropriate event handlers
        switch(eventName) {
            case 'game_state':
                this.handleGameUpdate(data);
                break;
            case 'monster_data':
                this.monsterManager.processServerMonsters(data);
                break;
            case 'monster_update':
                this.monsterManager.processMonsterUpdate(data);
                break;
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

    /**
     * Handle initialization errors
     * @param {Error} error - The error that occurred
     */
    handleInitializationError(error) {
        console.error('Game initialization error:', error);
        
        // Hide loading screen if it exists
        if (this.uiManager) {
            this.uiManager.hideLoadingScreen();
        }
        
        // Show error message
        const errorContainer = document.createElement('div');
        errorContainer.style.position = 'fixed';
        errorContainer.style.top = '0';
        errorContainer.style.left = '0';
        errorContainer.style.width = '100%';
        errorContainer.style.height = '100%';
        errorContainer.style.display = 'flex';
        errorContainer.style.flexDirection = 'column';
        errorContainer.style.alignItems = 'center';
        errorContainer.style.justifyContent = 'center';
        errorContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        errorContainer.style.color = '#ff0000';
        errorContainer.style.fontFamily = 'Arial, sans-serif';
        errorContainer.style.fontSize = '24px';
        errorContainer.style.zIndex = '10000';
        
        const title = document.createElement('h1');
        title.textContent = 'Game Initialization Failed';
        title.style.marginBottom = '20px';
        
        const message = document.createElement('p');
        message.textContent = error.message || 'Failed to connect to server. The game requires a server connection to run.';
        message.style.marginBottom = '30px';
        message.style.textAlign = 'center';
        message.style.maxWidth = '600px';
        
        const retryButton = document.createElement('button');
        retryButton.textContent = 'Retry Connection';
        retryButton.style.padding = '15px 30px';
        retryButton.style.fontSize = '18px';
        retryButton.style.backgroundColor = '#4CAF50';
        retryButton.style.border = 'none';
        retryButton.style.borderRadius = '5px';
        retryButton.style.color = 'white';
        retryButton.style.cursor = 'pointer';
        retryButton.addEventListener('click', () => {
            location.reload();
        });
        
        errorContainer.appendChild(title);
        errorContainer.appendChild(message);
        errorContainer.appendChild(retryButton);
        
        document.body.appendChild(errorContainer);
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

    /**
     * Set up input handlers for keyboard and mouse
     */
    setupInputHandlers() {
        // Set up keyboard handler for movement and skills
        document.addEventListener('keydown', (event) => {
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
            
            switch (event.code) {
                case 'KeyW': this.controls.forward = true; break;
                case 'KeyS': this.controls.backward = true; break;
                case 'KeyA': this.controls.left = true; break;
                case 'KeyD': this.controls.right = true; break;
                case 'Space': 
                    if (this.isAlive) {
                        // Check if player has chosen a path - skip in test environment
                        const isTestEnvironment = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';
                        if (!this.playerStats.path && !isTestEnvironment) {
                            console.log('You must choose a path (light or dark) before using skills');
                            // Show UI message if UI manager exists
                            if (this.uiManager && typeof this.uiManager.showNotification === 'function') {
                                this.uiManager.showNotification('Choose a path (light or dark) first');
                            } else if (this.uiManager && typeof this.uiManager.showMessage === 'function') {
                                this.uiManager.showMessage('Choose a path (light or dark) first');
                            }
                            break;
                        }
                        
                        // Check if we have targeting manager and a monster targeted
                        const target = this.targetingManager?.currentTarget;
                        if (target && target.type === 'monster' && this.skillsManager) {
                            // Get the monster
                            const monster = this.monsterManager?.getMonsterById(target.id);
                            if (monster) {
                                // Only attempt to attack if monster exists
                                this.skillsManager.useSkillOnMonster(target.id);
                            }
                        } else if (this.skillsManager) {
                            // Check if there's no target and show notification if needed
                            if (!target && this.uiManager && typeof this.uiManager.showNotification === 'function') {
                                this.uiManager.showNotification('No target selected', 'white');
                            } else {
                                // Use appropriate skill based on path
                                const skillToUse = this.skillsManager.getDefaultSkill();
                                if (skillToUse === 'martial_arts') {
                                    this.skillsManager.useMartialArts();
                                } else if (skillToUse === 'dark_ball') {
                                    this.skillsManager.useDarkBall();
                                }
                            }
                        }
                    }
                    break;
                case 'KeyR':
                    // R key for skill in slot 2
                    if (this.isAlive && this.skillsManager) {
                        const skillId = this.skillsManager.getSkillBySlot(2); // Slot 2 is R
                        if (skillId) {
                            this.skillsManager.useSkill(skillId);
                        } else if (this.uiManager && typeof this.uiManager.showNotification === 'function') {
                            this.uiManager.showNotification('No skill assigned to R', 'white');
                        }
                    }
                    break;
                case 'KeyF':
                    // F key for skill in slot 3
                    if (this.isAlive && this.skillsManager) {
                        const skillId = this.skillsManager.getSkillBySlot(3); // Slot 3 is F
                        if (skillId) {
                            this.skillsManager.useSkill(skillId);
                        } else if (this.uiManager && typeof this.uiManager.showNotification === 'function') {
                            this.uiManager.showNotification('No skill assigned to F', 'white');
                        }
                    }
                    break;
                case 'KeyV':
                    // V key for skill in slot 4
                    if (this.isAlive && this.skillsManager) {
                        const skillId = this.skillsManager.getSkillBySlot(4); // Slot 4 is V
                        if (skillId) {
                            this.skillsManager.useSkill(skillId);
                        } else if (this.uiManager && typeof this.uiManager.showNotification === 'function') {
                            this.uiManager.showNotification('No skill assigned to V', 'white');
                        }
                    }
                    break;
                case 'Digit4':
                    // 4 key for skill in slot 5
                    if (this.isAlive && this.skillsManager) {
                        const skillId = this.skillsManager.getSkillBySlot(5); // Slot 5 is 4
                        if (skillId) {
                            this.skillsManager.useSkill(skillId);
                        } else if (this.uiManager && typeof this.uiManager.showNotification === 'function') {
                            this.uiManager.showNotification('No skill assigned to 4', 'white');
                        }
                    }
                    break;
                case 'KeyE':
                    // E key for NPC interaction
                    if (this.isAlive && this.npcManager && this.npcManager.isNearNPC()) {
                        this.npcManager.handleInteraction();
                    }
                    break;
                case 'Digit3':
                    // Handle NPC interaction with the number 3 key
                    if (this.isAlive && this.npcManager) this.npcManager.handleInteraction();
                    break;
                case 'KeyO':
                    // O key for gaining XP in dev mode
                    if (this.networkManager && typeof this.networkManager.isDevModeAvailable === 'function' 
                        && this.networkManager.isDevModeAvailable()) {
                        console.log('DEV MODE: Gaining XP');
                        // Show notification
                        if (this.uiManager && typeof this.uiManager.showNotification === 'function') {
                            this.uiManager.showNotification('DEV MODE: Gaining XP', '#00ff00');
                        }
                        // Send request to server for XP gain
                        this.networkManager.socket.emit('dev_action', { 
                            action: 'gain_xp', 
                            amount: 50 
                        });
                    }
                    // Completely silent in production - no logs, no messages, no network requests
                    break;
                case 'KeyK':
                    // K key for gaining karma in dev mode
                    if (this.networkManager && typeof this.networkManager.isDevModeAvailable === 'function'
                        && this.networkManager.isDevModeAvailable()) {
                        console.log('DEV MODE: Gaining Karma');
                        // Show notification
                        if (this.uiManager && typeof this.uiManager.showNotification === 'function') {
                            this.uiManager.showNotification('DEV MODE: Gaining Karma', '#00ff00');
                        }
                        // Send request to server for karma gain
                        this.networkManager.socket.emit('dev_action', { 
                            action: 'gain_karma', 
                            amount: 10 
                        });
                    }
                    // Completely silent in production - no logs, no messages, no network requests
                    break;
                case 'KeyJ':
                    // J key for losing karma in dev mode
                    if (this.networkManager && this.networkManager.isDevModeAvailable()) {
                        console.log('DEV MODE: Losing Karma');
                        // Show notification
                        if (this.uiManager && typeof this.uiManager.showNotification === 'function') {
                            this.uiManager.showNotification('DEV MODE: Losing Karma', '#ff3300');
                        }
                        // Send request to server for karma loss
                        this.networkManager.socket.emit('dev_action', { 
                            action: 'lose_karma', 
                            amount: 10 
                        });
                    }
                    // Completely silent in production - no logs, no messages, no network requests
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
        
        // Set up mouse click handler for targeting
        document.addEventListener('click', (event) => {
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || 
                event.target.tagName === 'BUTTON' || event.target.classList.contains('ui-element')) {
                return;
            }
            
            console.log('Mouse click event detected');
            this.handleMouseClick(event);
        });
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

    /**
     * Main update function, called every frame
     * @param {number} delta - Time in seconds since the last frame
     */
    update(delta) {
        // Skip updates during initialization or when paused
        if (!this.isInitialized || this.isPaused) {
            return;
        }
        
        // Update time-based events
        this.currentTime += delta;
        
        // Update player movement if we have a local player
        if (this.localPlayer && this.isAlive) {
            this.updatePlayerMovement(delta);
        }
        
        // Update all managers (safely with optional chaining)
        if (this.networkManager) {
            this.networkManager.update(delta);
        }
        
        this.playerManager?.update(delta);
        this.skillsManager?.update(delta);
        this.karmaManager?.update(delta);
        this.npcManager?.update(delta);
        this.uiManager?.update(delta);
        this.environmentManager?.update(delta);
        this.cameraManager?.update(delta);
        this.targetingManager?.update();
        this.monsterManager?.update(delta);
        
        // Periodic health check to fix common rendering issues
        if (this.healthCheckCounter === undefined) {
            this.healthCheckCounter = 0;
        }
        
        // Run health check every 5 seconds (assuming 60fps)
        this.healthCheckCounter += delta;
        if (this.healthCheckCounter > 5) {
            this.healthCheckCounter = 0;
            this.runHealthCheck();
        }
        
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
    }

    /**
     * Periodic health check to fix common rendering issues
     */
    runHealthCheck() {
        // Check for monster visibility issues
        if (this.monsterManager && this.monsterManager.monsters) {
            let fixedCount = 0;
            
            this.monsterManager.monsters.forEach((monster) => {
                // Skip dead monsters
                if (!monster.isAlive || monster.health <= 0) return;
                
                // Check if monster mesh exists and is not visible
                if (monster.mesh && monster.mesh.visible === false) {
                    console.log(`Health check: Found invisible monster ${monster.id}, fixing visibility`);
                    monster.mesh.visible = true;
                    fixedCount++;
                    
                    // Also check child meshes
                    monster.mesh.traverse(child => {
                        if ((child.isMesh || child.isObject3D) && child.visible === false) {
                            child.visible = true;
                        }
                    });
                }
            });
            
            if (fixedCount > 0) {
                console.log(`Health check fixed visibility for ${fixedCount} monsters`);
            }
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
            
            // 5. Check monster collisions
            if (!collision && this.monsterManager) {
                const monsterCollision = this.monsterManager.checkMonsterCollisions(
                    this.localPlayer.position,
                    previousPosition
                );
                if (monsterCollision) {
                    collision = true;
                    // Ensure height is correct after monster collision resolution
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

    /**
     * Handle mouse click
     * @param {Event} event - Mouse event
     */
    handleMouseClick(event) {
        // Only handle left mouse button clicks
        if (event.button !== 0) return;
        
        // Convert screen coordinates to normalized device coordinates
        const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // Create a normalized vector for the mouse position
        const mousePosition = new THREE.Vector2(mouseX, mouseY);
        
        console.log('Mouse click:', {
            x: mouseX.toFixed(2), 
            y: mouseY.toFixed(2)
        });
        
        // Try to target something at the click position
        if (this.targetingManager) {
            this.targetingManager.handleTargeting(mousePosition);
        }
    }
}