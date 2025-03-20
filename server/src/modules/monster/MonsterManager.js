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
     * Check if a position is in the temple area
     * @param {Object} position - The position to check
     * @returns {boolean} - Whether the position is in the temple area
     */
    isInTemple(position) {
        // Temple dimensions - matching the client-side implementation
        // Add a small buffer around the temple to ensure the border is also protected
        const buffer = 2.5; // Increased buffer from 1.5 to 2.5 for better coverage
        
        // Base safe zone dimensions
        const baseHalfWidth = 15 + buffer; // 30/2 for base platform + buffer
        const crossVerticalHalfWidth = 4 + buffer; // 8/2 for vertical part + buffer
        const crossHorizontalHalfWidth = 12 + buffer; // 24/2 for horizontal part + buffer
        const crossVerticalHalfLength = 12 + buffer; // 24/2 for vertical part + buffer
        const crossHorizontalHalfLength = 4 + buffer; // 8/2 for horizontal part + buffer
        
        // Add a height check - temple protection should only extend to a reasonable height
        const maxHeight = 15; // Protection extends 15 units up from ground
        if (position.y > maxHeight) {
            return false; // Position is too high to be protected by temple
        }
        
        // Instead of adjusting position, expand the safe zone to better match the visual temple
        // First check the basic shape centered at origin
        const isInBasicZone = (
            // Base platform check
            (Math.abs(position.x) <= baseHalfWidth && 
             Math.abs(position.z) <= baseHalfWidth) ||
            
            // Cross vertical part check
            (Math.abs(position.x) <= crossVerticalHalfWidth && 
             Math.abs(position.z) <= crossVerticalHalfLength) ||
            
            // Cross horizontal part check
            (Math.abs(position.x) <= crossHorizontalHalfWidth && 
             Math.abs(position.z) <= crossHorizontalHalfLength)
        );
        
        // If in basic zone, return true
        if (isInBasicZone) {
            return true;
        }
        
        // Additional check for the northern section (z+) that needed the 2.5 offset
        // This adds extra protection to the north side without affecting other sides
        const northZ = position.z - 2.5; // Apply the 2.5 offset only to the north check
        
        const isInNorthZone = (
            // North base check
            (Math.abs(position.x) <= baseHalfWidth && 
             Math.abs(northZ) <= baseHalfWidth) ||
            
            // North cross vertical part check
            (Math.abs(position.x) <= crossVerticalHalfWidth && 
             Math.abs(northZ) <= crossVerticalHalfLength) ||
            
            // North cross horizontal part check
            (Math.abs(position.x) <= crossHorizontalHalfWidth && 
             Math.abs(northZ) <= crossHorizontalHalfLength)
        );
        
        return isInNorthZone;
    }
    
    /**
     * Initialize monsters in the game world
     */
    initializeMonsters() {
        // Define spawn positions away from temple, at safe distances from water edges
        const spawnPositions = [
            // North quadrant (safe from water)
            { x: 0, y: 0, z: 55 },    // Was 60, now 55
            { x: 20, y: 0, z: 50 },   // Was 60, now 50
            { x: -20, y: 0, z: 50 },  // Was 60, now 50
            { x: 35, y: 0, z: 45 },   // Was 40/50, now 35/45
            { x: -35, y: 0, z: 45 },  // Was -40/50, now -35/45
            
            // East quadrant (safe from water)
            { x: 55, y: 0, z: 0 },    // Was 60, now 55
            { x: 50, y: 0, z: 20 },   // Was 60, now 50
            { x: 50, y: 0, z: -20 },  // Was 60, now 50
            { x: 45, y: 0, z: 35 },   // Was 50/40, now 45/35
            { x: 45, y: 0, z: -35 },  // Was 50/-40, now 45/-35
            
            // South quadrant (safe from water)
            { x: 0, y: 0, z: -55 },   // Was -60, now -55
            { x: 20, y: 0, z: -50 },  // Was -60, now -50
            { x: -20, y: 0, z: -50 }, // Was -60, now -50
            { x: 35, y: 0, z: -45 },  // Was 40/-50, now 35/-45
            { x: -35, y: 0, z: -45 }, // Was -40/-50, now -35/-45
            
            // West quadrant (safe from water)
            { x: -55, y: 0, z: 0 },   // Was -60, now -55
            { x: -50, y: 0, z: 20 },  // Was -60, now -50
            { x: -50, y: 0, z: -20 }, // Was -60, now -50
            { x: -45, y: 0, z: 35 },  // Was -50/40, now -45/35
            { x: -45, y: 0, z: -35 }  // Was -50/-40, now -45/-35
        ];
        
        // Spawn monsters at each position
        spawnPositions.forEach(position => {
            this.spawnMonsterAtPosition('BASIC', position);
        });
        
        console.log(`Spawned ${spawnPositions.length} monsters around the map, safely away from water edges`);
    }
    
    /**
     * Get a random spawn position away from the temple
     * @returns {Object} A random position {x, y, z}
     */
    getRandomSpawnPosition() {
        const mapSize = 80; // Size of the playable map
        const minDistance = 25; // Minimum distance from the temple center
        
        let x, z;
        
        // Keep generating positions until we find one that's far enough from the temple
        do {
            // Generate random coordinates within the map
            x = (Math.random() * mapSize) - (mapSize / 2); // -40 to 40
            z = (Math.random() * mapSize) - (mapSize / 2); // -40 to 40
            
            // Check distance from temple center
            const distanceFromTemple = Math.sqrt(x * x + z * z);
            
            // Also check distance from the offset north point
            const northAdjustedZ = z - 2.5; // Apply the 2.5 offset to the north check
            const distanceFromNorthPoint = Math.sqrt(x * x + northAdjustedZ * northAdjustedZ);
            
            // If far enough from both temple points and not in temple, use this position
            if (distanceFromTemple >= minDistance && 
                distanceFromNorthPoint >= minDistance && 
                !this.isInTemple({x, y: 0, z})) {
                break;
            }
        } while (true);
        
        return { x, y: 0, z };
    }
    
    /**
     * Spawn a new monster of the specified type at the default position
     * @param {string} monsterType - The type of monster to spawn
     * @returns {Object} The spawned monster data
     */
    spawnMonster(monsterType) {
        const monsterConfig = GameConstants.MONSTER[monsterType];
        if (!monsterConfig) {
            console.error(`Unknown monster type: ${monsterType}`);
            return null;
        }
        
        // Use the new method with the default spawn position
        return this.spawnMonsterAtPosition(monsterType, { ...monsterConfig.SPAWN_POSITION });
    }
    
    /**
     * Spawn a monster at a specific position
     * @param {string} monsterType - The type of monster to spawn
     * @param {Object} position - The position to spawn the monster at
     * @returns {Object} The spawned monster data
     */
    spawnMonsterAtPosition(monsterType, position) {
        const monsterId = `monster-${uuidv4()}`;
        const monsterConfig = GameConstants.MONSTER[monsterType];
        
        if (!monsterConfig) {
            console.error(`Unknown monster type: ${monsterType}`);
            return null;
        }
        
        // Ensure position is valid and not in the temple
        if (this.isInTemple(position)) {
            // If the provided position is in temple, get a random position instead
            position = this.getRandomSpawnPosition();
            console.log(`Adjusted spawn position to ${JSON.stringify(position)} to avoid temple`);
        }
        
        const monster = {
            id: monsterId,
            type: monsterType,
            position: { ...position }, // Use the provided position
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
            isReturningToSpawn: false,
            // Add attack properties
            lastAttackTime: 0,
            isAttacking: false,
            attackAnimationEndTime: 0,
            // Store original spawn position for returning
            spawnPosition: { ...position }
        };
        
        // Add monster to the map
        this.monsters.set(monsterId, monster);
        console.log(`Spawned monster: ${monsterType} with ID ${monsterId} at position ${JSON.stringify(position)}`);
        
        return monster;
    }
    
    /**
     * Handle monster death
     * @param {string} killerId - ID of the player who killed the monster
     * @param {string} monsterId - ID of the monster that was killed
     * @returns {Object} The monster that was killed
     */
    handleMonsterDeath(killerId, monsterId) {
        const monster = this.monsters.get(monsterId);
        if (!monster) {
            console.warn(`Monster ${monsterId} not found for death handling`);
            return null;
        }
        
        console.log(`Monster ${monsterId} was killed by ${killerId}`);
        
        // Mark monster as dead
        monster.isAlive = false;
        monster.health = 0;
        
        // Grant experience to the killer if it's a player
        if (killerId && this.gameManager.playerManager) {
            // Grant experience to the player
            this.gameManager.grantExperience(killerId, monster.type);
        }
        
        // Notify all clients about the monster death
        if (this.gameManager && this.gameManager.io) {
            this.gameManager.io.emit('monster_death', {
                monsterId: monsterId,
                killerId: killerId,
                position: monster.position
            });
        }
        
        // Save original spawn position for reference
        const originalPosition = { ...monster.position };
        
        // Define water edge positions for respawning - keeping monsters away from temple
        const safeSpawnPositions = [
            // North region
            { x: 0, y: 0, z: 60 },    // Restored original value
            { x: 20, y: 0, z: 55 },   // Restored original value
            { x: -20, y: 0, z: 55 },  // Restored original value
            
            // East region
            { x: 60, y: 0, z: 0 },    // Restored original value
            { x: 55, y: 0, z: 20 },   // Restored original value
            { x: 55, y: 0, z: -20 },  // Restored original value
            
            // South region
            { x: 0, y: 0, z: -60 },   // Restored original value
            { x: 20, y: 0, z: -55 },  // Restored original value
            { x: -20, y: 0, z: -55 }, // Restored original value
            
            // West region
            { x: -60, y: 0, z: 0 },   // Restored original value
            { x: -55, y: 0, z: 20 },  // Restored original value
            { x: -55, y: 0, z: -20 }  // Restored original value
        ];
        
        // Schedule respawn with a random position from the safe positions
        const respawnTime = 30000; // Reduced from 60 seconds to 30 seconds for better gameplay
        
        console.log(`Monster ${monsterId} will be removed and a new one created in ${respawnTime / 1000} seconds`);
        
        // Clear any existing respawn timer
        if (this.respawnTimers.has(monsterId)) {
            clearTimeout(this.respawnTimers.get(monsterId));
        }
        
        // Set a new respawn timer
        const timerId = setTimeout(() => {
            // Remove the old monster completely
            this.monsters.delete(monsterId);
            
            // Choose a random position from safe positions
            const randomIndex = Math.floor(Math.random() * safeSpawnPositions.length);
            const newPosition = safeSpawnPositions[randomIndex];
            
            // Create randomness around the chosen position to avoid monsters stacking
            const randomOffset = {
                x: (Math.random() * 6) - 3, // ±3 units 
                z: (Math.random() * 6) - 3  // ±3 units
            };
            
            // Calculate the final position
            let finalPosition = {
                x: newPosition.x + randomOffset.x,
                y: 0,
                z: newPosition.z + randomOffset.z
            };
            
            // Double-check that the position is not in the temple
            if (this.isInTemple(finalPosition)) {
                // If somehow in temple, move it further away
                const distanceFromCenter = Math.sqrt(finalPosition.x * finalPosition.x + finalPosition.z * finalPosition.z);
                if (distanceFromCenter < 30) {
                    // Scale the position outward
                    const scale = 40 / distanceFromCenter;
                    finalPosition.x *= scale;
                    finalPosition.z *= scale;
                } else {
                    // Use a completely random position as fallback
                    const randomPos = this.getRandomSpawnPosition();
                    finalPosition.x = randomPos.x;
                    finalPosition.z = randomPos.z;
                }
            }
            
            // Create an entirely new monster with a new ID
            const newMonsterId = `monster-${this.generateUUID()}`;
            
            // Create new monster with same type but at new position
            const newMonster = {
                id: newMonsterId,
                type: monster.type,
                isAlive: true,
                health: GameConstants.MONSTER[monster.type].MAX_HEALTH,
                maxHealth: GameConstants.MONSTER[monster.type].MAX_HEALTH,
                position: finalPosition,
                spawnPosition: finalPosition, // Set new spawn position for return-to-spawn behavior
                rotation: { x: 0, y: Math.random() * Math.PI * 2, z: 0 },
                targetPlayerId: null,
                isReturningToSpawn: false,
                isAttacking: false,
                lastAttackTime: 0,
                lastMoveTime: Date.now(),
                wanderAngle: Math.random() * Math.PI * 2,
                wanderTimer: 0,
                wanderInterval: 2000 + Math.random() * 3000
            };
            
            // Add the new monster to our collection
            this.monsters.set(newMonsterId, newMonster);
            
            console.log(`New monster ${newMonsterId} created at position: x=${finalPosition.x.toFixed(2)}, z=${finalPosition.z.toFixed(2)}`);
            
            // Notify all clients about the new monster
            if (this.gameManager && this.gameManager.io) {
                this.gameManager.io.emit('monster_respawn', {
                    monster: {
                        id: newMonsterId, // Note this is a new ID
                        type: newMonster.type,
                        position: finalPosition,
                        health: newMonster.health,
                        maxHealth: newMonster.maxHealth,
                        isAlive: true
                    }
                });
            }
            
            // Remove from respawn timers
            this.respawnTimers.delete(monsterId);
        }, respawnTime);
        
        // Store the timer ID for cleanup
        this.respawnTimers.set(monsterId, timerId);
        
        return monster;
    }
    
    /**
     * Get all monsters as array for network sync
     * @returns {Array} Array of monster data
     */
    getAllMonsters() {
        // Filter out any monsters that are:
        // 1. Explicitly marked as dead
        // 2. Have health <= 0
        return Array.from(this.monsters.values())
            .filter(monster => {
                // First check explicit alive flag
                if (monster.isAlive === false) {
                    return false;
                }
                
                // Then check health - any monster with 0 or negative health is dead
                if (monster.health !== undefined && monster.health <= 0) {
                    // Correct inconsistent state - monster with 0 health should be marked dead
                    monster.isAlive = false;
                    console.log(`Corrected inconsistent state for monster ${monster.id}: had 0 health but was marked alive`);
                    return false;
                }
                
                // Monster is alive
                return true;
            });
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
     * Check if a monster would collide with other monsters at the given position
     * @param {string} currentMonsterId - The ID of the monster being checked (to exclude from collision check)
     * @param {Object} position - The position to check for collisions
     * @returns {boolean} - True if there would be a collision, false otherwise
     */
    checkMonsterCollision(currentMonsterId, position) {
        for (const [monsterId, monster] of this.monsters.entries()) {
            // Skip checking collision with self or dead monsters
            if (monsterId === currentMonsterId || !monster.isAlive) {
                continue;
            }
            
            // Calculate distance between monsters
            const dx = position.x - monster.position.x;
            const dz = position.z - monster.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Get collision radius from monster config
            const monsterConfig = GameConstants.MONSTER[monster.type];
            const collisionRadius = monsterConfig.COLLISION_RADIUS;
            
            // Combined collision radius (using the monster's own radius plus the other monster's radius)
            const combinedRadius = collisionRadius * 2;
            
            // Check if monsters would collide
            if (distance < combinedRadius) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Resolve collision by pushing monster away from the collision point
     * @param {string} monsterId - The ID of the monster to resolve collision for
     * @param {Object} newPosition - The attempted new position
     * @param {Object} currentPosition - The current position
     * @returns {Object} - The resolved position after collision handling
     */
    resolveMonsterCollision(monsterId, newPosition, currentPosition) {
        // Find which monster(s) we're colliding with
        let closestCollidingMonster = null;
        let closestDistance = Infinity;
        
        for (const [otherId, monster] of this.monsters.entries()) {
            // Skip checking collision with self or dead monsters
            if (otherId === monsterId || !monster.isAlive) {
                continue;
            }
            
            // Calculate distance between monsters
            const dx = newPosition.x - monster.position.x;
            const dz = newPosition.z - monster.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Get collision radius from monster config
            const monsterConfig = GameConstants.MONSTER[monster.type];
            const collisionRadius = monsterConfig.COLLISION_RADIUS;
            
            // Combined collision radius
            const combinedRadius = collisionRadius * 2;
            
            // Check if this is the closest collision
            if (distance < combinedRadius && distance < closestDistance) {
                closestCollidingMonster = monster;
                closestDistance = distance;
            }
        }
        
        // If no collision found, return the new position
        if (!closestCollidingMonster) {
            return newPosition;
        }
        
        // Get collision radius for calculation
        const monsterConfig = GameConstants.MONSTER[this.monsters.get(monsterId).type];
        const collisionRadius = monsterConfig.COLLISION_RADIUS;
        
        // Combined collision radius
        const combinedRadius = collisionRadius * 2;
        
        // Calculate push vector 
        const dx = newPosition.x - closestCollidingMonster.position.x;
        const dz = newPosition.z - closestCollidingMonster.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        // Normalize direction vector
        const normalizedDx = dx / distance;
        const normalizedDz = dz / distance;
        
        // Calculate the resolved position by placing the monster at the edge of the combined collision radius
        const resolvedX = closestCollidingMonster.position.x + normalizedDx * (combinedRadius + 0.1); // Add small buffer
        const resolvedZ = closestCollidingMonster.position.z + normalizedDz * (combinedRadius + 0.1);
        
        return {
            x: resolvedX,
            y: newPosition.y,
            z: resolvedZ
        };
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
            const attackRange = monsterConfig.ATTACK_RANGE;
            const deltaTime = (currentTime - monster.lastMoveTime) / 1000; // Convert to seconds
            
            // Emergency check - if monster is stuck in temple for some reason, forcefully teleport it out
            if (this.isInTemple(monster.position)) {
                console.log(`Monster ${monster.id} found in temple area - force teleporting to safe location`);
                
                // Use spawnPosition if available, or get a random position far from temple
                if (monster.spawnPosition && !this.isInTemple(monster.spawnPosition)) {
                    monster.position = { ...monster.spawnPosition };
                } else {
                    // Find a safe position away from temple
                    const safePosition = this.getRandomSpawnPosition();
                    monster.position = safePosition;
                    monster.spawnPosition = { ...safePosition }; // Set as new spawn point
                }
                
                monster.isReturningToSpawn = false;
                monster.targetPlayerId = null;
                monster.wanderAngle = Math.random() * Math.PI * 2;
                
                // Skip rest of update for this monster
                monster.lastMoveTime = currentTime;
                monster.lastUpdateTime = currentTime;
                return;
            }
            
            // Original update code continues...
            // Check if monster is currently in the temple area - if so, force it to return to spawn
            if (this.isInTemple(monster.position)) {
                monster.isReturningToSpawn = true;
                monster.targetPlayerId = null;
            }
            
            // Reset isAttacking flag if attack animation is complete
            if (monster.isAttacking && currentTime >= monster.attackAnimationEndTime) {
                monster.isAttacking = false;
            }
            
            // Skip movement and new targeting if monster is currently playing attack animation
            if (monster.isAttacking && currentTime < monster.attackAnimationEndTime) {
                return;
            }
            
            // Get player monster is currently targeting (if any)
            let targetPlayer = null;
            if (monster.targetPlayerId) {
                targetPlayer = players[monster.targetPlayerId];
                
                // Comprehensive target check - clear target in any of these cases:
                // 1. Player no longer exists
                // 2. Player is dead (isDead flag)
                // 3. Player has no health
                // 4. Player is invisible
                // 5. Player is in the temple
                if (!targetPlayer || 
                    targetPlayer.isDead || 
                    targetPlayer.life <= 0 || 
                    targetPlayer.health <= 0 ||
                    targetPlayer.isInvulnerable ||
                    targetPlayer.visible === false) {
                    console.log(`Monster ${monster.id} cleared target ${monster.targetPlayerId} (player dead, invisible, or missing)`);
                    monster.targetPlayerId = null;
                    targetPlayer = null;
                    monster.isReturningToSpawn = true;
                } else if (targetPlayer.position && this.isInTemple(targetPlayer.position)) {
                    // Check if target player is in temple area - if so, clear target
                    console.log(`Monster ${monster.id} cleared target ${monster.targetPlayerId} (player in temple)`);
                    monster.targetPlayerId = null;
                    targetPlayer = null;
                    // Set leashing flag to return to spawn
                    monster.isReturningToSpawn = true;
                } else {
                    // Check if target player has run away beyond aggro radius
                    const dx = targetPlayer.position.x - monster.position.x;
                    const dz = targetPlayer.position.z - monster.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    
                    if (distance > aggroRadius * 1.5) { // 1.5x aggro radius for leashing
                        console.log(`Monster ${monster.id} cleared target ${monster.targetPlayerId} (player out of aggro range)`);
                        monster.targetPlayerId = null;
                        targetPlayer = null;
                        // Set leashing flag to return to spawn
                        monster.isReturningToSpawn = true;
                    } else if (distance <= attackRange && !monster.isAttacking) {
                        // Player is in attack range - attack them
                        this.attackPlayer(monster.id, targetPlayer.id, playerManager);
                    }
                }
            }
            
            // Find a new target if we don't have one
            if (!targetPlayer && !monster.isReturningToSpawn) {
                // Calculate closest player
                let closestPlayer = null;
                let closestDistance = Infinity;
                
                for (const [playerId, player] of Object.entries(players)) {
                    // Skip players that are:
                    // 1. Dead or have no health
                    // 2. In the temple area
                    // 3. Invulnerable
                    // 4. Invisible
                    if (player.health <= 0 || 
                        player.life <= 0 || 
                        player.isDead || 
                        player.isInvulnerable || 
                        player.visible === false) {
                        continue;
                    }
                    
                    // Skip players in temple area
                    if (player.position && this.isInTemple(player.position)) {
                        continue;
                    }
                    
                    const dx = player.position.x - monster.position.x;
                    const dz = player.position.z - monster.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    
                    if (distance < aggroRadius && distance < closestDistance) {
                        closestPlayer = player;
                        closestDistance = distance;
                    }
                }
                
                if (closestPlayer) {
                    monster.targetPlayerId = closestPlayer.id;
                    targetPlayer = closestPlayer;
                    console.log(`Monster ${monster.id} acquired new target: ${closestPlayer.id}`);
                }
            }
            
            // Calculate distance to spawn point - use monster's own spawn position if available
            const spawnPosition = monster.spawnPosition || monsterConfig.SPAWN_POSITION;
            const dxSpawn = spawnPosition.x - monster.position.x;
            const dzSpawn = spawnPosition.z - monster.position.z;
            const distanceToSpawn = Math.sqrt(dxSpawn * dxSpawn + dzSpawn * dzSpawn);
            
            // Check if monster is too far from spawn point
            const maxRoamDistance = monsterConfig.MAX_FOLLOW_DISTANCE || 50; // Increased from 30 to 50
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
                    
                    // Calculate new position
                    const newX = monster.position.x + normalizedDx * moveStep;
                    const newZ = monster.position.z + normalizedDz * moveStep;
                    
                    // Check if new position would enter temple, if so, don't move
                    const newPosition = { x: newX, y: monster.position.y, z: newZ };
                    
                    // First check temple collision
                    if (!this.isInTemple(newPosition)) {
                        // Then check collision with other monsters
                        if (!this.checkMonsterCollision(monster.id, newPosition)) {
                            // Only move if no collisions
                            monster.position.x = newX;
                            monster.position.z = newZ;
                        } else {
                            // Resolve collision and apply the resolved position
                            const resolvedPosition = this.resolveMonsterCollision(monster.id, newPosition, monster.position);
                            monster.position.x = resolvedPosition.x;
                            monster.position.z = resolvedPosition.z;
                        }
                    } else {
                        // Temple collision handling (existing code)
                        // If new position would be in temple, try circling around the temple
                        // Calculate perpendicular components to create a circling effect
                        const perpX = -normalizedDz;
                        const perpZ = normalizedDx;
                        
                        // Try moving along the perpendicular direction
                        const alternativeX = monster.position.x + perpX * moveStep;
                        const alternativeZ = monster.position.z + perpZ * moveStep;
                        
                        if (!this.isInTemple({ x: alternativeX, y: monster.position.y, z: alternativeZ })) {
                            monster.position.x = alternativeX;
                            monster.position.z = alternativeZ;
                        } else {
                            // If that doesn't work, try the opposite direction
                            const alternativeX2 = monster.position.x - perpX * moveStep;
                            const alternativeZ2 = monster.position.z - perpZ * moveStep;
                            
                            if (!this.isInTemple({ x: alternativeX2, y: monster.position.y, z: alternativeZ2 })) {
                                monster.position.x = alternativeX2;
                                monster.position.z = alternativeZ2;
                            }
                            // If all options fail, monster stays in place
                        }
                    }
                }
            } else if (monster.isReturningToSpawn) {
                // Return to spawn behavior - use monster's own spawn position if available
                const spawnPosition = monster.spawnPosition || monsterConfig.SPAWN_POSITION;
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
                    
                    // Calculate new position
                    const newX = monster.position.x + normalizedDx * moveStep;
                    const newZ = monster.position.z + normalizedDz * moveStep;
                    
                    // Check for both temple and monster collisions
                    const newPosition = { x: newX, y: monster.position.y, z: newZ };
                    if (!this.isInTemple(newPosition)) {
                        // Check for monster collisions
                        if (!this.checkMonsterCollision(monster.id, newPosition)) {
                            // Only move if no collisions
                            monster.position.x = newX;
                            monster.position.z = newZ;
                        } else {
                            // Resolve collision and apply the resolved position
                            const resolvedPosition = this.resolveMonsterCollision(monster.id, newPosition, monster.position);
                            monster.position.x = resolvedPosition.x;
                            monster.position.z = resolvedPosition.z;
                        }
                    } else {
                        // Temple collision handling (existing code)
                        // If new position would be in temple, try circling around the temple
                        // Calculate perpendicular components to create a circling effect
                        const perpX = -normalizedDz;
                        const perpZ = normalizedDx;
                        
                        // Try moving along the perpendicular direction
                        const alternativeX = monster.position.x + perpX * moveStep;
                        const alternativeZ = monster.position.z + perpZ * moveStep;
                        
                        if (!this.isInTemple({ x: alternativeX, y: monster.position.y, z: alternativeZ })) {
                            monster.position.x = alternativeX;
                            monster.position.z = alternativeZ;
                        } else {
                            // If that doesn't work, try the opposite direction
                            const alternativeX2 = monster.position.x - perpX * moveStep;
                            const alternativeZ2 = monster.position.z - perpZ * moveStep;
                            
                            if (!this.isInTemple({ x: alternativeX2, y: monster.position.y, z: alternativeZ2 })) {
                                monster.position.x = alternativeX2;
                                monster.position.z = alternativeZ2;
                            }
                            // If all options fail, monster stays in place
                        }
                    }
                }
            } else {
                // Wandering behavior
                monster.wanderTimer += deltaTime * 1000; // Convert to milliseconds
                
                if (monster.wanderTimer >= monster.wanderInterval) {
                    // Pick a new random direction every wanderInterval
                    monster.wanderAngle = Math.random() * Math.PI * 2;
                    monster.wanderTimer = 0;
                    monster.wanderInterval = 2000 + Math.random() * 5000; // 2-7 seconds
                }
                
                // Calculate movement direction
                const moveStep = (movementSpeed * 0.7) * deltaTime; // Faster when wandering (increased from 0.5 to 0.7)
                
                // Calculate new position
                const newX = monster.position.x + Math.sin(monster.wanderAngle) * moveStep;
                const newZ = monster.position.z + Math.cos(monster.wanderAngle) * moveStep;
                
                // Check for both temple and monster collisions
                const newPosition = { x: newX, y: monster.position.y, z: newZ };
                if (!this.isInTemple(newPosition)) {
                    // Check for monster collisions
                    if (!this.checkMonsterCollision(monster.id, newPosition)) {
                        // Only move if no collisions
                        monster.position.x = newX;
                        monster.position.z = newZ;
                    } else {
                        // Resolve collision and apply the resolved position 
                        const resolvedPosition = this.resolveMonsterCollision(monster.id, newPosition, monster.position);
                        monster.position.x = resolvedPosition.x;
                        monster.position.z = resolvedPosition.z;
                        
                        // Pick a new direction since we hit something
                        monster.wanderAngle = (monster.wanderAngle + Math.PI/2 + (Math.random() * Math.PI)) % (2 * Math.PI);
                        monster.wanderTimer = monster.wanderInterval; // Force direction change next update
                    }
                } else {
                    // Temple collision handling (existing code)
                    monster.wanderAngle = (monster.wanderAngle + Math.PI) % (2 * Math.PI); // Turn 180 degrees
                    monster.wanderTimer = monster.wanderInterval; // Force direction change next update
                }
                
                // Update rotation to match movement direction
                monster.rotation.y = monster.wanderAngle;
            }
            
            // Update the monster's last move time
            monster.lastMoveTime = currentTime;
            monster.lastUpdateTime = currentTime;
        });
    }
    
    /**
     * Make a monster attack a player
     * @param {string} monsterId - ID of the attacking monster
     * @param {string} playerId - ID of the player to attack
     * @param {Object} playerManager - Reference to the player manager to get the player
     */
    attackPlayer(monsterId, playerId, playerManager) {
        const monster = this.monsters.get(monsterId);
        if (!monster) return;
        
        const player = playerManager.getPlayer(playerId);
        if (!player) return;
        
        // Comprehensive check to prevent attacks on:
        // 1. Dead players (isDead flag)
        // 2. Players with no health
        // 3. Invulnerable players
        // 4. Invisible players
        // 5. Players in temple
        if (player.isDead || 
            player.isInvulnerable || 
            player.life <= 0 || 
            player.health <= 0 || 
            player.visible === false) {
            console.log(`Monster ${monsterId} cannot attack player ${playerId} (player is dead, invisible, or invulnerable)`);
            
            // Clear the monster's target since this player shouldn't be attacked
            monster.targetPlayerId = null;
            monster.isReturningToSpawn = true;
            return;
        }
        
        // Check if player is in temple area (safe zone)
        if (player.position && this.isInTemple(player.position)) {
            console.log(`Monster ${monsterId} cannot attack player ${playerId} (player is in temple)`);
            monster.targetPlayerId = null;
            monster.isReturningToSpawn = true;
            return;
        }
        
        // Check if monster is in attack range
        const dx = player.position.x - monster.position.x;
        const dz = player.position.z - monster.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        const monsterConfig = GameConstants.MONSTER[monster.type];
        const attackRange = monsterConfig.ATTACK_RANGE;
        
        if (distance > attackRange) {
            return; // Too far to attack
        }
        
        // Check if monster is on cooldown
        const currentTime = Date.now();
        if (monster.lastAttackTime && currentTime - monster.lastAttackTime < monsterConfig.ATTACK_SPEED) {
            return; // Still on cooldown
        }
        
        // Set attack animation
        monster.isAttacking = true;
        monster.attackAnimationEndTime = currentTime + monsterConfig.ATTACK_ANIMATION_TIME;
        monster.lastAttackTime = currentTime;
        
        // Calculate damage
        const damageAmount = monsterConfig.ATTACK_DAMAGE;
        
        // Apply player's level-based damage reduction
        const playerLevel = player.level || 1;
        const maxDamageReduction = 0.3; // Cap at 30% damage reduction
        const damageReduction = Math.min(
            maxDamageReduction, 
            (playerLevel - 1) * GameConstants.LEVEL_REWARDS.DAMAGE_REDUCTION_PER_LEVEL
        );
        
        // Calculate final damage with reduction
        const finalDamage = Math.floor(damageAmount * (1 - damageReduction));
        
        // Apply damage to player
        player.life -= finalDamage;
        if (player.life < 0) player.life = 0;
        
        // Notify client
        if (this.gameManager && this.gameManager.io) {
            this.gameManager.io.to(playerId).emit('monsterDamage', {
                targetId: playerId,
                monsterId: monsterId,
                damage: finalDamage,
                monsterType: monster.type
            });
            
            // Broadcast health update to all players
            this.gameManager.io.emit('lifeUpdate', {
                id: playerId,
                life: player.life,
                maxLife: player.maxLife || 100,
                timestamp: currentTime
            });
        }
        
        console.log(`Monster ${monsterId} attacked player ${playerId} for ${finalDamage} damage (original: ${damageAmount}, reduction: ${Math.round(damageReduction * 100)}%)`);
        
        // Check if player died
        if (player.life <= 0 && !player.isDead) {
            // Handle player death through player manager
            playerManager.handlePlayerDeath(playerId, monsterId);
        }
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
    
    /**
     * Generate a new UUID for monster IDs
     * Using uuid v4 for random IDs
     * @private
     * @returns {string} A randomly generated UUID
     */
    generateUUID() {
        return uuidv4();
    }
}

export default MonsterManager; 