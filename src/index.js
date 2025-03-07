import * as THREE from 'three';
import { io } from 'socket.io-client';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';

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
            right: false
        };
        
        // Add karma recovery timer
        this.lastKarmaRecoveryTime = Date.now();
        
        // Camera settings for LoL-style view with zoom limits
        this.cameraOffset = new THREE.Vector3(0, 15, 15);
        this.minZoom = 12; // Increased minimum zoom to prevent getting too close
        this.maxZoom = 20; // Reduced maximum zoom to prevent zooming out too far
        this.zoomSpeed = 0.5; // Reduced zoom speed for smoother transitions
        this.currentZoom = 15; // Starting zoom level (middle point between min and max)
        this.cameraAngle = Math.PI / 4;
        this.cameraSmoothness = 0.05;
        
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

        // Add darkness overlay for karma system
        this.createDarknessOverlay();
        
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

        // Create temple in the center
        this.createTemple();

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
        // Check terrain boundaries
        const terrainSize = this.terrain.size;
        const halfTerrainSize = (terrainSize / 2) - 1;
        
        if (Math.abs(position.x) > halfTerrainSize || Math.abs(position.z) > halfTerrainSize) {
            if (previousPosition) {
                position.x = previousPosition.x;
                position.z = previousPosition.z;
            }
            return true;
        }
        
        // Check statue collisions
        if (this.statueColliders) {
            for (const statue of this.statueColliders) {
                const dx = position.x - statue.position.x;
                const dz = position.z - statue.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                if (distance < statue.radius) {
                    // Collision detected, move player back
                    if (previousPosition) {
                        position.x = previousPosition.x;
                        position.z = previousPosition.z;
                    }
                    return true;
                }
            }
        }
        
        return false;
    }

    async createPlayer(id, position = { x: 0, y: 1.5, z: 0 }, rotation = { y: 0 }) {
        console.log('Creating player mesh for ID:', id);
        console.log('Position:', position);
        console.log('Rotation:', rotation);
        console.log('Is local player:', id === this.socket?.id);
        
        // Load detailed model for all players
        let playerModel = await this.loadCharacterModel();

        // Use provided position for existing players, temple center for new local player
        if (id === this.socket?.id) {
            playerModel.position.set(0, 1.5, 0);
        } else {
            playerModel.position.set(
                position.x,
                position.y,
                position.z
            );
        }
        
        playerModel.rotation.y = rotation.y || 0;

        // Create status bars group that will not inherit rotation
        const statusGroup = new THREE.Group();
        statusGroup.position.y = 2.5; // Set initial height above player
        
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

        // Create three background bars
        const bars = ['life', 'mana', 'karma'].map((type, index) => {
            const background = new THREE.Mesh(barGeometry, backgroundMaterial.clone());
            const fillMaterial = new THREE.MeshBasicMaterial({
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.9
            });
            const fill = new THREE.Mesh(barGeometry, fillMaterial);
            
            // Position bars vertically stacked
            const yOffset = 3.5 + (barHeight + barSpacing) * (2 - index);
            background.position.y = yOffset;
            fill.position.y = yOffset;
            fill.position.z = 0.001; // Slightly in front

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
        playerModel.userData.statusBars = bars;
        playerModel.userData.statusGroup = statusGroup;

        // Add status group to scene AFTER setting up all bars
        this.scene.add(statusGroup);

        // Set initial values and update status bars immediately
        const initialStats = id === this.socket?.id ? {
            life: this.playerStats.currentLife,
            maxLife: this.playerStats.maxLife,
            mana: this.playerStats.currentMana,
            maxMana: this.playerStats.maxMana,
            karma: this.playerStats.currentKarma,
            maxKarma: this.playerStats.maxKarma
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
        
        // Force immediate update of status bars
        this.updatePlayerStatus(playerModel, initialStats);

        return playerModel;
    }

    updatePlayerStatus(playerMesh, stats) {
        // Create status bars if they don't exist
        if (!playerMesh.userData.statusBars || !playerMesh.userData.statusGroup) {
            console.log('Creating new status bars for player');
            const statusGroup = new THREE.Group();
            
            const barWidth = 1;
            const barHeight = 0.1;
            const barSpacing = 0.05;
            const barGeometry = new THREE.PlaneGeometry(barWidth, barHeight);
            
            const backgroundMaterial = new THREE.MeshBasicMaterial({
                color: 0x333333,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.7
            });
            
            const bars = ['life', 'mana', 'karma'].map((type, index) => {
                const background = new THREE.Mesh(barGeometry, backgroundMaterial.clone());
                const fillMaterial = new THREE.MeshBasicMaterial({
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.9
                });
                const fill = new THREE.Mesh(barGeometry, fillMaterial);
                
                const yOffset = 3.5 + (barHeight + barSpacing) * (2 - index);
                background.position.y = yOffset;
                fill.position.y = yOffset;
                fill.position.z = 0.001;
                
                statusGroup.add(background);
                statusGroup.add(fill);
                
                return { background, fill, width: barWidth, type };
            });
            
            playerMesh.userData.statusBars = bars;
            playerMesh.userData.statusGroup = statusGroup;
            this.scene.add(statusGroup);
        }

        // Get the player's world position
        const statusGroup = playerMesh.userData.statusGroup;
        const worldPosition = new THREE.Vector3();
        playerMesh.getWorldPosition(worldPosition);
        
        // Position status group above player's head
        statusGroup.position.set(worldPosition.x, worldPosition.y + 2.5, worldPosition.z);
        
        // Ensure status group is always facing the camera
        if (this.camera) {
            statusGroup.quaternion.copy(this.camera.quaternion);
        }

        // Store the stats in the player's userData
        playerMesh.userData.stats = stats;

        // Update each status bar
        playerMesh.userData.statusBars.forEach(bar => {
            const { fill, width, type } = bar;
            let fillAmount, color;

            switch (type) {
                case 'life':
                    fillAmount = stats.life / stats.maxLife;
                    color = new THREE.Color(0xff3333);
                    break;
                case 'mana':
                    fillAmount = stats.mana / stats.maxMana;
                    color = new THREE.Color(0x3333ff);
                    break;
                case 'karma':
                    fillAmount = stats.karma / stats.maxKarma;
                    if (stats.karma === 50) {
                        color = new THREE.Color(0xfffacd);
                    } else if (stats.karma > 50) {
                        const intensity = (stats.karma - 50) / 50;
                        color = new THREE.Color(0xff0000).lerp(new THREE.Color(0x800000), intensity);
                    } else {
                        const intensity = (50 - stats.karma) / 50;
                        color = new THREE.Color(0x4169e1).lerp(new THREE.Color(0x00ffff), intensity);
                    }
                    break;
            }

            // Update fill amount and color
            fill.scale.x = fillAmount;
            fill.position.x = -(width * (1 - fillAmount)) / 2;
            fill.material.color = color;
        });

        // Ensure the status group is visible and properly layered
        statusGroup.visible = true;
        statusGroup.renderOrder = 999; // Ensure it renders on top
        statusGroup.children.forEach(child => {
            child.renderOrder = 999;
        });
    }

    createBasicCharacter() {
        const playerGroup = new THREE.Group();
        
        // Create character body
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 32);
        const bodyMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xff0000,
            shininess: 0
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        body.receiveShadow = true;
        playerGroup.add(body);

        // Create character head
        const headGeometry = new THREE.SphereGeometry(0.3, 32, 32);
        const headMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xff0000,
            shininess: 0
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.5;
        head.castShadow = true;
        head.receiveShadow = true;
        playerGroup.add(head);

        return playerGroup;
    }

    setupMultiplayer() {
        console.log('Connecting to server...');
        
        this.socket = io(SERVER_URL, {
            transports: ['websocket'],  // Force WebSocket for faster updates
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            autoConnect: true,
            forceNew: true
        });

        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
            // Request immediate state update when connecting
            this.socket.emit('requestStateUpdate');
        });

        this.socket.on('currentPlayers', async (players) => {
            console.log('\n=== Received Current Players ===');
            console.log('Players:', players);
            
            // Clear existing players and their status bars
            this.players.forEach((playerMesh) => {
                if (playerMesh.userData.statusGroup) {
                    this.scene.remove(playerMesh.userData.statusGroup);
                }
                this.scene.remove(playerMesh);
            });
            this.players.clear();
            
            // Add all players
            for (const player of players) {
                if (player.id === this.socket.id) {
                    // Create local player if it doesn't exist
                    if (!this.localPlayer) {
                        this.localPlayer = await this.createPlayer(
                            player.id,
                            player.position,
                            { y: player.rotation.y || 0 }
                        );
                        this.scene.add(this.localPlayer);
                        
                        // Force update of local player status bars
                        this.updatePlayerStatus(this.localPlayer, {
                            life: this.playerStats.currentLife,
                            maxLife: this.playerStats.maxLife,
                            mana: this.playerStats.currentMana,
                            maxMana: this.playerStats.maxMana,
                            karma: this.playerStats.currentKarma,
                            maxKarma: this.playerStats.maxKarma
                        });
                    }
                } else {
                    // Create other players
                    const playerMesh = await this.createPlayer(
                        player.id,
                        player.position,
                        { y: player.rotation.y || 0 }
                    );
                    
                    this.scene.add(playerMesh);
                    
                    const stats = {
                        life: player.life ?? 100,
                        maxLife: player.maxLife ?? 100,
                        mana: player.mana ?? 100,
                        maxMana: player.maxMana ?? 100,
                        karma: player.karma ?? 50,
                        maxKarma: player.maxKarma ?? 100
                    };
                    
                    // Force creation and update of status bars
                    this.updatePlayerStatus(playerMesh, stats);
                    this.players.set(player.id, playerMesh);
                    
                    console.log(`Added player ${player.id} with status bars`);
                }
            }
        });

        this.socket.on('newPlayer', async (player) => {
            if (player.id === this.socket.id) return;
            
            console.log('Creating new player:', player.id);
            const playerMesh = await this.createPlayer(
                player.id,
                player.position,
                { y: player.rotation.y || 0 }
            );
            
            this.scene.add(playerMesh);
            
            const stats = {
                life: player.life ?? 100,
                maxLife: player.maxLife ?? 100,
                mana: player.mana ?? 100,
                maxMana: player.maxMana ?? 100,
                karma: player.karma ?? 50,
                maxKarma: player.maxKarma ?? 100
            };
            
            // Force creation and update of status bars
            this.updatePlayerStatus(playerMesh, stats);
            this.players.set(player.id, playerMesh);
            
            console.log(`Added new player ${player.id} with status bars`);
            
            // Send our current state to the new player
            if (this.localPlayer) {
                this.sendPlayerState();
            }
        });

        // Update interval for continuous state synchronization
        this.updateInterval = setInterval(() => {
            if (this.localPlayer && this.socket?.connected) {
                this.sendPlayerState();
            }
        }, 16);  // 60fps update rate

        this.socket.on('playerMoved', (player) => {
            if (player.id === this.socket?.id) return;
            
            const playerMesh = this.players.get(player.id);
            if (playerMesh) {
                // Update position
                playerMesh.position.set(
                    player.position.x,
                    player.position.y,
                    player.position.z
                );
                playerMesh.rotation.y = player.rotation.y || 0;
                
                // Update stats
                const stats = {
                    life: player.life ?? playerMesh.userData.stats?.life ?? 100,
                    maxLife: player.maxLife ?? playerMesh.userData.stats?.maxLife ?? 100,
                    mana: player.mana ?? playerMesh.userData.stats?.mana ?? 100,
                    maxMana: player.maxMana ?? playerMesh.userData.stats?.maxMana ?? 100,
                    karma: player.karma ?? playerMesh.userData.stats?.karma ?? 50,
                    maxKarma: player.maxKarma ?? playerMesh.userData.stats?.maxKarma ?? 100
                };
                
                playerMesh.userData.stats = stats;
                this.updatePlayerStatus(playerMesh, stats);
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Failed to connect to server:', error);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.cleanup();
        });

        this.socket.on('playerLeft', (playerId) => {
            console.log('\n=== Player Left ===');
            console.log('Player ID:', playerId);
            this.removePlayer(playerId);
        });

        this.socket.on('karmaUpdate', (player) => {
            console.log(`Received karma update - Player ID: ${player.id}, Karma: ${player.karma}`);
            const playerMesh = this.players.get(player.id);
            if (!playerMesh) {
                console.log(`No mesh found for player ${player.id}`);
                return;
            }

            // Immediately update the status bars with the new karma value
            const stats = {
                life: player.life ?? playerMesh.userData.stats?.life ?? 100,
                maxLife: player.maxLife ?? playerMesh.userData.stats?.maxLife ?? 100,
                mana: player.mana ?? playerMesh.userData.stats?.mana ?? 100,
                maxMana: player.maxMana ?? playerMesh.userData.stats?.maxMana ?? 100,
                karma: player.karma,
                maxKarma: player.maxKarma ?? 100
            };

            // Store the stats in the mesh's userData for future reference
            playerMesh.userData.stats = stats;
            
            // Force immediate update of the status bars
            this.updatePlayerStatus(playerMesh, stats);
            console.log(`Updated player ${player.id} karma to: ${player.karma}`);
        });
    }

    sendPlayerState() {
        if (!this.localPlayer || !this.socket?.connected) return;

        const playerState = {
            id: this.socket.id,
            position: this.localPlayer.position,
            rotation: this.localPlayer.rotation,
            karma: this.playerStats.currentKarma,
            maxKarma: this.playerStats.maxKarma,
            life: this.playerStats.currentLife,
            maxLife: this.playerStats.maxLife,
            mana: this.playerStats.currentMana,
            maxMana: this.playerStats.maxMana,
            timestamp: Date.now()
        };

        // Send state update with volatile flag for real-time priority
        this.socket.volatile.emit('playerMovement', playerState);
    }

    cleanup() {
        // Clear update interval when cleaning up
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        // Remove the game canvas
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.remove();
        }
        // Remove darkness overlay
        if (this.darknessOverlay) {
            this.darknessOverlay.remove();
        }
        // Clear any game state and remove status groups
        this.players.forEach(player => {
            if (player.userData.statusGroup) {
                this.scene.remove(player.userData.statusGroup);
            }
        });
        this.players.clear();
        if (this.localPlayer && this.localPlayer.userData.statusGroup) {
            this.scene.remove(this.localPlayer.userData.statusGroup);
        }
        this.localPlayer = null;
        // Stop the animation loop
        this.isRunning = false;
        const uiElements = document.querySelectorAll('div[style*="position: fixed"]');
        uiElements.forEach(element => element.remove());
    }

    updatePlayerPosition(player) {
        const playerMesh = this.players.get(player.id);
        if (!playerMesh) {
            console.log(`No mesh found for player ${player.id}`);
            return;
        }

        // Update position and rotation
        playerMesh.position.set(
            player.position.x,
            player.position.y,
            player.position.z
        );
        playerMesh.rotation.y = player.rotation._y || player.rotation.y || 0;
        
        // Only update stats if they are provided in the update
        if (player.karma !== undefined || player.life !== undefined || player.mana !== undefined) {
            const stats = {
                life: player.life ?? playerMesh.userData.stats?.life ?? 100,
                maxLife: player.maxLife ?? playerMesh.userData.stats?.maxLife ?? 100,
                mana: player.mana ?? playerMesh.userData.stats?.mana ?? 100,
                maxMana: player.maxMana ?? playerMesh.userData.stats?.maxMana ?? 100,
                karma: player.karma ?? playerMesh.userData.stats?.karma ?? 50,
                maxKarma: player.maxKarma ?? playerMesh.userData.stats?.maxKarma ?? 100
            };
            
            // Store the stats in the mesh's userData
            playerMesh.userData.stats = stats;
            
            // Update the status bars
            if (playerMesh.userData.statusBars && playerMesh.userData.statusGroup) {
                this.updatePlayerStatus(playerMesh, stats);
                console.log(`Updated player ${player.id} stats:`, stats);
            } else {
                console.warn(`Status bars not found for player ${player.id}`);
            }
        }
    }

    removePlayer(playerId) {
        const playerMesh = this.players.get(playerId);
        if (playerMesh) {
            // Remove status group from scene
            if (playerMesh.userData.statusGroup) {
                this.scene.remove(playerMesh.userData.statusGroup);
            }
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

        window.addEventListener('keydown', (event) => {
            switch(event.key.toLowerCase()) {
                case 'w': this.controls.forward = true; break;
                case 's': this.controls.backward = true; break;
                case 'a': this.controls.left = true; break;
                case 'd': this.controls.right = true; break;
                case 'k': this.adjustKarma(10); break; // Increase Karma by 10
                case 'r': this.adjustKarma(-this.playerStats.currentKarma); break; // Reset Karma to 0
            }
        });

        window.addEventListener('keyup', (event) => {
            switch(event.key.toLowerCase()) {
                case 'w': this.controls.forward = false; break;
                case 's': this.controls.backward = false; break;
                case 'a': this.controls.left = false; break;
                case 'd': this.controls.right = false; break;
            }
        });
    }

    async loadCharacterModel() {
        try {
            console.log('Starting to load character model...');
            
            // Load the GLB model
            const loader = new GLTFLoader();
            const gltf = await new Promise((resolve, reject) => {
                loader.load(
                    '/models/scene.glb',
                    (gltf) => {
                        console.log('Model loaded successfully:', gltf);
                        resolve(gltf);
                    },
                    (progress) => console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%'),
                    (error) => {
                        console.error('Error loading model:', error);
                        reject(error);
                    }
                );
            });

            // Create a group to hold the model
            const modelGroup = new THREE.Group();
            modelGroup.add(gltf.scene);
            
            // Set up the model with larger scale
            gltf.scene.scale.set(5, 5, 5);
            gltf.scene.position.y = 0;
            gltf.scene.rotation.y = 0;
            
            console.log('Model setup complete');
            return modelGroup;
            
        } catch (error) {
            console.error('Error in loadCharacterModel:', error);
            // Fallback to basic character if loading fails
            return this.createBasicCharacter();
        }
    }

    updatePlayer() {
        if (!this.localPlayer) return;

        const speed = 0.1;
        const rotationSpeed = 0.1;
        let moveX = 0;
        let moveZ = 0;

        // Calculate movement direction based on key combinations
        if (this.controls.forward) moveZ -= 1;
        if (this.controls.backward) moveZ += 1;
        if (this.controls.left) moveX -= 1;
        if (this.controls.right) moveX += 1;

        // Handle karma recovery timer
        if (this.checkTempleProximity()) {
            const currentTime = Date.now();
            const timeSinceLastRecovery = currentTime - this.lastKarmaRecoveryTime;
            
            if (timeSinceLastRecovery >= 60000 && this.playerStats.currentKarma > 0) {
                this.adjustKarma(-1);
                this.lastKarmaRecoveryTime = currentTime;
            }
        } else {
            this.lastKarmaRecoveryTime = Date.now();
        }

        // Update local player's status bars
        this.updatePlayerStatus(this.localPlayer, {
            life: this.playerStats.currentLife,
            maxLife: this.playerStats.maxLife,
            mana: this.playerStats.currentMana,
            maxMana: this.playerStats.maxMana,
            karma: this.playerStats.currentKarma,
            maxKarma: this.playerStats.maxKarma
        });

        // Normalize diagonal movement
        if (moveX !== 0 || moveZ !== 0) {
            const magnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
            if (magnitude > 0) {
                moveX = (moveX / magnitude) * speed;
                moveZ = (moveZ / magnitude) * speed;
                
                const nextPosition = this.localPlayer.position.clone();
                nextPosition.x += moveX;
                nextPosition.z += moveZ;

                if (!this.checkCollision(nextPosition, this.localPlayer.position.clone())) {
                    this.localPlayer.position.copy(nextPosition);

                    const targetRotation = Math.atan2(moveX, moveZ);
                    let currentRotation = this.localPlayer.rotation.y;
                    const rotationDiff = targetRotation - currentRotation;
                    
                    let normalizedDiff = rotationDiff;
                    while (normalizedDiff > Math.PI) normalizedDiff -= 2 * Math.PI;
                    while (normalizedDiff < -Math.PI) normalizedDiff += 2 * Math.PI;
                    
                    this.localPlayer.rotation.y += Math.sign(normalizedDiff) * 
                        Math.min(Math.abs(normalizedDiff), rotationSpeed);
                }
            }
        }
    }

    // Add new method to check if player is on temple platform
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

        return isOnBase || isOnVertical || isOnHorizontal;
    }

    updateCamera() {
        if (!this.localPlayer) return;

        // Get the player's position
        const playerPosition = this.localPlayer.position;
        
        // Calculate target camera position using current zoom level
        const targetX = playerPosition.x;
        const targetY = playerPosition.y + this.cameraOffset.y;
        const targetZ = playerPosition.z + this.cameraOffset.z;
        
        // Smoothly move camera to target position
        this.camera.position.x += (targetX - this.camera.position.x) * this.cameraSmoothness;
        this.camera.position.y += (targetY - this.camera.position.y) * this.cameraSmoothness;
        this.camera.position.z += (targetZ - this.camera.position.z) * this.cameraSmoothness;
        
        // Always look at player position
        this.camera.lookAt(playerPosition);
    }

    animate() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.animate());
        
        // Update all status bars every frame
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
            
            // Send local player state
            this.sendPlayerState();
        }
        
        // Animate water with improved wave patterns
        if (this.ocean && this.ocean.material) {
            this.waterTime += 0.001;
            
            if (this.ocean.material.normalMap) {
                const timeX = Math.sin(this.waterTime * 0.5) * 0.2;
                const timeY = Math.cos(this.waterTime * 0.3) * 0.2;
                this.ocean.material.normalMap.offset.x = timeX;
                this.ocean.material.normalMap.offset.y = timeY;
            }
            
            if (this.waveRings) {
                this.waveRings.forEach((wave, index) => {
                    const waveTime = this.waterTime * 1.2 + wave.phase;
                    const y = wave.baseY + 
                        Math.sin(waveTime) * wave.amplitude * 0.7 +
                        Math.sin(waveTime * 1.3) * wave.amplitude * 0.3;
                    wave.mesh.position.y = y;
                    
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
        this.updateKarmaEffects(); // Continuously update darkness effects
        
        this.updatePlayer();
        this.updateCamera();
        this.renderer.render(this.scene, this.camera);
    }

    createUI() {
        // Create UI container for XP ring
        const uiContainer = document.createElement('div');
        uiContainer.style.position = 'fixed';
        uiContainer.style.bottom = '20px';
        uiContainer.style.left = '20px';
        uiContainer.style.display = 'flex';
        uiContainer.style.alignItems = 'center';
        uiContainer.style.gap = '10px';
        uiContainer.style.zIndex = '1000';

        // Create and add the skill bar container with Life and Mana rings
        const skillBarWrapper = document.createElement('div');
        skillBarWrapper.style.position = 'fixed';
        skillBarWrapper.style.bottom = '20px';
        skillBarWrapper.style.left = '50%';
        skillBarWrapper.style.transform = 'translateX(-50%)';
        skillBarWrapper.style.display = 'flex';
        skillBarWrapper.style.flexDirection = 'column';
        skillBarWrapper.style.alignItems = 'center';
        skillBarWrapper.style.gap = '2px';  // Reduced from 5px to make elements almost touching
        document.body.appendChild(skillBarWrapper);

        // Create Karma bar container
        const karmaContainer = document.createElement('div');
        karmaContainer.style.width = '300px'; // Match skills bar width
        const karmaBar = this.createModernStatusBar('Karma', '#ffcc00', '#665200');
        this.karmaBarFill = karmaBar.querySelector('.fill');
        this.karmaText = karmaBar.querySelector('.text');
        this.karmaTooltip = karmaBar.querySelector('.tooltip');
        karmaContainer.appendChild(karmaBar);

        // Create container for Life ring, skills, and Mana ring
        const gameplayContainer = document.createElement('div');
        gameplayContainer.style.display = 'flex';
        gameplayContainer.style.alignItems = 'center';
        gameplayContainer.style.gap = '30px';  // Increased from 20px for better spacing with larger rings

        // Create Life ring
        const lifeRing = this.createStatRing('#ff3333', '#660000', 'Life');
        this.lifeRingFill = lifeRing.querySelector('.fill');
        this.lifeTooltip = lifeRing.querySelector('.tooltip');

        // Create Mana ring
        const manaRing = this.createStatRing('#3333ff', '#000066', 'Mana');
        this.manaRingFill = manaRing.querySelector('.fill');
        this.manaTooltip = manaRing.querySelector('.tooltip');

        // Create skill bar
        const skillBarContainer = this.createSkillBar();

        // Assemble the gameplay container
        gameplayContainer.appendChild(lifeRing);
        gameplayContainer.appendChild(skillBarContainer);
        gameplayContainer.appendChild(manaRing);

        // Add to skill bar wrapper
        skillBarWrapper.appendChild(karmaContainer);
        skillBarWrapper.appendChild(gameplayContainer);

        // Create circular icon with XP ring (keep existing code)
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
        xpTooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
        xpTooltip.style.color = '#ffffff';
        xpTooltip.style.padding = '8px 12px';
        xpTooltip.style.borderRadius = '6px';
        xpTooltip.style.fontSize = '12px';
        xpTooltip.style.fontWeight = '500';
        xpTooltip.style.whiteSpace = 'nowrap';
        xpTooltip.style.display = 'none';
        xpTooltip.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        xpTooltip.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
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
        });
        
        iconContainer.addEventListener('mouseleave', () => {
            xpTooltip.style.display = 'none';
        });

        uiContainer.appendChild(iconContainer);

        // Add to document
        document.body.appendChild(uiContainer);
        this.updateStatusBars();
    }

    createSkillBar() {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.gap = '4px';
        container.style.padding = '4px';
        container.style.background = 'linear-gradient(to bottom, #2a2a2a, #1a1a1a)';
        container.style.border = '2px solid #3a3a3a';
        container.style.borderRadius = '6px';
        container.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
        container.style.zIndex = '1000';

        // Create 5 skill slots
        for (let i = 1; i <= 5; i++) {
            const slot = document.createElement('div');
            slot.style.width = '50px';
            slot.style.height = '50px';
            slot.style.background = 'linear-gradient(135deg, #252525 0%, #1a1a1a 100%)';
            slot.style.border = '1px solid #333';
            slot.style.borderRadius = '4px';
            slot.style.position = 'relative';
            slot.style.boxShadow = 'inset 0 0 10px rgba(0, 0, 0, 0.5)';

            // Add key number
            const keyNumber = document.createElement('div');
            keyNumber.textContent = i;
            keyNumber.style.position = 'absolute';
            keyNumber.style.bottom = '2px';
            keyNumber.style.right = '2px';
            keyNumber.style.color = '#666';
            keyNumber.style.fontSize = '12px';
            keyNumber.style.fontWeight = 'bold';
            keyNumber.style.textShadow = '1px 1px 1px rgba(0, 0, 0, 0.5)';
            keyNumber.style.userSelect = 'none';

            slot.appendChild(keyNumber);
            container.appendChild(slot);
        }

        return container;
    }

    createModernStatusBar(label, color, shadowColor) {
        const container = document.createElement('div');
        container.style.width = '100%';
        container.style.position = 'relative';
        container.style.height = '26px';

        // Bar background
        const barContainer = document.createElement('div');
        barContainer.style.position = 'absolute';
        barContainer.style.left = '0';
        barContainer.style.right = '0';
        barContainer.style.top = '0';
        barContainer.style.bottom = '0';
        barContainer.style.background = 'linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.4))';
        barContainer.style.borderRadius = '5px';
        barContainer.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        barContainer.style.overflow = 'hidden';

        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.bottom = '120%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
        tooltip.style.color = '#ffffff';
        tooltip.style.padding = '8px 12px';
        tooltip.style.borderRadius = '6px';
        tooltip.style.fontSize = '12px';
        tooltip.style.fontWeight = '500';
        tooltip.style.whiteSpace = 'nowrap';
        tooltip.style.display = 'none';
        tooltip.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        tooltip.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        tooltip.style.backdropFilter = 'blur(4px)';
        tooltip.style.zIndex = '1000';

        // Fill bar with gradient and glow
        const fill = document.createElement('div');
        fill.className = 'fill';
        fill.style.width = '100%';
        fill.style.height = '100%';
        fill.style.background = `linear-gradient(to bottom, ${color}, ${shadowColor})`;
        fill.style.boxShadow = `0 0 10px ${color}, inset 0 0 5px rgba(255,255,255,0.5)`;
        fill.style.transition = 'width 0.3s ease';

        // Text container
        const textContainer = document.createElement('div');
        textContainer.style.position = 'absolute';
        textContainer.style.left = '0';
        textContainer.style.right = '0';
        textContainer.style.top = '0';
        textContainer.style.bottom = '0';
        textContainer.style.padding = '0 10px';
        textContainer.style.display = 'flex';
        textContainer.style.alignItems = 'center';
        textContainer.style.justifyContent = 'center';
        textContainer.style.color = 'white';
        textContainer.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.8)';
        textContainer.style.fontSize = '12px';
        textContainer.style.fontWeight = 'bold';

        // Label
        const labelElement = document.createElement('span');
        labelElement.textContent = label;

        textContainer.appendChild(labelElement);
        barContainer.appendChild(fill);
        container.appendChild(barContainer);
        container.appendChild(textContainer);
        container.appendChild(tooltip);

        // Add hover effects for tooltip
        container.addEventListener('mouseenter', () => {
            tooltip.style.display = 'block';
        });
        
        container.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });

        return container;
    }

    updateStatusBars() {
        // Update life ring
        const lifePercent = (this.playerStats.currentLife / this.playerStats.maxLife) * 100;
        this.lifeRingFill.style.height = `${lifePercent}%`;
        this.lifeTooltip.textContent = `Life: ${Math.round(this.playerStats.currentLife)} / ${this.playerStats.maxLife}`;

        // Update mana ring
        const manaPercent = (this.playerStats.currentMana / this.playerStats.maxMana) * 100;
        this.manaRingFill.style.height = `${manaPercent}%`;
        this.manaTooltip.textContent = `Mana: ${Math.round(this.playerStats.currentMana)} / ${this.playerStats.maxMana}`;

        // Update karma bar
        const karmaPercent = (this.playerStats.currentKarma / this.playerStats.maxKarma) * 100;
        this.karmaBarFill.style.width = `${karmaPercent}%`;
        this.karmaBarFill.style.boxShadow = `0 0 ${10 + (karmaPercent/10)}px #ffcc00`;
        if (this.karmaTooltip) {
            this.karmaTooltip.textContent = `Karma: ${Math.round(this.playerStats.currentKarma)} / ${this.playerStats.maxKarma}`;
        }
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
        const previousKarma = this.playerStats.currentKarma;
        this.playerStats.currentKarma = Math.max(0, Math.min(this.playerStats.maxKarma, this.playerStats.currentKarma + amount));
        
        console.log(`Local karma changed from ${previousKarma} to ${this.playerStats.currentKarma}`);
        
        // Update local display immediately
        this.updateStatusBars();
        this.updateKarmaEffects();
        
        // Emit karma update with volatile flag for faster transmission
        if (this.socket && this.localPlayer) {
            const updateData = {
                id: this.socket.id,
                position: this.localPlayer.position,
                rotation: this.localPlayer.rotation,
                karma: this.playerStats.currentKarma,
                maxKarma: this.playerStats.maxKarma,
                life: this.playerStats.currentLife,
                maxLife: this.playerStats.maxLife,
                mana: this.playerStats.currentMana,
                maxMana: this.playerStats.maxMana
            };

            // Emit karma update with high priority
            this.socket.emit('karmaUpdate', updateData);
            
            // Also emit regular movement update
            this.socket.emit('playerMovement', updateData);
            
            console.log('Emitted karma update:', this.playerStats.currentKarma);
        }
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

    createStatRing(color, shadowColor, statName) {
        const ringContainer = document.createElement('div');
        ringContainer.style.width = '96px';  // Increased from 60px to match XP ring
        ringContainer.style.height = '96px';  // Increased from 60px to match XP ring
        ringContainer.style.position = 'relative';
        ringContainer.style.borderRadius = '50%';
        ringContainer.style.background = 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)';
        ringContainer.style.border = '2px solid rgba(255, 255, 255, 0.15)';
        ringContainer.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';

        // Create fill element
        const fill = document.createElement('div');
        fill.className = 'fill';
        fill.style.position = 'absolute';
        fill.style.bottom = '0';
        fill.style.left = '0';
        fill.style.width = '100%';
        fill.style.height = '100%';
        fill.style.background = color;
        fill.style.transition = 'height 0.3s ease-out';
        fill.style.borderRadius = '50%';
        fill.style.opacity = '0.8';

        // Create ring container with mask
        const maskContainer = document.createElement('div');
        maskContainer.style.position = 'absolute';
        maskContainer.style.inset = '2px';
        maskContainer.style.borderRadius = '50%';
        maskContainer.style.overflow = 'hidden';
        maskContainer.appendChild(fill);

        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.bottom = '120%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
        tooltip.style.color = '#ffffff';
        tooltip.style.padding = '8px 12px';
        tooltip.style.borderRadius = '6px';
        tooltip.style.fontSize = '12px';
        tooltip.style.fontWeight = '500';
        tooltip.style.whiteSpace = 'nowrap';
        tooltip.style.display = 'none';
        tooltip.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        tooltip.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        tooltip.style.backdropFilter = 'blur(4px)';
        tooltip.style.zIndex = '1000';

        // Add hover effects
        ringContainer.addEventListener('mouseenter', () => {
            tooltip.style.display = 'block';
        });
        
        ringContainer.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });

        ringContainer.appendChild(maskContainer);
        ringContainer.appendChild(tooltip);
        return ringContainer;
    }

    createDarknessOverlay() {
        // Create a full-screen overlay for darkness and vignette effects
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0)';
        overlay.style.pointerEvents = 'none';
        overlay.style.transition = 'none'; // Remove transition for smooth player following
        overlay.style.zIndex = '999';
        
        document.body.appendChild(overlay);
        this.darknessOverlay = overlay;
    }

    updateKarmaEffects() {
        const karmaPercent = this.playerStats.currentKarma / this.playerStats.maxKarma;
        const karma = this.playerStats.currentKarma;
        
        // Calculate darkness multiplier based on karma zones with reduced maximum darkness
        let darknessMultiplier;
        if (karma === 50) {
            darknessMultiplier = 0.5;
        } else if (karma > 50) {
            // Scale the darkness to reach previous karma 80 levels at maximum
            const maxKarmaDarkness = 0.5 + ((80 - 50) / 50) * 0.5; // Previous darkness at karma 80
            darknessMultiplier = 0.5 + ((karma - 50) / 50) * (maxKarmaDarkness - 0.5);
        } else {
            darknessMultiplier = 0.5 - ((50 - karma) / 50) * 0.3;
        }

        // Update fog density based on karma zones
        const minFogDistance = 10;
        const maxFogDistance = 400;
        const fogNear = maxFogDistance - (darknessMultiplier * (maxFogDistance - minFogDistance));
        const fogFar = fogNear + (200 - (darknessMultiplier * 180));
        
        if (this.scene.fog) {
            this.scene.fog.near = fogNear;
            this.scene.fog.far = fogFar;
            const fogColor = new THREE.Color(0x004488);
            fogColor.multiplyScalar(1 - (darknessMultiplier * 0.9));
            this.scene.fog.color = fogColor;
            this.renderer.setClearColor(fogColor);
        }

        // Only proceed if we have a local player
        if (!this.localPlayer) return;

        // Convert player's 3D position to screen coordinates
        const vector = this.localPlayer.position.clone();
        vector.project(this.camera);

        // Convert to screen coordinates
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;

        // Calculate visible area size based on karma with adjusted scaling
        let visibleRadius;
        if (karma === 50) {
            visibleRadius = 40; // Base visibility at 50 karma
        } else if (karma > 50) {
            // Scale the radius reduction to match previous karma 80 levels
            const minRadius = 40 - ((80 - 50) / 50) * 20; // Previous radius at karma 80
            const reductionRange = 40 - minRadius;
            visibleRadius = 40 - ((karma - 50) / 50) * reductionRange;
        } else {
            visibleRadius = 40 + ((50 - karma) / 50) * 20;
        }

        // Calculate darkness intensity with reduced maximum
        const darkness = Math.min(0.8, darknessMultiplier * 1.2); // Reduced from 0.95 to 0.8
        
        // Create radial gradient centered on player
        this.darknessOverlay.style.background = `
            radial-gradient(
                circle ${visibleRadius}vmin at ${x}px ${y}px,
                rgba(0,0,0,0) 0%,
                rgba(0,0,0,${darkness * 0.3}) 50%,
                rgba(0,0,0,${darkness}) 100%
            )
        `;

        // Add pulsing effect for high karma (adjusted threshold)
        if (karma > 70) {
            const pulseIntensity = (karma - 70) / 30 * 0.8; // Reduced intensity by 20%
            this.darknessOverlay.style.animation = `karmaPulse ${2 - pulseIntensity}s infinite`;
            if (!document.getElementById('karmaPulseStyle')) {
                const style = document.createElement('style');
                style.id = 'karmaPulseStyle';
                style.textContent = `
                    @keyframes karmaPulse {
                        0% { opacity: 1; }
                        50% { opacity: ${1 - pulseIntensity * 0.2}; }
                        100% { opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }
        } else {
            this.darknessOverlay.style.animation = 'none';
        }

        // Update light intensity based on karma zones with reduced maximum darkness
        const minLightIntensity = 0.2; // Increased from 0.1
        const maxLightIntensity = 0.8;
        const lightIntensity = maxLightIntensity - (darknessMultiplier * (maxLightIntensity - minLightIntensity));
        
        this.scene.traverse((object) => {
            if (object instanceof THREE.AmbientLight) {
                object.intensity = lightIntensity;
            }
            if (object instanceof THREE.DirectionalLight) {
                object.intensity = Math.max(0.4, 1.2 - (darknessMultiplier * 0.8)); // Reduced darkness impact
            }
            if (object instanceof THREE.HemisphereLight) {
                object.intensity = Math.max(0.3, 0.6 - (darknessMultiplier * 0.3)); // Reduced darkness impact
            }
        });
    }

    createTemple() {
        const templeGroup = new THREE.Group();
        
        // Create a custom temple floor texture pattern
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 512;
        
        // Fill background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Create tile pattern
        const tileSize = 64;
        const tiles = canvas.width / tileSize;
        
        for (let i = 0; i < tiles; i++) {
            for (let j = 0; j < tiles; j++) {
                // Alternate tile colors for a checkered pattern
                const isEven = (i + j) % 2 === 0;
                ctx.fillStyle = isEven ? '#2a2a2a' : '#222222';
                
                // Draw main tile
                ctx.fillRect(
                    i * tileSize,
                    j * tileSize,
                    tileSize,
                    tileSize
                );
                
                // Add detail to tiles
                ctx.strokeStyle = '#333333';
                ctx.lineWidth = 2;
                ctx.strokeRect(
                    i * tileSize + 2,
                    j * tileSize + 2,
                    tileSize - 4,
                    tileSize - 4
                );
            }
        }
        
        // Create texture from canvas
        const floorTexture = new THREE.CanvasTexture(canvas);
        floorTexture.wrapS = THREE.RepeatWrapping;
        floorTexture.wrapT = THREE.RepeatWrapping;
        floorTexture.repeat.set(4, 4); // Repeat the pattern
        
        // Create floor material with the custom texture
        const floorMaterial = new THREE.MeshPhongMaterial({
            map: floorTexture,
            color: 0x666666,
            shininess: 30,
            bumpMap: floorTexture,
            bumpScale: 0.2,
        });

        // Create larger base platform (increased from 20 to 30)
        const baseGeometry = new THREE.BoxGeometry(30, 1, 30);
        const basePlatform = new THREE.Mesh(baseGeometry, floorMaterial);
        basePlatform.position.y = 0.5;
        basePlatform.receiveShadow = true;
        templeGroup.add(basePlatform);

        // Add corner statues
        const statuePositions = [
            { x: 13, z: 13 },  // Northeast
            { x: -13, z: 13 }, // Northwest
            { x: 13, z: -13 }, // Southeast
            { x: -13, z: -13 } // Southwest
        ];

        // Create statue material
        const statueMaterial = new THREE.MeshPhongMaterial({
            color: 0x808080, // Gray color for stone
            shininess: 10,
            roughness: 0.8,
        });

        this.statueColliders = [];

        statuePositions.forEach((pos, index) => {
            // Create statue base
            const baseHeight = 3;
            const baseWidth = 2;
            const statueBase = new THREE.Mesh(
                new THREE.BoxGeometry(baseWidth, baseHeight, baseWidth),
                statueMaterial
            );
            statueBase.position.set(pos.x, baseHeight/2 + 0.5, pos.z);
            statueBase.castShadow = true;
            statueBase.receiveShadow = true;

            // Create statue body
            const bodyHeight = 4;
            const bodyWidth = 1.5;
            const statueBody = new THREE.Mesh(
                new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyWidth),
                statueMaterial
            );
            statueBody.position.set(pos.x, baseHeight + bodyHeight/2 + 0.5, pos.z);
            statueBody.castShadow = true;
            statueBody.receiveShadow = true;

            // Create statue head
            const headSize = 1;
            const statueHead = new THREE.Mesh(
                new THREE.BoxGeometry(headSize, headSize, headSize),
                statueMaterial
            );
            statueHead.position.set(pos.x, baseHeight + bodyHeight + headSize/2 + 0.5, pos.z);
            statueHead.castShadow = true;
            statueHead.receiveShadow = true;

            // Add to temple group
            templeGroup.add(statueBase);
            templeGroup.add(statueBody);
            templeGroup.add(statueHead);

            // Create collider for the statue
            this.statueColliders.push({
                position: new THREE.Vector3(pos.x, 0, pos.z),
                radius: baseWidth / 1.5 // Slightly smaller than the actual base for better gameplay
            });
        });

        // Create larger cross-shaped upper platform
        const floorGroup = new THREE.Group();
        
        // Vertical part of cross (increased from 6x16 to 8x24)
        const verticalGeometry = new THREE.BoxGeometry(8, 0.5, 24);
        const verticalFloor = new THREE.Mesh(verticalGeometry, floorMaterial);
        verticalFloor.position.y = 0.75;
        verticalFloor.receiveShadow = true;
        floorGroup.add(verticalFloor);
        
        // Horizontal part of cross (increased from 16x6 to 24x8)
        const horizontalGeometry = new THREE.BoxGeometry(24, 0.5, 8);
        const horizontalFloor = new THREE.Mesh(horizontalGeometry, floorMaterial);
        horizontalFloor.position.y = 0.75;
        horizontalFloor.receiveShadow = true;
        floorGroup.add(horizontalFloor);
        
        templeGroup.add(floorGroup);

        // Add stronger ambient temple light
        const templeLight = new THREE.PointLight(0xffd700, 0.8, 30);
        templeLight.position.set(0, 4, 0);
        templeGroup.add(templeLight);

        // Position the entire temple at the center of the map
        templeGroup.position.set(0, 0, 0);
        this.scene.add(templeGroup);
        
        // Store temple reference
        this.temple = templeGroup;
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
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
}); // End of load event listener