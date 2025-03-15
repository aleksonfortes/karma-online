/**
 * NetworkManager.js - Server-side network management
 * 
 * Handles socket connections, message validation, and rate limiting
 */
import { Server } from 'socket.io';
import GameConstants from '../../config/GameConstants.js';

export class NetworkManager {
    constructor(httpServer, gameManager, playerManager) {
        this.gameManager = gameManager;
        this.playerManager = playerManager;
        this.lastUpdateTime = new Map();
        this.playerLastPositions = new Map();
        this._lastLogs = {};
        this.sockets = new Map();
        this.statsUpdateInterval = null;
        
        // Initialize socket server
        this.io = new Server(httpServer, {
            cors: {
                origin: ["https://localhost:5173", "https://localhost:3000"],
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling'],
            secure: true
        });
        
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
                // Validate data
                if (!data || !data.targetId || !data.skillName || !data.damage) {
                    return;
                }
                
                // Get the player
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    console.warn(`Player ${socket.id} not found for skill ${data.skillName}`);
                    return;
                }
                
                // Get the target player
                const targetPlayer = this.playerManager.getPlayer(data.targetId);
                
                if (!targetPlayer) {
                    console.warn(`Target player ${data.targetId} not found for skill ${data.skillName} by player ${socket.id}`);
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
                targetPlayer.life = Math.max(0, targetPlayer.life - data.damage);
                const damageDealt = previousLife - targetPlayer.life;
                
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
                // Validate data
                if (!data) {
                    return;
                }
                
                // Handle player death on server
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
        });
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
}

export default NetworkManager;
