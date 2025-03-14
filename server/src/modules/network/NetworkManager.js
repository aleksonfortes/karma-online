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
            this.sockets.set(socket.id, socket);
            
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
                if (!this.verifyMessageSignature(data, null)) {
                    this.logSecurityEvent(`Invalid message signature from player ${socket.id}`);
                    return;
                }
                const sanitizedData = this.sanitizeMovementData(data);
                if (!sanitizedData) {
                    this.logSecurityEvent(`Invalid movement data from player ${socket.id}`);
                    return;
                }
                
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
                // Validate skill data
                if (!data || !data.skillName) {
                    console.warn(`Invalid skill data from player ${socket.id}`);
                    return;
                }
                
                console.log(`Player ${socket.id} is using skill: ${data.skillName}`);
                
                // Get player and target
                const player = this.playerManager.getPlayer(socket.id);
                
                if (!player) {
                    console.warn(`Player ${socket.id} not found for skill use`);
                    return;
                }
                
                // Handle different skill types
                if (data.skillName === 'martial_arts' || data.skillName === 'dark_strike') {
                    // Validate target
                    if (!data.targetId) {
                        console.warn(`No target specified for skill ${data.skillName} by player ${socket.id}`);
                        return;
                    }
                    
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
                    
                    // Apply damage to target
                    if (!targetPlayer.stats) {
                        targetPlayer.stats = {
                            life: 100,
                            maxLife: 100,
                            level: 1
                        };
                    }
                    
                    // Ensure attacker has stats initialized
                    if (!player.stats) {
                        player.stats = {
                            life: 100,
                            maxLife: 100,
                            level: 1
                        };
                    }
                    
                    // Calculate and apply damage
                    const previousLife = targetPlayer.stats.life;
                    targetPlayer.stats.life = Math.max(0, targetPlayer.stats.life - data.damage);
                    const damageDealt = previousLife - targetPlayer.stats.life;
                    
                    console.log(`Player ${socket.id} dealt ${damageDealt} damage to ${data.targetId} using ${data.skillName}. Target health: ${targetPlayer.stats.life}/${targetPlayer.stats.maxLife}`);
                    
                    // Check if target died
                    if (targetPlayer.stats.life <= 0) {
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
                    
                    // IMPORTANT: Broadcast health update to ALL players immediately
                    // This ensures everyone sees the updated health bars in real-time
                    this.io.emit('lifeUpdate', {
                        id: data.targetId,
                        life: targetPlayer.stats.life,
                        maxLife: targetPlayer.stats.maxLife || 100,
                        timestamp: Date.now() // Add timestamp for client-side validation
                    });
                    
                    // Also broadcast the attacker's stats to ensure everyone has the latest data
                    this.io.emit('lifeUpdate', {
                        id: socket.id,
                        life: player.stats.life,
                        maxLife: player.stats.maxLife || 100,
                        timestamp: Date.now() // Add timestamp for client-side validation
                    });
                    
                    // Broadcast damage effect to all players
                    this.io.emit('damageEffect', {
                        sourceId: socket.id,
                        targetId: data.targetId,
                        damage: damageDealt,
                        skillName: data.skillName,
                        isCritical: false
                    });
                }
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
                if (!player.stats) {
                    player.stats = {};
                }
                
                player.stats.life = 100;
                player.stats.maxLife = 100;
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
                    stats: player.stats
                });
                
                // Also send a life update to ensure health bars are updated
                this.io.emit('lifeUpdate', {
                    id: socket.id,
                    life: player.stats.life,
                    maxLife: player.stats.maxLife
                });
                
                console.log(`Player ${socket.id} respawned at position:`, player.position);
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
                if (!player || !player.stats) {
                    return;
                }
                
                // Broadcast the player's current health to all clients
                this.io.emit('lifeUpdate', {
                    id: data.playerId,
                    life: player.stats.life,
                    maxLife: player.stats.maxLife || 100
                });
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                const player = this.playerManager.removePlayer(socket.id);
                if (player) {
                    this.lastUpdateTime.delete(socket.id);
                    this.io.emit('playerLeft', socket.id);
                    console.log(`Player left: ${player.displayName} (Total Players: ${this.playerManager.getPlayerCount()})`);
                }
            });
            
            // Broadcast player stats to all clients every second to ensure synchronization
            const statsInterval = setInterval(() => {
                const player = this.playerManager.getPlayer(socket.id);
                if (player && player.stats) {
                    this.io.emit('lifeUpdate', {
                        id: socket.id,
                        life: player.stats.life,
                        maxLife: player.stats.maxLife || 100
                    });
                }
            }, 1000); // Update every second
            
            // Clear interval on disconnect
            socket.on('disconnect', () => {
                clearInterval(statsInterval);
            });
        });
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
     * Validate player movement data
     */
    validateMovementData(data) {
        if (!data || typeof data !== 'object') return false;
        
        // Check for required fields
        if (!data.position || !data.rotation) return false;
        
        // Validate position values
        const pos = data.position;
        if (typeof pos.x !== 'number' || typeof pos.y !== 'number' || typeof pos.z !== 'number') {
            return false;
        }
        
        // Check for NaN or Infinity values
        if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z) ||
            !isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) {
            return false;
        }
        
        return true;
    }

    /**
     * Sanitize player movement data
     */
    sanitizeMovementData(data) {
        if (!this.validateMovementData(data)) return null;
        
        // Create a clean copy with only the fields we need
        return {
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
        
        return true;
    }

    /**
     * Enhanced logging with throttling for security events
     */
    logSecurityEvent(message, throttleKey = null) {
        if (throttleKey) {
            this.log(message, 'warn', true, `security_${throttleKey}`, 5000);
        } else {
            console.warn(`[Security] ${message}`);
        }
    }

    /**
     * Validate session
     */
    validateSession(socketId) {
        if (!this.playerManager.getPlayer(socketId)) {
            this.logSecurityEvent(`Invalid session attempt: ${socketId}`);
            return false;
        }
        return true;
    }

    /**
     * Verify message signature
     */
    verifyMessageSignature(message, signature) {
        // Implementation of message signature verification
        return true; // Placeholder
    }
    
    /**
     * Calculate distance between two positions
     */
    calculateDistance(pos1, pos2) {
        const dx = pos2.x - pos1.x;
        const dz = pos2.z - pos1.z;
        return Math.sqrt(dx * dx + dz * dz);
    }
}

export default NetworkManager;
