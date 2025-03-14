/**
 * TargetingManager.js - Handles player targeting of NPCs and other players
 * 
 * Manages target selection, highlighting, and related UI updates
 */
import * as THREE from 'three';

export class TargetingManager {
    constructor(game) {
        this.game = game;
        this.currentTarget = null;
        this.targetIndicator = null;
        this.raycaster = new THREE.Raycaster();
    }
    
    /**
     * Initialize the targeting manager
     */
    async init() {
        console.log('Initializing TargetingManager');
        
        // Initialize target indicator
        this.initTargetIndicator();
        
        // Set up mouse click event handler
        this.setupMouseClickHandler();
        
        console.log('TargetingManager initialized');
    }
    
    /**
     * Initialize the target indicator visual
     */
    initTargetIndicator() {
        // Create a 3D text nameplate for the target
        const createNameplate = () => {
            const group = new THREE.Group();
            
            // Create a backing plane for the nameplate
            const backingGeometry = new THREE.PlaneGeometry(2, 0.5);
            const backingMaterial = new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.7,
                side: THREE.DoubleSide
            });
            const backing = new THREE.Mesh(backingGeometry, backingMaterial);
            group.add(backing);
            
            // Add a colored border to the nameplate (for player type indication)
            const borderGeometry = new THREE.PlaneGeometry(2.1, 0.6);
            const borderMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000, // Default red, will be updated based on target type
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            const border = new THREE.Mesh(borderGeometry, borderMaterial);
            border.position.z = -0.01; // Slightly behind the backing
            group.add(border);
            
            // Create a health bar
            const healthBarBackingGeometry = new THREE.PlaneGeometry(1.8, 0.1);
            const healthBarBackingMaterial = new THREE.MeshBasicMaterial({
                color: 0x333333,
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide
            });
            const healthBarBacking = new THREE.Mesh(healthBarBackingGeometry, healthBarBackingMaterial);
            healthBarBacking.position.y = -0.15;
            group.add(healthBarBacking);
            
            // Create the actual health bar that will be scaled
            const healthBarGeometry = new THREE.PlaneGeometry(1.8, 0.1);
            const healthBarMaterial = new THREE.MeshBasicMaterial({
                color: 0x00cc00, // Green by default
                transparent: true,
                opacity: 1,
                side: THREE.DoubleSide
            });
            const healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
            healthBar.position.y = -0.15;
            healthBar.position.z = 0.01; // Slightly in front of the backing
            // We'll scale this along the x-axis to show health percentage
            healthBar.scale.x = 1;
            group.add(healthBar);
            
            // Store references to elements that need to be updated
            group.userData = {
                border: border,
                healthBar: healthBar,
                healthBarOriginalWidth: healthBarGeometry.parameters.width
            };
            
            // Position the nameplate above the target
            group.position.y = 2.5; // Height above the target
            group.visible = false;
            
