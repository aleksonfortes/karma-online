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
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false
        };
        
        // Logging control to prevent spam
        this.lastPositionLog = 0;
        this.logFrequency = 5000; // Log at most once every 5 seconds
        
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
        this.activeSkills = new Set(); // Skills the player has learned
        
        // Add dialogue state
        this.activeDialogue = null;
        this.dialogueUI = null;
        
        // Add karma recovery timer
        this.lastKarmaRecoveryTime = Date.now();
        
        // Camera settings for LoL-style view with zoom limits
        this.cameraOffset = new THREE.Vector3(0, 15, 15);
        this.minZoom = 12;
        this.maxZoom = 20;
        this.zoomSpeed = 0.5;
        this.currentZoom = 15;
        
        // Player state variables
        this.lastStatusUpdate = 0;
        this.lastStateUpdate = 0;
        this.lastWaterUpdate = 0;
        this.waterTime = 0;
        
        // Set up player stats
        this.playerStats = {
            id: "",
            name: "Player",
            level: 1,
            experience: 0,
            currentLife: 100,
            maxLife: 100,
            currentMana: 100,
            maxMana: 100,
            currentKarma: 50,
            maxKarma: 100,
            strength: 10,
            agility: 10,
            intelligence: 10,
            stamina: 10,
            charisma: 10,
            path: null // Start with no path chosen (not "neutral")
        };
        
        // Server URL for multiplayer
        this.SERVER_URL = serverUrl || "http://localhost:3000";
        
        // Shared geometries and materials for optimization
        this.sharedGeometries = {
            boxGeometry: new THREE.BoxGeometry(1, 1, 1),
            sphereGeometry: new THREE.SphereGeometry(0.5, 16, 16),
            planeGeometry: new THREE.PlaneGeometry(1, 1),
            barGeometry: new THREE.PlaneGeometry(1, 0.1)
        };
        
        this.sharedMaterials = {
            defaultMaterial: new THREE.MeshStandardMaterial({ color: 0xffffff }),
            backgroundBar: new THREE.MeshBasicMaterial({
                color: 0x333333,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.7
            })
        };
        
        // Initialize colliders array
        this.statueColliders = [];
        
        // Animation timing
        this.clock = new THREE.Clock();
        this.lastTime = 0;
        
        // NPC flags
        this.npcProximity = false;
        
        // Wave animation
        this.waveRings = [];
        
        // Initialize the game
        this.init();
    }
    
    async init() {
        console.log('Initializing game...');
        
        try {
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

            // Create temple in the center
            this.createTemple();

            // Create ocean border (it should be below the terrain)
            this.createOcean();
            
            // Initialize managers
            await this.initializeManagers();
            
            // Setup input handlers and camera
            this.setupInputHandlers();
            
            // Start the game loop
            this.startGameLoop();
            
            console.log('Game initialization complete');
            return true;
        } catch (error) {
            this.handleInitializationError(error);
            return false;
        }
    }
    
    // New method to initialize player properly
    initializePlayer() {
        console.log('Initializing player for the game...');
        
        // Check if we should use network mode
        const useNetworkMode = this.networkManager && (this.networkManager.isConnected || this.networkManager.socket);
        
        if (useNetworkMode) {
            console.log('Network mode detected - waiting for server to send player info');
            // In network mode, we'll wait for the networkManager to create the player
            // based on server data
            
            // If we already created a local player, keep it until server replacement arrives
            if (!this.localPlayer) {
                console.log('No local player exists yet, creating temporary player at temple center');
                // In the meantime, create a temporary player for visualization
                this.playerManager.createPlayer('local-temp')
                    .then(player => {
                        player.position.set(0, 3, 0);
                        this.scene.add(player);
                        this.localPlayer = player;
                        this.isAlive = true;
                        this.players.set('local-temp', player);
                        console.log('Temporary player created while waiting for server');
                    })
                    .catch(err => console.error('Failed to create temporary player:', err));
            }
        } else {
            // Offline mode - create player directly
            console.log('Offline mode - creating local player directly');
            
            // Clean up any existing player
            if (this.localPlayer) {
                console.log('Removing existing player before creating new one');
                if (this.localPlayer.userData?.statusGroup) {
                    this.scene.remove(this.localPlayer.userData.statusGroup);
                }
                this.scene.remove(this.localPlayer);
                
                // Remove from players map
                for (const [id, player] of this.players.entries()) {
                    if (player === this.localPlayer) {
                        this.players.delete(id);
                        break;
                    }
                }
                
                this.localPlayer = null;
            }
            
            // Create a new player
            this.playerManager.createPlayer('local')
                .then(player => {
                    console.log('Player created successfully');
                    
                    // Configure position
                    player.position.set(0, 3, 0);
                    
                    // Add to scene
                    this.scene.add(player);
                    
                    // Set references
                    this.localPlayer = player;
                    this.isAlive = true; 
                    this.players.set('local', player);
                    
                    // Initialize userData if needed
                    if (!player.userData) {
                        player.userData = {};
                    }
                    
                    // Set initial stats
                    const initialStats = {
                        life: this.playerStats.currentLife,
                        maxLife: this.playerStats.maxLife,
                        mana: this.playerStats.currentMana,
                        maxMana: this.playerStats.maxMana,
                        karma: this.playerStats.currentKarma,
                        maxKarma: this.playerStats.maxKarma
                    };
                    
                    player.userData.stats = initialStats;
                    
                    // Update status bars
                    this.updatePlayerStatus(player, initialStats);
                    
                    console.log('Local player fully initialized at position:', player.position);
                })
                .catch(error => {
                    console.error('Failed to create player:', error);
                    
                    // Try fallback character
                    console.log('Using fallback character');
                    this.localPlayer = this.playerManager.createFallbackCharacter();
                    this.localPlayer.position.set(0, 3, 0);
                    this.scene.add(this.localPlayer);
                    this.isAlive = true;
                    this.players.set('local', this.localPlayer);
                    
                    console.log('Fallback character created and positioned');
                });
        }
    }
    
    // Initialize managers while keeping the same flow as the original
    async initializeManagers() {
        console.log('Initializing game managers...');
        
        try {
            // Initialize scene manager first
            if (this.sceneManager) {
                await this.sceneManager.init();
                console.log('Scene Manager initialized');
            }
            
            // Initialize input manager
            if (this.inputManager) {
                await this.inputManager.init();
                console.log('Input Manager initialized');
            }
            
            // Initialize audio manager
            if (this.audioManager) {
                await this.audioManager.init();
                console.log('Audio Manager initialized');
            }
            
            // Initialize UI manager
            if (this.uiManager) {
                await this.uiManager.init();
                console.log('UI Manager initialized');
            }
            
            // Initialize player manager
            if (this.playerManager) {
                await this.playerManager.init();
                console.log('Player Manager initialized');
            }
            
            // Initialize karma manager
            if (this.karmaManager) {
                await this.karmaManager.init();
                console.log('Karma Manager initialized');
            }
            
            // Initialize skills manager
            if (this.skillsManager) {
                await this.skillsManager.init();
                console.log('Skills Manager initialized');
            }
            
            // Initialize network manager last
            if (this.networkManager) {
                await this.networkManager.init();
                console.log('Network Manager initialized');
            }
            
            // All managers initialized
            console.log('All managers initialized successfully');
            this.isInitialized = true;
            
            // Start the game loop
            this.startGameLoop();
            
            return true;
        } catch (error) {
            console.error('Error initializing managers:', error);
            return false;
        }
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
        if (this.activeDialogue) return; // Don't process movement if dialogue is active
        
        // Track key state
        this.keys[event.code] = true;
        
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
                this.useMartialArts();
                break;
            case 'KeyE':
                this.handleInteraction();
                break;
            case 'KeyK':
                this.adjustKarma(10); // Increase Karma by 10
                break;
            case 'KeyR':
                this.adjustKarma(-this.playerStats.currentKarma); // Reset Karma to 0
                break;
            case 'KeyF12':
                // Force clean all players (debug)
                if (this.networkManager) {
                    console.log('🧹 MANUAL CLEANUP: Force cleaning all ghost players...');
                    this.networkManager.forceCleanAllPlayers();
                }
                break;
        }
    }
    
    // Handle key up events
    handleKeyUp(event) {
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
        requestAnimationFrame(() => this.animate());
        
        // Update status bars at a lower frequency (every 100ms)
        const currentTime = Date.now();
        if (!this.lastStatusUpdate || currentTime - this.lastStatusUpdate >= 100) {
            this.players.forEach((playerMesh) => {
                if (playerMesh.userData.stats) {
                    this.updatePlayerStatus(playerMesh, playerMesh.userData.stats);
                }
            });
            
            if (this.localPlayer?.userData.stats) {
                this.updatePlayerStatus(this.localPlayer, {
                    life: this.playerStats.currentLife,
                    maxLife: this.playerStats.maxLife,
                    mana: this.playerStats.currentMana,
                    maxMana: this.playerStats.maxMana,
                    karma: this.playerStats.currentKarma,
                    maxKarma: this.playerStats.maxKarma
                });
            }
            this.lastStatusUpdate = currentTime;
            
            // Update status bar positions to follow characters
            this.updateStatusBarPositions();
        }

        // Update NPC interaction text to face camera
        if (this.darkNPC?.interactionSprite) {
            this.darkNPC.interactionSprite.quaternion.copy(this.camera.quaternion);
        }
        if (this.lightNPC?.interactionSprite) {
            this.lightNPC.interactionSprite.quaternion.copy(this.camera.quaternion);
        }
        
        // Send player state at a lower frequency (every 50ms)
        if (!this.lastStateUpdate || currentTime - this.lastStateUpdate >= 50) {
            if (this.localPlayer?.userData.stats) {
                this.sendPlayerState();
            }
            this.lastStateUpdate = currentTime;
        }
        
        // Update network manager to interpolate remote player positions
        if (this.networkManager) {
            this.networkManager.update();
        }
        
        // Optimize water animation by reducing calculations
        if (this.ocean && this.ocean.material) {
            this.waterTime += 0.001;
            
            if (this.ocean.material.normalMap && (!this.lastWaterUpdate || currentTime - this.lastWaterUpdate >= 50)) {
                const timeX = Math.sin(this.waterTime * 0.5) * 0.2;
                const timeY = Math.cos(this.waterTime * 0.3) * 0.2;
                this.ocean.material.normalMap.offset.x = timeX;
                this.ocean.material.normalMap.offset.y = timeY;
                this.lastWaterUpdate = currentTime;
            }
        }
        
        // Update light pulses and wave rings
        if (this.lights) {
            for (const light of this.lights) {
                if (light.userData && light.userData.pulse) {
                    light.intensity = light.userData.baseIntensity + 
                        Math.sin(currentTime * 0.002) * light.userData.pulseAmount;
                }
            }
        }
        
        if (this.waveRings) {
            for (const ring of this.waveRings) {
                const time = currentTime * 0.0005;
                ring.mesh.position.y = ring.baseY + Math.sin(time + ring.phase) * ring.amplitude;
            }
        }
        
        // Update player and camera
        this.updatePlayer();
        this.updateCamera();
        
        // Update animations for all characters
        const delta = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        // Update mixers for all players
        this.players.forEach(player => {
            if (player.userData && player.userData.mixer) {
                player.userData.mixer.update(delta / 1000);
            }
        });
        
        // Render scene
        this.renderer.render(this.scene, this.camera);
    }
    
    // Helper method to update status bar positions
    updateStatusBarPositions() {
        // Update local player status bars if they exist
        if (this.localPlayer && this.localPlayer.userData.statusGroup) {
            const worldPosition = new THREE.Vector3();
            this.localPlayer.getWorldPosition(worldPosition);
            this.localPlayer.userData.statusGroup.position.set(
                worldPosition.x, 
                worldPosition.y + 3.0, 
                worldPosition.z
            );
            this.localPlayer.userData.statusGroup.quaternion.copy(this.camera.quaternion);
        }
        
        // Update other players' status bars if they exist
        this.players.forEach(player => {
            if (player !== this.localPlayer && player.userData.statusGroup) {
                const worldPosition = new THREE.Vector3();
                player.getWorldPosition(worldPosition);
                player.userData.statusGroup.position.set(
                    worldPosition.x, 
                    worldPosition.y + 3.0, 
                    worldPosition.z
                );
                player.userData.statusGroup.quaternion.copy(this.camera.quaternion);
            }
        });
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
            const zoomFactor = this.currentZoom / 15; // Normalize to default zoom
            this.cameraOffset.y = 15 * zoomFactor;
            this.cameraOffset.z = 15 * zoomFactor;
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
        console.log('Starting game loop');
        this.lastTime = Date.now();
        this.isRunning = true;
        this.animate();
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
        const size = 120;
        const segments = 128;
        
        // Create plane geometry
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        
        // Create terrain material with grass texture
        const grassTexture = new THREE.TextureLoader().load('/textures/grass.jpg');
        grassTexture.wrapS = THREE.RepeatWrapping;
        grassTexture.wrapT = THREE.RepeatWrapping;
        grassTexture.repeat.set(10, 10);
        
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
        // Debug key state - logging once per 5 seconds
        const now = Date.now();
        if (now - (this._lastDebugLog || 0) > 5000) {
            console.log("DEBUG Controls:", 
                this.controls, 
                "LocalPlayer exists:", !!this.localPlayer,
                "Position:", this.localPlayer?.position
            );
            this._lastDebugLog = now;
        }

        // Skip update if player doesn't exist
        if (!this.localPlayer) {
            return;
        }
        
        // Calculate movement based on key state
        const speed = 0.2;
        const rotationSpeed = 0.15;
        let moveX = 0;
        let moveZ = 0;

        // Determine movement direction from controls
        if (this.controls.forward) moveZ -= 1;
        if (this.controls.backward) moveZ += 1;
        if (this.controls.left) moveX -= 1;
        if (this.controls.right) moveX += 1;

        // If player is moving
        if (moveX !== 0 || moveZ !== 0) {
            // Normalize for diagonal movement
            const magnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
            moveX = (moveX / magnitude) * speed;
            moveZ = (moveZ / magnitude) * speed;
            
            // Calculate next position
            const nextPosition = this.localPlayer.position.clone();
            nextPosition.x += moveX;
            nextPosition.z += moveZ;
            
            // Skip collision for now to ensure movement works
            const collision = false;
            
            // Apply position update
            this.localPlayer.position.copy(nextPosition);
            
            // Adjust height based on temple platform
            this.isOnTemplePlatform(this.localPlayer.position);
            
            // Update rotation based on movement direction
            const targetRotation = Math.atan2(moveX, moveZ);
            const rotationDiff = targetRotation - this.localPlayer.rotation.y;
            
            // Apply smooth rotation (with normalization)
            const normalizedDiff = Math.atan2(Math.sin(rotationDiff), Math.cos(rotationDiff));
            this.localPlayer.rotation.y += normalizedDiff * rotationSpeed;
            
            // Force send state update
            this.sendPlayerState();
            
            // Update animation if available
            if (this.localPlayer.userData?.mixer && this.localPlayer.userData?.animations) {
                const runAction = this.localPlayer.userData.animations['Running'];
                const idleAction = this.localPlayer.userData.animations['Idle'];
                
                if (runAction && idleAction && this.localPlayer.userData.currentAnimation !== 'Running') {
                    if (this.localPlayer.userData.currentAction) {
                        this.localPlayer.userData.currentAction.fadeOut(0.2);
                    }
                    runAction.reset().fadeIn(0.2).play();
                    this.localPlayer.userData.currentAction = runAction;
                    this.localPlayer.userData.currentAnimation = 'Running';
                }
            }
        } 
        else {
            // If not moving, switch to idle animation if needed
            if (this.localPlayer.userData?.mixer && this.localPlayer.userData?.animations) {
                const idleAction = this.localPlayer.userData.animations['Idle'];
                
                if (idleAction && this.localPlayer.userData.currentAnimation !== 'Idle') {
                    if (this.localPlayer.userData.currentAction) {
                        this.localPlayer.userData.currentAction.fadeOut(0.2);
                    }
                    idleAction.reset().fadeIn(0.2).play();
                    this.localPlayer.userData.currentAction = idleAction;
                    this.localPlayer.userData.currentAnimation = 'Idle';
                }
            }
        }
        
        // Update status bars if they exist
        if (this.localPlayer.userData?.statusGroup) {
            this.updateStatusBarPositions();
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

        // Check if status bars exist, create them if not
        if (!playerMesh.userData.bars || !playerMesh.userData.statusGroup) {
            console.warn(`Status bars not initialized for player: ${playerMesh.userData.id || 'unknown'}`);
            return; // Don't try to update non-existent status bars
        }

        // Update life bar
        if (stats.life !== undefined && playerMesh.userData.bars.life) {
            const lifeBar = playerMesh.userData.bars.life;
            lifeBar.value = stats.life;
            lifeBar.maxValue = stats.maxLife || 100;
            const lifeRatio = Math.max(0, Math.min(1, lifeBar.value / lifeBar.maxValue));
            lifeBar.fill.scale.x = lifeRatio;
            lifeBar.fill.position.x = -0.5 + (lifeRatio / 2);
        }

        // Update mana bar
        if (stats.mana !== undefined && playerMesh.userData.bars.mana) {
            const manaBar = playerMesh.userData.bars.mana;
            manaBar.value = stats.mana;
            manaBar.maxValue = stats.maxMana || 100;
            const manaRatio = Math.max(0, Math.min(1, manaBar.value / manaBar.maxValue));
            manaBar.fill.scale.x = manaRatio;
            manaBar.fill.position.x = -0.5 + (manaRatio / 2);
        }

        // Update karma bar
        if (stats.karma !== undefined && playerMesh.userData.bars.karma) {
            const karmaBar = playerMesh.userData.bars.karma;
            karmaBar.value = stats.karma;
            karmaBar.maxValue = stats.maxKarma || 100;
            const karmaRatio = Math.max(0, Math.min(1, karmaBar.value / karmaBar.maxValue));
            karmaBar.fill.scale.x = karmaRatio;
            karmaBar.fill.position.x = -0.5 + (karmaRatio / 2);
            
            // Change karma bar color based on karma value
            if (stats.karma <= 10) {
                karmaBar.fill.material.color.set(0xFF0000); // Red for Dark Karma (Near Forsaken)
            } else if (stats.karma >= 90) {
                karmaBar.fill.material.color.set(0xFFFFFF); // White for Light Karma (Near Illuminated)
            } else if (stats.karma < 50) {
                // Gradient from red to yellow (Dark Leaning)
                const t = (stats.karma - 10) / 40;
                karmaBar.fill.material.color.setRGB(1, t, 0);
            } else {
                // Gradient from yellow to white (Light Leaning)
                const t = (stats.karma - 50) / 40;
                karmaBar.fill.material.color.setRGB(1, 1, t);
            }
        }

        // Update player's stored stats
        if (!playerMesh.userData.stats) {
            playerMesh.userData.stats = {};
        }
        
        // Only update stats if provided
        if (stats.life !== undefined) playerMesh.userData.stats.life = stats.life;
        if (stats.maxLife !== undefined) playerMesh.userData.stats.maxLife = stats.maxLife;
        if (stats.mana !== undefined) playerMesh.userData.stats.mana = stats.mana;
        if (stats.maxMana !== undefined) playerMesh.userData.stats.maxMana = stats.maxMana;
        if (stats.karma !== undefined) playerMesh.userData.stats.karma = stats.karma;
        if (stats.maxKarma !== undefined) playerMesh.userData.stats.maxKarma = stats.maxKarma;
        
        // If this is the local player, update the game's player stats
        if (playerMesh === this.localPlayer && !silent) {
            if (stats.life !== undefined) this.playerStats.currentLife = stats.life;
            if (stats.maxLife !== undefined) this.playerStats.maxLife = stats.maxLife;
            if (stats.mana !== undefined) this.playerStats.currentMana = stats.mana;
            if (stats.maxMana !== undefined) this.playerStats.maxMana = stats.maxMana;
            if (stats.karma !== undefined) this.playerStats.currentKarma = stats.karma;
            if (stats.maxKarma !== undefined) this.playerStats.maxKarma = stats.maxKarma;
        }
        
        // Make sure status bars are correctly positioned
        this.updateStatusBarPositions();
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
    
    sendPlayerState() {
        if (!this.socket?.connected || !this.localPlayer) {
            // Don't log this every time - it's too spammy
            return;
        }
        
        // Send player position, rotation, and stats to server without logging
        this.socket.emit('playerMovement', {
            position: {
                x: this.localPlayer.position.x,
                y: this.localPlayer.position.y,
                z: this.localPlayer.position.z
            },
            rotation: {
                y: this.localPlayer.rotation.y
            },
            path: this.playerStats.path,
            karma: this.playerStats.currentKarma,
            maxKarma: this.playerStats.maxKarma,
            life: this.playerStats.currentLife,
            maxLife: this.playerStats.maxLife,
            mana: this.playerStats.currentMana,
            maxMana: this.playerStats.maxMana
        });
        
        // Occasionally log position for debugging - at most once per 5 seconds
        const now = Date.now();
        if (now - this.lastPositionLog > this.logFrequency) {
            console.log(`Player position: (${this.localPlayer.position.x.toFixed(2)}, ${this.localPlayer.position.y.toFixed(2)}, ${this.localPlayer.position.z.toFixed(2)})`);
            this.lastPositionLog = now;
        }
    }
    
    useMartialArts() {
        console.log('Game.useMartialArts called, checking if SkillsManager available');
        
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
        
        // Check if player is on light path
        if (this.playerStats && this.playerStats.path !== 'light') {
            console.log('Only light path players can use martial arts');
            return;
        }

        // Prevent Illuminated players from using martial arts
        if (this.playerStats && this.playerStats.currentKarma === 0) {
            console.log('Illuminated players cannot use direct damage skills');
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

        const playerPos = this.localPlayer.position;
        let targetFound = false;

        // Create visual effect
        this.createMartialArtsEffect();

        // Check for targets
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
        // This is a simplified version that just logs the status updates
        // In the full game, this would update the UI elements
        console.log(`Status: Life: ${Math.round(this.playerStats.currentLife)}/${this.playerStats.maxLife}, Mana: ${Math.round(this.playerStats.currentMana)}/${this.playerStats.maxMana}, Karma: ${Math.round(this.playerStats.currentKarma)}/${this.playerStats.maxKarma}`);
        
        // If the UIManager exists, delegate to it
        if (this.uiManager && typeof this.uiManager.updateStatusBars === 'function') {
            this.uiManager.updateStatusBars(this.playerStats);
        }
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
} 