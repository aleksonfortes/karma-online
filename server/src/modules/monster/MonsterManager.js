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
    
    initializeMonsters() {
        // Create a basic monster outside the temple
        this.spawnMonster('BASIC');
        
        console.log('Server monsters initialized:', this.monsters.size);
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
            lastUpdateTime: Date.now()
        };
        
        // Add monster to the map
        this.monsters.set(monsterId, monster);
        console.log(`Spawned monster: ${monsterType} with ID ${monsterId}`);
        
        return monster;
    }
    
    /**
     * Handle monster death and schedule respawn
     * @param {string} monsterId - ID of the monster that died
     */
    handleMonsterDeath(monsterId) {
        const monster = this.monsters.get(monsterId);
        if (!monster) {
            console.warn(`Monster ${monsterId} not found for death handling`);
            return;
        }
        
        // Mark the monster as dead but keep it in the collection
        monster.isAlive = false;
        console.log(`Monster ${monsterId} died, scheduling respawn`);
        
        // Get monster type for respawn configuration
        const monsterType = monster.type;
        const respawnTime = GameConstants.MONSTER[monsterType]?.RESPAWN_TIME || 10000;
        
        // Clear any existing timer for this monster
        if (this.respawnTimers.has(monsterId)) {
            clearTimeout(this.respawnTimers.get(monsterId));
        }
        
        // Schedule respawn
        const timerId = setTimeout(() => {
            this.respawnMonster(monsterId, monsterType);
        }, respawnTime);
        
        // Store the timer ID
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
     * Get all monsters for initial client state
     */
    getAllMonsters() {
        return Array.from(this.monsters.values())
            .filter(monster => monster.isAlive); // Only send alive monsters
    }
    
    /**
     * Get a specific monster by ID
     * @param {string} monsterId - ID of the monster to get
     */
    getMonsterById(monsterId) {
        return this.monsters.get(monsterId);
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
            
            // Simple AI: find closest player within aggro radius
            let closestPlayer = null;
            let closestDistance = Infinity;
            
            Object.values(players).forEach(player => {
                const dx = player.position.x - monster.position.x;
                const dz = player.position.z - monster.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                if (distance < GameConstants.MONSTER[monster.type].AGGRO_RADIUS && distance < closestDistance) {
                    closestPlayer = player;
                    closestDistance = distance;
                }
            });
            
            // Update monster rotation to face closest player
            if (closestPlayer) {
                const angle = Math.atan2(
                    monster.position.x - closestPlayer.position.x,
                    monster.position.z - closestPlayer.position.z
                );
                monster.rotation.y = angle;
            }
            
            // Update the monster's last update time
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
        
        this.monsters.clear();
        this.respawnTimers.clear();
    }
}

export default MonsterManager; 