            return group;
        };
        
        this.targetIndicator = createNameplate();
        
        // Add to scene
        this.game.scene.add(this.targetIndicator);
    }
    
    /**
     * Set up mouse click event handler for targeting
     */
    setupMouseClickHandler() {
        // Mouse click event for targeting
        this.game.renderer.domElement.addEventListener('click', (event) => {
            if (!this.game.isAlive) return;
            
            // Calculate mouse position in normalized device coordinates (-1 to +1)
            const rect = this.game.renderer.domElement.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            this.handleTargeting(x, y);
        });
        
        // Add escape key handler to clear target
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Escape') {
                this.clearTarget();
            }
        });
    }
    
    /**
     * Handle targeting based on mouse coordinates
     * @param {number} x - Normalized x coordinate (-1 to 1)
     * @param {number} y - Normalized y coordinate (-1 to 1)
     */
    handleTargeting(x, y) {
        console.log(`Targeting at coordinates: (${x.toFixed(2)}, ${y.toFixed(2)})`);
        
        // Log the game's players Map
        console.log(`Game.players Map size: ${this.game.players.size}`);
        console.log('Game.players contents:', Array.from(this.game.players.entries()).map(([id, player]) => {
            return {
                id: id,
                isLocalPlayer: player === this.game.localPlayer,
                position: player.position ? 
                    `(${player.position.x.toFixed(2)}, ${player.position.y.toFixed(2)}, ${player.position.z.toFixed(2)})` : 'N/A',
                userData: player.userData
            };
        }));
        
        // Log the PlayerManager's players Map for comparison
        if (this.game.playerManager && this.game.playerManager.players) {
            console.log(`PlayerManager.players Map size: ${this.game.playerManager.players.size}`);
            console.log('PlayerManager.players contents:', Array.from(this.game.playerManager.players.entries()).map(([id, player]) => {
                return {
                    id: id,
                    isLocalPlayer: player === this.game.localPlayer,
                    position: player.position ? 
                        `(${player.position.x.toFixed(2)}, ${player.position.y.toFixed(2)}, ${player.position.z.toFixed(2)})` : 'N/A',
                    userData: player.userData
                };
            }));
        }
        
        // Set up raycaster from camera through mouse position
        const camera = this.game.cameraManager.getCamera();
        this.raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        
        // Log raycaster direction for debugging
        console.log(`Raycaster direction: (${this.raycaster.ray.direction.x.toFixed(2)}, ${this.raycaster.ray.direction.y.toFixed(2)}, ${this.raycaster.ray.direction.z.toFixed(2)})`);
        
        // Focus only on player targeting for now
        const targetFound = this.checkPlayerIntersections();
        
        // If nothing was targeted, clear the current target
        if (!targetFound) {
            console.log('No target found, clearing current target');
            this.clearTarget();
        }
    }
    
    /**
     * Check for intersections with other players
     * @returns {boolean} True if a player was targeted
     */
    checkPlayerIntersections() {
        console.log('Checking for player intersections...');
        
        // Try to access players from both Game and PlayerManager to ensure we're checking all possible players
        const gamePlayers = this.game.players;
        const managerPlayers = this.game.playerManager ? this.game.playerManager.players : null;
        
        // Determine which players collection to use
        let playersToCheck = null;
        
        if (gamePlayers && gamePlayers.size > 0) {
            console.log(`Using Game.players (size: ${gamePlayers.size})`);
            playersToCheck = gamePlayers;
        } else if (managerPlayers && managerPlayers.size > 0) {
            console.log(`Using PlayerManager.players (size: ${managerPlayers.size})`);
            playersToCheck = managerPlayers;
        } else {
            console.log('No players available to check');
            return false;
        }
        
        // Log all players for debugging
        console.log('Players to check:', Array.from(playersToCheck.entries()).map(([id, player]) => {
            return {
                id: id,
                isLocalPlayer: player === this.game.localPlayer,
                hasPosition: !!player.position,
                position: player.position ? 
                    `(${player.position.x.toFixed(2)}, ${player.position.y.toFixed(2)}, ${player.position.z.toFixed(2)})` : 'N/A',
                childCount: player.children ? player.children.length : 0,
                hasMesh: player.children ? player.children.some(child => child.isMesh) : false
            };
        }));
        
        // Skip the local player in targeting
        for (const [id, player] of playersToCheck) {
            // Skip the local player
            if (player === this.game.localPlayer) {
                console.log(`Skipping local player with ID: ${id}`);
                continue;
            }
            
            // Debug log to verify player objects
            console.log(`Checking player with ID: ${id}`, {
                position: player.position,
                childCount: player.children ? player.children.length : 0,
                type: player.type,
                isObject3D: player instanceof THREE.Object3D,
                isGroup: player instanceof THREE.Group
            });
            
            // Ensure the player has a mesh
            if (!player) {
                console.log(`Player ${id} is undefined, skipping`);
                continue;
            }
            
            // Perform raycasting with recursive flag set to true to check all child meshes
            const intersects = this.raycaster.intersectObject(player, true);
            
            console.log(`Raycasting results for player ${id}:`, {
                intersectionCount: intersects.length,
                intersections: intersects.map(i => ({
                    distance: i.distance.toFixed(2),
                    objectType: i.object.type,
                    objectName: i.object.name
                }))
            });
            
            if (intersects.length > 0) {
                console.log(`Player targeted: ${id}`, intersects[0]);
                
                // Target the player
                this.setTarget(player, 'player', id);
                return true;
            }
        }
        
        console.log('No player intersections found');
        return false;
    }
    
    /**
     * Set a new target
     * @param {Object} target - The target object (player or NPC)
     * @param {string} type - The type of target ('player' or 'npc')
     * @param {string} id - The ID of the target
     */
    setTarget(target, type, id) {
        // If it's the same target, do nothing
        if (this.currentTarget && this.currentTarget.id === id && this.currentTarget.type === type) {
            return;
        }
        
        // Update current target
        this.currentTarget = {
            object: target,
            type: type,
            id: id
        };
        
        // Update target indicator position and make it visible
        this.updateTargetIndicator();
        
        // Update UI to show the target's information
        this.updateTargetUI();
        
        console.log(`Targeted ${type} with ID: ${id}`);
    }
    
    /**
     * Update the UI to display target information
     */
    updateTargetUI() {
        if (!this.currentTarget || !this.game.uiManager) return;
        
        const target = this.currentTarget.object;
        const type = this.currentTarget.type;
        const id = this.currentTarget.id;
        
        // Get target name and health based on type
        let name, health, maxHealth;
        
        if (type === 'player') {
            // For players, use the ID as a fallback name
            name = target.userData?.displayName || `Player ${id.substring(0, 5)}`;
            
            // Get health from player's userData or use default values
            health = target.userData?.life || 100;
            maxHealth = target.userData?.maxLife || 100;
        } else if (type === 'npc') {
            // For NPCs, use the name property or a default
            name = target.name || `NPC ${id.substring(0, 5)}`;
            
            // Get health from NPC properties
            health = target.health || target.life || 100;
            maxHealth = target.maxHealth || target.maxLife || 100;
        } else {
            // Default fallback
            name = "Unknown Target";
            health = 100;
            maxHealth = 100;
        }
        
        // Update UI
        this.game.uiManager.updateTargetDisplay(name, health, maxHealth, type);
    }
    
    /**
     * Clear the current target
     */
    clearTarget() {
        if (!this.currentTarget) return;
        
        // Clear current target
        this.currentTarget = null;
        
        // Hide target indicator
        if (this.targetIndicator) {
            this.targetIndicator.visible = false;
        }
        
        // Update UI to hide the target display
        if (this.game.uiManager) {
            this.game.uiManager.clearTargetDisplay();
        }
        
        console.log('Target cleared');
    }
    
    /**
     * Update the target indicator position and size
     */
    updateTargetIndicator() {
        if (!this.currentTarget || !this.targetIndicator) {
            console.log('No current target or target indicator');
            return;
        }
        
        const target = this.currentTarget.object;
        console.log('Updating target indicator for:', {
            targetType: this.currentTarget.type,
            targetId: this.currentTarget.id,
            hasPosition: !!target.position,
            hasGetWorldPosition: !!target.getWorldPosition,
            hasChildren: !!target.children,
            childCount: target.children ? target.children.length : 0
        });
        
        // Position the indicator above the target
        if (target) {
            // Get the target's position
            const position = new THREE.Vector3();
            
            // Different objects might store their position differently
            if (target.position) {
                // If the target has a direct position property (most THREE.js objects)
                position.copy(target.position);
                console.log('Using direct position property:', position);
            } else if (target.getWorldPosition) {
                // If the target has a getWorldPosition method
                target.getWorldPosition(position);
                console.log('Using getWorldPosition method:', position);
            } else {
                // Fallback: try to find a mesh within the target
                let mesh = null;
                
                // If target is a group, find the first mesh
                if (target.children) {
                    target.traverse((child) => {
                        if (!mesh && child.isMesh) {
                            mesh = child;
                        }
                    });
                }
                
                if (mesh) {
                    mesh.getWorldPosition(position);
                    console.log('Using mesh world position:', position);
                } else {
                    console.warn('Could not determine position for target indicator');
                    return;
                }
            }
            
            // Set the indicator position above the target
            // Keep the y-offset from the nameplate's internal position
            const yOffset = this.targetIndicator.position.y;
            this.targetIndicator.position.set(position.x, position.y + yOffset, position.z);
            
            // Update the nameplate appearance based on target type
            if (this.currentTarget.type === 'player') {
                // Blue border for players
                this.targetIndicator.userData.border.material.color.set(0x3366ff);
            } else if (this.currentTarget.type === 'npc') {
                // Yellow border for NPCs
                this.targetIndicator.userData.border.material.color.set(0xffcc00);
            }
            
            // Update health bar if health information is available
            if (target.userData?.stats?.life !== undefined && target.userData?.stats?.maxLife !== undefined) {
                const healthPercent = Math.max(0, Math.min(1, target.userData.stats.life / target.userData.stats.maxLife));
                this.targetIndicator.userData.healthBar.scale.x = healthPercent;
                
                // Center the health bar based on its new scale
                const offset = (1 - healthPercent) * this.targetIndicator.userData.healthBarOriginalWidth / 2;
                this.targetIndicator.userData.healthBar.position.x = -offset;
                
                // Update health bar color based on percentage
                if (healthPercent > 0.6) {
                    this.targetIndicator.userData.healthBar.material.color.set(0x00cc00); // Green
                } else if (healthPercent > 0.3) {
                    this.targetIndicator.userData.healthBar.material.color.set(0xcccc00); // Yellow
                } else {
                    this.targetIndicator.userData.healthBar.material.color.set(0xcc0000); // Red
                }
            }
            
            // Make the indicator face the camera
            this.targetIndicator.lookAt(this.game.cameraManager.getCamera().position);
            
            // Make the indicator visible
            this.targetIndicator.visible = true;
            console.log('Target indicator is now visible');
        }
    }
    
    /**
     * Update method called each frame
     */
    update() {
        // Update target indicator position if we have a target
        if (this.currentTarget) {
            this.updateTargetIndicator();
        }
    }
}

export default TargetingManager;
