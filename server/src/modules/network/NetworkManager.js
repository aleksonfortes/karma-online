/**
 * NetworkManager.js - Server-side network management
 * 
 * Handles socket connections, message validation, and rate limiting
 */
import { Server } from 'socket.io';
import GameConstants from '../../config/GameConstants.js';

export class NetworkManager {
    constructor(httpServer) {
        if (!httpServer) {
            throw new Error('HTTP server is required for NetworkManager');
        }

        this.io = new Server(httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });

        this.gameManager = null;
        this.playerManager = null;
        this.lastUpdateTime = new Map(); // For rate limiting movement
        this.skillAttempts = new Map(); // For rate limiting skill usage
        this.securityLogs = [];
        this.sockets = new Map();
        this._lastLogs = {};
        
        // No initialization here - will be done in setGameManager
    }
    
    /**
     * Set the game manager reference and initialize socket handlers
     */
    setGameManager(gameManager) {
        this.gameManager = gameManager;
        this.playerManager = this.gameManager.playerManager;
        
        this.setupSocketHandlers();
        this.initialize();
    }
    
    /**
     * Set up socket event handlers
     */
    setupSocketHandlers() {
        console.log('NetworkManager: Setting up socket handlers');
        
        this.io.on('connection', (socket) => {
            // Create new player through the player manager
            const player = this.playerManager.addPlayer(socket.id);
            
            // Log player connection with total count
            console.log(`Player connected: ${socket.id} (Total Players: ${this.playerManager.getPlayerCount()})`);
            
            // Store the socket
            this.sockets.set(socket.id, { statsInterval: null });
            
            // Send current game state to new player including NPCs
            socket.emit('initGameState', {
                players: this.playerManager.getAllPlayers(),
                npcs: this.gameManager.getAllNPCs(),
                serverTime: Date.now()
            });
            
            // Broadcast new player to others
            this.io.emit('newPlayer', player);

            // Handle player movement with rate limiting and validation
            socket.on('playerMovement', (data) => {
                if (!this.validateSession(socket.id)) {
                    return;
                }
                if (!this.rateLimitMovement(socket.id)) {
                    return;
                }
                
                // Validate movement data
                if (!this.validateMovementData(data)) {
                    this.logSecurityEvent(`Invalid movement data from player ${socket.id}`);
                    return;
                }
                
                // Create a clean copy with only the fields we need
                const sanitizedData = {
                    position: {
                        x: Number(data.position.x),
                        y: Number(data.position.y),
                        z: Number(data.position.z)
                    },
                    rotation: {
                        y: Number(data.rotation.y || 0)
                    },
                    path: data.path || null,
                    karma: Number(data.karma || 50),
                    maxKarma: Number(data.maxKarma || 100),
                    mana: Number(data.mana || 100),
                    maxMana: Number(data.maxMana || 100)
                };
                
                // Update player through game manager
                const success = this.gameManager.updatePlayerMovement(socket.id, sanitizedData);
                if (success) {
                    // Get updated player
                    const player = this.playerManager.getPlayer(socket.id);
                    
                    // Broadcast movement to other players
                    this.io.emit('playerMoved', {
                        id: socket.id,
                        position: sanitizedData.position,
                        rotation: sanitizedData.rotation,
                        path: sanitizedData.path,
                        karma: sanitizedData.karma,
                        maxKarma: sanitizedData.maxKarma,
                        life: player.life,
                        maxLife: player.maxLife,
                        mana: sanitizedData.mana,
                        maxMana: sanitizedData.maxMana
                    });
                    
                    this.lastUpdateTime.set(socket.id, Date.now());
                }
            });
            
            // Handle NPC interaction requests
            socket.on('npcInteraction', (data) => {
                if (!this.validateSession(socket.id)) {
                    return;
                }
                
                // Validate NPC ID
                if (!data || !data.npcId) {
                    this.logSecurityEvent(`Invalid NPC interaction data from player ${socket.id}`);
                    return;
                }
                
                // Process interaction through game manager
                const interactionResult = this.gameManager.handleNPCInteraction(socket.id, data.npcId);
                if (interactionResult) {
                    // Send interaction result back to the requesting player
                    socket.emit('npcInteractionResult', interactionResult);
                }
            });
            
            // Handle path selection
            socket.on('choosePath', (data) => {
                console.log(`Player ${socket.id} is choosing path: ${data?.path}`);
                
                // Validate path data
                if (!data || !data.path || (data.path !== 'light' && data.path !== 'dark')) {
                    this.logSecurityEvent(`Invalid path selection data from player ${socket.id}`);
                    socket.emit('pathSelectionResult', {
                        success: false,
                        message: 'Invalid path selection'
                    });
                    return;
                }
                
                // Get the player
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    socket.emit('pathSelectionResult', {
                        success: false,
                        message: 'Player not found'
                    });
                    return;
                }
                
                // Check if player has already chosen a path
                if (player.path) {
                    // Player already has a path, reject the request
                    socket.emit('pathSelectionResult', {
                        success: false,
                        message: `You have already chosen the path of ${player.path}. This choice is permanent in this life.`
                    });
                    return;
                }
                
                // Set the player's path
                player.path = data.path;
                
                // Grant skills based on path
                const skills = [];
                if (data.path === 'light') {
                    skills.push('martial_arts');
                }
                
                // Send success response
                socket.emit('pathSelectionResult', {
                    success: true,
                    path: data.path,
                    skills: skills
                });
                
                console.log(`Player ${socket.id} successfully chose path: ${data.path}`);
            });

            // Handle skill use
            socket.on('useSkill', (data) => {
                if (!data || !data.targetId || !data.skillName) {
                    console.warn(`Invalid skill data from ${socket.id}: ${JSON.stringify(data)}`);
                    return;
                }
                
                // Apply rate limiting
                if (!this.rateLimitSkillUsage(socket.id, 'pvp')) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Using skills too rapidly, please slow down'
                    });
                    return;
                }
                
                // Get the players
                const player = this.playerManager.getPlayer(socket.id);
                const targetPlayer = this.playerManager.getPlayer(data.targetId);
                
                if (!player || !targetPlayer) {
                    console.warn(`Player or target not found: ${socket.id} -> ${data.targetId}`);
                    return;
                }

                // Initialize skill cooldowns if not existing
                if (!player.skillCooldowns) {
                    player.skillCooldowns = new Map();
                }
                
                // Check server-side cooldown
                const now = Date.now();
                const lastUsedTime = player.skillCooldowns.get(data.skillName) || 0;
                const skillCooldown = this.getSkillCooldown(data.skillName);
                
                if (lastUsedTime > 0 && now - lastUsedTime < skillCooldown) {
                    console.log(`Player ${socket.id} tried to use ${data.skillName} before cooldown finished`);
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Skill is on cooldown'
                    });
                    return;
                }
                
                // Update skill cooldown
                player.skillCooldowns.set(data.skillName, now);
                
                // Check if player is dead
                if (player.isDead) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Cannot use skills while dead'
                    });
                    return;
                }
                
                // Check if target is dead
                if (targetPlayer.isDead) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Cannot attack a dead player'
                    });
                    return;
                }
                
                // Check if player or target is in temple area
                const isPlayerInTemple = this.isPositionInTemple(player.position);
                const isTargetInTemple = this.isPositionInTemple(targetPlayer.position);
                
                // Prevent attacks in temple safe zone
                if (isTargetInTemple) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Cannot attack players in temple safe zone'
                    });
                    return;
                }
                
                // Prevent attacks from outside temple to inside temple
                if (!isPlayerInTemple && isTargetInTemple) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Temple safe zone blocks your attack'
                    });
                    return;
                }
                
                // Check if target is in range
                const distance = this.calculateDistance(player.position, targetPlayer.position);
                let skillRange = 1.5; // Default range
                
                if (data.skillName === 'martial_arts') {
                    skillRange = 3;
                } else if (data.skillName === 'dark_strike') {
                    skillRange = 3;
                }
                
                if (distance > skillRange) {
                    console.log(`Player ${socket.id} tried to attack ${data.targetId} but is out of range (${distance} > ${skillRange})`);
                    return;
                }
                
                // Ensure target has life values initialized
                if (targetPlayer.life === undefined) {
                    targetPlayer.life = 100;
                }
                if (targetPlayer.maxLife === undefined) {
                    targetPlayer.maxLife = 100;
                }
                
                // Ensure attacker has life values initialized
                if (player.life === undefined) {
                    player.life = 100;
                }
                if (player.maxLife === undefined) {
                    player.maxLife = 100;
                }
                
                // Calculate and apply damage
                const previousLife = targetPlayer.life;
                
                // Server calculates damage instead of trusting client-sent value
                const damageDealt = this.calculateSkillDamage(data.skillName, player, targetPlayer);
                
                targetPlayer.life = Math.max(0, targetPlayer.life - damageDealt);
                
                console.log(`Player ${socket.id} dealt ${damageDealt} damage to ${data.targetId} using ${data.skillName}. Target health: ${targetPlayer.life}/${targetPlayer.maxLife}`);
                
                // Check if target died
                if (targetPlayer.life <= 0) {
                    targetPlayer.isDead = true;
                    console.log(`Player ${data.targetId} was killed by ${socket.id}`);
                    
                    // Emit death event to target
                    this.io.to(data.targetId).emit('playerDied', {
                        killerId: socket.id
                    });
                    
                    // Handle player death on server
                    this.playerManager.handlePlayerDeath(data.targetId, socket.id);
                }
                
                // Notify target of damage
                this.io.to(data.targetId).emit('skillDamage', {
                    sourceId: socket.id,
                    targetId: data.targetId,
                    damage: damageDealt,
                    skillName: data.skillName
                });
                
                // Store the last health update time for this player to prevent rapid oscillations
                if (!targetPlayer.lastHealthUpdateTime) {
                    targetPlayer.lastHealthUpdateTime = {};
                }
                targetPlayer.lastHealthUpdateTime[data.targetId] = Date.now();
                
                // Broadcast health update to ALL players immediately
                this.io.emit('lifeUpdate', {
                    id: data.targetId,
                    life: targetPlayer.life,
                    maxLife: targetPlayer.maxLife || 100,
                    timestamp: Date.now(), // Add timestamp for client-side validation
                    final: true // Mark this as a final update that shouldn't be overridden
                });
                
                // Also broadcast the attacker's stats to ensure everyone has the latest data
                this.io.emit('lifeUpdate', {
                    id: socket.id,
                    life: player.life,
                    maxLife: player.maxLife || 100,
                    timestamp: Date.now(), // Add timestamp for client-side validation
                    final: false // This is not a damage-related update
                });
                
                // Broadcast damage effect to all players
                this.io.emit('damageEffect', {
                    sourceId: socket.id,
                    targetId: data.targetId,
                    damage: damageDealt,
                    skillName: data.skillName,
                    isCritical: false
                });
            });
            
            // Handle player death notification
            socket.on('playerDeath', (data) => {
                console.log(`Player ${socket.id} reported their own death`);
                this.playerManager.handlePlayerDeath(socket.id);
            });
            
            // Handle player respawn request
            socket.on('respawn', () => {
                console.log(`Player ${socket.id} requested respawn`);
                
                // Get the player
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    console.warn(`Player ${socket.id} not found for respawn`);
                    return;
                }
                
                // Reset player stats
                player.life = 100;
                player.maxLife = 100;
                player.isDead = false;
                
                // Choose a random spawn point
                const spawnPoints = this.playerManager.getSpawnPoints();
                const randomSpawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
                
                if (randomSpawn) {
                    player.position = { ...randomSpawn };
                }
                
                // Notify all clients about the respawn
                this.io.emit('playerRespawned', {
                    id: socket.id,
                    position: player.position,
                    life: player.life,
                    maxLife: player.maxLife,
                    isDead: player.isDead
                });
                
                // Also send a life update to ensure health bars are updated
                this.io.emit('lifeUpdate', {
                    id: socket.id,
                    life: player.life,
                    maxLife: player.maxLife,
                    timestamp: Date.now(),
                    final: true
                });
                
                console.log(`Player ${socket.id} respawned at position:`, player.position);
            });

            // Handle karma updates from clients
            socket.on('karmaUpdate', (data) => {
                console.log(`Received karma update from player ${socket.id}:`, data);
                
                // Validate data
                if (!data || typeof data.karma !== 'number' || typeof data.maxKarma !== 'number') {
                    console.warn(`Invalid karma data received from player ${socket.id}`);
                    return;
                }
                
                // Get the player
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    console.warn(`Player ${socket.id} not found for karma update`);
                    return;
                }
                
                // Update player's karma values with server authority
                const previousKarma = player.karma;
                player.karma = Math.max(0, Math.min(player.maxKarma, data.karma));
                player.maxKarma = data.maxKarma;
                
                // Update player path based on karma level
                if (player.karma > player.maxKarma * 0.7) {
                    player.path = "dark";
                } else if (player.karma < player.maxKarma * 0.3) {
                    player.path = "light";
                } else {
                    player.path = null;
                }
                
                console.log(`Updated karma for player ${socket.id}: ${previousKarma} -> ${player.karma} (${player.path || 'neutral'} path)`);
                
                // Update player effects based on new karma value
                this.playerManager.updatePlayerEffects(player);
                
                // Broadcast the karma update to all clients
                this.io.emit('karmaUpdate', {
                    id: socket.id,
                    karma: player.karma,
                    maxKarma: player.maxKarma,
                    path: player.path,
                    timestamp: Date.now()
                });
            });

            // Handle player reset request (for reconnections)
            socket.on('requestPlayerReset', () => {
                console.log(`Player ${socket.id} requested a reset (reconnection)`);
                
                // Use the PlayerManager's resetPlayer method to properly reset the player
                const resetPlayer = this.playerManager.resetPlayer(socket.id);
                
                if (resetPlayer) {
                    console.log(`Player ${socket.id} has been reset due to reconnection`);
                    
                    // Confirm reset to the client
                    socket.emit('playerResetConfirmed');
                    
                    // Broadcast updated player state to all clients
                    this.broadcastPlayerList();
                } else {
                    console.error(`Failed to reset player ${socket.id} - player not found`);
                }
            });

            // Handle request for life update
            socket.on('requestLifeUpdate', (data) => {
                if (!data || !data.playerId) {
                    return;
                }
                
                const player = this.playerManager.getPlayer(data.playerId);
                if (!player) {
                    return;
                }
                
                // Broadcast the player's current health to all clients
                this.io.emit('lifeUpdate', {
                    id: data.playerId,
                    life: player.life,
                    maxLife: player.maxLife || 100
                });
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                const player = this.playerManager.removePlayer(socket.id);
                if (player) {
                    this.lastUpdateTime.delete(socket.id);
                    this.io.emit('playerLeft', socket.id);
                    console.log(`Player left: ${player.displayName} (Total Players: ${this.playerManager.getPlayerCount()})`);
                    
                    // Clear any intervals associated with this socket
                    if (this.sockets.has(socket.id)) {
                        const intervals = this.sockets.get(socket.id);
                        if (intervals.statsInterval) {
                            clearInterval(intervals.statsInterval);
                        }
                        this.sockets.delete(socket.id);
                    }
                }
            });
            
            // Handle request for player state update
            socket.on('requestStateUpdate', () => {
                console.log(`Player ${socket.id} requested state update`);
                
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    console.warn(`Player ${socket.id} not found for state update request`);
                    return;
                }
                
                // Send the complete player state including path and skills
                socket.emit('playerState', {
                    stats: {
                        life: player.life,
                        maxLife: player.maxLife || 100,
                        mana: player.mana || 100,
                        maxMana: player.maxMana || 100,
                        karma: player.karma || 50,
                        maxKarma: player.maxKarma || 100,
                        experience: player.experience || 0,
                        level: player.level || 1,
                        path: player.path || null
                    },
                    path: player.path || null,
                    skills: player.skills || []
                });
            });
            
            // Set up a stats interval for this socket and store it for cleanup
            const statsInterval = setInterval(() => {
                const player = this.playerManager.getPlayer(socket.id);
                if (player) {
                    this.io.emit('lifeUpdate', {
                        id: socket.id,
                        life: player.life,
                        maxLife: player.maxLife || 100
                    });
                }
            }, 1000); // Update every second
            
            // Store the interval for cleanup on disconnect
            this.sockets.set(socket.id, { statsInterval });

            // Handle monster attack
            socket.on('attack_monster', (data) => {
                if (!data || !data.monsterId) {
                    return this.logSecurityEvent(`Invalid attack_monster data from ${socket.id}`);
                }
                
                // Check if monster manager exists
                if (!this.gameManager || !this.gameManager.monsterManager) {
                    console.warn(`Monster manager not initialized for attack from ${socket.id}`);
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Combat system initializing, please try again'
                    });
                    return;
                }
                
                // Apply rate limiting
                if (!this.rateLimitSkillUsage(socket.id, 'monster')) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Using skills too rapidly, please slow down'
                    });
                    return;
                }
                
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    return this.logSecurityEvent(`Player not found for attack_monster from ${socket.id}`);
                }
                
                // Check if player is dead
                if (player.isDead) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Cannot attack while dead'
                    });
                    return;
                }
                
                // Initialize skill cooldowns if not existing
                if (!player.skillCooldowns) {
                    player.skillCooldowns = new Map();
                }
                
                // Get the skill being used
                const skillId = data.skillId || 'martial_arts';
                
                // Check server-side cooldown
                const now = Date.now();
                const lastUsedTime = player.skillCooldowns.get(skillId) || 0;
                const skillCooldown = this.getSkillCooldown(skillId);
                
                if (lastUsedTime > 0 && now - lastUsedTime < skillCooldown) {
                    console.log(`Player ${socket.id} tried to use ${skillId} on monster before cooldown finished`);
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Skill is on cooldown'
                    });
                    return;
                }
                
                // Update skill cooldown
                player.skillCooldowns.set(skillId, now);
                
                // Get the monster
                const monster = this.gameManager.monsterManager.getMonsterById(data.monsterId);
                if (!monster) {
                    return this.logSecurityEvent(`Monster ${data.monsterId} not found for attack_monster from ${socket.id}`);
                }
                
                // Skip attack if monster is already dead
                if (monster.health <= 0) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Cannot attack a dead monster'
                    });
                    return;
                }
                
                // Check if monster is in temple area
                const isMonsterInTemple = this.isPositionInTemple(monster.position);
                const isPlayerInTemple = this.isPositionInTemple(player.position);
                
                // Prevent attacks on monsters in temple safe zone
                if (isMonsterInTemple) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Cannot attack monsters in temple safe zone'
                    });
                    return;
                }
                
                // Prevent attacks from outside temple to inside temple
                if (!isPlayerInTemple && isMonsterInTemple) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Temple safe zone blocks your attack'
                    });
                    return;
                }
                
                // Check if the monster is within range
                const playerPos = player.position;
                const monsterPos = monster.position;
                const distance = this.calculateDistance(playerPos, monsterPos);
                
                // Get skill range
                const attackRange = this.getSkillRange(skillId);
                
                // Use a dynamic tolerance based on distance:
                // - For closer monsters (within range): more lenient
                // - For farther monsters: more strict
                const baseTolerance = 1.0; // Significantly increased from 0.5
                const rangeTolerance = Math.max(baseTolerance, attackRange * 0.2); // At least 20% of the skill's range
                
                // Log the check for debugging purposes
                console.log(`Range check for ${socket.id}: distance=${distance.toFixed(2)}, range=${attackRange}, tolerance=${rangeTolerance.toFixed(2)}`);

                if (distance > attackRange + rangeTolerance) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Target is out of range'
                    });
                    // Log detailed distance information for debugging
                    this.log(`Range error: Player ${socket.id} tried to attack monster ${monster.id} but is out of range (distance: ${distance.toFixed(2)}, range: ${attackRange}, tolerance: ${rangeTolerance.toFixed(2)})`);
                    return; // Important: return here to prevent attack processing
                }
                
                // Calculate damage from the server side
                const damage = this.calculateMonsterDamage(skillId, player, monster);
                
                // Apply damage to monster
                const previousHealth = monster.health;
                monster.health = Math.max(0, monster.health - damage);
                
                // Log the attack
                this.log(`Player ${socket.id} used ${skillId} on monster ${monster.id} for ${damage} damage (health: ${monster.health}/${monster.maxHealth || 100})`);
                
                // Check if monster is dead
                if (monster.health <= 0) {
                    // Handle monster death
                    this.gameManager.handleMonsterDeath(socket.id, monster.id);
                    
                    // Award XP and potentially items
                    this.rewardPlayerForMonsterKill(player, monster);
                } else {
                    // Broadcast monster health update to all clients
                    this.io.emit('monster_update', {
                        monsterId: monster.id,
                        health: monster.health,
                        maxHealth: monster.maxHealth || 100
                    });
                }
                
                // Broadcast damage effect to all nearby clients
                this.io.emit('monsterDamageEffect', {
                    monsterId: monster.id,
                    playerId: socket.id,
                    damage: damage,
                    skillId: skillId
                });
            });
            
            // Handle player respawn request
            socket.on('requestRespawn', () => {
                console.log(`Player ${socket.id} requested respawn`);
                
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    console.warn(`Player ${socket.id} not found for respawn request`);
                    return;
                }
                
                // Even if player is not marked as dead, force respawn
                if (!player.isDead) {
                    console.warn(`Player ${socket.id} requested respawn but is not marked as dead - forcing respawn anyway`);
                }
                
                // Respawn the player at the temple
                this.playerManager.respawnPlayer(socket.id);
                
                // Log temple position for debugging
                console.log(`Temple position for respawn: ${JSON.stringify(GameConstants.PLAYER.SPAWN_POSITION)}`);
                
                // Send respawn confirmation with temple coordinates
                const respawnData = {
                    position: { 
                        x: GameConstants.PLAYER.SPAWN_POSITION.x,
                        y: GameConstants.PLAYER.SPAWN_POSITION.y,
                        z: GameConstants.PLAYER.SPAWN_POSITION.z 
                    },
                    rotation: {
                        y: GameConstants.PLAYER.DEFAULT_ROTATION.y // Make sure player faces south (same as initial spawn)
                    },
                    life: player.life,
                    maxLife: player.maxLife || 100,
                    deathCount: player.deathCount || 0
                };
                
                socket.emit('respawnConfirmed', respawnData);
                console.log(`Sent respawnConfirmed to player ${socket.id} with position:`, respawnData.position, `and rotation:`, respawnData.rotation);
                
                // Update player's rotation in server state
                player.rotation = { ...GameConstants.PLAYER.DEFAULT_ROTATION };
                
                // Broadcast updated player position to all clients EXCEPT the respawning player
                // This ensures other clients see the player in temple
                socket.broadcast.emit('playerMoved', {
                    id: socket.id,
                    position: { ...GameConstants.PLAYER.SPAWN_POSITION },
                    rotation: { ...GameConstants.PLAYER.DEFAULT_ROTATION },
                    timestamp: Date.now()
                });
                
                // Also notify all clients that this player has respawned
                this.io.emit('playerRespawned', {
                    id: socket.id,
                    position: { ...GameConstants.PLAYER.SPAWN_POSITION },
                    stats: {
                        life: player.life,
                        maxLife: player.maxLife
                    }
                });
                
                console.log(`Broadcast player ${socket.id} respawn to all clients`);
            });

            // Handle client requesting state synchronization
            socket.on('request_sync', () => {
                // Send current state only to the requesting client
                this.synchronizeClientState(socket.id);
            });

            // Handle client-side monster state updates
            socket.on('client_monster_state', (data) => {
                if (!data || !data.monsterId || !data.clientState) {
                    console.warn('Received invalid client_monster_state data:', data);
                    return;
                }
                
                const { monsterId, clientState } = data;
                const monster = this.gameManager.monsterManager.getMonsterById(monsterId);
                
                // If monster doesn't exist or is already marked as dead, nothing to do
                if (!monster) {
                    console.log(`Client reported state for non-existent monster ${monsterId}`);
                    return;
                }
                
                // If client reports monster is dead with 0 health
                if (clientState.isAlive === false && clientState.health === 0) {
                    // Check if our server thinks it's alive
                    if (monster.isAlive === true) {
                        console.log(`Client reported monster ${monsterId} as dead but server thinks it's alive - syncing state`);
                        
                        // Trust the client in this case - mark as dead
                        monster.isAlive = false;
                        monster.health = 0;
                        
                        // Notify all clients about monster death
                        this.io.emit('monster_death', {
                            monsterId: monsterId,
                            killerId: null, // No known killer
                            position: monster.position
                        });
                    } else {
                        // Both agree monster is dead, log for monitoring
                        console.log(`Both client and server agree monster ${monsterId} is dead`);
                    }
                }
            });
        });

        // Start state synchronization
        this.startStateSynchronization();
    }
    
    /**
     * Initialize the network manager
     */
    initialize() {
        // Set up interval to broadcast all player stats periodically
        this.startStatsUpdateInterval();
    }
    
    /**
     * Start an interval to broadcast all player stats periodically
     * This ensures all clients have the most up-to-date information
     */
    startStatsUpdateInterval() {
        // Clear any existing interval
        if (this.statsUpdateInterval) {
            clearInterval(this.statsUpdateInterval);
        }
        
        // Set up interval to broadcast all player stats
        this.statsUpdateInterval = setInterval(() => {
            // Skip if no players
            if (!this.playerManager.players || this.playerManager.players.size === 0) {
                return;
            }
            
            // Create a batch update with all player stats
            const batchUpdate = {
                timestamp: Date.now(),
                players: []
            };
            
            // Add each player's stats to the batch update
            this.playerManager.players.forEach((player, playerId) => {
                // Skip if player doesn't have stats
                if (!player) {
                    return;
                }
                
                // Ensure player has valid health values
                const life = typeof player.life === 'number' ? player.life : 100;
                const maxLife = typeof player.maxLife === 'number' ? player.maxLife : 100;
                const isDead = Boolean(player.isDead);
                
                // Add player stats to batch update
                batchUpdate.players.push({
                    id: playerId,
                    life: life,
                    maxLife: maxLife,
                    isDead: isDead,
                    experience: player.experience || 0,
                    level: player.level || 1,
                    // Add a unique update ID to prevent race conditions
                    updateId: `${playerId}-${Date.now()}`
                });
            });
            
            // Skip if no players with stats
            if (batchUpdate.players.length === 0) {
                return;
            }
            
            // Broadcast the batch update to all clients
            this.io.emit('statsUpdate', batchUpdate);
        }, 500); // Update every 500ms for more responsive health updates
    }
    
    /**
     * Broadcast a full player list to all connected clients
     */
    broadcastPlayerList() {
        // Check if there are any connected clients
        if (this.io.engine.clientsCount > 0) {
            // Send a game state update to all clients with the current player list
            this.io.emit('gameStateUpdate', {
                players: this.playerManager.getAllPlayers(),
                serverTime: Date.now()
            });
        }
    }
    
    /**
     * Broadcast NPC updates to all connected clients
     */
    broadcastNPCUpdates() {
        this.io.emit('npcUpdates', this.gameManager.getAllNPCs());
    }
    
    /**
     * Validate player movement data
     */
    validateMovementData(data) {
        // Check if data exists and has position
        if (!data || !data.position) {
            return false;
        }
        
        // Check if position has x, y, z coordinates
        if (typeof data.position.x !== 'number' && typeof data.position.x !== 'string' ||
            typeof data.position.y !== 'number' && typeof data.position.y !== 'string' ||
            typeof data.position.z !== 'number' && typeof data.position.z !== 'string') {
            return false;
        }
        
        // Check for NaN or Infinity values
        if (isNaN(Number(data.position.x)) || isNaN(Number(data.position.y)) || isNaN(Number(data.position.z)) ||
            !isFinite(Number(data.position.x)) || !isFinite(Number(data.position.y)) || !isFinite(Number(data.position.z))) {
            return false;
        }
        
        return true;
    }

    /**
     * Rate limiting for player movement
     */
    rateLimitMovement(socketId) {
        const now = Date.now();
        const lastUpdate = this.lastUpdateTime.get(socketId) || 0;
        
        // Check if enough time has passed since the last update
        if (now - lastUpdate < 50) { // 50ms = 20 updates per second max
            this.logSecurityEvent(`Rate limit exceeded for player ${socketId}`, socketId);
            return false;
        }
        
        // Update the last update time
        this.lastUpdateTime.set(socketId, now);
        return true;
    }

    /**
     * Utility logging function with optional throttling
     */
    log(message, level = 'info', throttle = false, throttleKey = null, throttleTime = 30000) {
        // If throttling is requested, check if we should log based on time
        if (throttle && throttleKey) {
            const now = Date.now();
            
            // If we haven't logged this message recently, or it's the first time
            if (!this._lastLogs[throttleKey] || now - this._lastLogs[throttleKey] > throttleTime) {
                this._lastLogs[throttleKey] = now;
                console[level](`[NetworkManager] ${message}`);
            }
        } else {
            // Regular non-throttled logging
            console[level](`[NetworkManager] ${message}`);
        }
    }

    /**
     * Enhanced logging with throttling for security events
     */
    logSecurityEvent(message, throttleKey = null) {
        // Always log security events, but throttle identical messages
        const throttleTime = 60000; // 1 minute throttle for identical security events
        this.log(`SECURITY: ${message}`, 'warn', true, throttleKey || message, throttleTime);
    }

    /**
     * Validate session
     */
    validateSession(socketId) {
        // Check if socket is still connected
        if (!this.sockets.has(socketId)) {
            this.logSecurityEvent(`Invalid session: Socket ${socketId} not found`);
            return false;
        }
        return true;
    }

    /**
     * Calculate distance between two positions
     */
    calculateDistance(pos1, pos2) {
        if (!pos1 || !pos2) return Infinity;
        
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Check if a position is in the temple area
     */
    isPositionInTemple(position) {
        // Temple dimensions with buffer zone to ensure the edges are protected
        const buffer = 1.5; // Buffer of 1.5 units around the temple
        const baseHalfWidth = 15 + buffer; // 30/2 for base platform + buffer
        const crossVerticalHalfWidth = 4 + buffer; // 8/2 for vertical part + buffer
        const crossHorizontalHalfWidth = 12 + buffer; // 24/2 for horizontal part + buffer
        const crossVerticalHalfLength = 12 + buffer; // 24/2 for vertical part + buffer
        const crossHorizontalHalfLength = 4 + buffer; // 8/2 for horizontal part + buffer
        
        // Check if position is within base platform bounds
        const isOnBase = Math.abs(position.x) <= baseHalfWidth && 
                        Math.abs(position.z) <= baseHalfWidth;
        
        // Check if position is within cross vertical part
        const isOnVertical = Math.abs(position.x) <= crossVerticalHalfWidth && 
                            Math.abs(position.z) <= crossVerticalHalfLength;
        
        // Check if position is within cross horizontal part
        const isOnHorizontal = Math.abs(position.x) <= crossHorizontalHalfWidth && 
                                Math.abs(position.z) <= crossHorizontalHalfLength;

        return isOnBase || isOnVertical || isOnHorizontal;
    }

    /**
     * Get the cooldown time for a specific skill in milliseconds
     */
    getSkillCooldown(skillName) {
        switch(skillName) {
            case 'martial_arts':
                return 1000; // 1 second cooldown
            case 'dark_strike':
                return 1500; // 1.5 second cooldown
            default:
                return 1000; // Default cooldown
        }
    }

    /**
     * Calculate skill damage based on skill type and player stats
     */
    calculateSkillDamage(skillName, attacker, target) {
        // Base damage for each skill
        let baseDamage = 0;
        switch(skillName) {
            case 'martial_arts':
                baseDamage = 25;
                break;
            case 'dark_strike':
                baseDamage = 30;
                break;
            default:
                baseDamage = 20;
        }
        
        // Add randomness to damage (±20%)
        const varianceFactor = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2
        
        // Apply attacker's stats and target's defense (if implemented in the future)
        let finalDamage = Math.floor(baseDamage * varianceFactor);
        
        // Cap damage at remaining health to prevent overkill
        if (target.life < finalDamage) {
            finalDamage = target.life;
        }
        
        return finalDamage;
    }

    /**
     * Get the range for a specific skill
     */
    getSkillRange(skillId) {
        switch(skillId) {
            case 'martial_arts':
                return 3; // 3 units range
            case 'dark_strike':
                return 3; // 3 units range (matching client)
            default:
                return 2; // Default range
        }
    }

    /**
     * Calculate damage against a monster
     */
    calculateMonsterDamage(skillId, player, monster) {
        // Base damage for each skill
        let baseDamage = 0;
        switch(skillId) {
            case 'martial_arts':
                baseDamage = 25;
                break;
            case 'dark_strike':
                baseDamage = 35;
                break;
            default:
                baseDamage = 20;
        }
        
        // Add randomness to damage (±20%)
        const varianceFactor = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2
        
        // Apply player path bonuses if applicable
        if (player.path === 'light' && skillId === 'martial_arts') {
            baseDamage *= 1.2; // 20% bonus for light path using martial arts
        } else if (player.path === 'dark' && skillId === 'dark_strike') {
            baseDamage *= 1.2; // 20% bonus for dark path using dark strike
        }
        
        // Calculate final damage
        let finalDamage = Math.floor(baseDamage * varianceFactor);
        
        // Cap damage at remaining health to prevent overkill
        if (monster.health < finalDamage) {
            finalDamage = monster.health;
        }
        
        return finalDamage;
    }

    /**
     * Award XP and potentially items when a player kills a monster
     */
    rewardPlayerForMonsterKill(player, monster) {
        // This method can be expanded later with more sophisticated reward logic
        // For now, just log the kill
        console.log(`Player ${player.id} killed monster ${monster.id}`);
    }

    /**
     * Rate limiting for skill usage
     * @param {string} socketId - The player's socket ID
     * @param {string} skillType - Type of skill (e.g., 'pvp', 'monster')
     * @returns {boolean} - Whether the action passes rate limiting
     */
    rateLimitSkillUsage(socketId, skillType = 'generic') {
        const now = Date.now();
        const key = `${socketId}:${skillType}`;
        
        // Initialize attempts tracker if not exists
        if (!this.skillAttempts.has(key)) {
            this.skillAttempts.set(key, {
                count: 0,
                firstAttempt: now,
                lastAttempt: 0
            });
        }
        
        const attempts = this.skillAttempts.get(key);
        
        // If it's been more than 5 seconds since first attempt, reset counter
        if (now - attempts.firstAttempt > 5000) {
            attempts.count = 0;
            attempts.firstAttempt = now;
        }
        
        // Check for spam - max 10 attempts in 5 second window
        if (attempts.count >= 10) {
            // This is likely a spam attack
            this.logSecurityEvent(`Rate limit exceeded for skill usage by player ${socketId}`, socketId);
            return false;
        }
        
        // Check if using skills too rapidly - minimum 150ms between skill uses
        if (now - attempts.lastAttempt < 150) {
            return false;
        }
        
        // Update attempts info
        attempts.count++;
        attempts.lastAttempt = now;
        this.skillAttempts.set(key, attempts);
        
        return true;
    }

    /**
     * Periodically synchronize game state with all clients
     */
    startStateSynchronization() {
        // Clear any existing interval
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        // Add a small delay before starting synchronization to ensure all managers are initialized
        setTimeout(() => {
            // Synchronize every 10 seconds
            this.syncInterval = setInterval(() => {
                this.synchronizeGameState();
            }, 10000);
            
            console.log('Started game state synchronization');
        }, 5000); // 5 second delay before starting sync
    }
    
    /**
     * Send authoritative game state to all clients
     */
    synchronizeGameState() {
        if (!this.playerManager || !this.gameManager) {
            console.warn('Cannot synchronize game state: managers not initialized');
            return;
        }
        
        // Collect all players data in a format clients can process
        const playersData = [];
        this.playerManager.players.forEach(player => {
            playersData.push({
                id: player.id,
                position: player.position,
                life: player.life,
                maxLife: player.maxLife,
                isDead: player.isDead,
                timestamp: Date.now()
            });
        });
        
        // Collect all monsters data
        const monstersData = [];
        if (this.gameManager.monsterManager) {
            try {
                // Check if the getMonsters function exists
                if (typeof this.gameManager.monsterManager.getMonsters === 'function') {
                    const monsters = this.gameManager.monsterManager.getMonsters();
                    if (Array.isArray(monsters)) {
                        monsters.forEach(monster => {
                            if (monster && monster.id) {
                                monstersData.push({
                                    id: monster.id,
                                    position: monster.position || { x: 0, y: 0, z: 0 },
                                    health: monster.health || 0,
                                    maxHealth: monster.maxHealth || 100,
                                    isDead: monster.health <= 0,
                                    timestamp: Date.now()
                                });
                            }
                        });
                    }
                } else if (this.gameManager.monsterManager.monsters instanceof Map) {
                    // If getMonsters() doesn't exist but we have a monsters Map
                    this.gameManager.monsterManager.monsters.forEach(monster => {
                        if (monster && monster.id) {
                            monstersData.push({
                                id: monster.id,
                                position: monster.position || { x: 0, y: 0, z: 0 },
                                health: monster.health || 0,
                                maxHealth: monster.maxHealth || 100,
                                isDead: monster.health <= 0,
                                timestamp: Date.now()
                            });
                        }
                    });
                }
            } catch (error) {
                console.error('Error collecting monster data for synchronization:', error);
            }
        }
        
        // Send synchronization data to all clients
        this.io.emit('game_state_sync', {
            players: playersData,
            monsters: monstersData,
            timestamp: Date.now()
        });
    }
    
    /**
     * Send current game state to a specific client
     */
    synchronizeClientState(socketId) {
        if (!this.playerManager || !this.gameManager) {
            console.warn(`Cannot synchronize state for client ${socketId}: managers not initialized`);
            return;
        }
        
        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket) {
            console.warn(`Cannot find socket for client ${socketId}`);
            return;
        }
        
        // Send the same data as the global sync but only to this client
        this.synchronizeGameState();
        
        console.log(`Synchronized game state for client ${socketId}`);
    }
}

export default NetworkManager;
