import * as THREE from 'three';
import { UIManager } from './modules/ui/UIManager.js';
import { NetworkManager } from './modules/network/NetworkManager.js';
import { PlayerManager } from './modules/player/PlayerManager.js';
import { SkillsManager } from './modules/skills/SkillsManager.js';
import { KarmaManager } from './modules/karma/KarmaManager.js';
import { NPCManager } from './modules/npc/NPCManager.js';

export class Game {
    constructor(serverUrl) {
        // Initialize Three.js components
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        
        // Game state
        this.players = new Map();
        this.localPlayer = null;
        this.isRunning = true;
        this.isAlive = true;
        this.SERVER_URL = serverUrl;
        
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
        this.activeSkills = new Set(['martial_arts']);
        
        // Camera settings
        this.cameraOffset = { x: 0, y: 8, z: 10 };
        this.cameraTarget = null;
        this.minZoom = 12;
        this.maxZoom = 20;
        this.zoomSpeed = 0.5;
        this.currentZoom = 15;
        
        // Timing
        this.clock = new THREE.Clock();
        this.lastTime = 0;
        this.lastPositionLog = 0;
        this.logFrequency = 5000;
        
        // Initialize the game
        this.initialize();
    }

    async initialize() {
        try {
            console.log('Initializing game...');
            
            // Create Three.js scene
            this.setupScene();
            
            // Load initial environment (temple)
            this.setupEnvironment();
            
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
        // Create all managers
        this.uiManager = new UIManager(this);
        this.networkManager = new NetworkManager(this);
        this.playerManager = new PlayerManager(this);
        this.skillsManager = new SkillsManager(this);
        this.karmaManager = new KarmaManager(this);
        this.npcManager = new NPCManager(this);
        
        // Initialize UI first so we can show loading indicators
        await this.uiManager.init();
        this.uiManager.showLoadingScreen('Connecting to server...');
        
        try {
            // Initialize network first to determine if we're online
            const networkInitialized = await this.networkManager.init();
            
            if (!networkInitialized) {
                console.log('Network initialization failed, continuing in offline mode');
                this.uiManager.showNotification('Playing in offline mode', 'warning');
            }
        } catch (error) {
            console.warn('Network initialization failed:', error);
            this.uiManager.showNotification('Network error - playing in offline mode', 'warning');
        }
        
        // Initialize player (with or without network)
        await this.playerManager.init();
        await this.playerManager.loadCharacterModel();
        
        // Initialize other systems that depend on player
        await this.skillsManager.init();
        await this.karmaManager.init();
        
        // NPCs should be initialized last
        await this.npcManager.init();
        
        // Now that everything is loaded, hide loading screen and show game UI
        this.uiManager.hideLoadingScreen();
        this.uiManager.createUI();
    }

    // Handle network-related events from NetworkManager
    onNetworkEvent(eventName, data) {
        console.log(`Network event: ${eventName}`, data);
        
        switch (eventName) {
            case 'offlineMode':
                // Show offline mode notification
                this.uiManager.showNotification('Playing in offline mode', 'yellow');
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
                // Set camera to follow player
                this.setupCamera();
                break;
                
            default:
                console.log('Unhandled player event:', eventName);
        }
    }

    setupCamera() {
        if (this.playerManager.player) {
            // Set camera to follow player from behind
            this.camera.position.set(0, 5, 10); // Position behind and above player
            
            // Create a camera target that follows the player smoothly
            this.cameraTarget = new THREE.Object3D();
            this.cameraTarget.position.copy(this.playerManager.player.position);
            this.cameraTarget.position.y += 2; // Look at player head level
            this.scene.add(this.cameraTarget);
            
            this.camera.lookAt(this.cameraTarget.position);
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
        console.log('Processing game update:', data);
        
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
        
        // Setup camera
        this.camera.position.set(0, 15, 15);
        this.camera.lookAt(0, 0, 0);
        
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

    setupEnvironment() {
        console.log('Setting up environment...');
        
        // Create ground plane with grass texture
        const groundGeometry = new THREE.PlaneGeometry(500, 500);
        const textureLoader = new THREE.TextureLoader();
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x336633,
            roughness: 0.8,
            metalness: 0.2,
            side: THREE.DoubleSide
        });
        
        // Load and apply grass texture
        textureLoader.load('/textures/grass.jpg', (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(50, 50);
            groundMaterial.map = texture;
            groundMaterial.needsUpdate = true;
        });
        
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // Create water plane
        const waterGeometry = new THREE.PlaneGeometry(1000, 1000);
        const waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x004488,
            transparent: true,
            opacity: 0.8,
            roughness: 0.1,
            metalness: 0.8
        });
        
        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.rotation.x = -Math.PI / 2;
        water.position.y = -0.5;
        this.scene.add(water);
        
        // Create temple (placeholder)
        this.createTemple();
        
