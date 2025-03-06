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
        
        this.init();
        this.setupEventListeners();
        this.setupMultiplayer();
        this.animate();
    }

    init() {
        // Setup renderer with a background color matching the ocean
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.setClearColor(0x0066aa); // Match ocean color
        document.body.appendChild(this.renderer.domElement);

        // Setup camera for isometric view
        this.camera.position.set(0, 15, 15);
        this.camera.lookAt(0, 0, 0);
        this.camera.rotation.x = -Math.PI / 4;

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
        const size = 120; // Increased arena size to match LoL proportions
        const segments = 128;
        
        // Create plane geometry
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        
        // Create terrain material with grass texture
        const grassTexture = new THREE.TextureLoader().load('/textures/grass.jpg');
        grassTexture.wrapS = THREE.RepeatWrapping;
        grassTexture.wrapT = THREE.RepeatWrapping;
        grassTexture.repeat.set(15, 15); // Adjusted for larger terrain
        
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
        const oceanSize = 1000;
        const arenaRadius = this.terrain.size / 2;
        
        // Load water textures
        const waterNormals = new THREE.TextureLoader().load('/textures/waternormals.jpg');
        waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
        waterNormals.repeat.set(12, 12);
        
        // Create water materials
        const waterMaterial = new THREE.MeshPhongMaterial({
            color: 0x0066aa,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            normalMap: waterNormals,
            normalScale: new THREE.Vector2(2.5, 2.5),
            shininess: 100,
            specular: 0x666666,
            reflectivity: 1
        });

        // Create main ocean (large plane underneath everything)
        const mainOceanGeometry = new THREE.PlaneGeometry(oceanSize, oceanSize);
        const mainOcean = new THREE.Mesh(mainOceanGeometry, waterMaterial);
        mainOcean.rotation.x = -Math.PI / 2;
        mainOcean.position.y = -2;
        this.scene.add(mainOcean);

        // Create transition ring around the arena
        const transitionSegments = 64;
        const transitionWidth = 20;
        const innerRadius = arenaRadius;
        const outerRadius = arenaRadius + transitionWidth;

        const transitionGeometry = new THREE.RingGeometry(
            innerRadius,
            outerRadius,
            transitionSegments * 2,
            8
        );
        
        const transitionMaterial = waterMaterial.clone();
        transitionMaterial.opacity = 0.7;
        
        const transitionRing = new THREE.Mesh(transitionGeometry, transitionMaterial);
        transitionRing.rotation.x = -Math.PI / 2;
        transitionRing.position.y = -0.5;
        this.scene.add(transitionRing);

        // Create subtle waves using multiple rings
        const waveCount = 8;
        this.waveRings = [];
        
        for (let i = 0; i < waveCount; i++) {
            const radius = innerRadius + (i * (transitionWidth / waveCount));
            const waveGeometry = new THREE.RingGeometry(
                radius,
                radius + (transitionWidth / waveCount),
                transitionSegments,
                1
            );
            
            const waveMaterial = waterMaterial.clone();
            waveMaterial.opacity = 0.3 - (i * 0.03);
            
            const waveRing = new THREE.Mesh(waveGeometry, waveMaterial);
            waveRing.rotation.x = -Math.PI / 2;
            waveRing.position.y = -0.5 - (i * 0.2);
            this.scene.add(waveRing);
            
            this.waveRings.push({
                mesh: waveRing,
                baseY: -0.5 - (i * 0.2),
                phase: i * (Math.PI / waveCount)
            });
        }

        // Store ocean data
        this.ocean = {
            mainMesh: mainOcean,
            transitionRing: transitionRing,
            material: waterMaterial,
            size: this.terrain.size / 2
        };

        // Initialize animation properties
        this.waterTime = 0;
        this.waveSpeed = 0.3;
        this.waveHeight = 0.15;
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
        
        // Animate water
        if (this.ocean && this.ocean.material) {
            this.waterTime += 0.003;
            
            // Animate normal map for wave effect
            if (this.ocean.material.normalMap) {
                this.ocean.material.normalMap.offset.x = this.waterTime * 0.1;
                this.ocean.material.normalMap.offset.y = this.waterTime * 0.1;
            }
            
            // Animate wave rings
            if (this.waveRings) {
                this.waveRings.forEach((wave, index) => {
                    const y = wave.baseY + Math.sin(this.waterTime * 2 + wave.phase) * 0.1;
                    wave.mesh.position.y = y;
                    wave.mesh.rotation.z = Math.sin(this.waterTime + index) * 0.02;
                });
            }
        }
        
        this.updatePlayer();
        this.updateCamera();
        this.renderer.render(this.scene, this.camera);
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
}); 