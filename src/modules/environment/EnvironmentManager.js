import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import GameConstants from '../../../server/src/config/GameConstants.js';

export class EnvironmentManager {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.statueColliders = [];
        this.temple = null;
        this.darkNPC = null;
        this.lightNPC = null;
    }
    
    async init() {
        try {
            console.log('Initializing environment...');
            
            // Setup environment elements
            this.setupEnvironment();
            
            console.log('Environment initialization complete');
            return true;
        } catch (error) {
            console.error('Failed to initialize environment:', error);
            return false;
        }
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

        // Add NPC to the temple - we're restoring this to ensure NPCs are visible
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
            const darkConfig = GameConstants.TEMPLE_NPC.DARK;
            darkModel.scale.set(darkConfig.SCALE, darkConfig.SCALE, darkConfig.SCALE);
            darkModel.position.set(
                darkConfig.POSITION.x, 
                darkConfig.POSITION.y, 
                darkConfig.POSITION.z
            );
            darkModel.rotation.y = darkConfig.ROTATION;
            
            // Set up the light NPC model (left side)
            const lightModel = lightNPC.scene;
            const lightConfig = GameConstants.TEMPLE_NPC.LIGHT;
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
                    radius: GameConstants.NPC.DARK.COLLISION_RADIUS
                },
                {
                    position: new THREE.Vector3(lightConfig.POSITION.x, 0, lightConfig.POSITION.z),
                    radius: GameConstants.NPC.LIGHT.COLLISION_RADIUS
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

    // Add temple proximity checking
    checkTempleProximity() {
        if (!this.game.localPlayer || !this.temple) return false;
        
        const playerPos = this.game.localPlayer.position;
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

    // Get all colliders for collision detection
    getColliders() {
        return this.statueColliders;
    }

    update(delta) {
        // No need for updates without ambient particles
    }
    
    cleanup() {
        console.log('Cleaning up environment...');
        
        // Clean up NPCs
        if (this.darkNPC) {
            this.scene.remove(this.darkNPC);
            if (this.darkNPC.interactionSprite) {
                this.scene.remove(this.darkNPC.interactionSprite);
            }
            this.darkNPC = null;
        }
        
        if (this.lightNPC) {
            this.scene.remove(this.lightNPC);
            if (this.lightNPC.interactionSprite) {
                this.scene.remove(this.lightNPC.interactionSprite);
            }
            this.lightNPC = null;
        }
        
        // Clean up temple
        if (this.temple) {
            this.scene.remove(this.temple);
            this.temple = null;
        }
        
        // Clear colliders
        this.statueColliders = [];
    }
}
