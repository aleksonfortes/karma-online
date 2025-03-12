import * as THREE from 'three';
import { UIManager } from './modules/ui/UIManager.js';
import { NetworkManager } from './modules/network/NetworkManager.js';
import { PlayerManager } from './modules/player/PlayerManager.js';
import { SkillsManager } from './modules/skills/SkillsManager.js';
import { KarmaManager } from './modules/karma/KarmaManager.js';
import { TerrainManager } from './modules/terrain/TerrainManager.js';
import { NPCManager } from './modules/npc/NPCManager.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import ModelScales from './config/ModelScales.js';
import { getServerUrl } from './config.js';

export class Game {
    constructor() {
        // Initialize Three.js components
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
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
        try {
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
            
            // Initialize network first - required for game to work
            const networkInitialized = await this.networkManager.init();
            if (!networkInitialized) {
                throw new Error('Failed to connect to server');
            }
            
            // Initialize player
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

        // Create temple floor at ground level (no elevated platform)
        // Using a very thin box instead of completely removing it to maintain the floor texture
        const baseHeight = 0.05; // Very thin floor instead of 1.5
        const baseGeometry = new THREE.BoxGeometry(30, baseHeight, 30);
        const basePlatform = new THREE.Mesh(baseGeometry, floorMaterial);
        basePlatform.position.y = baseHeight / 2; // Position at half height (almost at ground level)
        basePlatform.receiveShadow = true;
        templeGroup.add(basePlatform);

        // Add corner statues - adjusted positions for ground level
        const statuePositions = [
            { x: 13, z: 13 },  // Northeast
            { x: -13, z: 13 }, // Northwest
            { x: 13, z: -13 }, // Southeast
            { x: -13, z: -13 } // Southwest
        ];

        // Create statue material
        const statueMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080,
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
                radius: baseWidth // Maintain the same collision radius
            });
        });

        // Create cross-shaped floor pattern
        const floorGroup = new THREE.Group();
        
        // Vertical part of cross
        const verticalGeometry = new THREE.BoxGeometry(8, 0.1, 24);
        const verticalFloor = new THREE.Mesh(verticalGeometry, floorMaterial);
        verticalFloor.position.y = baseHeight + 0.05; // Position just above base
        verticalFloor.receiveShadow = true;
        floorGroup.add(verticalFloor);
        
        // Horizontal part of cross
        const horizontalGeometry = new THREE.BoxGeometry(24, 0.1, 8);
        const horizontalFloor = new THREE.Mesh(horizontalGeometry, floorMaterial);
        horizontalFloor.position.y = baseHeight + 0.05; // Position just above base
        horizontalFloor.receiveShadow = true;
        floorGroup.add(horizontalFloor);
        
        templeGroup.add(floorGroup);

        // Add temple light
        const templeLight = new THREE.PointLight(0xffd700, 0.8, 30);
        templeLight.position.set(0, 4, 0); // Adjust light height to be lower
        templeGroup.add(templeLight);

        // Add NPC to the temple
        this.loadNPC(templeGroup, baseHeight);

        // Position the entire temple
        templeGroup.position.set(0, 0, 0);
        this.scene.add(templeGroup);
        
        // Store temple reference
        this.temple = templeGroup;
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
            const darkConfig = ModelScales.TEMPLE_NPC.DARK;
            darkModel.scale.set(darkConfig.SCALE, darkConfig.SCALE, darkConfig.SCALE);
            darkModel.position.set(
                darkConfig.POSITION.x, 
                darkConfig.POSITION.y, 
                darkConfig.POSITION.z
            );
            darkModel.rotation.y = darkConfig.ROTATION;
            
            // Set up the light NPC model (left side)
            const lightModel = lightNPC.scene;
            const lightConfig = ModelScales.TEMPLE_NPC.LIGHT;
            lightModel.scale.set(lightConfig.SCALE, lightConfig.SCALE, lightConfig.SCALE);
            lightModel.position.set(
                lightConfig.POSITION.x, 
                lightConfig.POSITION.y, 
                lightConfig.POSITION.z
            );
            lightModel.rotation.y = lightConfig.ROTATION;
            
            // Add shadows to both NPCs
            [darkModel, lightModel].forEach(model => {
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
            });

            // Add interaction text to both NPCs, positioned directly above their heads
            const darkTextSprite = this.addInteractionText(darkModel, darkConfig.TEXT_OFFSET);
            const lightTextSprite = this.addInteractionText(lightModel, lightConfig.TEXT_OFFSET);
            
            // Ensure text sprites have the same visual size
            darkTextSprite.scale.set(
                darkConfig.TEXT_SCALE.x, 
                darkConfig.TEXT_SCALE.y, 
                darkConfig.TEXT_SCALE.z
            );
            lightTextSprite.scale.set(
                lightConfig.TEXT_SCALE.x, 
                lightConfig.TEXT_SCALE.y, 
                lightConfig.TEXT_SCALE.z
            );
            
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

            // Add colliders for both NPCs with the same radius
            this.statueColliders.push(
                {
                    position: new THREE.Vector3(darkConfig.POSITION.x, 0, darkConfig.POSITION.z),
                    radius: ModelScales.NPC.DARK.COLLISION_RADIUS
                },
                {
                    position: new THREE.Vector3(lightConfig.POSITION.x, 0, lightConfig.POSITION.z),
                    radius: ModelScales.NPC.LIGHT.COLLISION_RADIUS
                }
            );

        } catch (error) {
            console.error('Error loading NPC models:', error);
        }
    }

    addInteractionText(npcModel, yOffset) {
        // Create a canvas for the text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        // Set text style with slightly larger font
        context.font = 'bold 36px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        // Create gradient for text
        const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, '#4a9eff');
        gradient.addColorStop(1, '#00ff88');

        // Draw text with gradient and outline
        const text = 'Press E';
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
        sprite.scale.set(0.5, 0.12, 1);
        sprite.position.y = yOffset;
        sprite.renderOrder = 999;
        
        // Add sprite as child of NPC model
        npcModel.add(sprite);

        // Store sprite reference
        npcModel.interactionSprite = sprite;
        
        // Return the sprite for further adjustments if needed
        return sprite;
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
        if (!this.localPlayer || !this.temple) return false;
        
        const playerPos = this.localPlayer.position;
        const templePos = this.temple.position;
        
        // Check if player is within the temple base platform bounds
        const baseHalfWidth = 15; // 30/2 for base platform
        return Math.abs(playerPos.x - templePos.x) <= baseHalfWidth && 
               Math.abs(playerPos.z - templePos.z) <= baseHalfWidth;
    }

    // Add method to check if player is on temple platform
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
        
        // Add mouse wheel event listener for zoom
        window.addEventListener('wheel', (event) => {
            const zoomAmount = event.deltaY * 0.01 * this.zoomSpeed;
            this.currentZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.currentZoom + zoomAmount));
        });
        
        // Update camera aspect ratio and size when window resizes
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
            
            try {
                const delta = this.clock.getDelta();
                this.update(delta);
                this.renderer.render(this.scene, this.camera);
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
        
        // Update camera
        if (this.localPlayer) {
            this.updateCamera();
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
            
            // Check collisions
            if (this.checkCollision(this.localPlayer.position)) {
                this.localPlayer.position.copy(previousPosition);
            }

            // Send position update to server
            this.networkManager?.sendPlayerState({
                x: this.localPlayer.position.x,
                y: this.localPlayer.position.y,
                z: this.localPlayer.position.z,
                rotation: this.localPlayer.rotation.y,
                animation: 'running'
            });
        }
    }

    updateCamera() {
        if (!this.localPlayer) return;

        const playerPosition = this.localPlayer.position;
        const zoomFactor = this.currentZoom / 15;
        const offsetY = this.cameraOffset.y * zoomFactor;
        const offsetZ = this.cameraOffset.z * zoomFactor;
        
        // Smoothly move camera
        const smoothness = 0.05;
        this.camera.position.x += (playerPosition.x - this.camera.position.x) * smoothness;
        this.camera.position.y += (playerPosition.y + offsetY - this.camera.position.y) * smoothness;
        this.camera.position.z += (playerPosition.z + offsetZ - this.camera.position.z) * smoothness;
        
        // Look at player
        const lookAtPosition = playerPosition.clone();
        lookAtPosition.y += 1.5;
        this.camera.lookAt(lookAtPosition);
    }

    checkCollision(position) {
        // Check terrain boundaries
        const terrainSize = 100;
        const halfTerrainSize = terrainSize / 2 - 1;
        
        if (Math.abs(position.x) > halfTerrainSize || Math.abs(position.z) > halfTerrainSize) {
            return true;
        }
        
        // Check statue collisions
        if (this.statueColliders) {
            for (const collider of this.statueColliders) {
                const dx = position.x - collider.position.x;
                const dz = position.z - collider.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                if (distance < collider.radius + 0.5) {
                    return true;
                }
            }
        }
        
        return false;
    }
} 