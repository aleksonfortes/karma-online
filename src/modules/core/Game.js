import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { UIManager } from '../ui/UIManager.js';
import { NetworkManager } from '../network/NetworkManager.js';
import { PlayerManager } from '../player/PlayerManager.js';
import { SkillsManager } from '../skills/SkillsManager.js';
import { KarmaManager } from '../karma/KarmaManager.js';
import { NPCManager } from '../npc/NPCManager.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class Game {
    constructor(serverUrl) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.players = new Map();
        this.localPlayer = null;
        this.socket = null;
        this.isRunning = true;
        this.isAlive = true; // Explicitly set isAlive to true
        
        // Initialize controls object first
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false
        };
        
        // Initialize keys object to track key states
        this.keys = {};
        
        // Add dialogue state
        this.activeDialogue = null;
        this.dialogueUI = null;
        
        // Add skills system
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
        this.activeSkills = new Set(['martial_arts']); // Skills the player has learned
        
        // Logging control to prevent spam
        this.lastPositionLog = 0;
        this.logFrequency = 5000; // Log at most once every 5 seconds
        
        // Add camera control variables
        this.cameraOffset = { x: 0, y: 8, z: 10 };
        this.cameraTarget = null;
        this.minZoom = 12;
        this.maxZoom = 20;
        this.zoomSpeed = 0.5;
        this.currentZoom = 15;
        
        // Set up player stats
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
        
        // Shared resources for optimization
        this.sharedGeometries = {
            boxGeometry: new THREE.BoxGeometry(1, 1, 1),
            sphereGeometry: new THREE.SphereGeometry(0.5, 16, 16),
            planeGeometry: new THREE.PlaneGeometry(1, 1),
            barGeometry: new THREE.PlaneGeometry(1, 0.1),
            playerBase: new THREE.BoxGeometry(0.8, 1.2, 0.5),
            playerHead: new THREE.SphereGeometry(0.3, 16, 16)
        };
        
        this.sharedMaterials = {
            defaultMaterial: new THREE.MeshStandardMaterial({ color: 0xffffff }),
            backgroundBar: new THREE.MeshBasicMaterial({
                color: 0x333333,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.7
            }),
            playerBody: new THREE.MeshPhongMaterial({
                color: 0x999999,
                shininess: 10
            })
        };
        
        // Animation timing
        this.clock = new THREE.Clock();
        this.lastTime = 0;
        
        // Initialize game systems
        this.SERVER_URL = serverUrl || 'http://localhost:3000';
        
        // NPC flags
        this.npcProximity = false;
        
        // Call init to start the game
        this.init();
    }
    
    async init() {
        console.log('Initializing game...');
        
        try {
            // Add event for debug logging
            window.addEventListener('error', (event) => {
                console.error('Unhandled error:', event.error);
            });
            
            // Setup rendering
            this.setupScene();
            
            // Explicitly set player position height off the ground
            this.playerY = 0; // This will be used for collision detection
            
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
            
            // Initialize managers
            await this.initializeManagers();
            
            // Create the temple in the center of the scene
            this.createTemple();
            
            // Setup event listeners after everything is loaded
            this.setupEventListeners();
            
            // Setup input handlers and camera
            this.setupInputHandlers();
            this.setupCamera();
            
            // Initialize player from template or network
            await this.initializePlayer();
            
            // Start the game loop
            this.startGameLoop();
            
            console.log('Game initialization complete');
            return true;
        } catch (error) {
            this.handleInitializationError(error);
            return false;
        }
    }
    
    // Update the player initialization method
    async initializePlayer() {
        console.log('Initializing player for the game...');
        
        try {
            // Check if we should use network mode
            const useNetworkMode = this.networkManager && this.networkManager.socket && this.networkManager.socket.connected;
            
            if (useNetworkMode) {
                console.log('Network mode detected - using socket ID:', this.networkManager.socket.id);
                
                // In network mode, create the player using the NetworkManager
                const player = await this.networkManager.createLocalPlayer();
                
                if (player) {
                    console.log('Player created successfully via network with ID:', player.userData?.id);
                    // The NetworkManager already adds the player to the scene and sets it as localPlayer
                    return true;
                } else {
                    console.warn('Failed to create player via network, falling back to offline mode');
                    // Fall back to offline mode
                    return this.createOfflinePlayer();
                }
            } else {
                // Offline mode
                return this.createOfflinePlayer();
            }
        } catch (error) {
            console.error('Error initializing player:', error);
            // Attempt recovery with offline player
            return this.createOfflinePlayer();
        }
    }
    
    // Add a helper method to create an offline player
    async createOfflinePlayer() {
        console.log('Creating offline player');
        
        try {
            // Clean up any existing player
            if (this.localPlayer) {
                console.log('Removing existing player before creating offline player');
                this.scene.remove(this.localPlayer);
                this.localPlayer = null;
            }
            
            // Create a new offline player
            const player = await this.playerManager.createPlayer(
                'offline-' + Math.floor(Math.random() * 1000000),
                { x: 0, y: 3, z: 0 },
                { y: 0 }
            );
            
            // Set as the local player
            this.localPlayer = player;
            this.isAlive = true;
            
            // Add to scene
            this.scene.add(player);
            
            // Add to players map
            if (player.userData && player.userData.id) {
                this.players.set(player.userData.id, player);
            } else {
                this.players.set('offline-player', player);
            }
            
            // Set initial stats
            this.updatePlayerStatus(player, {
                life: this.playerStats.currentLife,
                maxLife: this.playerStats.maxLife,
                mana: this.playerStats.currentMana,
                maxMana: this.playerStats.maxMana,
                karma: this.playerStats.currentKarma,
                maxKarma: this.playerStats.maxKarma
            });
            
            console.log('Offline player created successfully');
            return true;
        } catch (error) {
            console.error('Failed to create offline player:', error);
            return false;
        }
    }
    
    // Initialize managers while keeping the same flow as the original
    async initializeManagers() {
        // Create all managers
        this.uiManager = new UIManager(this);
        this.networkManager = new NetworkManager(this);
        this.playerManager = new PlayerManager(this);
        this.skillsManager = new SkillsManager(this);
        this.karmaManager = new KarmaManager(this);
        this.npcManager = new NPCManager(this);
        
        // Initialize UI first so we can show loading indicators
        this.uiManager.init();
        this.uiManager.showLoadingScreen('Connecting to server...');
        
        try {
            // Initialize network first to determine if we're online
            const networkInitResult = await this.networkManager.init();
            
            // If network initialization failed, immediately go to offline mode
            if (!networkInitResult) {
                throw new Error('Network initialization returned false');
            }
            
            // Try to connect with a timeout
            let isConnected = false;
            const connectionTimeout = 10000; // 10 seconds
            const startTime = Date.now();
            
            while (!isConnected && Date.now() - startTime < connectionTimeout) {
                if (this.networkManager.isConnected) {
                    isConnected = true;
                    break;
                }
                
                // Wait a short time before checking again
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (!isConnected) {
                console.warn('Connection timeout, continuing in offline mode');
                this.networkManager.enterOfflineMode();
                this.uiManager.showNotification('Failed to connect to server - playing in offline mode', 'warning');
                this.uiManager.hideLoadingScreen();
            }
        } catch (error) {
            console.warn('Network initialization failed, continuing in offline mode:', error);
            this.networkManager.enterOfflineMode();
            this.uiManager.showNotification('Network error - playing in offline mode', 'warning');
            this.uiManager.hideLoadingScreen();
        }
        
        // Continue with other managers initialization regardless of network status
        this.playerManager.init();
        this.skillsManager.init();
        this.karmaManager.init();
        this.npcManager.init();
    }
    
    // Setup event listeners just like in the original
    setupEventListeners() {
        // Keyboard events - these are now handled directly in Game.js, not in PlayerManager
        document.addEventListener('keydown', (event) => this.handleKeyDown(event));
        document.addEventListener('keyup', (event) => this.handleKeyUp(event));
        
        // Mouse events
        document.addEventListener('wheel', (event) => this.handleMouseWheel(event));
        document.addEventListener('click', (event) => this.handleMouseClick(event));
        
        // Window resize event
        window.addEventListener('resize', () => this.handleResize());
    }
    
    // Handle key down events
    handleKeyDown(event) {
        // Skip if inside input field or dialogue is active
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        if (this.activeDialogue) {
            return; // Don't process movement if dialogue is active
        }
        
        // Safely track key state
        if (!this.keys) this.keys = {};
        this.keys[event.code] = true;
        
        // Ensure controls object exists
        if (!this.controls) {
            this.controls = {
                forward: false,
                backward: false,
                left: false,
                right: false
            };
        }
        
        switch (event.code) {
            case 'KeyW':
                this.controls.forward = true;
                break;
            case 'KeyS':
                this.controls.backward = true;
                break;
            case 'KeyA':
                this.controls.left = true;
                break;
            case 'KeyD':
                this.controls.right = true;
                break;
            case 'Space':
                if (typeof this.useMartialArts === 'function') {
                    this.useMartialArts();
                }
                break;
            case 'KeyE':
                if (typeof this.handleInteraction === 'function') {
                    this.handleInteraction();
                }
                break;
            case 'KeyK':
                if (typeof this.adjustKarma === 'function') {
                    this.adjustKarma(10); // Increase Karma by 10
                }
                break;
            case 'KeyR':
                if (typeof this.adjustKarma === 'function') {
                    this.adjustKarma(-this.playerStats.currentKarma); // Reset Karma to 0
                }
                break;
            case 'KeyF12':
                // Force clean all players (debug)
                if (this.networkManager && typeof this.networkManager.forceCleanAllPlayers === 'function') {
                    console.log('🧹 MANUAL CLEANUP: Force cleaning all ghost players...');
                    this.networkManager.forceCleanAllPlayers();
                }
                break;
        }
    }
    
    // Handle key up events
    handleKeyUp(event) {
        // Skip if inside input field
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // Safely track key state
        if (!this.keys) this.keys = {};
        this.keys[event.code] = false;
        
        // Ensure controls object exists
        if (!this.controls) {
            this.controls = {
                forward: false,
                backward: false,
                left: false,
                right: false
            };
        }
        
        switch (event.code) {
            case 'KeyW':
                this.controls.forward = false;
                break;
            case 'KeyS':
                this.controls.backward = false;
                break;
            case 'KeyA':
                this.controls.left = false;
                break;
            case 'KeyD':
                this.controls.right = false;
                break;
        }
    }
    
    // Handle mouse wheel for camera zoom
    handleMouseWheel(event) {
        // Zoom in/out with mouse wheel
        const zoomAmount = event.deltaY * 0.001 * this.zoomSpeed;
        this.currentZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.currentZoom + zoomAmount));
    }
    
    // Handle window resize
    handleResize() {
        // Update camera aspect ratio and renderer size
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        // Update UI elements if they exist
        if (this.uiManager) {
            this.uiManager.updateStatusBarsPosition();
        }
    }
    
    animate() {
        if (!this.isRunning) return;
        
        // Calculate delta time
        const now = Date.now();
        const deltaTime = (now - this.lastTime) / 1000;
        this.lastTime = now;
        
        // Request next frame
        requestAnimationFrame(() => this.animate());
        
        try {
            // Update status bars at a lower frequency (every 100ms)
            if (!this.lastStatusUpdate || now - this.lastStatusUpdate >= 100) {
                // Update all players' status bars
                this.players.forEach((playerMesh) => {
                    if (playerMesh.userData && playerMesh.userData.stats) {
                        this.updatePlayerStatus(playerMesh, playerMesh.userData.stats, true);
                    }
                });
                
                // Update local player status
                if (this.localPlayer && this.playerStats) {
                    this.updatePlayerStatus(this.localPlayer, {
                        life: this.playerStats.life,
                        maxLife: this.playerStats.maxLife,
                        mana: this.playerStats.mana,
                        maxMana: this.playerStats.maxMana,
                        karma: this.playerStats.karma,
                        maxKarma: this.playerStats.maxKarma
                    }, true);
                }
                
                // Update UI status bars
                this.updateStatusBars();
                
                this.lastStatusUpdate = now;
            }
            
            // Update camera to follow player
            this.updateCamera();
            
            // Update player movement
            this.updatePlayer();
            
            // Update status bar positions
            this.updateStatusBarPositions();
            
            // Update network state if connected
            if (this.networkManager) {
                try {
                    this.networkManager.update();
                } catch (error) {
                    console.error('Error updating network state:', error);
                }
            }
            
            // Update NPC interaction text if it exists
            if (this.darkNPC && this.darkNPC.userData.interactionText) {
                this.darkNPC.userData.interactionText.lookAt(this.camera.position);
            }
            if (this.lightNPC && this.lightNPC.userData.interactionText) {
                this.lightNPC.userData.interactionText.lookAt(this.camera.position);
            }
            
            // Render the scene
            this.renderer.render(this.scene, this.camera);
        } catch (error) {
            console.error('Error in animation loop:', error);
        }
    }
    
    // Helper method to update status bar positions
    updateStatusBarPositions() {
        // Update status bar positions for all players
        this.players.forEach(player => {
            if (player && player.userData && player.userData.statusGroup) {
                const worldPosition = new THREE.Vector3();
                player.getWorldPosition(worldPosition);
                
                player.userData.statusGroup.position.set(
                    worldPosition.x,
                    worldPosition.y + 2.0, // Position above player's head
                    worldPosition.z
                );
                
                // Make status group face the camera
                player.userData.statusGroup.quaternion.copy(this.camera.quaternion);
            }
        });
        
        // Also update local player if not in players map
        if (this.localPlayer && 
            this.localPlayer.userData && 
            this.localPlayer.userData.statusGroup && 
            !this.players.has(this.socket?.id)) {
            
            const worldPosition = new THREE.Vector3();
            this.localPlayer.getWorldPosition(worldPosition);
            
            this.localPlayer.userData.statusGroup.position.set(
                worldPosition.x,
                worldPosition.y + 2.0, // Position above player's head
                worldPosition.z
            );
            
            // Make status group face the camera
            this.localPlayer.userData.statusGroup.quaternion.copy(this.camera.quaternion);
        }
    }
    
    setupCamera() {
        // Set initial camera position to match original isometric view
        this.camera.position.set(0, 15, 15);
        this.camera.lookAt(0, 0, 0);
        
        // Update camera matrices
        this.camera.updateProjectionMatrix();
        
        console.log('Camera positioned at', this.camera.position);
    }
    
    handleInitializationError(error) {
        console.error('Game initialization error:', error);
        
        // Show error message to the user
        this.uiManager.hideLoadingScreen();
        this.uiManager.showErrorScreen(`Failed to initialize game: ${error.message}`);
    }
    
    handleGameUpdate(data) {
        console.log('Game update received:', data);
        
        // Update player stats if provided
        if (data.stats) {
            // Update local player stats
            this.playerStats.currentLife = data.stats.life || this.playerStats.currentLife;
            this.playerStats.maxLife = data.stats.maxLife || this.playerStats.maxLife;
            this.playerStats.currentMana = data.stats.mana || this.playerStats.currentMana;
            this.playerStats.maxMana = data.stats.maxMana || this.playerStats.maxMana;
            this.playerStats.currentKarma = data.stats.karma || this.playerStats.currentKarma;
            this.playerStats.maxKarma = data.stats.maxKarma || this.playerStats.maxKarma;
            
            // Update UI
            if (this.localPlayer) {
                this.updatePlayerStatus(this.localPlayer, {
                    life: this.playerStats.currentLife,
                    maxLife: this.playerStats.maxLife,
                    mana: this.playerStats.currentMana,
                    maxMana: this.playerStats.maxMana,
                    karma: this.playerStats.currentKarma,
                    maxKarma: this.playerStats.maxKarma
                });
            }
        }
        
        // Handle other game updates as needed
        if (data.message) {
            // Show message to player
            if (this.uiManager) {
                this.uiManager.showNotification(data.message, data.messageType || 'info');
            }
        }
    }
    
    setupScene() {
        // Setup renderer with a background color matching the ocean
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.setClearColor(0x004488); // Match the ocean color exactly
        document.body.appendChild(this.renderer.domElement);
        
        // Setup camera for isometric view
        this.camera.position.set(0, 15, 15);
        this.camera.lookAt(0, 0, 0);
        this.camera.rotation.x = -Math.PI / 4;
        
        // Add fog to blend with the background
        this.scene.fog = new THREE.Fog(0x004488, 150, 400);
        
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);
        
        // Add directional light from above
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(5, 15, 8);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
        
        // Add hemisphere light for better environment lighting
        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x0066aa, 0.6);
        this.scene.add(hemisphereLight);
        
        // Create terrain first (it should be above the ocean)
        this.createTerrain();
        
        // Create ocean border (it should be below the terrain)
        this.createOcean();
    }
    
    setupInputHandlers() {
        console.log('Setting up input handlers');
        
        // Keyboard events for movement
        document.addEventListener('keydown', (event) => {
            switch (event.key.toLowerCase()) {
                case 'w':
                    this.controls.forward = true;
                    break;
                case 's':
                    this.controls.backward = true;
                    break;
                case 'a':
                    this.controls.left = true;
                    break;
                case 'd':
                    this.controls.right = true;
                    break;
                case ' ': // Space bar for martial arts
                    this.useMartialArts();
                    break;
                case 'e': // E key for interaction
                    this.handleInteraction();
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            switch (event.key.toLowerCase()) {
                case 'w':
                    this.controls.forward = false;
                    break;
                case 's':
                    this.controls.backward = false;
                    break;
                case 'a':
                    this.controls.left = false;
                    break;
                case 'd':
                    this.controls.right = false;
                    break;
            }
        });

        // Add mouse wheel event listener for zoom
        window.addEventListener('wheel', (event) => {
            // Determine zoom direction
            const zoomAmount = event.deltaY * 0.01 * this.zoomSpeed;
            
            // Calculate new zoom level
            this.currentZoom = Math.max(
                this.minZoom,
                Math.min(this.maxZoom, this.currentZoom + zoomAmount)
            );
            
            // Update camera offset
            const zoomRatio = this.currentZoom / 15; // 15 is the default zoom
            this.cameraOffset.y = 15 * zoomRatio;
            this.cameraOffset.z = 15 * zoomRatio;
        });

        // Update camera aspect ratio and size when window resizes
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
    
    setupEnvironment() {
        console.log('Setting up environment to match original game');
        
        // Create water surface
        const waterSize = 500;
        const waterGeometry = new THREE.PlaneGeometry(waterSize, waterSize);
        
        // Deep blue water color like original game
        const waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x001a33, // Dark blue like original game
            roughness: 0.1,
            metalness: 0.8,
            transparent: true,
            opacity: 0.7
        });
        
        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.rotation.x = -Math.PI / 2;
        water.position.y = -0.5; // Lower position
        water.receiveShadow = true;
        this.scene.add(water);
        
        // Create ground with green color that matches original game
        const groundSize = 500;
        const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
        
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x336633, // Darker green like original
            roughness: 0.8,
            side: THREE.DoubleSide
        });
        
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.4; // Just above water
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        console.log('Environment setup complete');
    }
    
    startGameLoop() {
        // Initialize the animation loop
        this.isRunning = true;
        console.log('Starting game loop');
        
        // Set a flag to track if we've logged initialization issues
        let initIssuesLogged = false;
        
        // Start the animation loop
        const animate = () => {
            if (!this.isRunning) return;
            
            requestAnimationFrame(animate);
            
            try {
                // Get timing
                const delta = this.clock.getDelta();
                const elapsedTime = this.clock.getElapsedTime();
                
                // Skip the first few frames to ensure everything is loaded
                if (elapsedTime < 0.5) {
                    this.renderer.render(this.scene, this.camera);
                    return;
                }
                
                // Check if we're ready to update
                const isReadyToUpdate = this.scene && this.camera;
                
                if (!isReadyToUpdate) {
                    if (!initIssuesLogged) {
                        console.warn('Game not fully initialized yet, waiting...');
                        initIssuesLogged = true;
                    }
                    return;
                }
                
                // Update the world
                this.update(delta);
                
                // Render the scene
                this.renderer.render(this.scene, this.camera);
            } catch (error) {
                console.error('Error in animation loop:', error);
            }
        };
        
        // Start the animation loop
        animate();
    }
    
    cleanup() {
        console.log('Cleaning up game resources');
        
        // Delegate cleanup to managers
        if (this.networkManager) this.networkManager.cleanup();
        if (this.playerManager) this.playerManager.cleanup();
        if (this.uiManager) this.uiManager.cleanup();
        if (this.karmaManager) this.karmaManager.cleanup();
        if (this.npcManager) this.npcManager.cleanup();
        
        // Remove the game canvas
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.remove();
        }
        
        // Dispose of shared resources
        if (this.sharedGeometries) {
            Object.values(this.sharedGeometries).forEach(geometry => geometry.dispose());
        }
        
        if (this.sharedMaterials) {
            Object.values(this.sharedMaterials).forEach(material => material.dispose());
        }
        
        // Stop the animation loop
        this.isRunning = false;
    }
    
    // Camera update to follow player
    updateCamera() {
        if (!this.localPlayer) return;

        // Get the player's position
        const playerPosition = this.localPlayer.position;
        
        // Calculate camera offset based on zoom level
        const zoomFactor = this.currentZoom / 15; // Normalize to default zoom
        const offsetY = this.cameraOffset.y * zoomFactor;
        const offsetZ = this.cameraOffset.z * zoomFactor;
        
        // Calculate target camera position
        const targetX = playerPosition.x;
        const targetY = playerPosition.y + offsetY;
        const targetZ = playerPosition.z + offsetZ;
        
        // Use a smoothness factor for camera movement (lower = smoother)
        const smoothness = 0.05;
        
        // Smoothly move camera to target position
        this.camera.position.x += (targetX - this.camera.position.x) * smoothness;
        this.camera.position.y += (targetY - this.camera.position.y) * smoothness;
        this.camera.position.z += (targetZ - this.camera.position.z) * smoothness;
        
        // Always look at player position (slightly above feet)
        const lookAtPosition = playerPosition.clone();
        lookAtPosition.y += 1.5; // Look at player's upper body
        this.camera.lookAt(lookAtPosition);
    }
    
    createTerrain() {
        // Terrain size (more like LoL)
        const size = 200; // Increased from 120 to 200 for a larger arena
        const segments = 128;
        
        // Create plane geometry
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        
        // Create terrain material with grass texture
        const grassTexture = new THREE.TextureLoader().load('/textures/grass.jpg');
        grassTexture.wrapS = THREE.RepeatWrapping;
        grassTexture.wrapT = THREE.RepeatWrapping;
        grassTexture.repeat.set(25, 25); // Increased texture repeat to match larger size
        
        const material = new THREE.MeshPhongMaterial({
            map: grassTexture,
            shininess: 0,
            side: THREE.DoubleSide
        });
        
        // Create terrain mesh
        const terrain = new THREE.Mesh(geometry, material);
        terrain.rotation.x = -Math.PI / 2;
        terrain.position.y = 0;
        terrain.receiveShadow = true;
        this.scene.add(terrain);
        
        // Store terrain data for collision detection
        this.terrain = {
            geometry,
            size,
            segments
        };
    }
    
    createOcean() {
        // Ocean size (much larger than terrain to prevent black space)
        const oceanSize = 4000;
        const arenaRadius = this.terrain.size / 2;
        
        // Load water textures with improved settings
        const waterNormals = new THREE.TextureLoader().load('/textures/waternormals.jpg');
        waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
        waterNormals.repeat.set(8, 8); // Reduced repeat for less obvious tiling
        
        // Create water materials with improved settings
        const waterMaterial = new THREE.MeshPhongMaterial({
            color: 0x004488,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            normalMap: waterNormals,
            normalScale: new THREE.Vector2(1.5, 1.5), // Reduced normal intensity
            shininess: 80,
            specular: 0x444444,
            reflectivity: 0.8
        });
        
        // Create main ocean (large plane underneath everything)
        const mainOceanGeometry = new THREE.PlaneGeometry(oceanSize, oceanSize, 50, 50); // Added segments for wave deformation
        const mainOcean = new THREE.Mesh(mainOceanGeometry, waterMaterial);
        mainOcean.rotation.x = -Math.PI / 2;
        mainOcean.position.y = -2.5;
        this.scene.add(mainOcean);

        // Create gradient transition rings
        const transitionSegments = 128;
        const transitionWidth = 40;
        const ringCount = 20;
        const startOpacity = 0.9;
        const startY = -0.5;

        this.waveRings = [];
        
        // Create transition rings from grass to water
        for (let i = 0; i < ringCount; i++) {
            const t = i / (ringCount - 1);
            const radius = arenaRadius + (t * transitionWidth);
            
            const ringGeometry = new THREE.RingGeometry(
                radius,
                radius + (transitionWidth / ringCount),
                transitionSegments,
                1
            );
            
            const ringMaterial = waterMaterial.clone();
            // More gradual opacity transition
            ringMaterial.opacity = startOpacity * Math.pow(1 - t, 2);
            
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.rotation.x = -Math.PI / 2;
            
            const yOffset = -t * 2;
            ring.position.y = startY + yOffset;
            
            this.scene.add(ring);
            
            this.waveRings.push({
                mesh: ring,
                baseY: startY + yOffset,
                phase: i * (Math.PI * 2 / ringCount), // Better phase distribution
                amplitude: 0.05 * (1 - t) // Reduced wave amplitude
            });
        }

        // Store ocean data
        this.ocean = {
            mainMesh: mainOcean,
            material: waterMaterial,
            waterTime: 0
        };
    }
    
    createTemple() {
        const templeGroup = new THREE.Group();
        
        // Create a custom temple floor texture pattern (chess style)
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 512;
        
        // Fill background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Create chess pattern
        const tileSize = 64;
        const tiles = canvas.width / tileSize;
        
        for (let i = 0; i < tiles; i++) {
            for (let j = 0; j < tiles; j++) {
                // Chess pattern colors
                const isEven = (i + j) % 2 === 0;
                ctx.fillStyle = isEven ? '#2a2a2a' : '#1a1a1a';
                
                // Draw chess tile
                ctx.fillRect(
                    i * tileSize,
                    j * tileSize,
                    tileSize,
                    tileSize
                );
                
                // Add subtle border to tiles
                ctx.strokeStyle = '#333333';
                ctx.lineWidth = 1;
                ctx.strokeRect(
                    i * tileSize,
                    j * tileSize,
                    tileSize,
                    tileSize
                );
            }
        }
        
        // Create texture from canvas
        const floorTexture = new THREE.CanvasTexture(canvas);
        floorTexture.wrapS = THREE.RepeatWrapping;
        floorTexture.wrapT = THREE.RepeatWrapping;
        floorTexture.repeat.set(4, 4);
        
        // Create floor material with the custom texture
        const floorMaterial = new THREE.MeshPhongMaterial({
            map: floorTexture,
            color: 0x666666,
            shininess: 30,
            bumpMap: floorTexture,
            bumpScale: 0.2,
        });

        // Create elevated platform
        const baseHeight = 1.5;
        const baseGeometry = new THREE.BoxGeometry(30, baseHeight, 30);
        const basePlatform = new THREE.Mesh(baseGeometry, floorMaterial);
        basePlatform.position.y = baseHeight / 2; // Position at half height
        basePlatform.receiveShadow = true;
        templeGroup.add(basePlatform);

        // Add corner statues - adjusted positions for new height
        const statuePositions = [
            { x: 13, z: 13 },  // Northeast
            { x: -13, z: 13 }, // Northwest
            { x: 13, z: -13 }, // Southeast
            { x: -13, z: -13 } // Southwest
        ];

        // Create statue material
        const statueMaterial = new THREE.MeshPhongMaterial({
            color: 0x808080,
            shininess: 10,
            roughness: 0.8,
        });

        this.statueColliders = [];

        statuePositions.forEach((pos, index) => {
            // Create statue base
            const baseStatueHeight = 3;
            const baseWidth = 2;
            const statueBase = new THREE.Mesh(
                new THREE.BoxGeometry(baseWidth, baseStatueHeight, baseWidth),
                statueMaterial
            );
            statueBase.position.set(pos.x, baseHeight + baseStatueHeight/2, pos.z);
            statueBase.castShadow = true;
            statueBase.receiveShadow = true;

            // Create statue body
            const bodyHeight = 4;
            const bodyWidth = 1.5;
            const statueBody = new THREE.Mesh(
                new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyWidth),
                statueMaterial
            );
            statueBody.position.set(pos.x, baseHeight + baseStatueHeight + bodyHeight/2, pos.z);
            statueBody.castShadow = true;
            statueBody.receiveShadow = true;

            // Create statue head
            const headSize = 1;
            const statueHead = new THREE.Mesh(
                new THREE.BoxGeometry(headSize, headSize, headSize),
                statueMaterial
            );
            statueHead.position.set(pos.x, baseHeight + baseStatueHeight + bodyHeight + headSize/2, pos.z);
            statueHead.castShadow = true;
            statueHead.receiveShadow = true;

            // Add to temple group
            templeGroup.add(statueBase);
            templeGroup.add(statueBody);
            templeGroup.add(statueHead);

            // Create collider for the statue
            this.statueColliders.push({
                position: new THREE.Vector3(pos.x, 0, pos.z),
                radius: baseWidth // Changed from baseWidth / 1.5 to baseWidth for larger collision area
            });
        });

        // Create cross-shaped upper platform
        const floorGroup = new THREE.Group();
        
        // Vertical part of cross
        const verticalGeometry = new THREE.BoxGeometry(8, 0.5, 24);
        const verticalFloor = new THREE.Mesh(verticalGeometry, floorMaterial);
        verticalFloor.position.y = baseHeight + 0.25; // Position above base
        verticalFloor.receiveShadow = true;
        floorGroup.add(verticalFloor);
        
        // Horizontal part of cross
        const horizontalGeometry = new THREE.BoxGeometry(24, 0.5, 8);
        const horizontalFloor = new THREE.Mesh(horizontalGeometry, floorMaterial);
        horizontalFloor.position.y = baseHeight + 0.25; // Position above base
        horizontalFloor.receiveShadow = true;
        floorGroup.add(horizontalFloor);
        
        templeGroup.add(floorGroup);

        // Add temple light
        const templeLight = new THREE.PointLight(0xffd700, 0.8, 30);
        templeLight.position.set(0, baseHeight + 4, 0); // Adjust light height
        templeGroup.add(templeLight);

        // Add NPC to the temple
        this.loadNPC(templeGroup, baseHeight);

        // Position the entire temple
        templeGroup.position.set(0, 0, 0);
        this.scene.add(templeGroup);
        
        // Store temple reference
        this.temple = templeGroup;
    }
    
    updatePlayer() {
        // Debug controls and player status
        const now = Date.now();
        if (now - (this._lastDebugLog || 0) > 5000) {
            console.log("DEBUG Controls:", 
                this.controls, 
                "LocalPlayer exists:", !!this.localPlayer,
                "Position:", this.localPlayer?.position ? {
                    x: this.localPlayer.position.x.toFixed(2),
                    y: this.localPlayer.position.y.toFixed(2),
                    z: this.localPlayer.position.z.toFixed(2)
                } : null
            );
            this._lastDebugLog = now;
        }

        // Skip update if player doesn't exist, but try to recover
        if (!this.localPlayer) {
            // Try to recover by creating a local player
            this.createLocalPlayerIfMissing();
            return;
        }
        
        // Verify this is really a valid player object
        if (!this.localPlayer.position || !this.localPlayer.rotation) {
            console.warn("Local player object is invalid, recreating...");
            this.localPlayer = null;
            this.createLocalPlayerIfMissing();
            return;
        }
        
        // Calculate movement based on key state
        const speed = 0.2;
        const rotationSpeed = 0.15;
        let moveX = 0;
        let moveZ = 0;
        let didMove = false;

        // Determine movement direction from controls
        if (this.controls.forward) {
            moveZ = -speed;
            didMove = true;
        }
        if (this.controls.backward) {
            moveZ = speed;
            didMove = true;
        }
        if (this.controls.left) {
            moveX = -speed;
            didMove = true;
        }
        if (this.controls.right) {
            moveX = speed;
            didMove = true;
        }
        
        // If no movement, update animation to idle if needed
        if (!didMove && this.localPlayer.userData.animation !== 'idle') {
            this.localPlayer.userData.animation = 'idle';
            
            // If we have a network manager, send the animation change
            if (this.networkManager && this.networkManager.isConnected) {
                this.networkManager.sendPlayerState({
                    animation: 'idle'
                });
            }
            return;
        } else if (!didMove) {
            // No change needed
            return;
        }
        
        // Store previous position for collision detection
        const previousPosition = {
            x: this.localPlayer.position.x,
            y: this.localPlayer.position.y,
            z: this.localPlayer.position.z
        };
        
        // Apply movement relative to player's rotation
        const angle = this.localPlayer.rotation.y;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        
        this.localPlayer.position.x += (moveX * cos - moveZ * sin);
        this.localPlayer.position.z += (moveX * sin + moveZ * cos);
        
        // Collision detection
        this.checkCollision(this.localPlayer.position, previousPosition);
        
        // Set running animation if moving
        if (this.localPlayer.userData.animation !== 'running') {
            this.localPlayer.userData.animation = 'running';
        }
        
        // Send position update to server if network is active
        if (this.networkManager && this.networkManager.isConnected) {
            this.networkManager.sendPlayerState({
                x: this.localPlayer.position.x,
                y: this.localPlayer.position.y,
                z: this.localPlayer.position.z,
                rx: this.localPlayer.rotation.x,
                ry: this.localPlayer.rotation.y,
                rz: this.localPlayer.rotation.z,
                animation: 'running'
            });
        }
    }
    
    // Check if player is on temple platform and update height
    isOnTemplePlatform(position) {
        if (!this.temple) return false;
        
        // Get temple dimensions
        const baseHalfWidth = 15; // 30/2 for base platform
        const crossVerticalHalfWidth = 4; // 8/2 for vertical part
        const crossHorizontalHalfWidth = 12; // 24/2 for horizontal part
        const crossVerticalHalfLength = 12; // 24/2 for vertical part
        const crossHorizontalHalfLength = 4; // 8/2 for horizontal part

        // Check if position is within base platform bounds
        const isOnBase = Math.abs(position.x) <= baseHalfWidth && 
                        Math.abs(position.z) <= baseHalfWidth;

        // Check if position is within cross vertical part
        const isOnVertical = Math.abs(position.x) <= crossVerticalHalfWidth && 
                            Math.abs(position.z) <= crossVerticalHalfLength;

        // Check if position is within cross horizontal part
        const isOnHorizontal = Math.abs(position.x) <= crossHorizontalHalfWidth && 
                              Math.abs(position.z) <= crossHorizontalHalfLength;

        // If on any part of the temple platform, player should be at temple height
        if (isOnBase || isOnVertical || isOnHorizontal) {
            position.y = 3; // Temple height (1.5 base height + 1.5 character height)
        } else {
            position.y = 1.5; // Ground level height
        }

        return isOnBase || isOnVertical || isOnHorizontal;
    }
    
    checkCollision(position, previousPosition) {
        // Check terrain boundaries first (water/edge collision)
        const terrainSize = 100; // Use a reasonable size for terrain
        const halfTerrainSize = terrainSize / 2 - 1;
        
        // Strict boundary check for water
        if (Math.abs(position.x) > halfTerrainSize - 1 || Math.abs(position.z) > halfTerrainSize - 1) {
            console.log("Terrain boundary collision");
            if (previousPosition) {
                position.x = previousPosition.x;
                position.z = previousPosition.z;
            }
            return true;
        }
        
        // Check statue and NPC collisions with a reasonable buffer
        if (this.statueColliders) {
            for (const collider of this.statueColliders) {
                const dx = position.x - collider.position.x;
                const dz = position.z - collider.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                // Use a reasonable collision radius (0.5 instead of 1.0)
                if (distance < collider.radius + 0.5) {
                    console.log("Statue collision with:", collider);
                    if (previousPosition) {
                        // Push player away from the collision point
                        const angle = Math.atan2(dz, dx);
                        const pushDistance = (collider.radius + 0.5) - distance;
                        position.x = collider.position.x + (Math.cos(angle) * (collider.radius + 0.5));
                        position.z = collider.position.z + (Math.sin(angle) * (collider.radius + 0.5));
                    }
                    return true;
                }
            }
        }
        
        // Check collisions with other players - with more lenient settings
        if (this.players) {
            const playerRadius = 0.5; // Reduced from 1.0 for player collision
            const spawnRadius = 5.0; // Increased from 3.0 for temple area
            const isInSpawnArea = Math.abs(position.x) < spawnRadius && Math.abs(position.z) < spawnRadius;
            
            // Skip player collisions in spawn area to avoid getting stuck
            if (isInSpawnArea) {
                return false;
            }
            
            // Check collision with other players
            for (const [id, otherPlayer] of this.players) {
                // Skip self-collision check
                if (this.localPlayer && otherPlayer === this.localPlayer) continue;
                
                const dx = position.x - otherPlayer.position.x;
                const dz = position.z - otherPlayer.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                if (distance < playerRadius) {
                    console.log("Player collision with:", id);
                    if (previousPosition) {
                        // Push away, but less aggressively
                        const angle = Math.atan2(dz, dx);
                        position.x = otherPlayer.position.x + Math.cos(angle) * playerRadius;
                        position.z = otherPlayer.position.z + Math.sin(angle) * playerRadius;
                    }
                    return true;
                }
            }
        }
        
        return false;
    }
    
    updatePlayerStatus(playerMesh, stats, silent = false) {
        // Skip if player mesh doesn't exist
        if (!playerMesh) {
            console.warn('Cannot update status: playerMesh is undefined');
            return;
        }

        // Initialize userData if it doesn't exist
        if (!playerMesh.userData) {
            console.warn('Player userData not initialized, creating it');
            playerMesh.userData = {};
        }

        // Store the stats in player userData
        if (!playerMesh.userData.stats) {
            playerMesh.userData.stats = {};
        }
        
        // Update the stored stats with new values
        if (stats.life !== undefined) playerMesh.userData.stats.life = stats.life;
        if (stats.maxLife !== undefined) playerMesh.userData.stats.maxLife = stats.maxLife;
        if (stats.mana !== undefined) playerMesh.userData.stats.mana = stats.mana;
        if (stats.maxMana !== undefined) playerMesh.userData.stats.maxMana = stats.maxMana;
        if (stats.karma !== undefined) playerMesh.userData.stats.karma = stats.karma;
        if (stats.maxKarma !== undefined) playerMesh.userData.stats.maxKarma = stats.maxKarma;

        // Update status bars if they exist
        if (playerMesh.userData.statusBars && playerMesh.userData.statusGroup) {
            playerMesh.userData.statusBars.forEach(bar => {
                const statValue = playerMesh.userData.stats[bar.type];
                const maxValue = playerMesh.userData.stats[`max${bar.type.charAt(0).toUpperCase() + bar.type.slice(1)}`];
                
                if (statValue !== undefined && maxValue !== undefined) {
                    const ratio = Math.max(0, Math.min(1, statValue / maxValue));
                    bar.fill.scale.x = ratio;
                    
                    // Center the fill bar
                    bar.fill.position.x = (ratio - 1) * bar.width / 2;
                    
                    // Update color for karma bar
                    if (bar.type === 'karma') {
                        // Karma color gradient from red (0) to yellow (50) to green (100)
                        if (ratio <= 0.5) {
                            // Red to yellow
                            const r = 1.0;
                            const g = ratio * 2;
                            bar.fill.material.color.setRGB(r, g, 0);
                        } else {
                            // Yellow to green
                            const r = 1.0 - (ratio - 0.5) * 2;
                            const g = 1.0;
                            bar.fill.material.color.setRGB(r, g, 0);
                        }
                    }
                }
            });
            
            // Update status group position to follow player
            const worldPosition = new THREE.Vector3();
            playerMesh.getWorldPosition(worldPosition);
            playerMesh.userData.statusGroup.position.set(
                worldPosition.x,
                worldPosition.y + 2.0,
                worldPosition.z
            );
        } else if (!silent) {
            console.warn(`Status bars not found for player: ${playerMesh.userData.id || 'unknown'}`);
        }
        
        // Handle special cases, like death
        if (stats.life === 0 && this.playerManager && playerMesh === this.localPlayer) {
            console.log('Player died, handling death');
            if (this.playerManager.handlePlayerDeath) {
                this.playerManager.handlePlayerDeath(playerMesh);
            }
        }
    }
    
    // Add temple interaction method
    checkTempleProximity() {
        if (!this.localPlayer || !this.temple) return false;
        
        const playerPos = this.localPlayer.position;
        const templePos = this.temple.position;
        
        // Check if player is within the temple base platform bounds
        const baseHalfWidth = 15; // 30/2 for base platform
        return Math.abs(playerPos.x - templePos.x) <= baseHalfWidth && 
               Math.abs(playerPos.z - templePos.z) <= baseHalfWidth;
    }
    
    async loadNPC(templeGroup, baseHeight) {
        try {
            const loader = new GLTFLoader();
            
            // Load both NPC models
            const [darkNPC, lightNPC] = await Promise.all([
                new Promise((resolve, reject) => {
                    loader.load(
                        '/models/dark_npc.glb',
                        (gltf) => resolve(gltf),
                        undefined,
                        (error) => reject(error)
                    );
                }),
                new Promise((resolve, reject) => {
                    loader.load(
                        '/models/light_npc.glb',
                        (gltf) => resolve(gltf),
                        undefined,
                        (error) => reject(error)
                    );
                })
            ]);

            // Set up the dark NPC model (right side)
            const darkModel = darkNPC.scene;
            darkModel.scale.set(3.5, 3.5, 3.5);
            darkModel.position.set(7, 5.5, -9);
            darkModel.rotation.y = -Math.PI / 4;
            
            // Set up the light NPC model (left side)
            const lightModel = lightNPC.scene;
            lightModel.scale.set(6, 6, 6);
            lightModel.position.set(-7, 2.0, -9);
            lightModel.rotation.y = Math.PI / 4;
            
            // Add shadows to both NPCs
            [darkModel, lightModel].forEach(model => {
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
            });

            // Add interaction text to both NPCs with adjusted y-offsets
            this.addInteractionText(darkModel, 1.2);  // Keep dark NPC's text position
            this.addInteractionText(lightModel, 1.1);  // Lower light NPC's text position

            // Add both NPCs to temple group
            templeGroup.add(darkModel);
            templeGroup.add(lightModel);

            // Store NPC references
            this.darkNPC = darkModel;
            this.lightNPC = lightModel;

            // Create colliders for both NPCs
            if (!this.statueColliders) {
                this.statueColliders = [];
            }

            // Add colliders for both NPCs
            this.statueColliders.push(
                {
                    position: new THREE.Vector3(7, 0, -9),
                    radius: 2.0
                },
                {
                    position: new THREE.Vector3(-7, 0, -9),
                    radius: 2.0
                }
            );
            
            console.log('NPCs loaded successfully');

        } catch (error) {
            console.error('Error loading NPC models:', error);
            // Skip creating fallback NPCs as they might be causing issues
        }
    }
    
    addInteractionText(npcModel, yOffset) {
        // Create a canvas for the text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        // Set text style with slightly larger font
        context.font = 'bold 36px Arial';  // Increased from 16px to 20px
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        // Create gradient for text
        const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, '#4a9eff');
        gradient.addColorStop(1, '#00ff88');

        // Draw text with gradient and outline
        const text = 'Press E';  // Changed from 'E to interact' to 'E interact'
        context.fillStyle = gradient;
        context.strokeStyle = '#000000';
        context.lineWidth = 2;
        context.strokeText(text, canvas.width / 2, canvas.height / 2);
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        // Create sprite material with adjusted renderOrder
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });

        // Create sprite and add to NPC
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(0.4, 0.1, 1);
        sprite.position.y = yOffset;
        sprite.renderOrder = 999;
        
        // Add sprite as child of NPC model
        npcModel.add(sprite);

        // Store sprite reference
        npcModel.interactionSprite = sprite;
    }
    
    // Update the sendPlayerState method to properly handle missing local player
    sendPlayerState() {
        if (!this.networkManager || !this.networkManager.socket) {
            // Not connected to network, no need to send state
            return;
        }
        
        if (!this.localPlayer) {
            // No local player, try to create one
            this.createLocalPlayerIfMissing();
            return;
        }
        
        try {
            // Send player state to the server via NetworkManager
            this.networkManager.sendPlayerState({
                position: {
                    x: this.localPlayer.position.x,
                    y: this.localPlayer.position.y,
                    z: this.localPlayer.position.z
                },
                rotation: {
                    y: this.localPlayer.rotation.y
                },
                life: this.playerStats.currentLife,
                maxLife: this.playerStats.maxLife,
                mana: this.playerStats.currentMana,
                maxMana: this.playerStats.maxMana,
                karma: this.playerStats.currentKarma,
                maxKarma: this.playerStats.maxKarma,
                path: this.playerStats.path
            });
        } catch (error) {
            console.error('Error sending player state:', error);
        }
    }
    
    useMartialArts() {
        console.log('Game.useMartialArts called');
        
        // Delegate to SkillsManager if available
        if (this.skillsManager && typeof this.skillsManager.useMartialArts === 'function') {
            console.log('Delegating to SkillsManager.useMartialArts');
            this.skillsManager.useMartialArts();
            return;
        }
        
        console.log('Using direct implementation of useMartialArts');
        
        // Prevent skill use if dead
        if (!this.isAlive) {
            console.log('Cannot use skills while dead');
            return;
        }

        // Check if player has the skill
        if (!this.activeSkills || !this.activeSkills.has('martial_arts')) {
            console.log('Player does not have martial arts skill');
            return;
        }
        
        // Check if player is on light path - only enforce if path is set
        if (this.playerStats && this.playerStats.path && this.playerStats.path !== 'light') {
            console.log('Only light path players can use martial arts');
            return;
        }

        // Prevent Illuminated players from using martial arts
        if (this.playerStats && this.playerStats.currentKarma === 0) {
            console.log('Illuminated players cannot use direct damage skills');
            return;
        }

        // Make sure skills object exists
        if (!this.skills || !this.skills.martial_arts) {
            console.log('Martial arts skill not found');
            return;
        }

        const skill = this.skills.martial_arts;
        const now = Date.now();

        // Check cooldown
        if (now - skill.lastUsed < skill.cooldown) {
            console.log('Martial arts skill is on cooldown');
            return;
        }

        // Find nearby players
        if (!this.localPlayer) {
            console.log('Local player not found');
            return;
        }

        // Create visual effect
        this.createMartialArtsEffect();
        
        // Get player position
        const playerPos = this.localPlayer.position.clone();
        let targetFound = false;
        
        // Check each player for potential targets
        this.players.forEach((otherPlayer, playerId) => {
            if (playerId === this.socket?.id) return; // Skip self
            
            // Skip dead players
            if (!otherPlayer.userData?.stats?.life || 
                otherPlayer.userData.stats.life <= 0 || 
                otherPlayer.userData.isDead) {
                console.log('Skipping dead player:', playerId);
                return;
            }

            const dx = otherPlayer.position.x - playerPos.x;
            const dz = otherPlayer.position.z - playerPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance <= skill.range) {
                targetFound = true;
                console.log(`Found target: ${playerId} at distance ${distance}`);
                
                // Emit damage event to server
                if (this.socket?.connected) {
                    console.log('Emitting skillDamage event to server');
                    this.socket.emit('skillDamage', {
                        targetId: playerId,
                        damage: skill.damage,
                        skillName: 'martial_arts'
                    });
                } else {
                    console.log('Socket not connected, cannot emit skillDamage event');
                }
            }
        });

        if (targetFound) {
            skill.lastUsed = now;
            console.log('Martial arts used successfully');
            
            // Update skill bar if UI manager exists
            if (this.uiManager) {
                this.uiManager.updateSkillBar();
            }
        } else {
            console.log('No targets found for martial arts attack');
        }
    }
    
    useMana(amount) {
        if (this.playerStats.currentMana >= amount) {
            this.playerStats.currentMana -= amount;
            this.updateStatusBars();

            // Emit stats update to server
            if (this.socket?.connected) {
                this.socket.emit('statsUpdate', {
                    id: this.socket.id,
                    life: this.playerStats.currentLife,
                    maxLife: this.playerStats.maxLife,
                    mana: this.playerStats.currentMana,
                    maxMana: this.playerStats.maxMana
                });
            }
            return true;
        }
        return false;
    }
    
    createMartialArtsEffect() {
        // Create a visual effect for the martial arts attack
        if (!this.localPlayer) return;
        
        // Create a simple sphere to represent the effect
        const effectGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const effectMaterial = new THREE.MeshBasicMaterial({
            color: 0xffcc00,
            transparent: true,
            opacity: 0.7
        });
        
        const effect = new THREE.Mesh(effectGeometry, effectMaterial);
        
        // Position in front of player
        const playerPos = this.localPlayer.position.clone();
        const forwardVec = new THREE.Vector3(0, 0, -1).applyQuaternion(this.localPlayer.quaternion);
        effect.position.copy(playerPos);
        effect.position.y += 1; // At chest level
        effect.position.add(forwardVec.multiplyScalar(1));
        
        this.scene.add(effect);
        
        // Animate and remove
        let scale = 1;
        const animate = () => {
            scale -= 0.1;
            effect.scale.set(scale, scale, scale);
            effect.material.opacity = scale;
            
            if (scale <= 0) {
                this.scene.remove(effect);
                effectGeometry.dispose();
                effectMaterial.dispose();
                return;
            }
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    updateStatusBars() {
        console.log(`Player Status: Life: ${this.playerStats.life}/${this.playerStats.maxLife}, Mana: ${this.playerStats.mana}/${this.playerStats.maxMana}, Karma: ${this.playerStats.karma}/${this.playerStats.maxKarma}`);
        
        // Update UI manager if available
        if (this.uiManager && typeof this.uiManager.updateStatusBars === 'function') {
            this.uiManager.updateStatusBars(this.playerStats);
        }
        
        // Update 3D status bars for local player
        if (this.localPlayer && this.localPlayer.userData && this.localPlayer.userData.statusBars) {
            const { statusBars } = this.localPlayer.userData;
            
            // Update life bar
            const lifeBar = statusBars.find(bar => bar.type === 'life');
            if (lifeBar) {
                const lifePercent = Math.max(0, Math.min(1, this.playerStats.life / this.playerStats.maxLife));
                lifeBar.fill.scale.x = lifePercent;
                lifeBar.fill.position.x = (lifePercent - 1) * lifeBar.width / 2;
            }
            
            // Update mana bar
            const manaBar = statusBars.find(bar => bar.type === 'mana');
            if (manaBar) {
                const manaPercent = Math.max(0, Math.min(1, this.playerStats.mana / this.playerStats.maxMana));
                manaBar.fill.scale.x = manaPercent;
                manaBar.fill.position.x = (manaPercent - 1) * manaBar.width / 2;
            }
            
            // Update karma bar
            const karmaBar = statusBars.find(bar => bar.type === 'karma');
            if (karmaBar) {
                const karmaValue = Math.abs(this.playerStats.karma);
                const karmaPercent = Math.max(0, Math.min(1, karmaValue / 100));
                karmaBar.fill.scale.x = karmaPercent;
                karmaBar.fill.position.x = (karmaPercent - 1) * karmaBar.width / 2;
                
                // Update color based on karma alignment
                if (this.playerStats.karma > 0) {
                    karmaBar.fill.material.color.set(0xffcc00); // Gold for light
                } else {
                    karmaBar.fill.material.color.set(0x800080); // Purple for dark
                }
            }
        }
        
        // Update 3D status bars for other players
        this.players.forEach((player, id) => {
            if (player && player.userData && player.userData.statusBars && player.userData.stats) {
                const { statusBars, stats } = player.userData;
                
                // Update life bar
                const lifeBar = statusBars.find(bar => bar.type === 'life');
                if (lifeBar && stats.life !== undefined && stats.maxLife !== undefined) {
                    const lifePercent = Math.max(0, Math.min(1, stats.life / stats.maxLife));
                    lifeBar.fill.scale.x = lifePercent;
                    lifeBar.fill.position.x = (lifePercent - 1) * lifeBar.width / 2;
                }
                
                // Update mana bar
                const manaBar = statusBars.find(bar => bar.type === 'mana');
                if (manaBar && stats.mana !== undefined && stats.maxMana !== undefined) {
                    const manaPercent = Math.max(0, Math.min(1, stats.mana / stats.maxMana));
                    manaBar.fill.scale.x = manaPercent;
                    manaBar.fill.position.x = (manaPercent - 1) * manaBar.width / 2;
                }
                
                // Update karma bar
                const karmaBar = statusBars.find(bar => bar.type === 'karma');
                if (karmaBar && stats.karma !== undefined) {
                    const karmaValue = Math.abs(stats.karma);
                    const karmaPercent = Math.max(0, Math.min(1, karmaValue / 100));
                    karmaBar.fill.scale.x = karmaPercent;
                    karmaBar.fill.position.x = (karmaPercent - 1) * karmaBar.width / 2;
                    
                    // Update color based on karma alignment
                    if (stats.karma > 0) {
                        karmaBar.fill.material.color.set(0xffcc00); // Gold for light
                    } else {
                        karmaBar.fill.material.color.set(0x800080); // Purple for dark
                    }
                }
            }
        });
    }

    handleInteraction() {
        if (!this.localPlayer) return;

        // Check proximity to NPCs
        const playerPos = this.localPlayer.position;
        
        // Check dark NPC
        if (this.darkNPC) {
            const darkNPCPos = this.darkNPC.position;
            const distanceToDark = Math.sqrt(
                Math.pow(playerPos.x - darkNPCPos.x, 2) +
                Math.pow(playerPos.z - darkNPCPos.z, 2)
            );
            
            if (distanceToDark < 5) {  // Increased interaction radius from 3 to 5
                console.log('Interacting with Dark NPC. Distance:', distanceToDark);
                this.showDialogue('dark');
                return;
            }
        }
        
        // Check light NPC
        if (this.lightNPC) {
            const lightNPCPos = this.lightNPC.position;
            const distanceToLight = Math.sqrt(
                Math.pow(playerPos.x - lightNPCPos.x, 2) +
                Math.pow(playerPos.z - lightNPCPos.z, 2)
            );
            
            if (distanceToLight < 5) {  // Increased interaction radius from 3 to 5
                console.log('Interacting with Light NPC. Distance:', distanceToLight);
                this.showDialogue('light');
                return;
            }
        }
    }

    showDialogue(npcType) {
        // Remove existing dialogue if any
        this.hideDialogue();
        
        // Create dialogue UI
        const dialogueContainer = document.createElement('div');
        dialogueContainer.style.position = 'fixed';
        dialogueContainer.style.top = '50px';
        dialogueContainer.style.left = '50%';
        dialogueContainer.style.transform = 'translateX(-50%)';
        dialogueContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
        dialogueContainer.style.padding = '25px';
        dialogueContainer.style.borderRadius = '15px';
        dialogueContainer.style.color = 'white';
        dialogueContainer.style.maxWidth = '800px';
        dialogueContainer.style.width = '90%';
        dialogueContainer.style.zIndex = '1000';
        dialogueContainer.style.border = npcType === 'dark' ? '2px solid #6600cc' : '2px solid #ffcc00';
        dialogueContainer.style.boxShadow = npcType === 'dark' ? 
            '0 0 30px rgba(102, 0, 204, 0.4)' : 
            '0 0 30px rgba(255, 204, 0, 0.4)';

        // Don't show choice dialogue if player already has a path
        if (this.playerStats.path) {
            const text = document.createElement('p');
            text.style.margin = '0';
            text.style.fontSize = '18px';
            text.style.lineHeight = '1.5';
            text.style.textShadow = '0 0 2px rgba(0, 0, 0, 0.5)';
            text.textContent = `You have already chosen the path of ${this.playerStats.path}. This choice is permanent in this life.`;

            const closeButton = this.createDialogueButton('Close', () => this.hideDialogue());
            closeButton.style.marginTop = '15px';
            closeButton.style.float = 'right';
            
            dialogueContainer.appendChild(text);
            dialogueContainer.appendChild(closeButton);
            document.body.appendChild(dialogueContainer);
            
            this.dialogueUI = dialogueContainer;
            return;
        }

        // Create title
        const title = document.createElement('h2');
        title.style.margin = '0 0 20px 0';
        title.style.fontSize = '24px';
        title.style.color = npcType === 'dark' ? '#6600cc' : '#ffcc00';
        title.style.textShadow = '0 0 10px ' + (npcType === 'dark' ? 'rgba(102, 0, 204, 0.5)' : 'rgba(255, 204, 0, 0.5)');
        title.textContent = npcType === 'dark' ? 'Dark Guardian' : 'Light Guardian';

        // Initial greeting
        const greeting = document.createElement('p');
        greeting.style.margin = '0 0 20px 0';
        greeting.style.fontSize = '18px';
        greeting.style.lineHeight = '1.6';
        greeting.style.color = '#ffffff';
        greeting.textContent = npcType === 'dark' ? 
            'Greetings, seeker of power. I am the Dark Guardian, keeper of forbidden knowledge and master of shadows.' :
            'Welcome, noble soul. I am the Light Guardian, protector of sacred wisdom and bearer of divine light.';

        // Path description
        const description = document.createElement('div');
        description.style.margin = '0 0 20px 0';
        description.style.padding = '15px';
        description.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        description.style.borderRadius = '10px';
        description.style.fontSize = '16px';
        description.style.lineHeight = '1.6';

        const pathTitle = document.createElement('h3');
        pathTitle.style.margin = '0 0 10px 0';
        pathTitle.style.color = npcType === 'dark' ? '#6600cc' : '#ffcc00';
        pathTitle.textContent = npcType === 'dark' ? 'The Path of Darkness' : 'The Path of Light';
        description.appendChild(pathTitle);

        const pathContent = document.createElement('div');
        if (npcType === 'dark') {
            pathContent.innerHTML = `
                <p>Those who walk the Dark Path seek ultimate power through sacrifice. At maximum Karma (100), you will achieve the <strong style="color: #6600cc">Forsaken</strong> status, granting you:</p>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>Immunity to direct damage</li>
                    <li>The highest damage potential in the game</li>
                    <li>Life regeneration only through combat and kills</li>
                    <li>Gradual health decay every 5 seconds</li>
                </ul>
                <p style="color: #ff9900"><strong>Warning:</strong> Forsaken can only be defeated by the Light's "Seal of Light" ability, which will force reincarnation.</p>
            `;
        } else {
            pathContent.innerHTML = `
                <p>Those who walk the Light Path seek enlightenment through protection. At minimum Karma (0), you will achieve the <strong style="color: #ffcc00">Illuminated</strong> status, granting you:</p>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>Immunity to direct damage</li>
                    <li>Enhanced healing abilities that scale with lower Karma</li>
                    <li>Constant life regeneration</li>
                    <li>Access to powerful support abilities</li>
                </ul>
                <p style="color: #ff9900"><strong>Note:</strong> Illuminated cannot deal direct damage but can only be defeated by the Dark's "Curse of Darkness" ability, which will force reincarnation.</p>
            `;
        }
        description.appendChild(pathContent);

        // Warning about permanence
        const warning = document.createElement('p');
        warning.style.margin = '20px 0';
        warning.style.padding = '10px';
        warning.style.backgroundColor = 'rgba(255, 153, 0, 0.2)';
        warning.style.borderRadius = '5px';
        warning.style.fontSize = '16px';
        warning.style.color = '#ff9900';
        warning.style.fontStyle = 'italic';
        warning.innerHTML = '<strong>⚠ Choose wisely:</strong> Your path choice is permanent in this lifetime. Only through reincarnation can a new path be chosen.';

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'space-between';
        buttonContainer.style.marginTop = '20px';

        // Create choice buttons
        const acceptButton = this.createDialogueButton(
            'Accept this Path',
            () => {
                this.hideDialogue();
                this.choosePath(npcType);
            }
        );
        acceptButton.style.backgroundColor = npcType === 'dark' ? '#6600cc' : '#ffcc00';
        acceptButton.style.minWidth = '150px';
        
        const declineButton = this.createDialogueButton(
            'I Need Time',
            () => this.hideDialogue()
        );
        declineButton.style.backgroundColor = '#444444';
        declineButton.style.minWidth = '150px';

        buttonContainer.appendChild(declineButton);
        buttonContainer.appendChild(acceptButton);

        // Assemble the dialogue
        dialogueContainer.appendChild(title);
        dialogueContainer.appendChild(greeting);
        dialogueContainer.appendChild(description);
        dialogueContainer.appendChild(warning);
        dialogueContainer.appendChild(buttonContainer);
        document.body.appendChild(dialogueContainer);

        // Store reference to active dialogue
        this.dialogueUI = dialogueContainer;
        this.activeDialogue = npcType;
    }

    createDialogueButton(text, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.padding = '8px 16px';
        button.style.backgroundColor = '#4a9eff';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.color = 'white';
        button.style.cursor = 'pointer';
        button.style.minWidth = '100px';
        button.style.fontSize = '16px';
        
        button.addEventListener('click', onClick);
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = '#2185ff';
        });
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = '#4a9eff';
        });

        return button;
    }

    choosePath(path) {
        console.log(`Game.choosePath called with path: ${path}`);
        
        // Remove any existing dialogue
        if (this.uiManager) {
            this.uiManager.hideDialogue();
        }
        
        // Set the player's path
        if (this.playerStats) {
            this.playerStats.path = path;
        }
        
        // Grant Martial Arts skill if choosing Light path
        if (path === 'light') {
            console.log('Adding martial_arts skill to player activeSkills');
            this.activeSkills = this.activeSkills || new Set();
            this.activeSkills.add('martial_arts');
            
            // Update UI
            if (this.uiManager) {
                this.uiManager.updateSkillBar();
                this.uiManager.showNotification('You have learned Martial Arts skill! Press Space to use it.', '#ffcc00');
            }
        }
        
        // Create confirmation dialogue
        const dialogueContainer = document.createElement('div');
        dialogueContainer.style.position = 'fixed';
        dialogueContainer.style.top = '50px';
        dialogueContainer.style.left = '50%';
        dialogueContainer.style.transform = 'translateX(-50%)';
        dialogueContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
        dialogueContainer.style.padding = '25px';
        dialogueContainer.style.borderRadius = '15px';
        dialogueContainer.style.color = 'white';
        dialogueContainer.style.maxWidth = '800px';
        dialogueContainer.style.width = '90%';
        dialogueContainer.style.zIndex = '1000';
        dialogueContainer.style.border = path === 'dark' ? '2px solid #6600cc' : '2px solid #ffcc00';
        dialogueContainer.style.boxShadow = path === 'dark' ? 
            '0 0 30px rgba(102, 0, 204, 0.4)' : 
            '0 0 30px rgba(255, 204, 0, 0.4)';

        // Create title
        const title = document.createElement('h2');
        title.style.margin = '0 0 20px 0';
        title.style.fontSize = '24px';
        title.style.color = path === 'dark' ? '#6600cc' : '#ffcc00';
        title.style.textShadow = '0 0 10px ' + (path === 'dark' ? 'rgba(102, 0, 204, 0.5)' : 'rgba(255, 204, 0, 0.5)');
        title.textContent = path === 'dark' ? 'Dark Path Chosen' : 'Light Path Chosen';

        // Create confirmation message
        const message = document.createElement('div');
        message.style.margin = '0 0 20px 0';
        message.style.fontSize = '18px';
        message.style.lineHeight = '1.6';
        
        if (path === 'dark') {
            message.innerHTML = `
                <p>You have embraced the shadows. The Dark Path will grant you immense power through sacrifice.</p>
                <p>Your journey to becoming <strong style="color: #6600cc">Forsaken</strong> begins now. Seek to increase your Karma to 100 to unlock your full potential.</p>
                <p>Remember: Your strength will come from combat and victory, but the shadows will constantly test your resolve.</p>
            `;
        } else {
            message.innerHTML = `
                <p>You have chosen to walk in the light. The Light Path will grant you divine protection and healing abilities.</p>
                <p>Your journey to becoming <strong style="color: #ffcc00">Illuminated</strong> begins now. Seek to decrease your Karma to 0 to unlock your full potential.</p>
                <p>Remember: Your power lies in protection and support, and the light will constantly restore your vitality.</p>
            `;
        }

        // Next steps section
        const nextSteps = document.createElement('div');
        nextSteps.style.margin = '20px 0';
        nextSteps.style.padding = '15px';
        nextSteps.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        nextSteps.style.borderRadius = '10px';
        nextSteps.innerHTML = `
            <h3 style="margin: 0 0 10px 0; color: ${path === 'dark' ? '#6600cc' : '#ffcc00'}">Next Steps</h3>
            <ul style="margin: 0; padding-left: 20px;">
                <li>Explore the world and develop your abilities</li>
                <li>Monitor your Karma level as it will determine your power</li>
                <li>Return to me for guidance on your journey</li>
            </ul>
        `;

        const closeButton = this.createDialogueButton('Begin Journey', () => {
            this.hideDialogue();
        });
        closeButton.style.backgroundColor = path === 'dark' ? '#6600cc' : '#ffcc00';
        closeButton.style.marginTop = '20px';
        closeButton.style.float = 'right';
        closeButton.style.minWidth = '150px';

        dialogueContainer.appendChild(title);
        dialogueContainer.appendChild(message);
        dialogueContainer.appendChild(nextSteps);
        dialogueContainer.appendChild(closeButton);
        document.body.appendChild(dialogueContainer);

        // Update the dialogue reference
        this.dialogueUI = dialogueContainer;
    }

    hideDialogue() {
        if (this.dialogueUI) {
            this.dialogueUI.remove();
            this.dialogueUI = null;
            this.activeDialogue = null;
        }
    }
    
    updateSkillBar() {
        // This is a placeholder for skill bar updates
        console.log('Updating skill bar with active skills:', Array.from(this.activeSkills));
    }

    adjustKarma(amount) {
        const previousKarma = this.playerStats.currentKarma;
        this.playerStats.currentKarma = Math.max(0, Math.min(this.playerStats.maxKarma, this.playerStats.currentKarma + amount));
        
        console.log(`Local karma changed from ${previousKarma} to ${this.playerStats.currentKarma}`);
        
        // Update local display immediately
        if (this.localPlayer) {
            this.updatePlayerStatus(this.localPlayer, {
                life: this.playerStats.currentLife,
                maxLife: this.playerStats.maxLife,
                mana: this.playerStats.currentMana,
                maxMana: this.playerStats.maxMana,
                karma: this.playerStats.currentKarma,
                maxKarma: this.playerStats.maxKarma
            });
        }
        
        // Send karma update to server immediately
        if (this.socket?.connected) {
            const updateData = {
                id: this.socket.id,
                karma: this.playerStats.currentKarma,
                maxKarma: this.playerStats.maxKarma,
                life: this.playerStats.currentLife,
                maxLife: this.playerStats.maxLife,
                mana: this.playerStats.currentMana,
                maxMana: this.playerStats.maxMana
            };
            
            // Emit dedicated karma update event
            this.socket.emit('karmaUpdate', updateData);
            
            // Also update position and full state
            this.sendPlayerState();
        }
    }

    // Handle mouse click events
    handleMouseClick(event) {
        // Check if we're clicking on an NPC or interactive element
        if (this.npcProximity) {
            this.handleInteraction();
        }
    }

    // Update the updatePlayerPosition method to handle missing localPlayer gracefully
    updatePlayerPosition() {
        const now = Date.now();
        
        // Debug logging at reasonable intervals
        if (now - (this._lastDebugLog || 0) > 5000) {
            console.log(
                "Game state:", 
                { 
                    localPlayerExists: this.localPlayer !== null,
                    isAlive: this.isAlive,
                    playerCount: this.players.size,
                    networkConnected: this.networkManager ? this.networkManager.isConnected : false
                } 
            );
            this._lastDebugLog = now;
        }

        // Skip update if player doesn't exist, but no longer warn every frame
        if (!this.localPlayer) {
            // Attempt to create the local player if it doesn't exist yet
            this.createLocalPlayerIfMissing();
            return;
        }
        
        // ... rest of the existing updatePlayerPosition method ...
    }
    
    // Add a helper method to create local player if it's missing
    createLocalPlayerIfMissing() {
        // Shortcut if we already have a valid local player
        if (this.localPlayer && this.localPlayer.position && this.localPlayer.rotation) {
            return this.localPlayer;
        }
        
        console.log('Local player missing or invalid - attempting to create one');
        
        // Check if we're online and have a valid network manager
        if (this.networkManager && this.networkManager.socket && this.networkManager.socket.connected) {
            // Try creating a player through the network manager
            this.networkManager.createLocalPlayer().then(player => {
                if (player) {
                    console.log(`Local player created via network with ID: ${player.userData?.playerId}`);
                    // No need to do anything else as createLocalPlayer already sets this.localPlayer
                } else {
                    console.warn('Network player creation failed, creating offline player');
                    this.createOfflinePlayer();
                }
            }).catch(error => {
                console.error('Error creating local player via network:', error);
                this.createOfflinePlayer();
            });
        } else {
            // We're in offline mode, create an offline player
            this.createOfflinePlayer();
        }
    }

    // Add the missing update method that's called from the animation loop
    update(deltaTime) {
        // No need to calculate delta time here since it's passed in
        const now = Date.now();
        
        try {
            // Update status bars at a lower frequency (every 100ms)
            if (!this.lastStatusUpdate || now - this.lastStatusUpdate >= 100) {
                // Update all players' status bars
                this.players.forEach((playerMesh) => {
                    if (playerMesh.userData && playerMesh.userData.stats) {
                        this.updatePlayerStatus(playerMesh, playerMesh.userData.stats, true);
                    }
                });
                
                // Update local player status
                if (this.localPlayer && this.playerStats) {
                    this.updatePlayerStatus(this.localPlayer, {
                        life: this.playerStats.currentLife,
                        maxLife: this.playerStats.maxLife,
                        mana: this.playerStats.currentMana,
                        maxMana: this.playerStats.maxMana,
                        karma: this.playerStats.currentKarma,
                        maxKarma: this.playerStats.maxKarma
                    }, true);
                }
                
                // Update UI status bars
                this.updateStatusBars();
                
                this.lastStatusUpdate = now;
            }
            
            // Update camera to follow player
            this.updateCamera();
            
            // Update player movement
            this.updatePlayer();
            
            // Update status bar positions
            this.updateStatusBarPositions();
            
            // Update network state if connected
            if (this.networkManager) {
                try {
                    this.networkManager.update(deltaTime);
                } catch (error) {
                    console.error('Error updating network state:', error);
                }
            }
            
            // Update NPC interaction text if it exists
            if (this.darkNPC && this.darkNPC.userData.interactionText) {
                this.darkNPC.userData.interactionText.lookAt(this.camera.position);
            }
            if (this.lightNPC && this.lightNPC.userData.interactionText) {
                this.lightNPC.userData.interactionText.lookAt(this.camera.position);
            }
            
            // Check for temple proximity for NPC interaction
            this.checkTempleProximity();
        } catch (error) {
            console.error('Error in update method:', error);
        }
    }
} 