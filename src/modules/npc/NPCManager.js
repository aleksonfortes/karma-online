import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import GameConstants from '../../../server/src/config/GameConstants.js';

export class NPCManager {
    constructor(game) {
        this.game = game;
        this.activeDialogue = null;
        this.npcs = new Map();
        this.npcProximity = false;
        this.networkPlayers = new Map(); // Store network players
        this.waterTime = 0;
        this.lightNPC = null;
        this.darkNPC = null;
        this.npcModels = {
            'light_npc': null,
            'dark_npc': null
        };
        this.initialized = false;
    }
    
    async init() {
        console.log('Initializing NPC Manager');
        
        // Only initialize once
        if (this.initialized) {
            console.log('NPC Manager already initialized');
            return;
        }
        
        // Wait for network manager to be ready
        if (this.game.networkManager?.isConnected) {
            console.log('Network connected, waiting for server NPCs');
            // NPCs will be initialized through processServerNPCs
        } else {
            console.log('No network connection, loading NPCs locally');
            await this.loadLocalNPCs();
        }
        
        this.initialized = true;
    }
    
    /**
     * Process NPC data received from server
     * @param {Array} npcData - Array of NPC data objects from server
     */
    processServerNPCs(npcData) {
        if (!npcData || !Array.isArray(npcData)) {
            console.error('Invalid NPC data received from server:', npcData);
            return;
        }
        
        console.log('Processing server NPCs:', npcData);
        
        // Clean up existing NPCs before loading new ones
        this.cleanup();
        
        // Load each NPC from server data
        npcData.forEach(async npc => {
            const position = new THREE.Vector3(npc.position.x, npc.position.y, npc.position.z);
            await this.loadNPC(position, npc.type, npc);
        });
    }
    
