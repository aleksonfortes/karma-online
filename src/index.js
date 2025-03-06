import * as THREE from 'three';
import { io } from 'socket.io-client';

// Determine the server URL based on the environment
const SERVER_URL = window.location.hostname === 'localhost' && window.location.port === '5173'
    ? 'http://localhost:3000'  // Development
    : window.location.origin;  // Production

console.log('Connecting to server URL:', SERVER_URL);

function clearGameData() {
    localStorage.removeItem('gameSessionId');
    // Clear any other game-related data
    sessionStorage.clear();
    // Force a hard reload to clear cache
    window.location.reload(true);
}

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.players = new Map();
        this.localPlayer = null;
        this.socket = null;
        this.isRunning = true;
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false
        };
        
        // Camera settings for LoL-style view
        this.cameraOffset = new THREE.Vector3(0, 15, 15); // Height and distance from player
        this.cameraAngle = Math.PI / 4; // 45-degree angle
        this.cameraSmoothness = 0.1; // Lower = smoother camera movement
        
        // Add player stats
        this.playerStats = {
            maxLife: 100,
            currentLife: 100,
            maxMana: 100,
            currentMana: 100,
            maxKarma: 100,
            currentKarma: 50,
            lifeRegen: 0.1,
            manaRegen: 0.2,
            level: 1,
            experience: 0,
            experienceToNextLevel: 100
        };

        this.createUI();
        this.init();
        this.setupEventListeners();
        this.setupMultiplayer();
        this.animate();
    }

    init() {
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
            size: this.terrain.size / 2
        };

        // Initialize animation properties
        this.waterTime = 0;
        this.waveSpeed = 0.1; // Slower wave movement
        this.waveHeight = 0.1;
    }

    noise(x, z) {
        // Simple Perlin-like noise function
        return (Math.sin(x * 2.3 + z * 1.7) * Math.sin(x * 1.5 - z * 2.1) * 
                Math.cos(x * 0.8 + z * 1.3) * Math.cos(x * 1.2 - z * 0.9)) * 0.5 + 0.5;
    }

    checkCollision(position, previousPosition) {
        // Get the terrain size and add a small buffer zone
        const terrainSize = this.terrain.size;
        const halfTerrainSize = (terrainSize / 2) - 1; // Buffer of 1 unit from the edge
        
        // Check if player is trying to go beyond the grass terrain
        if (Math.abs(position.x) > halfTerrainSize || Math.abs(position.z) > halfTerrainSize) {
            // Reset to previous safe position instead of clamping
            if (previousPosition) {
                position.x = previousPosition.x;
                position.z = previousPosition.z;
            }
            return true;
        }
        
        return false;
    }

    createPlayer(id, position = { x: 0, y: 0, z: 0 }, rotation = { y: 0 }) {
        console.log('Creating player mesh for ID:', id);
        console.log('Position:', position);
        console.log('Rotation:', rotation);
        console.log('Is local player:', id === this.socket?.id);
        
        const playerGroup = new THREE.Group();
        
        // Create character body
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 32);
        const bodyMaterial = new THREE.MeshPhongMaterial({ 
            color: id === this.socket?.id ? 0x00ff00 : 0xff0000,
            shininess: 0
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        body.receiveShadow = true;
        playerGroup.add(body);

        // Create character head
        const headGeometry = new THREE.SphereGeometry(0.3, 32, 32);
        const headMaterial = new THREE.MeshPhongMaterial({ 
            color: id === this.socket?.id ? 0x00ff00 : 0xff0000,
            shininess: 0
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.5;
        head.castShadow = true;
        head.receiveShadow = true;
        playerGroup.add(head);

        // Set position and rotation
        playerGroup.position.set(position.x, position.y, position.z);
        playerGroup.rotation.y = rotation.y || 0;
        console.log('Player mesh created and positioned');
        return playerGroup;
    }

    setupMultiplayer() {
        console.log('Connecting to server...');
        
        // Create socket with initial configuration
        this.socket = io(SERVER_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            autoConnect: true,
            forceNew: true
        });

        // Set up connection event handlers
        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
        });

        this.socket.on('connect_error', (error) => {
            console.error('Failed to connect to server:', error);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.cleanup();
        });

        this.socket.on('currentPlayers', (players) => {
            console.log('\n=== Received Current Players ===');
            console.log('Players:', players);
            console.log('My socket ID:', this.socket.id);
            
            // Clear existing players
            console.log('Clearing existing players...');
            this.players.forEach((playerMesh) => {
                this.scene.remove(playerMesh);
            });
            this.players.clear();
            
            // Add all players including our own
            console.log('Creating players...');
            players.forEach((player) => {
                console.log('Creating player:', player);
                console.log('Is this player me?', player.id === this.socket.id);
                const playerMesh = this.createPlayer(
                    player.id,
                    player.position,
                    { y: player.rotation._y || player.rotation.y || 0 }
                );
                if (player.id === this.socket.id) {
                    console.log('Setting local player:', player.id);
                    this.localPlayer = playerMesh;
                } else {
                    console.log('Adding remote player:', player.id);
                    this.players.set(player.id, playerMesh);
                }
                this.scene.add(playerMesh);
            });
            console.log('Total players created:', players.length);
            console.log('Local player:', this.localPlayer ? 'exists' : 'missing');
            console.log('Remote players:', this.players.size);
        });

        this.socket.on('newPlayer', (player) => {
            console.log('\n=== New Player Joined ===');
            console.log('Player:', player);
            console.log('Is this player me?', player.id === this.socket.id);
            if (player.id !== this.socket.id) {
                console.log('Creating new player mesh');
                const playerMesh = this.createPlayer(
                    player.id,
                    player.position,
                    { y: player.rotation._y || player.rotation.y || 0 }
                );
                this.players.set(player.id, playerMesh);
                this.scene.add(playerMesh);
                console.log('New player added to scene');
            }
        });

        this.socket.on('playerMoved', (player) => {
            console.log('\n=== Player Moved ===');
            console.log('Player:', player);
            this.updatePlayerPosition(player);
        });

        this.socket.on('playerLeft', (playerId) => {
            console.log('\n=== Player Left ===');
            console.log('Player ID:', playerId);
            this.removePlayer(playerId);
        });
    }

    cleanup() {
        // Remove the game canvas
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.remove();
        }
        // Clear any game state
        this.players.clear();
        this.localPlayer = null;
        // Stop the animation loop
        this.isRunning = false;
        const uiElements = document.querySelectorAll('div[style*="position: fixed"]');
        uiElements.forEach(element => element.remove());
    }

    updatePlayerPosition(player) {
        const playerMesh = this.players.get(player.id);
        if (playerMesh) {
            console.log(`Updating position for player ${player.id}:`, player.position);
            playerMesh.position.set(
                player.position.x,
                player.position.y,
                player.position.z
            );
            playerMesh.rotation.y = player.rotation._y || player.rotation.y || 0;
        } else {
            console.log(`No mesh found for player ${player.id}`);
            console.log('Current players:', Array.from(this.players.keys()));
        }
    }

    removePlayer(playerId) {
        const playerMesh = this.players.get(playerId);
        if (playerMesh) {
            this.scene.remove(playerMesh);
            this.players.delete(playerId);
        }
    }

    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        window.addEventListener('keydown', (event) => {
            switch(event.key.toLowerCase()) {
                case 'w': this.controls.forward = true; break;
                case 's': this.controls.backward = true; break;
                case 'a': this.controls.left = true; break;
                case 'd': this.controls.right = true; break;
                case ' ': this.controls.jump = true; break;
            }
        });

        window.addEventListener('keyup', (event) => {
            switch(event.key.toLowerCase()) {
                case 'w': this.controls.forward = false; break;
                case 's': this.controls.backward = false; break;
                case 'a': this.controls.left = false; break;
                case 'd': this.controls.right = false; break;
                case ' ': this.controls.jump = false; break;
            }
        });
    }

    updatePlayer() {
        if (!this.localPlayer) return;

        const speed = 0.1;
        const rotationSpeed = 0.02;
        let hasMoved = false;
        let moveX = 0;
        let moveZ = 0;

        // Store previous position for collision resolution
        const previousPosition = this.localPlayer.position.clone();

        // Calculate movement direction based on key combinations
        if (this.controls.forward) moveZ -= 1;  // W - Forward/Up (negative Z)
        if (this.controls.backward) moveZ += 1; // S - Backward/Down (positive Z)
        if (this.controls.left) moveX -= 1;     // A - Left (negative X)
        if (this.controls.right) moveX += 1;    // D - Right (positive X)

        // Normalize diagonal movement to maintain consistent speed
        if (moveX !== 0 || moveZ !== 0) {
            // Calculate the magnitude of the movement vector
            const magnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
            if (magnitude > 0) {
                // Normalize and apply speed
                moveX = (moveX / magnitude) * speed;
                moveZ = (moveZ / magnitude) * speed;
                
                // Create a temporary position to check collision
                const nextPosition = this.localPlayer.position.clone();
                nextPosition.x += moveX;
                nextPosition.z += moveZ;

                // Only move if the next position is valid
                if (!this.checkCollision(nextPosition, previousPosition)) {
                    this.localPlayer.position.copy(nextPosition);
                    hasMoved = true;

                    // Update rotation to face movement direction
                    if (moveX !== 0 || moveZ !== 0) {
                        const targetRotation = Math.atan2(moveX, -moveZ);
                        let currentRotation = this.localPlayer.rotation.y;
                        const rotationDiff = targetRotation - currentRotation;
                        
                        // Normalize rotation difference to [-π, π]
                        let normalizedDiff = rotationDiff;
                        while (normalizedDiff > Math.PI) normalizedDiff -= 2 * Math.PI;
                        while (normalizedDiff < -Math.PI) normalizedDiff += 2 * Math.PI;
                        
                        // Apply smooth rotation
                        this.localPlayer.rotation.y += Math.sign(normalizedDiff) * 
                            Math.min(Math.abs(normalizedDiff), rotationSpeed);
                    }
                }
            }
        }

        // Handle jumping
        if (this.controls.jump) {
            // Simple jump animation
            this.localPlayer.position.y = Math.sin(Date.now() * 0.01) * 2 + 1;
            hasMoved = true;
        } else if (this.localPlayer.position.y !== 0) {
            this.localPlayer.position.y = 0;
            hasMoved = true;
        }

        // Only emit position to server if the player has moved
        if (hasMoved) {
            this.socket.emit('playerMovement', {
                position: this.localPlayer.position,
                rotation: this.localPlayer.rotation
            });
        }
    }

    updateCamera() {
        if (!this.localPlayer) return;

        // Get the player's position
        const playerPosition = this.localPlayer.position;
        
        // Calculate target camera position
        const targetX = playerPosition.x + this.cameraOffset.x;
        const targetY = playerPosition.y + this.cameraOffset.y;
        const targetZ = playerPosition.z + this.cameraOffset.z;
        
        // Smoothly move camera to target position
        this.camera.position.x += (targetX - this.camera.position.x) * this.cameraSmoothness;
        this.camera.position.y += (targetY - this.camera.position.y) * this.cameraSmoothness;
        this.camera.position.z += (targetZ - this.camera.position.z) * this.cameraSmoothness;
        
        // Look at player position
        this.camera.lookAt(
            playerPosition.x,
            playerPosition.y + 1, // Look slightly above the player
            playerPosition.z
        );
    }

    animate() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.animate());
        
        // Animate water with improved wave patterns
        if (this.ocean && this.ocean.material) {
            this.waterTime += 0.001; // Even slower water animation
            
            // Animate normal map for wave effect with more subtle movement
            if (this.ocean.material.normalMap) {
                const timeX = Math.sin(this.waterTime * 0.5) * 0.2;
                const timeY = Math.cos(this.waterTime * 0.3) * 0.2;
                this.ocean.material.normalMap.offset.x = timeX;
                this.ocean.material.normalMap.offset.y = timeY;
            }
            
            // Animate wave rings with more natural movement
            if (this.waveRings) {
                this.waveRings.forEach((wave, index) => {
                    const waveTime = this.waterTime * 1.2 + wave.phase;
                    const y = wave.baseY + 
                        Math.sin(waveTime) * wave.amplitude * 0.7 +
                        Math.sin(waveTime * 1.3) * wave.amplitude * 0.3;
                    wave.mesh.position.y = y;
                    
                    // Subtle rotation animation
                    const rotationAmount = Math.sin(this.waterTime * 0.8 + index * 0.2) * 0.005;
                    wave.mesh.rotation.z = rotationAmount;
                });
            }
        }
        
        // Update player stats
        if (this.playerStats.currentLife < this.playerStats.maxLife) {
            this.playerStats.currentLife = Math.min(
                this.playerStats.maxLife,
                this.playerStats.currentLife + this.playerStats.lifeRegen
            );
        }
        if (this.playerStats.currentMana < this.playerStats.maxMana) {
            this.playerStats.currentMana = Math.min(
                this.playerStats.maxMana,
                this.playerStats.currentMana + this.playerStats.manaRegen
            );
        }
        this.updateStatusBars();
        
        // Add small amount of XP over time (for testing)
        if (Math.random() < 0.01) { // 1% chance each frame
            this.gainExperience(1);
        }
        
        this.updatePlayer();
        this.updateCamera();
        this.renderer.render(this.scene, this.camera);
    }

    createUI() {
        // Create UI container
        const uiContainer = document.createElement('div');
        uiContainer.style.position = 'fixed';
        uiContainer.style.bottom = '20px';
        uiContainer.style.left = '20px';
        uiContainer.style.display = 'flex';
        uiContainer.style.alignItems = 'center';
        uiContainer.style.gap = '10px';
        uiContainer.style.zIndex = '1000';

        // Create circular icon with XP ring
        const iconContainer = document.createElement('div');
        iconContainer.style.width = '96px';  // Increased from 80px
        iconContainer.style.height = '96px';  // Increased from 80px
        iconContainer.style.position = 'relative';
        iconContainer.style.borderRadius = '50%';
        iconContainer.style.background = 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)';
        iconContainer.style.border = '2px solid rgba(147, 255, 223, 0.15)';
        iconContainer.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
        iconContainer.style.marginRight = '12px';  // Reduced from 20px to bring bars closer

        // Create XP fill element with gradient and masking
        const xpFill = document.createElement('div');
        xpFill.style.position = 'absolute';
        xpFill.style.bottom = '0';
        xpFill.style.left = '0';
        xpFill.style.width = '100%';
        xpFill.style.height = '0%';
        xpFill.style.background = '#FFFFFF';
        xpFill.style.transition = 'height 0.3s ease-out';
        xpFill.style.transformOrigin = 'bottom';
        xpFill.style.zIndex = '1';  // Ensure it's above the background
        xpFill.style.opacity = '1';  // Force full opacity
        xpFill.style.mixBlendMode = 'normal';  // Ensure normal blending
        this.xpFill = xpFill;

        // Create XP ring container with mask
        const xpRingContainer = document.createElement('div');
        xpRingContainer.style.position = 'absolute';
        xpRingContainer.style.inset = '2px';  // Use inset for consistent margins
        xpRingContainer.style.borderRadius = '50%';
        xpRingContainer.style.overflow = 'hidden';
        xpRingContainer.style.zIndex = '0';  // Ensure proper stacking
        this.xpRing = xpRingContainer;

        // Create level display container
        const levelContainer = document.createElement('div');
        levelContainer.style.position = 'absolute';
        levelContainer.style.inset = '0';  // Cover entire container
        levelContainer.style.display = 'flex';
        levelContainer.style.alignItems = 'center';
        levelContainer.style.justifyContent = 'center';
        levelContainer.style.zIndex = '2';  // Ensure it's above the fill

        // Add player level with improved styling
        const levelText = document.createElement('div');
        levelText.textContent = this.playerStats.level;
        levelText.style.color = '#FFD700';  // Golden color
        levelText.style.fontSize = '38px';  // Increased from 32px
        levelText.style.fontWeight = 'bold';
        levelText.style.textShadow = '0 0 10px rgba(255, 215, 0, 0.7)';  // Golden glow
        levelText.style.transform = 'translateY(-2px)';
        levelText.style.letterSpacing = '0.5px';
        levelText.style.userSelect = 'none';
        levelText.style.zIndex = '3';
        this.levelText = levelText;

        // Add pulsing animation for the level text
        const style = document.createElement('style');
        style.textContent = `
            @keyframes levelPulse {
                0% { text-shadow: 0 0 10px rgba(255, 215, 0, 0.5); }
                50% { text-shadow: 0 0 15px rgba(255, 215, 0, 0.8); }
                100% { text-shadow: 0 0 10px rgba(255, 215, 0, 0.5); }
            }
        `;
        document.head.appendChild(style);
        levelText.style.animation = 'levelPulse 2s ease-in-out infinite';

        // Add shine effect overlay
        const shineEffect = document.createElement('div');
        shineEffect.style.position = 'absolute';
        shineEffect.style.top = '0';
        shineEffect.style.left = '0';
        shineEffect.style.width = '100%';
        shineEffect.style.height = '100%';
        shineEffect.style.borderRadius = '50%';
        shineEffect.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 50%)';
        shineEffect.style.pointerEvents = 'none';

        // Update XP tooltip style with modern design
        const xpTooltip = document.createElement('div');
        xpTooltip.style.position = 'absolute';
        xpTooltip.style.bottom = '120%';
        xpTooltip.style.left = '50%';
        xpTooltip.style.transform = 'translateX(-50%)';
        xpTooltip.style.backgroundColor = 'rgba(20, 20, 20, 0.95)';
        xpTooltip.style.color = '#20D9C7';
        xpTooltip.style.padding = '8px 12px';
        xpTooltip.style.borderRadius = '6px';
        xpTooltip.style.fontSize = '12px';
        xpTooltip.style.fontWeight = '500';
        xpTooltip.style.whiteSpace = 'nowrap';
        xpTooltip.style.display = 'none';
        xpTooltip.style.border = '1px solid rgba(32, 217, 199, 0.2)';
        xpTooltip.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3), 0 0 10px rgba(32, 217, 199, 0.1)';
        xpTooltip.style.backdropFilter = 'blur(4px)';
        this.xpTooltip = xpTooltip;

        // Assemble the icon with all effects
        xpRingContainer.appendChild(xpFill);
        levelContainer.appendChild(levelText);  // Add level text to level container
        iconContainer.appendChild(xpRingContainer);
        iconContainer.appendChild(levelContainer);
        iconContainer.appendChild(shineEffect);
        iconContainer.appendChild(xpTooltip);

        // Add hover effects
        iconContainer.addEventListener('mouseenter', () => {
            this.updateXPTooltip();
            xpTooltip.style.display = 'block';
            iconContainer.style.transform = 'scale(1.02)';
            iconContainer.style.transition = 'transform 0.2s ease';
        });
        
        iconContainer.addEventListener('mouseleave', () => {
            xpTooltip.style.display = 'none';
            iconContainer.style.transform = 'scale(1)';
        });

        // Create bars container with adjusted positioning
        const barsContainer = document.createElement('div');
        barsContainer.style.display = 'flex';
        barsContainer.style.flexDirection = 'column';
        barsContainer.style.gap = '4px';  // Increased from 3px
        barsContainer.style.width = '150px';
        barsContainer.style.alignSelf = 'center';

        // Create status bars with new style
        const lifeBar = this.createModernStatusBar('Life', '#ff3333', '#660000');
        this.lifeBarFill = lifeBar.querySelector('.fill');
        this.lifeText = lifeBar.querySelector('.text');

        const manaBar = this.createModernStatusBar('Mana', '#3333ff', '#000066');
        this.manaBarFill = manaBar.querySelector('.fill');
        this.manaText = manaBar.querySelector('.text');

        const karmaBar = this.createModernStatusBar('Karma', '#ffcc00', '#665200');
        this.karmaBarFill = karmaBar.querySelector('.fill');
        this.karmaText = karmaBar.querySelector('.text');

        // Add elements to containers
        barsContainer.appendChild(lifeBar);
        barsContainer.appendChild(manaBar);
        barsContainer.appendChild(karmaBar);

        uiContainer.appendChild(iconContainer);
        uiContainer.appendChild(barsContainer);

        // Add to document
        document.body.appendChild(uiContainer);
        this.updateStatusBars();
    }

    createModernStatusBar(label, color, shadowColor) {
        const container = document.createElement('div');
        container.style.width = '100%';
        container.style.position = 'relative';
        container.style.height = '26px';  // Increased from 22px

        // Bar background
        const barContainer = document.createElement('div');
        barContainer.style.position = 'absolute';
        barContainer.style.left = '0';
        barContainer.style.right = '0';
        barContainer.style.top = '0';
        barContainer.style.bottom = '0';
        barContainer.style.background = 'linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.4))';
        barContainer.style.borderRadius = '5px';  // Increased from 4px
        barContainer.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        barContainer.style.overflow = 'hidden';

        // Fill bar with gradient and glow
        const fill = document.createElement('div');
        fill.className = 'fill';
        fill.style.width = '100%';
        fill.style.height = '100%';
        fill.style.background = `linear-gradient(to bottom, ${color}, ${shadowColor})`;
        fill.style.boxShadow = `0 0 10px ${color}, inset 0 0 5px rgba(255,255,255,0.5)`;  // Increased glow
        fill.style.transition = 'width 0.3s ease';

        // Text container
        const textContainer = document.createElement('div');
        textContainer.style.position = 'absolute';
        textContainer.style.left = '0';
        textContainer.style.right = '0';
        textContainer.style.top = '0';
        textContainer.style.bottom = '0';
        textContainer.style.padding = '0 10px';  // Increased from 8px
        textContainer.style.display = 'flex';
        textContainer.style.alignItems = 'center';
        textContainer.style.justifyContent = 'space-between';
        textContainer.style.color = 'white';
        textContainer.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.8)';
        textContainer.style.fontSize = '12px';  // Increased from 11px
        textContainer.style.fontWeight = 'bold';

        // Label
        const labelElement = document.createElement('span');
        labelElement.textContent = label;

        // Value text
        const text = document.createElement('span');
        text.className = 'text';

        textContainer.appendChild(labelElement);
        textContainer.appendChild(text);
        barContainer.appendChild(fill);
        container.appendChild(barContainer);
        container.appendChild(textContainer);

        return container;
    }

    updateStatusBars() {
        // Update life bar with glow intensity based on percentage
        const lifePercent = (this.playerStats.currentLife / this.playerStats.maxLife) * 100;
        this.lifeBarFill.style.width = `${lifePercent}%`;
        this.lifeText.textContent = `${Math.round(this.playerStats.currentLife)} / ${this.playerStats.maxLife}`;
        this.lifeBarFill.style.boxShadow = `0 0 ${10 + (lifePercent/10)}px #ff3333`;

        // Update mana bar with glow intensity based on percentage
        const manaPercent = (this.playerStats.currentMana / this.playerStats.maxMana) * 100;
        this.manaBarFill.style.width = `${manaPercent}%`;
        this.manaText.textContent = `${Math.round(this.playerStats.currentMana)} / ${this.playerStats.maxMana}`;
        this.manaBarFill.style.boxShadow = `0 0 ${10 + (manaPercent/10)}px #3333ff`;

        // Update karma bar with glow intensity based on percentage
        const karmaPercent = (this.playerStats.currentKarma / this.playerStats.maxKarma) * 100;
        this.karmaBarFill.style.width = `${karmaPercent}%`;
        this.karmaText.textContent = `${Math.round(this.playerStats.currentKarma)} / ${this.playerStats.maxKarma}`;
        this.karmaBarFill.style.boxShadow = `0 0 ${10 + (karmaPercent/10)}px #ffcc00`;
    }

    // Add damage and healing methods
    damagePlayer(amount) {
        this.playerStats.currentLife = Math.max(0, this.playerStats.currentLife - amount);
        this.updateStatusBars();
    }

    healPlayer(amount) {
        this.playerStats.currentLife = Math.min(this.playerStats.maxLife, this.playerStats.currentLife + amount);
        this.updateStatusBars();
    }

    useMana(amount) {
        if (this.playerStats.currentMana >= amount) {
            this.playerStats.currentMana -= amount;
            this.updateStatusBars();
            return true;
        }
        return false;
    }

    adjustKarma(amount) {
        this.playerStats.currentKarma = Math.max(0, Math.min(this.playerStats.maxKarma, this.playerStats.currentKarma + amount));
        this.updateStatusBars();
    }

    updateXPTooltip() {
        const xpCurrent = Math.round(this.playerStats.experience);
        const xpNeeded = this.playerStats.experienceToNextLevel;
        this.xpTooltip.textContent = `XP: ${xpCurrent} / ${xpNeeded}`;
    }

    gainExperience(amount) {
        this.playerStats.experience += amount;
        while (this.playerStats.experience >= this.playerStats.experienceToNextLevel) {
            this.playerStats.experience -= this.playerStats.experienceToNextLevel;
            this.levelUp();
        }
        this.updateLevelDisplay();
    }

    levelUp() {
        this.playerStats.level++;
        this.playerStats.experienceToNextLevel = Math.floor(this.playerStats.experienceToNextLevel * 1.5);
        
        // Increase stats on level up
        this.playerStats.maxLife += 10;
        this.playerStats.maxMana += 10;
        this.playerStats.currentLife = this.playerStats.maxLife;
        this.playerStats.currentMana = this.playerStats.maxMana;
        
        // Update displays
        this.updateStatusBars();
        
        // Create level up effect
        this.createLevelUpEffect();
    }

    createLevelUpEffect() {
        const levelUpFlash = document.createElement('div');
        levelUpFlash.style.position = 'absolute';
        levelUpFlash.style.top = '0';
        levelUpFlash.style.left = '0';
        levelUpFlash.style.width = '100%';
        levelUpFlash.style.height = '100%';
        levelUpFlash.style.borderRadius = '50%';
        levelUpFlash.style.background = 'radial-gradient(circle, rgba(255, 215, 0, 0.8) 0%, rgba(255, 215, 0, 0) 100%)';
        levelUpFlash.style.animation = 'levelUpFlash 0.5s ease-out';
        levelUpFlash.style.pointerEvents = 'none';

        const style = document.createElement('style');
        style.textContent = `
            @keyframes levelUpFlash {
                0% { transform: scale(1); opacity: 0.8; }
                100% { transform: scale(1.5); opacity: 0; }
            }
        `;
        document.head.appendChild(style);

        this.xpRing.parentElement.appendChild(levelUpFlash);
        setTimeout(() => levelUpFlash.remove(), 500);
    }

    updateLevelDisplay() {
        // Update level number
        this.levelText.textContent = this.playerStats.level;
        
        // Update XP fill height with forced visibility
        const progress = (this.playerStats.experience / this.playerStats.experienceToNextLevel) * 100;
        this.xpFill.style.height = `${progress}%`;
        this.xpFill.style.opacity = '1';
        this.xpFill.style.background = '#FFFFFF';
        
        // Update tooltip if visible
        if (this.xpTooltip.style.display === 'block') {
            this.updateXPTooltip();
        }
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
}); 