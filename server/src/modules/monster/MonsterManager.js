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
        // Create monsters at varied positions across the map
        this.spawnMonsterAtPosition('BASIC', { x: 30, y: 0, z: 30 });
        this.spawnMonsterAtPosition('BASIC', { x: -30, y: 0, z: 30 });
        this.spawnMonsterAtPosition('BASIC', { x: 30, y: 0, z: -30 });
        this.spawnMonsterAtPosition('BASIC', { x: -30, y: 0, z: -30 });
        this.spawnMonsterAtPosition('BASIC', { x: 0, y: 0, z: 40 });
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
        
        // Schedule respawn with random time between base time and 2x base time
        const baseRespawnTime = GameConstants.MONSTER[monster.type].RESPAWN_TIME || 10000;
        const respawnTime = baseRespawnTime + Math.random() * baseRespawnTime; // 10-20 seconds
        
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
        // Get a random position for the respawn
        const spawnPosition = this.getRandomSpawnPosition();
        
        // Remove the old monster
        this.monsters.delete(monsterId);
        this.respawnTimers.delete(monsterId);
        
        // Spawn a new monster at the random position
        this.spawnMonsterAtPosition(monsterType, spawnPosition);
        
        console.log(`Monster ${monsterId} has been respawned at position ${JSON.stringify(spawnPosition)}`);
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
            const attackRange = monsterConfig.ATTACK_RANGE;
            const deltaTime = (currentTime - monster.lastMoveTime) / 1000; // Convert to seconds
            
            // Check if monster is currently in the temple area - if so, force it to return to spawn
            if (this.isInTemple(monster.position)) {
                monster.isReturningToSpawn = true;
                monster.targetPlayerId = null;
            }
            
            // Skip movement and new targeting if monster is currently playing attack animation
            if (monster.isAttacking && currentTime < monster.attackAnimationEndTime) {
                return;
            }
            
            // Get player monster is currently targeting (if any)
            let targetPlayer = null;
            if (monster.targetPlayerId) {
                targetPlayer = players[monster.targetPlayerId];
                
                // If target player is no longer in the game or is dead, clear target
                if (!targetPlayer || targetPlayer.health <= 0 || targetPlayer.isDead) {
                    monster.targetPlayerId = null;
                    targetPlayer = null;
                } else {
                    // Check if target player is in temple area - if so, clear target
                    if (targetPlayer.position && this.isInTemple(targetPlayer.position)) {
                        monster.targetPlayerId = null;
                        targetPlayer = null;
                        // Set leashing flag to return to spawn
                        monster.isReturningToSpawn = true;
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
                        } else if (distance <= attackRange) {
                            // Player is in attack range - attack them!
                            this.attackPlayer(monster.id, targetPlayer.id, playerManager);
                        }
                    }
                }
            }
            
            // If no target player, find closest player within aggro radius
            if (!targetPlayer && !monster.isReturningToSpawn) {
                let closestPlayer = null;
                let closestDistance = Infinity;
                
                Object.values(players).forEach(player => {
                    // Skip dead players
                    if (player.health <= 0 || player.isDead) return;
                    // Skip players in temple area
                    if (player.position && this.isInTemple(player.position)) return;
                    
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
                    
                    // Check if player is already in attack range
                    const dx = targetPlayer.position.x - monster.position.x;
                    const dz = targetPlayer.position.z - monster.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    
                    if (distance <= attackRange) {
                        // Player is in attack range - attack them!
                        this.attackPlayer(monster.id, targetPlayer.id, playerManager);
                    }
                }
            }
            // Even if returning to spawn, check for nearby players to engage
            else if (!targetPlayer && monster.isReturningToSpawn) {
                let closestPlayer = null;
                let closestDistance = Infinity;
                
                Object.values(players).forEach(player => {
                    // Skip dead players
                    if (player.health <= 0 || player.isDead) return;
                    // Skip players in temple area
                    if (player.position && this.isInTemple(player.position)) return;
                    
                    const dx = player.position.x - monster.position.x;
                    const dz = player.position.z - monster.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    
                    // Use a slightly smaller aggro radius when returning to prevent constant back-and-forth
                    const returningAggroRadius = aggroRadius * 0.8;
                    if (distance < returningAggroRadius && distance < closestDistance) {
                        closestPlayer = player;
                        closestDistance = distance;
                    }
                });
                
                // Set new target player if found
                if (closestPlayer) {
                    targetPlayer = closestPlayer;
                    monster.targetPlayerId = closestPlayer.id;
                    monster.isReturningToSpawn = false;
                    
                    // Check if player is already in attack range
                    const dx = targetPlayer.position.x - monster.position.x;
                    const dz = targetPlayer.position.z - monster.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    
                    if (distance <= attackRange) {
                        // Player is in attack range - attack them!
                        this.attackPlayer(monster.id, targetPlayer.id, playerManager);
                    }
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
                    if (!this.isInTemple(newPosition)) {
                        // Only move if new position is not inside the temple
                        monster.position.x = newX;
                        monster.position.z = newZ;
                    } else {
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
                    
                    // Check if new position would enter temple, if so, don't move to that exact position but try to go around
                    const newPosition = { x: newX, z: newZ };
                    if (!this.isInTemple(newPosition)) {
                        // Only move if new position is not inside the temple
                        monster.position.x = newX;
                        monster.position.z = newZ;
                    } else {
                        // Try to go around the temple by adding a perpendicular component
                        // This creates a slight tangential movement to avoid getting stuck
                        const perpX = -normalizedDz;
                        const perpZ = normalizedDx;
                        
                        // Try moving along the perpendicular direction
                        const alternativeX = monster.position.x + perpX * moveStep;
                        const alternativeZ = monster.position.z + perpZ * moveStep;
                        
                        if (!this.isInTemple({ x: alternativeX, y: monster.position.y, z: alternativeZ })) {
                            monster.position.x = alternativeX;
                            monster.position.z = alternativeZ;
                        } else {
                            // If that also doesn't work, try the opposite perpendicular direction
                            const alternativeX2 = monster.position.x - perpX * moveStep;
                            const alternativeZ2 = monster.position.z - perpZ * moveStep;
                            
                            if (!this.isInTemple({ x: alternativeX2, y: monster.position.y, z: alternativeZ2 })) {
                                monster.position.x = alternativeX2;
                                monster.position.z = alternativeZ2;
                            }
                            // If nothing works, monster stays in place for this update
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
                
                // Check if new position would enter temple, if so, don't move and pick a new direction
                const newPosition = { x: newX, y: monster.position.y, z: newZ };
                if (!this.isInTemple(newPosition)) {
                    // Only move if new position is not inside the temple
                    monster.position.x = newX;
                    monster.position.z = newZ;
                } else {
                    // Pick a new random direction if we're about to enter the temple
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
     * Attack a player
     * @param {string} monsterId - ID of the monster attacking
     * @param {string} playerId - ID of the player being attacked
     * @param {Object} playerManager - Reference to the player manager
     */
    attackPlayer(monsterId, playerId, playerManager) {
        const monster = this.monsters.get(monsterId);
        if (!monster || !monster.isAlive) return;
        
        const player = playerManager.getPlayer(playerId);
        if (!player) return;
        
        // Check if player is in temple area - if so, don't attack
        if (player.position && this.isInTemple(player.position)) {
            // Stop targeting this player since they're in a safe zone
            monster.targetPlayerId = null;
            return;
        }
        
        const monsterConfig = GameConstants.MONSTER[monster.type];
        const currentTime = Date.now();
        
        // Make sure we're not attacking too frequently
        if (currentTime - monster.lastAttackTime < monsterConfig.ATTACK_SPEED) return;
        
        // Record that we're starting an attack
        monster.isAttacking = true;
        monster.lastAttackTime = currentTime;
        monster.attackAnimationEndTime = currentTime + monsterConfig.ATTACK_ANIMATION_TIME;
        
        // Calculate damage
        const damage = monsterConfig.ATTACK_DAMAGE;
        
        // Apply damage to player after the animation delay (simulate hit connecting)
        setTimeout(() => {
            // Verify player is still valid
            const updatedPlayer = playerManager.getPlayer(playerId);
            if (!updatedPlayer) return;
            
            // Verify monster is still valid
            const updatedMonster = this.monsters.get(monsterId);
            if (!updatedMonster || !updatedMonster.isAlive) return;
            
            // Check if player is now in temple area - if so, don't apply damage
            if (updatedPlayer.position && this.isInTemple(updatedPlayer.position)) {
                // Player moved into temple during attack animation, abort attack
                updatedMonster.targetPlayerId = null;
                updatedMonster.isAttacking = false;
                return;
            }
            
            // Apply damage to player
            const previousLife = updatedPlayer.life || 100;
            updatedPlayer.life = Math.max(0, previousLife - damage);
            
            console.log(`Monster ${monsterId} dealt ${damage} damage to player ${playerId}. Health: ${updatedPlayer.life}/${updatedPlayer.maxLife || 100}`);
            
            // Emit damage event to player
            this.gameManager.io.to(playerId).emit('monsterDamage', {
                monsterId: monsterId,
                damage: damage,
                health: updatedPlayer.life,
                maxHealth: updatedPlayer.maxLife || 100
            });
            
            // Check if player died
            if (updatedPlayer.life <= 0) {
                console.log(`Player ${playerId} was killed by monster ${monsterId}`);
                
                // Emit death event to player
                this.gameManager.io.to(playerId).emit('playerDied', {
                    killerId: monsterId,
                    killerType: 'monster'
                });
                
                // Handle player death on server
                playerManager.handlePlayerDeath(playerId, monsterId);
                
                // Monster stops attacking this player
                updatedMonster.targetPlayerId = null;
            }
            
            // Broadcast damage effect to all players
            this.gameManager.io.emit('damageEffect', {
                sourceId: monsterId,
                sourceType: 'monster',
                targetId: playerId,
                damage: damage,
                skillName: 'monster_attack',
                isCritical: false
            });
            
            // Broadcast health update to ALL players
            this.gameManager.io.emit('lifeUpdate', {
                id: playerId,
                life: updatedPlayer.life,
                maxLife: updatedPlayer.maxLife || 100,
                timestamp: Date.now(),
                final: true
            });
            
            // Attack animation is done
            updatedMonster.isAttacking = false;
        }, monsterConfig.ATTACK_ANIMATION_TIME);
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