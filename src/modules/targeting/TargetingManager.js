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
        this.lastUpdateTime = 0;
        this.updateFrequency = 500; // Update target indicator every 500ms
        this.lastValidationTime = 0; // Time of last target validation
        this.validationFrequency = 5000; // Only validate target every 5 seconds
        this.playerUpdateTimeout = null; // Timeout for player updates
    }
    
    /**
     * Initialize the targeting manager
     */
    async init() {
        console.log('Initializing TargetingManager');
        
        // Set up escape key handler to clear target
        this.setupEscapeKeyHandler();
        
        console.log('TargetingManager initialized');
    }
    
    /**
     * Initialize the target indicator visual
     */
    initTargetIndicator() {
        // We no longer need a separate target indicator since we have health bars for all players
        console.log('Target indicator initialization skipped - using player health bars instead');
        
        // Clear any existing target indicator
        if (this.targetIndicator) {
            console.log('Removing existing target indicator');
            this.game.scene.remove(this.targetIndicator);
            this.targetIndicator = null;
        }
    }
    
    /**
     * Set up the escape key handler to clear targeting
     */
    setupEscapeKeyHandler() {
        // Add escape key handler to clear target
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Escape') {
                this.clearTarget();
            }
        });
    }
    
    /**
     * Handle targeting based on mouse click
     * @param {THREE.Vector2} mousePosition - Normalized mouse position
     */
    handleTargeting(mousePosition) {
        console.log('Handling targeting with mouse position:', mousePosition);
        
        // Update the raycaster with the mouse position
        this.raycaster.setFromCamera(mousePosition, this.game.cameraManager.getCamera());
        
        // Check for intersections with players first
        const playerTargeted = this.checkPlayerIntersections();
        
        // If no player was targeted, check for monster intersections
        if (!playerTargeted) {
            const monsterTargeted = this.checkMonsterIntersections();
            
            // If no monster was targeted either, clear the current target
            if (!monsterTargeted) {
                console.log('No target found, clearing current target');
                this.clearTarget();
            }
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
     * Check for intersections with monsters
     * @returns {boolean} True if a monster was targeted
     */
    checkMonsterIntersections() {
        console.log('Checking for monster intersections...');
        
        // Access the monsters from the game's monster manager if it exists
        const monsters = this.game.monsterManager ? this.game.monsterManager.monsters : null;
        
        if (!monsters || monsters.size === 0) {
            console.log('No monsters available to check');
            return false;
        }
        
        // Log all monsters for debugging
        console.log('Monsters to check:', Array.from(monsters.entries()).map(([id, monster]) => {
            return {
                id: id,
                hasPosition: !!monster.position,
                position: monster.position ? 
                    `(${monster.position.x.toFixed(2)}, ${monster.position.y.toFixed(2)}, ${monster.position.z.toFixed(2)})` : 'N/A',
                childCount: monster.children ? monster.children.length : 0,
                hasMesh: monster.children ? monster.children.some(child => child.isMesh) : false
            };
        }));
        
        // Check each monster for intersection
        for (const [id, monster] of monsters) {
            // Debug log to verify monster objects
            console.log(`Checking monster with ID: ${id}`, {
                position: monster.position,
                childCount: monster.children ? monster.children.length : 0,
                type: monster.type,
                isObject3D: monster instanceof THREE.Object3D,
                isGroup: monster instanceof THREE.Group
            });
            
            // Ensure the monster has a mesh
            if (!monster) {
                console.log(`Monster ${id} is undefined, skipping`);
                continue;
            }
            
            // Perform raycasting with recursive flag set to true to check all child meshes
            const intersects = this.raycaster.intersectObject(monster, true);
            
            console.log(`Raycasting results for monster ${id}:`, {
                intersectionCount: intersects.length,
                intersections: intersects.map(i => ({
                    distance: i.distance.toFixed(2),
                    objectType: i.object.type,
                    objectName: i.object.name
                }))
            });
            
            if (intersects.length > 0) {
                console.log(`Monster targeted: ${id}`, intersects[0]);
                
                // Target the monster
                this.setTarget(monster, 'monster', id);
                return true;
            }
        }
        
        console.log('No monster intersections found');
        return false;
    }
    
    /**
     * Set the current target
     * @param {THREE.Object3D} object - The target object
     * @param {string} type - The type of target ('player' or 'monster')
     * @param {string} id - The ID of the target
     */
    setTarget(object, type, id) {
        console.log(`Setting target: ${type} with ID: ${id}`);
        
        // Cancel any existing validation timeout
        if (this.playerUpdateTimeout) {
            clearTimeout(this.playerUpdateTimeout);
            this.playerUpdateTimeout = null;
        }
        
        // Store the target information
        this.currentTarget = {
            object,
            type,
            id,
            timeTargeted: Date.now() // Add timestamp when the target was set
        };
        
        // Update the UI target display
        if (this.game.uiManager && this.game.uiManager.updateTargetDisplay) {
            // Get the target's name
            let name = 'Unknown';
            let health = 100;
            let maxHealth = 100;
            let level = 1;
            
            // Try to get the target's name and health from userData
            if (object.userData) {
                if (type === 'player') {
                    name = object.userData.name || `Player ${id}`;
                } else if (type === 'monster') {
                    name = object.userData.name || object.name || `Monster ${id.substring(0, 5)}`;
                }
                
                // Get health information if available
                if (object.userData.stats) {
                    health = object.userData.stats.life || 100;
                    maxHealth = object.userData.stats.maxLife || 100;
                    // Get level if available, default to 1
                    level = object.userData.stats.level || object.userData.level || 1;
                }
            }
            
            // Update the UI
            this.game.uiManager.updateTargetDisplay(name, health, maxHealth, type, level);
        }
    }
    
    /**
     * Update the target indicator position and size
     */
    updateTargetIndicator() {
        // We no longer need to update a separate target indicator
        // as we now have health bars for all players
        return;
    }
    
    /**
     * Clear the current target
     */
    clearTarget() {
        console.log('Clearing target');
        
        // Cancel any existing validation timeout
        if (this.playerUpdateTimeout) {
            clearTimeout(this.playerUpdateTimeout);
            this.playerUpdateTimeout = null;
        }
        
        // Remove the current target
        this.currentTarget = null;
        
        // Clear the UI target display
        if (this.game.uiManager && this.game.uiManager.clearTargetDisplay) {
            this.game.uiManager.clearTargetDisplay();
        } else if (this.game.uiManager && this.game.uiManager.updateTargetDisplay) {
            // Fallback if clearTargetDisplay doesn't exist
            this.game.uiManager.updateTargetDisplay('', 0, 0, '', 0);
        }
    }
    
    /**
     * Update method called each frame
     */
    update() {
        // We no longer need to update a separate target indicator
        // as we now have health bars for all players
    }
}

export default TargetingManager;
