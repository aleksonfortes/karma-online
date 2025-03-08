// Import protection measures
import './protection';

// Rest of the imports
import * as THREE from 'three';
import { io } from 'socket.io-client';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';

// Wrap the entire game in an IIFE to prevent global scope access
(() => {
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
            
            // Add skills system
            this.skills = {
                martial_arts: {
                    name: 'Martial Arts',
                    key: 'Space',
                    slot: 1, // Changed from 5 to 1
                    damage: 75, // Increased from 15 to 75 (5x) for testing
                    range: 3,
                    cooldown: 2000, // 2 seconds
                    lastUsed: 0,
                    icon: '🥋' // Changed to a defensive martial arts icon
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
                experienceToNextLevel: 100,
                path: null  // 'light' or 'dark' or null
            };

            // Add darkness overlay for karma system
            this.createDarknessOverlay();
            
            // Add shared geometries and materials
            this.sharedGeometries = {
                barGeometry: new THREE.PlaneGeometry(1, 0.1),
                playerBase: new THREE.CylinderGeometry(0.3, 0.3, 1.5, 32),
                playerHead: new THREE.SphereGeometry(0.3, 32, 32)
            };
            
            this.sharedMaterials = {
                backgroundBar: new THREE.MeshBasicMaterial({
                    color: 0x333333,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.7
                }),
                playerBody: new THREE.MeshPhongMaterial({ 
                    color: 0xff0000,
                    shininess: 0
                })
            };
            
            // Initialize the game
            this.createUI();
            this.init();
            this.setupEventListeners();
            this.setupMultiplayer();
            this.animate();
            
            this.isAlive = true; // Add this new property
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
            // Check terrain boundaries first (water/edge collision)
            const terrainSize = this.terrain.size;
            const halfTerrainSize = (terrainSize / 2) - 1;
            
            // Strict boundary check for water
            if (Math.abs(position.x) > halfTerrainSize - 1 || Math.abs(position.z) > halfTerrainSize - 1) {
                if (previousPosition) {
                    position.x = previousPosition.x;
                    position.z = previousPosition.z;
                }
                return true;
            }
            
            // Check statue and NPC collisions with larger buffer
            if (this.statueColliders) {
                for (const collider of this.statueColliders) {
                    const dx = position.x - collider.position.x;
                    const dz = position.z - collider.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    
                    // Increased buffer from 0.1 to 1.0 for more noticeable collisions
                    if (distance < collider.radius + 1.0) {
                        if (previousPosition) {
                            // Push player away from the collision point
                            const angle = Math.atan2(dz, dx);
                            const pushDistance = (collider.radius + 1.0) - distance;
                            position.x = collider.position.x + (Math.cos(angle) * (collider.radius + 1.0));
                            position.z = collider.position.z + (Math.sin(angle) * (collider.radius + 1.0));
                        }
                        return true;
                    }
                }
            }
            
            // Check collisions with other players
            if (this.players) {
                const playerRadius = 1.0; // Radius for player collision
                const spawnRadius = 3.0; // Radius around temple center where collisions are more lenient
                const isInSpawnArea = Math.abs(position.x) < spawnRadius && Math.abs(position.z) < spawnRadius;
                
                // Check collision with other players
                for (const [id, otherPlayer] of this.players) {
                    // Skip self-collision check
                    if (this.localPlayer && otherPlayer === this.localPlayer) continue;
                    
                    const dx = position.x - otherPlayer.position.x;
                    const dz = position.z - otherPlayer.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    
                    // If in spawn area, allow more movement to prevent getting stuck
                    if (isInSpawnArea) {
                        // Only collide if extremely close and moving closer
                        if (distance < playerRadius && previousPosition) {
                            const prevDx = previousPosition.x - otherPlayer.position.x;
                            const prevDz = previousPosition.z - otherPlayer.position.z;
                            const prevDistance = Math.sqrt(prevDx * prevDx + prevDz * prevDz);
                            
                            // If moving away from other player, allow movement
                            if (distance >= prevDistance) {
                                continue;
                            }
                        } else {
                            continue;
                        }
                    } else if (distance < playerRadius * 2) { // Normal collision outside spawn area
                        if (previousPosition) {
                            // Push players apart
                            const angle = Math.atan2(dz, dx);
                            position.x = otherPlayer.position.x + (Math.cos(angle) * playerRadius * 2);
                            position.z = otherPlayer.position.z + (Math.sin(angle) * playerRadius * 2);
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
                playerModel.position.set(0, 3, 0); // Start at temple height
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
            statusGroup.position.y = 2.0; // Reduced from 2.5 to 2.0 for closer positioning
            
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
                
                // Set background color for karma bar to white
                if (type === 'karma') {
                    background.material.color = new THREE.Color(0xffffff);
                }
                
                // Position bars vertically stacked with smaller spacing
                const yOffset = 2.5 + (barHeight + barSpacing) * (2 - index);
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

        updatePlayerStatus(playerMesh, stats, silent = false) {
            if (!playerMesh.userData.statusBars || !playerMesh.userData.statusGroup) {
                if (!silent) {
                    console.warn('⚠️ Status bars not initialized for player');
                }
                // Create status bars if they don't exist
                const statusGroup = new THREE.Group();
                
                const bars = ['life', 'mana', 'karma'].map((type, index) => {
                    // Use shared geometry and material
                    const background = new THREE.Mesh(
                        this.sharedGeometries.barGeometry,
                        this.sharedMaterials.backgroundBar.clone()
                    );
                    const fillMaterial = new THREE.MeshBasicMaterial({
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.9
                    });
                    const fill = new THREE.Mesh(this.sharedGeometries.barGeometry, fillMaterial);
                    
                    const yOffset = 2.5 + (0.1 + 0.05) * (2 - index);
                    background.position.y = yOffset;
                    fill.position.y = yOffset;
                    fill.position.z = 0.001;
                    
                    statusGroup.add(background);
                    statusGroup.add(fill);
                    
                    return { background, fill, width: 1, type };
                });
                
                playerMesh.userData.statusBars = bars;
                playerMesh.userData.statusGroup = statusGroup;
                this.scene.add(statusGroup);
            }

            // Get the player's world position
            const statusGroup = playerMesh.userData.statusGroup;
            const worldPosition = new THREE.Vector3();
            playerMesh.getWorldPosition(worldPosition);
            
            // Position status group above player's head and ensure it's visible
            statusGroup.position.set(worldPosition.x, worldPosition.y + 3.0, worldPosition.z);
            statusGroup.visible = true;
            
            // Ensure status group is always facing the camera
            if (this.camera) {
                statusGroup.quaternion.copy(this.camera.quaternion);
            }

            // Store the stats in the player's userData
            const oldStats = playerMesh.userData.stats ? { ...playerMesh.userData.stats } : null;
            playerMesh.userData.stats = { ...stats };  // Create a copy to prevent reference issues

            // Only log significant changes to life/mana values
            if (!silent && oldStats && (
                Math.abs(oldStats.life - stats.life) > 0.1 || 
                Math.abs(oldStats.mana - stats.mana) > 0.1
            )) {
                console.log('📊 Player Stats Changed:', {
                    playerId: playerMesh === this.localPlayer ? 'localPlayer' : 'otherPlayer',
                    life: {
                        old: Math.round(oldStats.life),
                        new: Math.round(stats.life),
                        max: stats.maxLife
                    },
                    mana: {
                        old: Math.round(oldStats.mana),
                        new: Math.round(stats.mana),
                        max: stats.maxMana
                    }
                });
            }

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
                        color = new THREE.Color(0x000000);
                        break;
                }

                // Update fill amount and color
                fill.scale.x = Math.max(0, Math.min(1, fillAmount));
                fill.position.x = -(width * (1 - fillAmount)) / 2;
                fill.material.color = color;
            });

            // Ensure proper rendering order
            statusGroup.renderOrder = 999;
            statusGroup.children.forEach(child => {
                child.renderOrder = 999;
            });
        }

        createBasicCharacter() {
            const playerGroup = new THREE.Group();
            
            // Use shared geometries and materials
            const body = new THREE.Mesh(this.sharedGeometries.playerBase, this.sharedMaterials.playerBody);
            body.castShadow = true;
            body.receiveShadow = true;
            playerGroup.add(body);

            const head = new THREE.Mesh(this.sharedGeometries.playerHead, this.sharedMaterials.playerBody);
            head.position.y = 1.5;
            head.castShadow = true;
            head.receiveShadow = true;
            playerGroup.add(head);

            return playerGroup;
        }

        setupMultiplayer() {
            console.log('Connecting to server...');
            
            this.socket = io(SERVER_URL, {
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                autoConnect: true,
                forceNew: true
            });

            this.socket.on('connect', () => {
                console.log('Connected to server with ID:', this.socket.id);
                this.socket.emit('requestStateUpdate');
            });

            // Add skill effect handler
            this.socket.on('skillEffect', (data) => {
                const targetMesh = this.players.get(data.targetId);
                if (!targetMesh) {
                    console.warn('🎯 Skill Effect: Target not found', {
                        targetId: data.targetId,
                        type: data.type
                    });
                    return;
                }

                if (data.type === 'damage') {
                    console.log('⚔️ Damage Effect:', {
                        targetId: data.targetId,
                        damage: data.damage,
                        oldLife: targetMesh.userData.stats?.life,
                        isLocalPlayer: data.targetId === this.socket.id
                    });

                    // Find the character model's material (it's a child of the player mesh)
                    let characterMaterial;
                    targetMesh.traverse((child) => {
                        if (child.isMesh && child.material) {
                            characterMaterial = child.material;
                        }
                    });

                    if (!characterMaterial) {
                        console.warn('Character material not found for damage effect');
                        return;
                    }
                    
                    // Create damage number with unique ID
                    const damageId = `damage-${Date.now()}-${Math.random()}`;
                    const damageText = document.createElement('div');
                    damageText.id = damageId;
                    damageText.textContent = data.isCritical ? `${data.damage}!` : data.damage;
                    damageText.style.position = 'fixed';
                    damageText.style.color = data.isCritical ? '#ff0000' : '#ffffff';
                    damageText.style.fontSize = data.isCritical ? '24px' : '20px';
                    damageText.style.fontWeight = 'bold';
                    damageText.style.textShadow = '2px 2px 2px rgba(0,0,0,0.5)';
                    damageText.style.pointerEvents = 'none';
                    damageText.style.zIndex = '1000';
                    document.body.appendChild(damageText);

                    // Get screen position for damage number
                    const updatePosition = () => {
                        const vector = new THREE.Vector3();
                        vector.setFromMatrixPosition(targetMesh.matrixWorld);
                        vector.y += 2;

                        const widthHalf = window.innerWidth / 2;
                        const heightHalf = window.innerHeight / 2;
                        vector.project(this.camera);

                        const x = (vector.x * widthHalf) + widthHalf;
                        const y = -(vector.y * heightHalf) + heightHalf;

                        damageText.style.left = `${x}px`;
                        damageText.style.top = `${y}px`;
                    };

                    // Initial position
                    updatePosition();

                    // Store original color and flash the target red
                    const originalColor = characterMaterial.color.clone();
                    characterMaterial.color.setHex(0xff0000);

                    // Animate damage number
                    const startTime = performance.now();
                    const animate = (currentTime) => {
                        const elapsed = currentTime - startTime;
                        const duration = 1000; // 1 second animation
                        
                        if (elapsed < duration) {
                            const progress = elapsed / duration;
                            damageText.style.opacity = 1 - progress;
                            damageText.style.transform = `translateY(${-50 * progress}px)`;
                            updatePosition(); // Update position each frame
                            requestAnimationFrame(animate);
                        } else {
                            // Ensure the element is removed
                            const element = document.getElementById(damageId);
                            if (element) {
                                element.remove();
                            }
                        }
                    };
                    requestAnimationFrame(animate);

                    // Reset target color after 200ms
                    setTimeout(() => {
                        characterMaterial.color.copy(originalColor);
                    }, 200);

                    // Backup cleanup after 2 seconds in case animation fails
                    setTimeout(() => {
                        const element = document.getElementById(damageId);
                        if (element) {
                            element.remove();
                        }
                    }, 2000);
                } else if (data.type === 'immune') {
                    // Create immunity text
                    const immuneText = document.createElement('div');
                    immuneText.className = 'immune-text';
                    immuneText.style.position = 'absolute';
                    immuneText.style.fontFamily = 'Arial, sans-serif';
                    immuneText.style.fontWeight = 'bold';
                    immuneText.style.fontSize = '20px';
                    immuneText.style.color = data.reason === 'illuminated' ? '#ffff00' : '#800080';
                    immuneText.style.textShadow = '2px 2px 2px rgba(0,0,0,0.5)';
                    immuneText.style.pointerEvents = 'none';
                    immuneText.textContent = data.reason === 'illuminated' ? 'IMMUNE ✨' : 'IMMUNE 🌑';

                    document.body.appendChild(immuneText);

                    // Convert 3D position to screen coordinates
                    const position = new THREE.Vector3();
                    targetMesh.getWorldPosition(position);
                    position.y += 2;

                    const screenPosition = position.clone();
                    screenPosition.project(this.camera);

                    const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
                    const y = (-screenPosition.y * 0.5 + 0.5) * window.innerHeight;

                    immuneText.style.left = x + 'px';
                    immuneText.style.top = y + 'px';

                    // Store the original material color
                    const originalColor = targetMesh.material ? targetMesh.material.color.clone() : new THREE.Color(0xffffff);
                    
                    // Flash the target with immunity effect
                    if (targetMesh.material) {
                        targetMesh.material.color.setHex(data.reason === 'illuminated' ? 0xffff00 : 0x800080);
                        if (targetMesh.material.emissive) {
                            targetMesh.material.emissive.setHex(data.reason === 'illuminated' ? 0x666600 : 0x400040);
                        }
                    }

                    // Animate immunity text
                    let startTime = performance.now();
                    const animate = (currentTime) => {
                        const elapsed = currentTime - startTime;
                        const duration = 1500; // 1.5 second animation
                        
                        if (elapsed < duration) {
                            const progress = elapsed / duration;
                            immuneText.style.opacity = 1 - progress;
                            immuneText.style.transform = `translateY(${-50 * progress}px)`;
                            requestAnimationFrame(animate);
                        } else {
                            document.body.removeChild(immuneText);
                        }
                    };
                    requestAnimationFrame(animate);

                    // Reset target material after 300ms
                    setTimeout(() => {
                        if (targetMesh.material) {
                            targetMesh.material.color.copy(originalColor);
                            if (targetMesh.material.emissive) {
                                targetMesh.material.emissive.setHex(0x000000);
                            }
                        }
                    }, 300);
                }
            });

            // Add new handler for life and mana updates
            this.socket.on('statsUpdate', (data) => {
                console.log('Received statsUpdate:', data);
                const playerMesh = this.players.get(data.id);
                if (!playerMesh) {
                    console.log('Player mesh not found for stats update:', data.id);
                    return;
                }

                // Update the player's stats
                if (!playerMesh.userData.stats) {
                    playerMesh.userData.stats = {};
                }

                const oldStats = { ...playerMesh.userData.stats };
                playerMesh.userData.stats = {
                    ...playerMesh.userData.stats,
                    life: data.life,
                    maxLife: data.maxLife,
                    mana: data.mana,
                    maxMana: data.maxMana
                };

                console.log('Updated player stats:', {
                    playerId: data.id,
                    oldLife: oldStats.life,
                    newLife: data.life,
                    oldMana: oldStats.mana,
                    newMana: data.mana
                });

                // Update the visual status bars
                this.updatePlayerStatus(playerMesh, playerMesh.userData.stats);

                // If this is our player, update the main UI
                if (data.id === this.socket.id) {
                    this.playerStats.currentLife = data.life;
                    this.playerStats.maxLife = data.maxLife;
                    this.playerStats.currentMana = data.mana;
                    this.playerStats.maxMana = data.maxMana;
                    this.updateStatusBars();
                }
            });

            // Add life update handler
            this.socket.on('lifeUpdate', (data) => {
                const playerMesh = this.players.get(data.id);
                if (!playerMesh) {
                    console.log('Player mesh not found for life update:', data.id);
                    return;
                }

                // Update stored life stats
                if (!playerMesh.userData.stats) {
                    playerMesh.userData.stats = {};
                }
                
                const oldLife = playerMesh.userData.stats.life;
                playerMesh.userData.stats.life = data.life;
                playerMesh.userData.stats.maxLife = data.maxLife;
                
                // Update visual status bars
                this.updatePlayerStatus(playerMesh, playerMesh.userData.stats);

                // If this is our player, update the main UI and check for death
                if (data.id === this.socket.id) {
                    const previousLife = this.playerStats.currentLife;
                    this.playerStats.currentLife = data.life;
                    this.playerStats.maxLife = data.maxLife;
                    this.updateStatusBars();
                    
                    // Check for death
                    if (this.playerStats.currentLife === 0 && previousLife > 0) {
                        this.handlePlayerDeath();
                    }
                    
                    console.log('🛡️ Life Updated:', {
                        oldLife: previousLife,
                        newLife: this.playerStats.currentLife,
                        maxLife: this.playerStats.maxLife,
                        died: this.playerStats.currentLife === 0
                    });
                }
            });

            // Add mana update handler
            this.socket.on('manaUpdate', (data) => {
                const playerMesh = this.players.get(data.id);
                if (!playerMesh) {
                    console.log('Player mesh not found for mana update:', data.id);
                    return;
                }

                // Update stored mana stats
                if (!playerMesh.userData.stats) {
                    playerMesh.userData.stats = {};
                }
                
                playerMesh.userData.stats.mana = data.mana;
                playerMesh.userData.stats.maxMana = data.maxMana;
                
                // Update visual status bars
                this.updatePlayerStatus(playerMesh, playerMesh.userData.stats);

                // If this is our player, update the main UI
                if (data.id === this.socket.id) {
                    this.playerStats.currentMana = data.mana;
                    this.playerStats.maxMana = data.maxMana;
                    this.updateStatusBars();
                }
            });

            // Update karma handler to only handle karma
            this.socket.on('karmaUpdate', (data) => {
                const playerMesh = this.players.get(data.id);
                if (!playerMesh) {
                    console.log('Player mesh not found for karma update:', data.id);
                    return;
                }

                // Update stored karma stats
                if (!playerMesh.userData.stats) {
                    playerMesh.userData.stats = {};
                }
                
                playerMesh.userData.stats.karma = data.karma;
                playerMesh.userData.stats.maxKarma = data.maxKarma;
                
                // Update visual status bars
                this.updatePlayerStatus(playerMesh, playerMesh.userData.stats);

                // If this is our player, update the main UI and effects
                if (data.id === this.socket.id) {
                    this.playerStats.currentKarma = data.karma;
                    this.playerStats.maxKarma = data.maxKarma;
                    this.updateStatusBars();
                    this.updateKarmaEffects();
                }
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
                    if (player.id === this.socket?.id) {
                        // Create local player if it doesn't exist
                        if (!this.localPlayer) {
                            this.localPlayer = await this.createPlayer(
                                player.id,
                                player.position,
                                { y: player.rotation.y || 0 }
                            );
                            this.scene.add(this.localPlayer);
                            
                            // Add local player to players Map
                            this.players.set(player.id, this.localPlayer);
                            
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
                        
                        console.log(`Added player ${player.id} with status bars:`, stats);
                    }
                }
                
                // Send our initial state to all players
                if (this.localPlayer) {
                    this.sendPlayerState();
                    // Also send initial karma update
                    this.socket.emit('karmaUpdate', {
                        id: this.socket.id,
                        karma: this.playerStats.currentKarma,
                        maxKarma: this.playerStats.maxKarma,
                        life: this.playerStats.currentLife,
                        maxLife: this.playerStats.maxLife,
                        mana: this.playerStats.currentMana,
                        maxMana: this.playerStats.maxMana
                    });
                }
            });

            this.socket.on('newPlayer', async (player) => {
                if (player.id === this.socket.id) {
                    // If this is us, make sure we're in the players Map
                    if (!this.players.has(player.id) && this.localPlayer) {
                        this.players.set(player.id, this.localPlayer);
                    }
                    return;
                }
                
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
                    if (!playerMesh.userData.stats) {
                        playerMesh.userData.stats = {};
                    }
                    
                    const stats = {
                        ...playerMesh.userData.stats,
                        life: player.life,
                        maxLife: player.maxLife,
                        mana: player.mana,
                        maxMana: player.maxMana,
                        karma: player.karma,
                        maxKarma: player.maxKarma
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
        }

        sendPlayerState() {
            if (!this.localPlayer || !this.socket?.connected) return;

            const playerState = {
                id: this.socket.id,
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
            
            // Dispose of shared resources
            Object.values(this.sharedGeometries).forEach(geometry => geometry.dispose());
            Object.values(this.sharedMaterials).forEach(material => material.dispose());
            this.hideDialogue();  // Clean up any active dialogue
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
                    case 'e': this.handleInteraction(); break;  // Add E key interaction
                    case ' ': this.useMartialArts(); break; // Space key for Martial Arts
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

        useMartialArts() {
            // Prevent skill use if dead
            if (!this.isAlive) {
                console.log('Cannot use skills while dead');
                return;
            }

            // Check if player has the skill
            if (!this.activeSkills.has('martial_arts') || this.playerStats.path !== 'light') {
                return;
            }

            // Prevent Illuminated players from using martial arts
            if (this.playerStats.currentKarma === 0) {
                console.log('Illuminated players cannot use direct damage skills');
                return;
            }

            const skill = this.skills.martial_arts;
            const now = Date.now();

            // Check cooldown
            if (now - skill.lastUsed < skill.cooldown) {
                return;
            }

            // Find nearby players
            if (!this.localPlayer) return;

            const playerPos = this.localPlayer.position;
            let targetFound = false;

            this.players.forEach((otherPlayer, playerId) => {
                if (playerId === this.socket.id) return; // Skip self
                
                // Skip dead players - more thorough check
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
                    // Emit damage event to server
                    this.socket.emit('skillDamage', {
                        targetId: playerId,
                        damage: skill.damage,
                        skillName: 'martial_arts'
                    });
                }
            });

            if (targetFound) {
                skill.lastUsed = now;
            }
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
            if (!this.localPlayer || !this.isAlive) return; // Skip update if player is dead

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

            // Update local player's status bars without life regeneration
            this.updatePlayerStatus(this.localPlayer, {
                life: this.playerStats.currentLife, // Don't modify life here
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

                    // Check if the next position is valid
                    if (!this.checkCollision(nextPosition, this.localPlayer.position.clone())) {
                        // Update position
                        this.localPlayer.position.copy(nextPosition);
                        
                        // Check if player is on temple platform and update height
                        this.isOnTemplePlatform(this.localPlayer.position);

                        // Update rotation
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

            // If on any part of the temple platform, player should be at temple height
            if (isOnBase || isOnVertical || isOnHorizontal) {
                position.y = 3; // Temple height (1.5 base height + 1.5 character height)
            } else {
                position.y = 1.5; // Ground level height
            }

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
            
            // Optimize water animation by reducing calculations
            if (this.ocean && this.ocean.material) {
                this.waterTime += 0.001;
                
                if (this.ocean.material.normalMap && (!this.lastWaterUpdate || currentTime - this.lastWaterUpdate >= 50)) {
                    const timeX = Math.sin(this.waterTime * 0.5) * 0.2;
                    const timeY = Math.cos(this.waterTime * 0.3) * 0.2;
                    this.ocean.material.normalMap.offset.x = timeX;
                    this.ocean.material.normalMap.offset.y = timeY;
                    
                    if (this.waveRings) {
                        this.waveRings.forEach((wave, index) => {
                            const waveTime = this.waterTime * 1.2 + wave.phase;
                            wave.mesh.position.y = wave.baseY + 
                                Math.sin(waveTime) * wave.amplitude * 0.7 +
                                Math.sin(waveTime * 1.3) * wave.amplitude * 0.3;
                            wave.mesh.rotation.z = Math.sin(this.waterTime * 0.8 + index * 0.2) * 0.005;
                        });
                    }
                    this.lastWaterUpdate = currentTime;
                }
            }
            
            // Update player stats at a lower frequency (every 100ms)
            if (!this.lastStatsUpdate || currentTime - this.lastStatsUpdate >= 100) {
                // Only regenerate mana, not life
                if (this.playerStats.currentMana < this.playerStats.maxMana) {
                    this.playerStats.currentMana = Math.min(
                        this.playerStats.maxMana,
                        this.playerStats.currentMana + this.playerStats.manaRegen
                    );
                }
                this.updateStatusBars();
                this.lastStatsUpdate = currentTime;
            }
            
            // Update karma effects at a lower frequency (every 50ms)
            if (!this.lastKarmaUpdate || currentTime - this.lastKarmaUpdate >= 50) {
                this.updateKarmaEffects();
                this.lastKarmaUpdate = currentTime;
            }
            
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
            const karmaBar = this.createModernStatusBar('', '#000000', '#000000'); // Changed to empty label
            this.karmaBarFill = karmaBar.querySelector('.fill');
            this.karmaText = karmaBar.querySelector('.text');
            this.karmaTooltip = karmaBar.querySelector('.tooltip');

            // Update karma bar background to white and text to golden
            const karmaBackground = karmaBar.querySelector('div[style*="background: linear-gradient"]');
            if (karmaBackground) {
                karmaBackground.style.background = '#ffffff';
            }
            const karmaTextElement = karmaBar.querySelector('span');
            if (karmaTextElement) {
                karmaTextElement.style.color = '#FFD700'; // Golden color
                karmaTextElement.style.fontSize = '14px';
                karmaTextElement.style.textShadow = '0 0 10px rgba(255, 215, 0, 0.7), -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff'; // Golden glow + white border
            }

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
                slot.style.display = 'flex';
                slot.style.alignItems = 'center';
                slot.style.justifyContent = 'center';
                slot.style.fontSize = '24px';

                // Add key number
                const keyNumber = document.createElement('div');
                keyNumber.textContent = i;
                keyNumber.style.position = 'absolute';
                keyNumber.style.bottom = '2px';
                keyNumber.style.right = '2px';
                keyNumber.style.color = '#fff';
                keyNumber.style.fontSize = '10px';
                keyNumber.style.fontWeight = 'bold';
                keyNumber.style.textShadow = '1px 1px 1px rgba(0, 0, 0, 0.5)';
                keyNumber.style.userSelect = 'none';

                // Add Space key indicator for slot 1
                if (i === 1) {
                    const spaceKey = document.createElement('div');
                    spaceKey.textContent = 'Space';
                    spaceKey.style.position = 'absolute';
                    spaceKey.style.bottom = '2px';
                    spaceKey.style.left = '2px';
                    spaceKey.style.color = '#fff';
                    spaceKey.style.fontSize = '10px';
                    spaceKey.style.fontWeight = 'bold';
                    spaceKey.style.textShadow = '1px 1px 1px rgba(0, 0, 0, 0.5)';
                    spaceKey.style.userSelect = 'none';
                    slot.appendChild(spaceKey);
                }

                slot.appendChild(keyNumber);
                container.appendChild(slot);
                
                // Store reference to slot for updating later
                if (i === 1) {
                    this.martialArtsSlot = slot;
                }
            }

            return container;
        }

        updateSkillBar() {
            // Update Martial Arts slot if player has chosen Light path
            if (this.martialArtsSlot) {
                if (this.playerStats.path === 'light' && this.activeSkills.has('martial_arts')) {
                    const skill = this.skills.martial_arts;
                    
                    // Create skill icon container
                    const iconContainer = document.createElement('div');
                    iconContainer.textContent = skill.icon;
                    iconContainer.style.fontSize = '28px';
                    iconContainer.style.position = 'absolute';
                    iconContainer.style.top = '50%';
                    iconContainer.style.left = '50%';
                    iconContainer.style.transform = 'translate(-50%, -50%)';
                    iconContainer.style.color = '#fff';
                    iconContainer.style.textShadow = '0 0 10px rgba(255, 255, 255, 0.5)';
                    
                    // Clear previous icon if any
                    const oldIcon = this.martialArtsSlot.querySelector('.skill-icon');
                    if (oldIcon) {
                        oldIcon.remove();
                    }
                    
                    iconContainer.className = 'skill-icon';
                    this.martialArtsSlot.appendChild(iconContainer);
                } else {
                    // Clear the slot if path is not light or skill not learned
                    const oldIcon = this.martialArtsSlot.querySelector('.skill-icon');
                    if (oldIcon) {
                        oldIcon.remove();
                    }
                }
            }
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
            // Update life ring - fill from top to bottom
            const lifePercent = (this.playerStats.currentLife / this.playerStats.maxLife) * 100;
            this.lifeRingFill.style.height = `${lifePercent}%`;
            this.lifeTooltip.textContent = `Life: ${Math.round(this.playerStats.currentLife)} / ${this.playerStats.maxLife}`;

            // Update mana ring - fill from top to bottom
            const manaPercent = (this.playerStats.currentMana / this.playerStats.maxMana) * 100;
            this.manaRingFill.style.height = `${manaPercent}%`;
            this.manaTooltip.textContent = `Mana: ${Math.round(this.playerStats.currentMana)} / ${this.playerStats.maxMana}`;

            // Update karma bar
            const karmaPercent = (this.playerStats.currentKarma / this.playerStats.maxKarma) * 100;
            this.karmaBarFill.style.width = `${karmaPercent}%`;
            this.karmaBarFill.style.boxShadow = `0 0 ${10 + (karmaPercent/10)}px #000000`;
            if (this.karmaTooltip) {
                this.karmaTooltip.textContent = `Karma: ${Math.round(this.playerStats.currentKarma)} / ${this.playerStats.maxKarma}`;
            }
        }

        // Add damage and healing methods
        damagePlayer(amount) {
            console.log('Damage taken:', amount);
            console.log('Current life:', this.playerStats.currentLife);
            
            const previousLife = this.playerStats.currentLife;
            this.playerStats.currentLife = Math.max(0, this.playerStats.currentLife - amount);
            
            console.log('New life:', this.playerStats.currentLife);
            this.updateStatusBars();

            // Check for death
            if (this.playerStats.currentLife === 0 && previousLife > 0) {
                console.log('Player died, calling handlePlayerDeath');
                this.handlePlayerDeath();
            }

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
        }

        handlePlayerDeath() {
            console.log('Starting death sequence...');
            
            // Disable player movement and interactions immediately
            this.isAlive = false;
            
            if (this.localPlayer) {
                // Hide status bars
                if (this.localPlayer.userData.statusGroup) {
                    this.scene.remove(this.localPlayer.userData.statusGroup);
                }

                // Set up death animation state
                this.localPlayer.userData.deathAnimation = {
                    startTime: Date.now(),
                    duration: 2000,
                    startY: this.localPlayer.position.y,
                    startRotation: this.localPlayer.rotation.y,
                    isAnimating: true
                };

                // Add death animation to the game's update loop
                const originalUpdatePlayer = this.updatePlayer.bind(this);
                this.updatePlayer = () => {
                    if (!this.isAlive && this.localPlayer?.userData.deathAnimation?.isAnimating) {
                        const anim = this.localPlayer.userData.deathAnimation;
                        const elapsed = Date.now() - anim.startTime;
                        const progress = Math.min(elapsed / anim.duration, 1);
                        
                        // Smooth easing
                        const easeProgress = progress * (2 - progress);
                        
                        // Update position (sink)
                        this.localPlayer.position.y = anim.startY - (easeProgress * 2);
                        
                        // Update rotation (spin)
                        this.localPlayer.rotation.y = anim.startRotation + (easeProgress * Math.PI * 4);
                        
                        // Update scale (shrink)
                        this.localPlayer.scale.setScalar(Math.max(0.1, 1 - easeProgress));

                        // Send updated state to server
                        if (this.socket?.connected) {
                            this.socket.emit('playerState', {
                                id: this.socket.id,
                                position: this.localPlayer.position,
                                rotation: this.localPlayer.rotation,
                                scale: this.localPlayer.scale,
                                isDead: true
                            });
                        }

                        // Check if animation is complete
                        if (progress >= 1) {
                            this.localPlayer.userData.deathAnimation.isAnimating = false;
                            this.scene.remove(this.localPlayer);
                            if (this.socket?.id) {
                                this.players.delete(this.socket.id);
                                // Final death notification to server
                                if (this.socket?.connected) {
                                    this.socket.emit('playerDied', {
                                        id: this.socket.id,
                                        isDead: true
                                    });
                                }
                            }
                        }
                    } else {
                        // Call original update if not animating death
                        originalUpdatePlayer();
                    }
                };
            }

            // Create death screen overlay with pointer-events blocking
            const deathOverlay = document.createElement('div');
            deathOverlay.style.position = 'fixed';
            deathOverlay.style.top = '0';
            deathOverlay.style.left = '0';
            deathOverlay.style.width = '100%';
            deathOverlay.style.height = '100%';
            deathOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0)'; // Start transparent
            deathOverlay.style.display = 'flex';
            deathOverlay.style.flexDirection = 'column';
            deathOverlay.style.alignItems = 'center';
            deathOverlay.style.justifyContent = 'center';
            deathOverlay.style.zIndex = '9999';
            deathOverlay.style.pointerEvents = 'all';
            deathOverlay.style.transition = 'background-color 2s ease-in';

            // Death message with fade in
            const deathMessage = document.createElement('h1');
            deathMessage.textContent = 'You Have Died';
            deathMessage.style.color = '#ff0000';
            deathMessage.style.fontSize = '48px';
            deathMessage.style.marginBottom = '20px';
            deathMessage.style.textShadow = '0 0 10px rgba(255, 0, 0, 0.7)';
            deathMessage.style.opacity = '0';
            deathMessage.style.transition = 'opacity 2s ease-in';

            // Add flavor text
            const flavorText = document.createElement('p');
            flavorText.textContent = 'Your journey in this life has ended...';
            flavorText.style.color = '#ffffff';
            flavorText.style.fontSize = '24px';
            flavorText.style.marginBottom = '30px';
            flavorText.style.textShadow = '0 0 10px rgba(255, 255, 255, 0.5)';
            flavorText.style.opacity = '0';
            flavorText.style.transition = 'opacity 2s ease-in';

            // Restart button
            const restartButton = document.createElement('button');
            restartButton.textContent = 'Begin a New Life';
            restartButton.style.padding = '15px 30px';
            restartButton.style.fontSize = '24px';
            restartButton.style.backgroundColor = '#ff3333';
            restartButton.style.color = 'white';
            restartButton.style.border = 'none';
            restartButton.style.borderRadius = '5px';
            restartButton.style.cursor = 'pointer';
            restartButton.style.transition = 'all 0.3s ease';
            restartButton.style.transform = 'scale(1)';
            restartButton.style.opacity = '0';

            restartButton.addEventListener('mouseover', () => {
                restartButton.style.backgroundColor = '#ff0000';
                restartButton.style.transform = 'scale(1.1)';
            });

            restartButton.addEventListener('mouseout', () => {
                restartButton.style.backgroundColor = '#ff3333';
                restartButton.style.transform = 'scale(1)';
            });

            restartButton.addEventListener('click', () => {
                // Clean up current game state
                this.cleanup();
                
                // Clear any stored game data
                clearGameData();
                
                // Force a hard reload of the page
                window.location.reload(true);
            });

            deathOverlay.appendChild(deathMessage);
            deathOverlay.appendChild(flavorText);
            deathOverlay.appendChild(restartButton);
            document.body.appendChild(deathOverlay);

            // Trigger fade-in animations after a short delay
            setTimeout(() => {
                deathOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                deathMessage.style.opacity = '1';
                flavorText.style.opacity = '1';
                restartButton.style.opacity = '1';
            }, 100);
        }

        healPlayer(amount) {
            this.playerStats.currentLife = Math.min(this.playerStats.maxLife, this.playerStats.currentLife + amount);
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
            ringContainer.style.width = '96px';
            ringContainer.style.height = '96px';
            ringContainer.style.position = 'relative';
            ringContainer.style.borderRadius = '50%';
            ringContainer.style.background = 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)';
            ringContainer.style.border = '2px solid rgba(255, 255, 255, 0.15)';
            ringContainer.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';

            // Create fill element
            const fill = document.createElement('div');
            fill.className = 'fill';
            fill.style.position = 'absolute';
            fill.style.left = '0';
            fill.style.width = '100%';
            fill.style.background = color;
            fill.style.transition = 'height 0.3s ease-out';
            fill.style.borderRadius = '0';  // Remove border radius from fill
            fill.style.opacity = '0.8';
            fill.style.bottom = '0';  // Start from bottom
            fill.style.transformOrigin = 'bottom';  // Set transform origin to bottom

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
            // Remove any existing dialogue
            this.hideDialogue();
            
            // Set the player's path
            this.playerStats.path = path;
            
            // Grant Martial Arts skill if choosing Light path
            if (path === 'light') {
                this.activeSkills.add('martial_arts');
                this.updateSkillBar();
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
    }

    // Start the game when the page loads
    window.addEventListener('load', () => {
        new Game();
    }); // End of load event listener
})(); // Close IIFE