/**
 * Server-side MonsterManager.js
 * 
 * Manages monster state, spawning, respawning, and behavior on the server
 * Maintains server authority over monster positions and status
 */
import { v4 as uuidv4 } from 'uuid';
import GameConstants from '../../config/GameConstants.js';

export class MonsterManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.monsters = new Map();
        this.respawnTimers = new Map();
        
        // Initialize monsters with their positions and types
        this.initializeMonsters();
    }
    
    /**
     * Initialize monsters in the game world
     */
    initializeMonsters() {
        // Create initial monsters
        this.spawnMonster('BASIC');
    }
    
    /**
     * Spawn a new monster of the specified type
     * @param {string} monsterType - The type of monster to spawn
     * @returns {Object} The spawned monster data
     */
    spawnMonster(monsterType) {
        const monsterId = `monster-${uuidv4()}`;
        const monsterConfig = GameConstants.MONSTER[monsterType];
        
        if (!monsterConfig) {
            console.error(`Unknown monster type: ${monsterType}`);
            return null;
        }
        
        const monster = {
            id: monsterId,
            type: monsterType,
            position: { ...monsterConfig.SPAWN_POSITION },
            rotation: { y: 0 },
            scale: monsterConfig.SCALE,
            collisionRadius: monsterConfig.COLLISION_RADIUS,
            health: monsterConfig.MAX_HEALTH,
            maxHealth: monsterConfig.MAX_HEALTH,
            isAlive: true,
            lastUpdateTime: Date.now(),
            // Add wandering behavior properties
            wanderAngle: Math.random() * Math.PI * 2,
            wanderTimer: 0,
            wanderInterval: 2000 + Math.random() * 3000, // Random interval between 2-5 seconds
            // Add targeting properties
            targetPlayerId: null,
            lastMoveTime: Date.now(),
            isReturningToSpawn: false
        };
        
        // Add monster to the map
        this.monsters.set(monsterId, monster);
        console.log(`Spawned monster: ${monsterType} with ID ${monsterId}`);
        
        return monster;
    }
    
    /**
     * Handle monster death
     * @param {string} monsterId - ID of the monster that died
     */
    handleMonsterDeath(monsterId) {
        const monster = this.monsters.get(monsterId);
        if (!monster) {
            console.warn(`Monster ${monsterId} not found for death handling`);
            return;
        }
        
        console.log(`Monster ${monsterId} has died`);
        
        // Update monster status
        monster.isAlive = false;
        monster.health = 0;
        
        // Schedule respawn
        const respawnTime = GameConstants.MONSTER[monster.type].RESPAWN_TIME || 10000;
        
        console.log(`Scheduling respawn for monster ${monsterId} in ${respawnTime}ms`);
        
        const timerId = setTimeout(() => {
            this.respawnMonster(monsterId, monster.type);
        }, respawnTime);
        
        // Store timer ID to clear it if needed
        this.respawnTimers.set(monsterId, timerId);
    }
    
    /**
     * Respawn a previously killed monster
     * @param {string} monsterId - ID of the monster to respawn
     * @param {string} monsterType - Type of the monster
     */
    respawnMonster(monsterId, monsterType) {
        // Remove the old monster
        this.monsters.delete(monsterId);
        this.respawnTimers.delete(monsterId);
        
        // Spawn a new monster of the same type
        this.spawnMonster(monsterType);
        
        console.log(`Monster ${monsterId} has been respawned`);
    }
    
    /**
     * Get all monsters as array for network sync
     * @returns {Array} Array of monster data
     */
    getAllMonsters() {
        // Only return alive monsters to the client
        return Array.from(this.monsters.values())
            .filter(monster => monster.isAlive);
    }
    
    /**
     * Get a monster by ID
     * @param {string} monsterId - ID of the monster to get
     * @returns {Object} The monster data, or null if not found
     */
    getMonsterById(monsterId) {
        return this.monsters.get(monsterId) || null;
    }
    
    /**
     * Update monsters (movement, behavior, etc.)
     * @param {Object} playerManager - The player manager for targeting players
     */
    update(playerManager) {
        const players = playerManager.getAllPlayers();
        const currentTime = Date.now();
        
        // Update each monster
        this.monsters.forEach(monster => {
            // Skip dead monsters
            if (!monster.isAlive) return;
            
            const monsterConfig = GameConstants.MONSTER[monster.type];
            const movementSpeed = monsterConfig.MOVEMENT_SPEED;
            const aggroRadius = monsterConfig.AGGRO_RADIUS;
            const deltaTime = (currentTime - monster.lastMoveTime) / 1000; // Convert to seconds
            
            // Get player monster is currently targeting (if any)
            let targetPlayer = null;
            if (monster.targetPlayerId) {
                targetPlayer = players[monster.targetPlayerId];
                
                // If target player is no longer in the game or is dead, clear target
                if (!targetPlayer || targetPlayer.health <= 0) {
                    monster.targetPlayerId = null;
                    targetPlayer = null;
                } else {
                    // Check if target player has run away beyond aggro radius
                    const dx = targetPlayer.position.x - monster.position.x;
                    const dz = targetPlayer.position.z - monster.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    
                    // If player has moved beyond 1.5x the aggro radius, stop following
                    if (distance > aggroRadius * 1.5) {
                        monster.targetPlayerId = null;
                        targetPlayer = null;
                        // Set leashing flag to return to spawn
                        monster.isReturningToSpawn = true;
                    }
                }
            }
            
            // If no target player, find closest player within aggro radius
            if (!targetPlayer && !monster.isReturningToSpawn) {
                let closestPlayer = null;
                let closestDistance = Infinity;
                
                Object.values(players).forEach(player => {
                    // Skip dead players
                    if (player.health <= 0) return;
                    
                    const dx = player.position.x - monster.position.x;
                    const dz = player.position.z - monster.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    
                    if (distance < aggroRadius && distance < closestDistance) {
                        closestPlayer = player;
                        closestDistance = distance;
                    }
                });
                
                // Set new target player if found
                if (closestPlayer) {
                    targetPlayer = closestPlayer;
                    monster.targetPlayerId = closestPlayer.id;
                    monster.isReturningToSpawn = false;
                }
            }
            
            // Calculate distance to spawn point
            const spawnPosition = monsterConfig.SPAWN_POSITION;
            const dxSpawn = spawnPosition.x - monster.position.x;
            const dzSpawn = spawnPosition.z - monster.position.z;
            const distanceToSpawn = Math.sqrt(dxSpawn * dxSpawn + dzSpawn * dzSpawn);
            
            // Check if monster is too far from spawn point
            const maxRoamDistance = monsterConfig.MAX_FOLLOW_DISTANCE || 30;
            if (distanceToSpawn > maxRoamDistance) {
                // Force return to spawn behavior
                monster.isReturningToSpawn = true;
                monster.targetPlayerId = null;
                targetPlayer = null;
            }
            
            // Movement logic
            if (targetPlayer) {
                // Calculate direction to target player
                const dx = targetPlayer.position.x - monster.position.x;
                const dz = targetPlayer.position.z - monster.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                // Update monster rotation to face player
                const angle = Math.atan2(dx, dz);
                monster.rotation.y = angle;
                
                // Move toward player if not too close
                if (distance > monsterConfig.COLLISION_RADIUS + 1.0) {
                    const moveStep = movementSpeed * deltaTime;
                    
                    // Normalize direction vector
                    const normalizedDx = dx / distance;
                    const normalizedDz = dz / distance;
                    
                    // Move toward player
                    monster.position.x += normalizedDx * moveStep;
                    monster.position.z += normalizedDz * moveStep;
                }
            } else if (monster.isReturningToSpawn) {
                // Return to spawn behavior
                const dx = spawnPosition.x - monster.position.x;
                const dz = spawnPosition.z - monster.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                // If we're close enough to spawn, stop returning
                if (distance < 1.0) {
                    monster.isReturningToSpawn = false;
                    monster.position.x = spawnPosition.x;
                    monster.position.z = spawnPosition.z;
                    // Reset wandering
                    monster.wanderAngle = Math.random() * Math.PI * 2;
                    monster.wanderTimer = 0;
                } else {
                    // Update monster rotation to face spawn point
                    const angle = Math.atan2(dx, dz);
                    monster.rotation.y = angle;
                    
                    // Calculate movement
                    const moveStep = movementSpeed * 1.5 * deltaTime; // Move faster when returning
                    
                    // Normalize direction vector
                    const normalizedDx = dx / distance;
                    const normalizedDz = dz / distance;
                    
                    // Move toward spawn
                    monster.position.x += normalizedDx * moveStep;
                    monster.position.z += normalizedDz * moveStep;
                }
            } else {
                // Wandering behavior
                monster.wanderTimer += deltaTime * 1000; // Convert to milliseconds
                
                if (monster.wanderTimer >= monster.wanderInterval) {
                    // Pick a new random direction every wanderInterval
                    monster.wanderAngle = Math.random() * Math.PI * 2;
                    monster.wanderTimer = 0;
                    monster.wanderInterval = 2000 + Math.random() * 3000; // 2-5 seconds
                }
                
                // Calculate movement direction
                const moveStep = (movementSpeed * 0.5) * deltaTime; // Slower when wandering
                monster.position.x += Math.sin(monster.wanderAngle) * moveStep;
                monster.position.z += Math.cos(monster.wanderAngle) * moveStep;
                
                // Update rotation to match movement direction
                monster.rotation.y = monster.wanderAngle;
            }
            
            // Update the monster's last move time
            monster.lastMoveTime = currentTime;
            monster.lastUpdateTime = currentTime;
        });
    }
    
    /**
     * Clean up resources when shutting down
     */
    cleanup() {
        // Clear all respawn timers
        this.respawnTimers.forEach((timerId) => {
            clearTimeout(timerId);
        });
        
        this.respawnTimers.clear();
        this.monsters.clear();
    }
}

export default MonsterManager; 