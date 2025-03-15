import * as THREE from 'three';

export class TerrainManager {
    constructor(game) {
        this.game = game;
        this.terrain = null;
        this.ocean = null;
        this.waveRings = [];
        this.waterTime = 0;
        this.waveSpeed = 0.1;
        this.waveHeight = 0.1;
    }
    
    async init() {
        // Initialize the terrain and ocean
        this.createTerrain();
        return true;
    }
    
    createTerrain() {
        // Create terrain first (it should be above the ocean)
        this.generateTerrain();
        
        // Create ocean border (it should be below the terrain)
        this.createOcean();
        
        // Setup renderer with a background color matching the ocean
        this.game.renderer.setClearColor(0x004488); // Match the ocean color exactly
        
        // Add fog to blend with the background
        this.game.scene.fog = new THREE.Fog(0x004488, 150, 400);
        
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.game.scene.add(ambientLight);
        
        // Add directional light from above
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(5, 15, 8);
        directionalLight.castShadow = true;
        this.game.scene.add(directionalLight);
        
        // Add hemisphere light for better environment lighting
        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x0066aa, 0.6);
        this.game.scene.add(hemisphereLight);
        
        // Temple will be created by the NPCManager when it's initialized
    }
    
    generateTerrain() {
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
        this.game.scene.add(terrain);
        
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
        this.game.scene.add(mainOcean);

        // Create gradient transition rings
        const transitionSegments = 128;
        const transitionWidth = 20; // Reduced from 40 to make transition tighter
        const ringCount = 30; // Increased from 20 to create smoother transition
        const startOpacity = 0.95; // Increased from 0.9 for better blending
        const startY = -0.1; // Raised from -0.5 to be closer to the grass level

        this.waveRings = [];
        
        // Create transition rings from grass to water
        for (let i = 0; i < ringCount; i++) {
            const t = i / (ringCount - 1);
            const radius = arenaRadius - 1 + (t * transitionWidth); // Subtract 1 to start slightly inside the grass
            
            const ringGeometry = new THREE.RingGeometry(
                radius,
                radius + (transitionWidth / ringCount),
                transitionSegments,
                1
            );
            
            const ringMaterial = waterMaterial.clone();
            // More gradual opacity transition
            ringMaterial.opacity = startOpacity * Math.pow(1 - t, 1.5); // Adjusted power curve
            
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.rotation.x = -Math.PI / 2;
            
            const yOffset = -t * 2.4; // Increased from 2 to create steeper drop-off
            ring.position.y = startY + yOffset;
            
            this.game.scene.add(ring);
            
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
        
        // Strict boundary check for water - using the actual terrain size now
        // The terrain size is 200 as defined in generateTerrain()
        if (Math.abs(position.x) > halfTerrainSize || Math.abs(position.z) > halfTerrainSize) {
            if (previousPosition) {
                position.x = previousPosition.x;
                position.z = previousPosition.z;
            }
            return true;
        }
        
        // Check if player is on temple platform
        const templeRadius = 15; // Temple platform radius
        const templeCenter = new THREE.Vector3(0, 0, 0);
        
        // Check if player is on temple platform
        const distanceFromTemple = position.distanceTo(templeCenter);
        
        // Check for temple cross shape with precise dimensions
        const isOnVertical = Math.abs(position.x) <= 4.5 && Math.abs(position.z) <= 12.5;
        const isOnHorizontal = Math.abs(position.x) <= 12.5 && Math.abs(position.z) <= 4.5;
        
        // Set player height based on position, but don't return true (which would indicate collision)
        if (distanceFromTemple <= templeRadius || isOnVertical || isOnHorizontal) {
            // On temple platform - set height to 3
            position.y = 3;
        } else {
            // On grass - set height to properly position the player on top of the grass
            // The player model has a Y offset of -1.65, so we need to compensate for that
            // by setting the position.y to a value that will place the feet on top of the grass
            position.y = 1.65; // Increased from 1.5 to prevent sinking
        }
        
        // Check statue and NPC collisions with larger buffer
        if (false && this.game.npcManager && this.game.npcManager.statueColliders) {
            for (const collider of this.game.npcManager.statueColliders) {
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
        const players = this.game.playerManager.players;
        const localPlayer = this.game.playerManager.localPlayer;
        
        if (false && players) {
            const playerRadius = 1.0; // Radius for player collision
            const spawnRadius = 3.0; // Radius around temple center where collisions are more lenient
            const isInSpawnArea = Math.abs(position.x) < spawnRadius && Math.abs(position.z) < spawnRadius;
            
            // Check collision with other players
            for (const [id, otherPlayer] of players) {
                // Skip self-collision check
                if (localPlayer && otherPlayer === localPlayer) continue;
                
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
    
    update() {
        // Update water time for wave animation
        this.waterTime += this.waveSpeed;
        
        // Update wave rings
        for (const ring of this.waveRings) {
            const { mesh, baseY, phase, amplitude } = ring;
            mesh.position.y = baseY + (Math.sin(this.waterTime + phase) * amplitude);
        }
    }
    
    isOnTemplePlatform(position) {
        // Use the EnvironmentManager's implementation if available
        if (this.game.environmentManager) {
            return this.game.environmentManager.isOnTemplePlatform(position);
        }
        
        // Fallback implementation if EnvironmentManager is not available
        const platformRadius = 5; // Radius of the temple platform
        const distance = Math.sqrt(position.x * position.x + position.z * position.z);
        return distance <= platformRadius;
    }
    
    cleanup() {
        // Clean up any resources
        if (this.terrain && this.terrain.geometry) {
            this.terrain.geometry.dispose();
        }
        
        if (this.ocean && this.ocean.material) {
            this.ocean.material.dispose();
        }
        
        // Remove all wave rings
        for (const ring of this.waveRings) {
            if (ring.mesh && ring.mesh.parent) {
                ring.mesh.parent.remove(ring.mesh);
            }
            if (ring.mesh && ring.mesh.geometry) {
                ring.mesh.geometry.dispose();
            }
            if (ring.mesh && ring.mesh.material) {
                ring.mesh.material.dispose();
            }
        }
        
        this.waveRings = [];
    }
} 