        console.log('Environment setup complete');
    }

    createTemple() {
        // Create a simple temple structure
        const templeGeometry = new THREE.BoxGeometry(10, 15, 10);
        const templeMaterial = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.7,
            metalness: 0.2
        });
        
        const temple = new THREE.Mesh(templeGeometry, templeMaterial);
        temple.position.set(0, 7.5, 0);
        temple.castShadow = true;
        temple.receiveShadow = true;
        this.scene.add(temple);
        temple.userData.isTemple = true; // Mark this as the temple for proximity checks
        this.temple = temple; // Store reference to temple
        
        // Add temple steps
        const stepsGeometry = new THREE.BoxGeometry(15, 2, 15);
        const stepsMaterial = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            roughness: 0.8,
            metalness: 0.1
        });
        
        const steps = new THREE.Mesh(stepsGeometry, stepsMaterial);
        steps.position.set(0, 1, 0);
        steps.castShadow = true;
        steps.receiveShadow = true;
        this.scene.add(steps);
    }

    createAmbientParticles() {
        // Create particle system for ambient atmosphere
        const particleCount = 1000;
        const particles = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 100;
            positions[i + 1] = Math.random() * 50;
            positions[i + 2] = (Math.random() - 0.5) * 100;
        }
        
        particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const particleMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.1,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending
        });
        
        this.particleSystem = new THREE.Points(particles, particleMaterial);
        this.scene.add(this.particleSystem);
    }

    // Add temple proximity checking
    checkTempleProximity() {
        if (!this.temple || !this.localPlayer) return false;
        const templePosition = this.temple.position;
        const playerPosition = this.localPlayer.position;
        const distance = templePosition.distanceTo(playerPosition);
        return distance < 20; // 20 units radius around temple
    }

    // Add method to check if player is inside temple
    isInsideTemple() {
        if (!this.temple || !this.localPlayer) return false;
        const templePosition = this.temple.position;
        const playerPosition = this.localPlayer.position;
        
        // Define temple bounds (adjust these values based on your temple size)
        const templeBounds = {
            minX: templePosition.x - 10,
            maxX: templePosition.x + 10,
            minZ: templePosition.z - 10,
            maxZ: templePosition.z + 10
        };
        
        return playerPosition.x >= templeBounds.minX &&
               playerPosition.x <= templeBounds.maxX &&
               playerPosition.z >= templeBounds.minZ &&
               playerPosition.z <= templeBounds.maxZ;
    }

    adjustKarma(amount) {
        if (!this.playerStats) {
            this.playerStats = {
                currentKarma: 50,
                maxKarma: 100,
                path: "neutral"
            };
        }

        const previousKarma = this.playerStats.currentKarma;
        this.playerStats.currentKarma = Math.max(0, Math.min(this.playerStats.maxKarma, this.playerStats.currentKarma + amount));

        // Update player path based on karma level
        if (this.playerStats.currentKarma < this.playerStats.maxKarma * 0.3) {
            if (this.playerStats.path !== "dark") {
                this.playerStats.path = "dark";
                this.karmaManager.onKarmaThresholdCrossed();
            }
        } else if (this.playerStats.currentKarma > this.playerStats.maxKarma * 0.7) {
            if (this.playerStats.path !== "light") {
                this.playerStats.path = "light";
                this.karmaManager.onKarmaThresholdCrossed();
            }
        } else if (this.playerStats.path !== "neutral") {
            this.playerStats.path = "neutral";
            this.karmaManager.onKarmaThresholdCrossed();
        }

        // Update UI if available
        if (this.uiManager) {
            this.uiManager.updateKarmaDisplay(this.playerStats.currentKarma, this.playerStats.maxKarma);
        }

        return this.playerStats.currentKarma - previousKarma;
    }

    setupInputHandlers() {
        console.log('Setting up input handlers...');
        
        // Keyboard events
        document.addEventListener('keydown', (event) => {
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
            
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
                    if (this.skillsManager) {
                        this.skillsManager.useMartialArts();
                    }
                    break;
            }
        });
        
        document.addEventListener('keyup', (event) => {
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
            
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
        });
        
        // Mouse wheel for zoom
        window.addEventListener('wheel', (event) => {
            const zoomAmount = event.deltaY * 0.001;
            this.currentZoom = Math.max(
                this.minZoom,
                Math.min(this.maxZoom, this.currentZoom + zoomAmount)
            );
        });
        
        // Window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        console.log('Input handlers setup complete');
    }

    startGameLoop() {
        console.log('Starting game loop...');
        
        const animate = () => {
            if (!this.isRunning) return;
            
            requestAnimationFrame(animate);
            
            const delta = this.clock.getDelta();
            
            // Update game state
            this.update(delta);
            
            // Render scene
            this.renderer.render(this.scene, this.camera);
        };
        
        animate();
        console.log('Game loop started');
    }

    update(delta) {
        // Update player movement if we have a local player
        if (this.localPlayer && this.isAlive) {
            this.updatePlayerMovement(delta);
        }
        
        // Update camera position
        if (this.cameraTarget && this.localPlayer) {
            this.updateCamera();
        }
        
        // Update managers
        if (this.networkManager) this.networkManager.update(delta);
        if (this.playerManager) this.playerManager.update(delta);
        if (this.karmaManager) this.karmaManager.update(delta);
        if (this.npcManager) this.npcManager.update(delta);
    }

    updatePlayerMovement(delta) {
        const moveSpeed = 5 * delta;
        const rotateSpeed = 2 * delta;
        
        if (this.controls.forward) this.localPlayer.translateZ(-moveSpeed);
        if (this.controls.backward) this.localPlayer.translateZ(moveSpeed);
        if (this.controls.left) this.localPlayer.rotation.y += rotateSpeed;
        if (this.controls.right) this.localPlayer.rotation.y -= rotateSpeed;
    }

    updateCamera() {
        // Update camera position based on player
        const targetPosition = new THREE.Vector3();
        this.localPlayer.getWorldPosition(targetPosition);
        
        // Add offset based on zoom level
        targetPosition.y += this.cameraOffset.y * (this.currentZoom / 15);
        targetPosition.z += this.cameraOffset.z * (this.currentZoom / 15);
        
        // Smoothly move camera
        this.camera.position.lerp(targetPosition, 0.1);
        this.camera.lookAt(this.localPlayer.position);
    }
} 