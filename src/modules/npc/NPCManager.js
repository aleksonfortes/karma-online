import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class NPCManager {
    constructor(game) {
        this.game = game;
        this.activeDialogue = null;
        this.npcs = [];
        this.npcProximity = false;
        this.networkPlayers = new Map(); // Store network players
        this.waterTime = 0;
        this.lightNPC = null;
        this.darkNPC = null;
    }
    
    init() {
        console.log('Initializing NPC Manager');
        // Wait for NPCs to be created in Game.js
        return true;
    }
    
    async loadNPC(position, npcType) {
        console.log(`Loading NPC: ${npcType} at position:`, position);
        
        try {
            // Create NPC model (using same model as players for now)
            const npcGeometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
            const npcMaterial = new THREE.MeshStandardMaterial({
                color: npcType === 'light_npc' ? 0xffcc00 : 0x660066,
                metalness: 0.3,
                roughness: 0.7
            });
            
            const npcModel = new THREE.Mesh(npcGeometry, npcMaterial);
            npcModel.position.copy(position);
            npcModel.castShadow = true;
            npcModel.receiveShadow = true;
            
            // Add interaction text sprite
            this.addInteractionText(npcModel);
            
            // Store reference based on type
            if (npcType === 'light_npc') {
                this.game.lightNPC = npcModel;
                npcModel.position.set(-5, 1, -5); // Light NPC position
            } else if (npcType === 'dark_npc') {
                this.game.darkNPC = npcModel;
                npcModel.position.set(5, 1, -5); // Dark NPC position
            }
            
            // Add to scene
            this.game.scene.add(npcModel);
            this.npcs.push({ mesh: npcModel, type: npcType });
            
            return npcModel;
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
        context.font = 'Bold 24px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.strokeStyle = 'black';
        context.lineWidth = 3;
        
        // Draw text with black outline
        const text = 'Press E to interact';
        const x = canvas.width / 2;
        const y = canvas.height / 2;
        
        // Draw stroke
        context.strokeText(text, x, y);
        // Draw fill
        context.fillText(text, x, y);
        
        // Create sprite with text texture
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });
        
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(2, 0.5, 1);
        sprite.position.y = yOffset;
        sprite.visible = false; // Initially hidden
        
        // Add to NPC
        npcModel.add(sprite);
        
        // Store reference to sprite
        if (!npcModel.userData) {
            npcModel.userData = {};
        }
        npcModel.userData.interactionSprite = sprite;
        
        return sprite;
    }
    
    checkTempleProximity() {
        if (!this.game.localPlayer || !this.game.temple) return false;
        
        const playerPosition = this.game.localPlayer.position;
        
        // Simple distance check from temple center
        const templex = 0; // Temple is at origin x
        const templez = 0; // Temple is at origin z
        
        const distanceX = playerPosition.x - templex;
        const distanceZ = playerPosition.z - templez;
        const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
        
        // Player is in temple if within 15 units of center
        return distance < 15;
    }
    
    calculateDistance(posA, posB) {
        const dx = posA.x - posB.x;
        const dz = posA.z - posB.z;
        return Math.sqrt(dx * dx + dz * dz);
    }
    
    handleInteraction() {
        if (!this.game.localPlayer) return;
        
        // Check proximity to NPCs
        const playerPos = this.game.localPlayer.position;
        
        // Check if NPCs exist in the game
        if (this.game.lightNPC && this.game.darkNPC) {
            // Check dark NPC proximity
            const darkNPCPos = this.game.darkNPC.position;
            const distanceToDark = this.calculateDistance(playerPos, darkNPCPos);
            
            if (distanceToDark < 5) {  // Increased interaction radius from 3 to 5
                console.log('Interacting with Dark NPC. Distance:', distanceToDark);
                if (this.game.uiManager && this.game.uiManager.showDialogue) {
                    this.game.uiManager.showDialogue('dark_npc');
                }
                return;
            }
            
            // Check light NPC proximity
            const lightNPCPos = this.game.lightNPC.position;
            const distanceToLight = this.calculateDistance(playerPos, lightNPCPos);
            
            if (distanceToLight < 5) {  // Increased interaction radius from 3 to 5
                console.log('Interacting with Light NPC. Distance:', distanceToLight);
                if (this.game.uiManager && this.game.uiManager.showDialogue) {
                    this.game.uiManager.showDialogue('light_npc');
                }
                return;
            }
        }
    }
    
    // Hide all interaction sprites
    hideAllInteractionLabels() {
        if (this.game.lightNPC?.interactionSprite) {
            this.game.lightNPC.interactionSprite.visible = false;
        }
        if (this.game.darkNPC?.interactionSprite) {
            this.game.darkNPC.interactionSprite.visible = false;
        }
    }
    
    update() {
        // If game is not initialized or player is not loaded, skip update
        if (!this.game.localPlayer) return;
        
        // Update NPC interaction labels based on proximity
        if (this.game.lightNPC && this.game.darkNPC) {
            const playerPos = this.game.localPlayer.position;
            
            // Check dark NPC
            if (this.game.darkNPC.userData && this.game.darkNPC.userData.interactionSprite) {
                const darkNPCPos = this.game.darkNPC.position;
                const distanceToDark = this.calculateDistance(playerPos, darkNPCPos);
                
                // Show/hide interaction label based on distance
                this.game.darkNPC.userData.interactionSprite.visible = distanceToDark < 5;
                
                // Update NPC orientation to face player
                if (distanceToDark < 10) {
                    const angle = Math.atan2(darkNPCPos.x - playerPos.x, darkNPCPos.z - playerPos.z);
                    this.game.darkNPC.rotation.y = angle;
                }
                
                // Make interaction sprite face camera
                if (this.game.camera && this.game.darkNPC.userData.interactionSprite) {
                    this.game.darkNPC.userData.interactionSprite.quaternion.copy(this.game.camera.quaternion);
                }
            }
            
            // Check light NPC
            if (this.game.lightNPC.userData && this.game.lightNPC.userData.interactionSprite) {
                const lightNPCPos = this.game.lightNPC.position;
                const distanceToLight = this.calculateDistance(playerPos, lightNPCPos);
                
                // Show/hide interaction label based on distance
                this.game.lightNPC.userData.interactionSprite.visible = distanceToLight < 5;
                
                // Update NPC orientation to face player
                if (distanceToLight < 10) {
                    const angle = Math.atan2(lightNPCPos.x - playerPos.x, lightNPCPos.z - playerPos.z);
                    this.game.lightNPC.rotation.y = angle;
                }
                
                // Make interaction sprite face camera
                if (this.game.camera && this.game.lightNPC.userData.interactionSprite) {
                    this.game.lightNPC.userData.interactionSprite.quaternion.copy(this.game.camera.quaternion);
                }
            }
            
            // Update NPC proximity flag based on closest distance
            const distanceToDark = this.calculateDistance(playerPos, this.game.darkNPC.position);
            const distanceToLight = this.calculateDistance(playerPos, this.game.lightNPC.position);
            this.npcProximity = Math.min(distanceToDark, distanceToLight) < 5;
        }
    }
    
    cleanup() {
        // Remove all NPCs
        this.npcs.forEach(npc => {
            if (npc.mesh) {
                this.game.scene.remove(npc.mesh);
            }
        });
        this.npcs = [];
    }
} 