    /**
     * Load NPCs locally if server data is not available
     * This maintains backward compatibility
     */
    async loadLocalNPCs() {
        console.log('Loading NPCs locally');
        
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

            // Add interaction text to both NPCs
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
            
            // Add both NPCs to scene
            this.game.scene.add(darkModel);
            this.game.scene.add(lightModel);

            // Store NPC references
            this.darkNPC = darkModel;
            this.lightNPC = lightModel;
            this.game.darkNPC = darkModel;
            this.game.lightNPC = lightModel;

            // Store in the NPCs map
            this.npcs.set('dark_npc', { 
                id: 'dark_npc',
                mesh: darkModel, 
                type: 'dark_npc',
                collisionRadius: GameConstants.NPC.DARK.COLLISION_RADIUS
            });
            
            this.npcs.set('light_npc', { 
                id: 'light_npc',
                mesh: lightModel, 
                type: 'light_npc',
                collisionRadius: GameConstants.NPC.LIGHT.COLLISION_RADIUS
            });
            
            // Store in npcModels for easy access
            this.npcModels['dark_npc'] = darkModel;
            this.npcModels['light_npc'] = lightModel;
            
            console.log('NPCs loaded locally');
        } catch (error) {
            console.error('Error loading NPC models locally:', error);
        }
    }
    
    async loadNPC(position, npcType, serverData = null) {
        const npcId = serverData?.id || npcType;
        
        // Check if we already have this NPC
        if (this.npcs.has(npcId)) {
            console.log(`NPC ${npcId} already exists, updating position`);
            const existingNPC = this.npcs.get(npcId);
            if (existingNPC && existingNPC.mesh && position) {
                existingNPC.mesh.position.copy(position);
            }
            return existingNPC.mesh;
        }
        
        // Only log when initially loading, not for position updates
        if (!this.npcs.has(npcId)) {
            console.log(`Loading NPC: ${npcType}`);
        }
        
        // Check if we already have an NPC of this type loaded (regardless of ID)
        // This prevents duplicate NPCs of the same type when reconnecting
        if (!serverData && (npcType === 'light_npc' || npcType === 'dark_npc')) {
            const existingNPCs = Array.from(this.npcs.values());
            const sameTypeNPC = existingNPCs.find(npc => npc.type === npcType);
            if (sameTypeNPC && sameTypeNPC.mesh) {
                console.log(`Using existing ${npcType} instead of creating a duplicate`);
                if (position) {
                    sameTypeNPC.mesh.position.copy(position);
                }
                return sameTypeNPC.mesh;
            }
        }
        
        try {
            // If we're loading from server data and have the model already loaded locally,
            // we'll use that instead of creating a new one
            if (serverData && (npcType === 'dark_npc' || npcType === 'light_npc')) {
                const loader = new GLTFLoader();
                let npcModel;
                
                if (npcType === 'dark_npc') {
                    // Load the dark NPC model
                    const gltf = await new Promise((resolve, reject) => {
                        loader.load(
                            '/models/dark_npc.glb',
                            (gltf) => resolve(gltf),
                            undefined,
                            (error) => reject(error)
                        );
                    });
                    
                    npcModel = gltf.scene;
                    const darkConfig = GameConstants.NPC.DARK;
                    npcModel.scale.set(darkConfig.SCALE, darkConfig.SCALE, darkConfig.SCALE);
                    
                    // Add interaction text with correct offset
                    this.addInteractionText(npcModel, darkConfig.INTERACTION_TEXT_OFFSET);
                    
                    // Position the NPC
                    if (position) {
                        npcModel.position.copy(position);
                    } else {
                        // Use default position if none provided
                        npcModel.position.set(5, 1, -5);
                    }
                    
                    // Store references
                    this.darkNPC = npcModel;
                    this.game.darkNPC = npcModel;
                } else {
                    // Load the light NPC model
                    const gltf = await new Promise((resolve, reject) => {
                        loader.load(
                            '/models/light_npc.glb',
                            (gltf) => resolve(gltf),
                            undefined,
                            (error) => reject(error)
                        );
                    });
                    
                    npcModel = gltf.scene;
                    const lightConfig = GameConstants.NPC.LIGHT;
                    npcModel.scale.set(lightConfig.SCALE, lightConfig.SCALE, lightConfig.SCALE);
                    
                    // Add interaction text with correct offset
                    this.addInteractionText(npcModel, lightConfig.INTERACTION_TEXT_OFFSET);
                    
                    // Position the NPC
                    if (position) {
                        npcModel.position.copy(position);
                    } else {
                        // Use default position if none provided
                        npcModel.position.set(-5, 1, -5);
                    }
                    
                    // Store references
                    this.lightNPC = npcModel;
                    this.game.lightNPC = npcModel;
                }
                
                // Add shadows
                npcModel.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                // Get the appropriate NPC config based on type
                const npcConfig = npcType === 'light_npc' 
                    ? GameConstants.NPC.LIGHT 
                    : GameConstants.NPC.DARK;
                
                // Store in the NPCs map with server-provided ID or generated ID
                const npcId = serverData?.id || npcType;
                this.npcs.set(npcId, { 
                    id: npcId,
                    mesh: npcModel, 
                    type: npcType,
                    collisionRadius: npcConfig.COLLISION_RADIUS,
                    serverData: serverData || null
                });
                
                // Add to scene
                this.game.scene.add(npcModel);
                
                // Store in npcModels for easy access
                this.npcModels[npcType] = npcModel;
                
                return npcModel;
            } else {
                // Create a simple placeholder NPC model (cylinder)
                const npcGeometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
                const npcMaterial = new THREE.MeshStandardMaterial({
                    color: npcType === 'light_npc' ? 0xffcc00 : 0x660066,
                    metalness: 0.3,
                    roughness: 0.7
                });
                
                const npcModel = new THREE.Mesh(npcGeometry, npcMaterial);
                if (position) {
                    npcModel.position.copy(position);
                } else {
                    // Default positions if none provided
                    if (npcType === 'light_npc') {
                        npcModel.position.set(-5, 1, -5);
                    } else {
                        npcModel.position.set(5, 1, -5);
                    }
                }
                npcModel.castShadow = true;
                npcModel.receiveShadow = true;
                
                // Get the appropriate NPC config based on type
                const npcConfig = npcType === 'light_npc' 
                    ? GameConstants.NPC.LIGHT 
                    : GameConstants.NPC.DARK;
                
                // Apply the correct scale from GameConstants
                npcModel.scale.set(npcConfig.SCALE, npcConfig.SCALE, npcConfig.SCALE);
                
                // Add interaction text sprite with the correct offset from GameConstants
                this.addInteractionText(npcModel, npcConfig.INTERACTION_TEXT_OFFSET);
                
                // Store reference based on type
                if (npcType === 'light_npc') {
                    this.lightNPC = npcModel;
                    this.game.lightNPC = npcModel;
                } else if (npcType === 'dark_npc') {
                    this.darkNPC = npcModel;
                    this.game.darkNPC = npcModel;
                }
                
                // Store in the NPCs map with server-provided ID or generated ID
                const npcId = serverData?.id || npcType;
                this.npcs.set(npcId, { 
                    id: npcId,
                    mesh: npcModel, 
                    type: npcType,
                    collisionRadius: npcConfig.COLLISION_RADIUS,
                    serverData: serverData || null
                });
                
                // Add to scene
                this.game.scene.add(npcModel);
                
                // Store in npcModels for easy access
                this.npcModels[npcType] = npcModel;
                
                return npcModel;
            }
        } catch (error) {
            console.error('Failed to load NPC:', error);
            return null;
        }
    }
    
    addInteractionText(npcModel, yOffset = 2) {
        // Create canvas for text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        // Clear canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Set up text style
        context.font = 'bold 24px Arial';
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

        // Create sprite material
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });

        // Create sprite and position it above NPC
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(2, 0.5, 1);
        sprite.position.y = yOffset;
        sprite.visible = false; // Start hidden
        
        // Add sprite to NPC model
        npcModel.add(sprite);
        
        // Store reference to the sprite in the NPC model's userData
        if (!npcModel.userData) {
            npcModel.userData = {};
        }
        npcModel.userData.interactionSprite = sprite;
        
        return sprite;
    }
    
    // Use the EnvironmentManager's checkTempleProximity method instead
    checkTempleProximity() {
        if (this.game.environmentManager) {
            return this.game.environmentManager.checkTempleProximity();
        }
        return false;
    }

    calculateDistance(posA, posB) {
        const dx = posA.x - posB.x;
        const dy = posA.y - posB.y;
        const dz = posA.z - posB.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    handleInteraction() {
        console.log("Handling NPC interaction");
        
        // Check proximity to NPCs
        const playerPos = this.game.localPlayer.position;
        
        // First check the NPCs from EnvironmentManager if they exist
        if (this.game.environmentManager && (this.game.environmentManager.darkNPC || this.game.environmentManager.lightNPC)) {
            // Check dark NPC
            if (this.game.environmentManager.darkNPC) {
                const darkNpcPos = this.game.environmentManager.darkNPC.position;
                const distance = this.calculateDistance(playerPos, darkNpcPos);
                const darkConfig = GameConstants.NPC.DARK;
                
                if (distance < darkConfig.COLLISION_RADIUS + 3) {
                    console.log(`Interacting with Dark NPC. Distance:`, distance);
                    
                    // Send interaction request to server if connected
                    if (this.game.networkManager && this.game.networkManager.isConnected && this.game.networkManager.socket) {
                        this.game.networkManager.socket.emit('npcInteraction', {
                            npcId: 'dark_npc'
                        });
                    }
                    
                    // Show dialogue based on NPC type
                    if (this.game.uiManager && this.game.uiManager.showDialogue) {
                        this.game.uiManager.showDialogue('dark_npc');
                    }
                    
                    return;
                }
            }
            
            // Check light NPC
            if (this.game.environmentManager.lightNPC) {
                const lightNpcPos = this.game.environmentManager.lightNPC.position;
                const distance = this.calculateDistance(playerPos, lightNpcPos);
                const lightConfig = GameConstants.NPC.LIGHT;
                
                if (distance < lightConfig.COLLISION_RADIUS + 3) {
                    console.log(`Interacting with Light NPC. Distance:`, distance);
                    
                    // Send interaction request to server if connected
                    if (this.game.networkManager && this.game.networkManager.isConnected && this.game.networkManager.socket) {
                        this.game.networkManager.socket.emit('npcInteraction', {
                            npcId: 'light_npc'
                        });
                    }
                    
                    // Show dialogue based on NPC type
                    if (this.game.uiManager && this.game.uiManager.showDialogue) {
                        this.game.uiManager.showDialogue('light_npc');
                    }
                    
                    return;
                }
            }
        }
        
        // If we didn't interact with the EnvironmentManager NPCs, check the ones in our map
        for (const [npcId, npcData] of this.npcs) {
            if (!npcData.mesh) {
                console.log(`NPC ${npcId} has no mesh, skipping`);
                continue;
            }
            
            const npcPos = npcData.mesh.position;
            const distance = this.calculateDistance(playerPos, npcPos);
            
            // If player is close enough to interact
            if (distance < npcData.collisionRadius + 3) {
                console.log(`Interacting with ${npcData.type}. Distance:`, distance);
                
                // Send interaction request to server if connected
                if (this.game.networkManager && this.game.networkManager.isConnected && this.game.networkManager.socket) {
                    this.game.networkManager.socket.emit('npcInteraction', {
                        npcId: npcId
                    });
                }
                
                // Show dialogue based on NPC type
                if (this.game.uiManager && this.game.uiManager.showDialogue) {
                    this.game.uiManager.showDialogue(npcData.type);
                }
                
                return;
            }
        }
        
        console.log("No NPCs in range for interaction");
    }
    
    // Hide all interaction sprites
    hideAllInteractionLabels() {
        this.npcs.forEach(npcData => {
            if (npcData.mesh?.userData?.interactionSprite) {
                npcData.mesh.userData.interactionSprite.visible = false;
            }
        });
    }
    
    // Process NPC updates from server
    processNPCUpdates(npcUpdates) {
        if (!npcUpdates || !Array.isArray(npcUpdates)) return;
        
        npcUpdates.forEach(update => {
            const npc = this.npcs.get(update.id);
            if (npc && npc.mesh) {
                // Update position if provided
                if (update.position) {
                    npc.mesh.position.set(
                        update.position.x,
                        update.position.y,
                        update.position.z
                    );
                }
                
                // Update rotation if provided
                if (update.rotation) {
                    npc.mesh.rotation.y = update.rotation.y;
                }
                
                // Update other properties as needed
                if (update.serverData) {
                    npc.serverData = update.serverData;
                }
            }
        });
    }
    
    // Get colliders for all NPCs for collision detection
    getNPCColliders() {
        const colliders = [];
        
        // Add colliders for all NPCs
        for (const [id, npcData] of this.npcs) {
            if (!npcData.mesh) continue;
            
            colliders.push({
                position: npcData.mesh.position,
                radius: npcData.collisionRadius || 1.0
            });
        }
        
        return colliders;
    }
    
    // Check for collisions with NPCs and handle them
    // Returns true if there is a collision
    checkNPCCollisions(position, previousPosition) {
        for (const [id, npcData] of this.npcs) {
            if (!npcData.mesh) continue;
            
            const npcPos = npcData.mesh.position;
            const dx = position.x - npcPos.x;
            const dz = position.z - npcPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Use the collision radius from the NPC data or a default value
            const collisionRadius = npcData.collisionRadius || 1.0;
            
            if (distance < collisionRadius) {
                if (previousPosition) {
                    // Calculate the angle and push the player away in the opposite direction
                    const angle = Math.atan2(dz, dx);
                    
                    // Use a larger buffer and ensure consistent handling in all directions
                    const pushDistance = collisionRadius + 0.8; // Increased buffer for better separation
                    
                    // Set position directly based on angle from NPC center
                    position.x = npcPos.x + (Math.cos(angle) * pushDistance);
                    position.z = npcPos.z + (Math.sin(angle) * pushDistance);
                    
                    // Add some randomness to prevent getting stuck in specific positions
                    position.x += (Math.random() * 0.1) - 0.05;
                    position.z += (Math.random() * 0.1) - 0.05;
                }
                return true;
            }
        }
        
        return false;
    }
    
    update() {
        // If game is not initialized or player is not loaded, skip update
        if (!this.game.localPlayer) return;
        
        // Update NPC interaction labels based on proximity
        const playerPos = this.game.localPlayer.position;
        
        // First check NPCs from EnvironmentManager
        if (this.game.environmentManager) {
            // Check Dark NPC
            if (this.game.environmentManager.darkNPC && this.game.environmentManager.darkNPC.interactionSprite) {
                const darkNPC = this.game.environmentManager.darkNPC;
                const distance = this.calculateDistance(playerPos, darkNPC.position);
                const darkConfig = GameConstants.NPC.DARK;
                
                // Show/hide interaction label based on distance
                darkNPC.interactionSprite.visible = distance < darkConfig.COLLISION_RADIUS + 3;
                
                // Make interaction sprite face camera
                if (this.game.cameraManager && this.game.cameraManager.camera && darkNPC.interactionSprite) {
                    darkNPC.interactionSprite.quaternion.copy(this.game.cameraManager.camera.quaternion);
                }
            }
            
            // Check Light NPC
            if (this.game.environmentManager.lightNPC && this.game.environmentManager.lightNPC.interactionSprite) {
                const lightNPC = this.game.environmentManager.lightNPC;
                const distance = this.calculateDistance(playerPos, lightNPC.position);
                const lightConfig = GameConstants.NPC.LIGHT;
                
                // Show/hide interaction label based on distance
                lightNPC.interactionSprite.visible = distance < lightConfig.COLLISION_RADIUS + 3;
                
                // Make interaction sprite face camera
                if (this.game.cameraManager && this.game.cameraManager.camera && lightNPC.interactionSprite) {
                    lightNPC.interactionSprite.quaternion.copy(this.game.cameraManager.camera.quaternion);
                }
            }
        }
        
        // Then check NPCs in our own map
        this.npcs.forEach(npcData => {
            const npcMesh = npcData.mesh;
            if (!npcMesh || !npcMesh.userData || !npcMesh.userData.interactionSprite) return;
            
            const distance = this.calculateDistance(playerPos, npcMesh.position);
            
            // Show/hide interaction label based on distance
            npcMesh.userData.interactionSprite.visible = distance < npcData.collisionRadius + 3;
            
            // Make interaction sprite face camera
            if (this.game.cameraManager && this.game.cameraManager.camera && npcMesh.userData.interactionSprite) {
                npcMesh.userData.interactionSprite.quaternion.copy(this.game.cameraManager.camera.quaternion);
            }
        });
        
        // Update NPC proximity flag based on closest distance
        let closestDistance = Infinity;
        
        // Check distance to EnvironmentManager NPCs
        if (this.game.environmentManager) {
            if (this.game.environmentManager.darkNPC) {
                const distance = this.calculateDistance(playerPos, this.game.environmentManager.darkNPC.position);
                if (distance < closestDistance) {
                    closestDistance = distance;
                }
            }
            
            if (this.game.environmentManager.lightNPC) {
                const distance = this.calculateDistance(playerPos, this.game.environmentManager.lightNPC.position);
                if (distance < closestDistance) {
                    closestDistance = distance;
                }
            }
        }
        
        // Check distance to NPCs in our map
        this.npcs.forEach(npcData => {
            if (!npcData.mesh) return;
            const distance = this.calculateDistance(playerPos, npcData.mesh.position);
            if (distance < closestDistance) {
                closestDistance = distance;
            }
        });
        
        this.npcProximity = closestDistance < 5;
    }
    
    cleanup() {
        console.log('Cleaning up NPCs');
        
        // Remove all NPCs from the scene
        this.npcs.forEach(npc => {
            if (npc.mesh) {
                this.game.scene.remove(npc.mesh);
                // Clean up any associated resources
                if (npc.mesh.geometry) npc.mesh.geometry.dispose();
                if (npc.mesh.material) {
                    if (Array.isArray(npc.mesh.material)) {
                        npc.mesh.material.forEach(m => m.dispose());
                    } else {
                        npc.mesh.material.dispose();
                    }
                }
            }
        });
        
        // Handle special NPC cases
        if (this.darkNPC) {
            this.game.scene.remove(this.darkNPC);
            if (this.darkNPC.geometry) this.darkNPC.geometry.dispose();
            if (this.darkNPC.material) this.darkNPC.material.dispose();
            this.darkNPC = null;
            this.game.darkNPC = null;
        }
        if (this.lightNPC) {
            this.game.scene.remove(this.lightNPC);
            if (this.lightNPC.geometry) this.lightNPC.geometry.dispose();
            if (this.lightNPC.material) this.lightNPC.material.dispose();
            this.lightNPC = null;
            this.game.lightNPC = null;
        }
        
        // Clear all references
        this.npcs.clear();
        this.npcModels = {
            'light_npc': null,
            'dark_npc': null
        };
    }
}