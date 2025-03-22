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
        this.targetValidationInterval = null;
        
        // Set up the escape key handler to clear target
        this.setupEscapeKeyHandler();
        
        // Start the target validation interval
        this.startTargetValidation();
    }
    
    /**
     * Initialize the targeting manager
     */
    async init() {
        console.log('Initializing TargetingManager');
        
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
        
        // Store the mouse position for proximity targeting
        this.lastMousePosition = mousePosition.clone();
        
        // Update the raycaster with the mouse position
        this.raycaster.setFromCamera(mousePosition, this.game.cameraManager.getCamera());
        
        // Debug information about available targets
        if (this.game.monsterManager && this.game.monsterManager.monsters) {
            console.log(`Available monsters for targeting: ${this.game.monsterManager.monsters.size}`);
        }
        
        // First check for player intersections
        const playerTargeted = this.checkPlayerIntersections();
        
        // If no player was targeted, check for monster intersections
        if (!playerTargeted) {
            console.log('No player targeted, checking for monsters...');
            const monsterTargeted = this.checkMonsterIntersections();
            
            // If no monster was targeted either, clear the current target
            if (!monsterTargeted) {
                console.log('No target found, clearing current target');
                this.clearTarget();
            } else {
                console.log('Monster successfully targeted!');
            }
        } else {
            console.log('Player successfully targeted!');
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
        
        // Variables to track the closest player
        let closestPlayer = null;
        let closestDistance = Infinity;
        let closestPlayerId = null;
        
        // Skip the local player in targeting
        for (const [id, player] of playersToCheck) {
            // Skip the local player
            if (player === this.game.localPlayer) {
                console.log(`Skipping local player with ID: ${id}`);
                continue;
            }
            
            // Skip invalid players
            if (!player) {
                console.log(`Player ${id} is undefined, skipping`);
                continue;
            }
            
            // Perform raycasting with recursive flag set to true to check all child meshes
            const intersects = this.raycaster.intersectObject(player, true);
            
            console.log(`Raycasting results for player ${id}:`, {
                intersectionCount: intersects.length,
                intersections: intersects.length > 0 ? intersects.map(i => ({
                    distance: i.distance.toFixed(2),
                    objectType: i.object.type
                })) : []
            });
            
            if (intersects.length > 0) {
                // Get the distance to the player
                const distance = intersects[0].distance;
                
                // If this is the closest player so far, remember it
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestPlayer = player;
                    closestPlayerId = id;
                    console.log(`Player targeted: ${id} at distance ${distance.toFixed(2)}`);
                }
            }
        }
        
        // If we found a closest player, target it
        if (closestPlayer) {
            console.log(`Targeting closest player: ${closestPlayerId} at distance ${closestDistance.toFixed(2)}`);
            this.setTarget(closestPlayer, 'player', closestPlayerId);
            return true;
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
        
        console.log(`Found ${monsters.size} monsters to check for targeting`);
        
        // Get camera for targeting
        const camera = this.game.cameraManager.getCamera();
        
        // Use the stored mouse position which is already in NDC space
        const mousePosition = this.lastMousePosition || new THREE.Vector2(0, 0);
        
        // Variables to track the closest targeted monster by direct hit
        let closestMonster = null;
        let closestDistance = Infinity;
        
        // Check each monster for direct intersection with the mouse click ray
        monsters.forEach((monster, id) => {
            // Skip invalid monsters
            if (!monster || !monster.mesh) {
                return;
            }
            
            // Try direct raycast intersection first
            const intersects = this.raycaster.intersectObject(monster.mesh, true);
            
            if (intersects.length > 0) {
                // Direct hit with the monster mesh
                const distance = intersects[0].distance;
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestMonster = monster;
                    console.log(`Direct hit on monster ${id} at distance ${distance.toFixed(2)}`);
                }
            }
        });
        
        // If we found a closest monster by direct hit, target it
        if (closestMonster) {
            console.log(`Targeting monster: ${closestMonster.id} at distance ${closestDistance.toFixed(2)}`);
            this.setTarget(closestMonster, 'monster', closestMonster.id);
            return true;
        }
        
        console.log('No monster intersections found');
        return false;
    }
    
    /**
     * Set the current target
     * @param {Object} object - The target object
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
        
        // For monsters, we need to make sure we store the monster object correctly
        if (type === 'monster') {
            // Ensure the monster is the same object reference as in the MonsterManager
            const monster = this.game.monsterManager.getMonsterById(id);
            if (monster) {
                // Use the monster from the manager to ensure consistent references
                object = monster;
            }
        }
        
        // Store the target information
        this.currentTarget = {
            object: object,
            type: type,
            id: id,
            timeTargeted: Date.now() // Add timestamp when the target was set
        };
        
        // Debug log to check target format
        console.log('Current target set to:', JSON.stringify({
            type: this.currentTarget.type,
            id: this.currentTarget.id,
            time: new Date(this.currentTarget.timeTargeted).toISOString()
        }));
        
        // Determine name based on type
        let name = 'Unknown';
        let health = 100;
        let maxHealth = 100;
        let level = 1;
        
        if (type === 'player') {
            // Get the player data directly from the player manager
            const playerInfo = this.game.playerManager.getPlayerById(id);
            
            if (playerInfo) {
                name = playerInfo.displayName || `Player ${id.substring(0, 5)}`;
                health = playerInfo.life || 100;
                maxHealth = playerInfo.maxLife || 100;
                level = playerInfo.level || 1;
                
                // Enhanced debug for displayName issue
                console.log(`Setting player target name:`, {
                    id: id,
                    displayName: playerInfo.displayName,
                    fallbackName: `Player ${id.substring(0, 5)}`,
                    finalName: name,
                    playerInfoKeys: Object.keys(playerInfo)
                });
            } else {
                console.warn(`Player info not found for ID ${id}`);
                name = `Player ${id.substring(0, 5)}`;
            }
            
            // Request latest health data
            if (this.game.networkManager && this.game.networkManager.socket) {
                this.game.networkManager.socket.emit('requestLifeUpdate', { playerId: id });
            }
            
            // Set up a repeating health update for this player
            this.playerUpdateTimeout = setInterval(() => {
                if (this.game.networkManager && this.game.networkManager.socket) {
                    this.game.networkManager.socket.emit('requestLifeUpdate', { playerId: id });
                }
            }, 2000); // Update every 2 seconds
            
        } else if (type === 'monster') {
            // For monsters, use the monster data from our MonsterManager
            const monster = object;
            
            if (monster) {
                // Get monster level from its configuration if available
                if (monster.type && this.game.gameConstants && this.game.gameConstants.MONSTER && 
                    this.game.gameConstants.MONSTER[monster.type] && 
                    this.game.gameConstants.MONSTER[monster.type].LEVEL) {
                    level = this.game.gameConstants.MONSTER[monster.type].LEVEL;
                }
                
                // Format the monster name nicely (same as in setTarget)
                let name;
                const monsterTypeName = monster.type || 'Unknown';
                
                if (monsterTypeName === 'TYPHON') {
                    name = 'Typhon';
                } else if (monsterTypeName === 'BASIC') {
                    name = 'Cerberus';
                } else {
                    // For any other monster types, just use the type name
                    name = monsterTypeName.charAt(0).toUpperCase() + monsterTypeName.slice(1).toLowerCase();
                }
                
                // Get monster health
                health = monster.health !== undefined ? monster.health : 100;
                maxHealth = monster.maxHealth !== undefined ? monster.maxHealth : 100;
                
                console.log(`Setting monster target: ${name}, Health: ${health}/${maxHealth}, Level: ${level}`);
            } else {
                console.warn(`Monster object not found for ID ${id}`);
            }
        }
        
        // Update the target display in the UI
        if (this.game.uiManager) {
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
        
        const hadTarget = this.currentTarget !== null;
        
        // Remove the current target
        this.currentTarget = null;
        
        // Clear the UI target display
        if (this.game.uiManager && this.game.uiManager.clearTargetDisplay) {
            this.game.uiManager.clearTargetDisplay();
        } else if (this.game.uiManager && this.game.uiManager.updateTargetDisplay) {
            // Fallback if clearTargetDisplay doesn't exist
            this.game.uiManager.updateTargetDisplay('', 0, 0, '', 0);
        }
        
        // Show notification only if we previously had a target and it was explicitly cleared
        // This prevents showing the notification during initialization or redundant clears
        if (hadTarget && this.game.uiManager && typeof this.game.uiManager.showNotification === 'function') {
            this.game.uiManager.showNotification('No target selected', 'white');
        }
    }
    
    /**
     * Start periodic validation of the current target
     */
    startTargetValidation() {
        // Clear any existing interval
        if (this.targetValidationInterval) {
            clearInterval(this.targetValidationInterval);
        }
        
        // Check target validity more frequently (every 500ms) to ensure UI stays responsive
        // especially for monsters with rapidly changing health
        this.targetValidationInterval = setInterval(() => {
            this.validateCurrentTarget();
        }, 500);
    }
    
    /**
     * Validate the current target to ensure it's still valid
     * This will clear the target if any of the following are true:
     * 1. The target is dead
     * 2. The target is invisible
     * 3. The target no longer exists
     */
    validateCurrentTarget() {
        if (!this.currentTarget) {
            return;
        }
        
        const camera = this.game.cameraManager.getCamera();
        
        // For monster targets, we need to handle differently since monster.mesh is the actual Object3D
        if (this.currentTarget.type === 'monster') {
            const monsterId = this.currentTarget.id;
            const monster = this.game.monsterManager.getMonsterById(monsterId);
            
            // If monster no longer exists in the monster manager, clear target
            if (!monster || !monster.mesh) {
                console.log('Monster target no longer exists, clearing target');
                this.clearTarget();
                return;
            }
            
            // Check if monster is dead - clear target immediately
            if (monster.health <= 0) {
                console.log('Monster target has 0 health, clearing target immediately');
                this.clearTarget();
                return;
            }
            
            // Update the target display with current health - do this every validation check
            // to ensure the UI is always in sync with the actual monster health
            if (this.game.uiManager) {
                // Get monster level from its configuration if available
                let level = 1;
                if (monster.type && this.game.gameConstants && this.game.gameConstants.MONSTER && 
                    this.game.gameConstants.MONSTER[monster.type] && 
                    this.game.gameConstants.MONSTER[monster.type].LEVEL) {
                    level = this.game.gameConstants.MONSTER[monster.type].LEVEL;
                }
                
                // Format the monster name nicely (same as in setTarget)
                let name;
                const monsterTypeName = monster.type || 'Unknown';
                
                if (monsterTypeName === 'TYPHON') {
                    name = 'Typhon';
                } else if (monsterTypeName === 'BASIC') {
                    name = 'Cerberus';
                } else {
                    // For any other monster types, just use the type name
                    name = monsterTypeName.charAt(0).toUpperCase() + monsterTypeName.slice(1).toLowerCase();
                }
                
                this.game.uiManager.updateTargetDisplay(
                    name,
                    monster.health,
                    monster.maxHealth,
                    'monster',
                    level
                );
            }
            
            // No longer clearing target if off-screen to maintain target for PVP combat
        } else if (this.currentTarget.type === 'player') {
            // For player targets, we need to look at the players Map in playerManager
            const playerId = this.currentTarget.id;
            const playerObject = this.game.playerManager.getPlayerById(playerId);
            
            // Check if the player still exists
            if (!playerObject) {
                console.log('Target no longer in scene, clearing target');
                this.clearTarget();
                return;
            }
            
            // Update the target display with current player info - do this every validation check
            // to ensure UI is always in sync with actual player health
            if (this.game.uiManager) {
                // Get health stats from playerObject
                const health = playerObject.life || 0;
                const maxHealth = playerObject.maxLife || 100;
                
                // Get player name directly from the playerObject
                const playerName = playerObject.displayName || `Player ${playerId.substring(0, 6)}`;
                
                // Add debugging to confirm displayName retrieval
                console.log(`Updating target display in validate:`, {
                    displayName: playerObject.displayName,
                    finalName: playerName,
                    playerObjectKeys: Object.keys(playerObject)
                });
                
                this.game.uiManager.updateTargetDisplay(
                    playerName,
                    health,
                    maxHealth,
                    'player',
                    playerObject.level || 1
                );
            }
            
            // No longer clearing target if off-screen to maintain target for PVP combat
        }
    }
    
    /**
     * Update method called each frame
     */
    update() {
        // We no longer need to update a separate target indicator
        // as we now have health bars for all players
    }
    
    /**
     * Get the current target ID
     * @returns {string|null} The ID of the current target, or null if no target
     */
    getTargetId() {
        if (!this.currentTarget) {
            return null;
        }
        return this.currentTarget.id;
    }
    
    /**
     * Get the current target's type (player, monster, etc.)
     * @returns {string|null} The type of the current target, or null if no target
     */
    getTargetType() {
        if (!this.currentTarget) {
            return null;
        }
        return this.currentTarget.type;
    }

    /**
     * Get the current target object
     * @returns {Object|null} The current target object, or null if no target
     */
    getTargetObject() {
        if (!this.currentTarget) {
            return null;
        }

        // For player targets
        if (this.currentTarget.type === 'player') {
            const playerId = this.currentTarget.id;
            return this.game.playerManager.getPlayerById(playerId);
        }
        
        // For monster targets
        if (this.currentTarget.type === 'monster') {
            const monsterId = this.currentTarget.id;
            const monster = this.game.monsterManager.getMonsterById(monsterId);
            return monster?.mesh || null;
        }
        
        // For any other target type, return the object directly
        return this.currentTarget.object || null;
    }
}

export default TargetingManager;
