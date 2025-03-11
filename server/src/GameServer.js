import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

export class GameServer {
    constructor(httpServer) {
        console.log('GameServer: Initializing...');
        this.io = new Server(httpServer, {
            cors: {
                origin: ["http://localhost:5173", "http://localhost:3000"],
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling']
        });

        // Store active players - using original simple structure
        this.players = new Map();
        this.gameState = {
            players: new Map(),
            lastUpdate: Date.now()
        };
        this.lastUpdateTime = new Map();

        this.setupSocketHandlers();
        this.startGameLoop();
        console.log('GameServer: Initialization complete');
    }
    
    // Remove periodic cleanup that might cause desynchronization
    // Rely on socket disconnect events for cleanup as in the original version
    
    broadcastPlayerList() {
        if (this.players.size > 0) {
            this.io.emit('fullPlayersSync', Array.from(this.players.values()));
        }
    }
    
    // Create a utility logging function
    log(message, level = 'info', throttle = false, throttleKey = null, throttleTime = 30000) {
        // If throttling is requested, check if we should log based on time
        if (throttle && throttleKey) {
            const now = Date.now();
            if (!this._lastLogs) this._lastLogs = {};
            
            // If we haven't logged this message recently, or it's the first time
            if (!this._lastLogs[throttleKey] || now - this._lastLogs[throttleKey] > throttleTime) {
                this._lastLogs[throttleKey] = now;
                console[level](`[GameServer] ${message}`);
            }
        } else {
            // Regular non-throttled logging
            console[level](`[GameServer] ${message}`);
        }
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            // Check if this socket.id is already connected
            const existingPlayerIds = Array.from(this.players.keys());
            const reconnection = existingPlayerIds.some(id => {
                const player = this.players.get(id);
                return player && player.ip === socket.handshake.address;
            });

            if (reconnection) {
                this.log(`Player reconnected with new socket ID: ${socket.id} from IP: ${socket.handshake.address}`, 'info', true, 'reconnect');
            } else {
                this.log(`Player connected: ${socket.id} from IP: ${socket.handshake.address}`);
            }

            // Create a new player instance
            const newPlayer = this.createPlayer(socket.id);
            
            // Set the IP address for reconnection detection
            newPlayer.ip = socket.handshake.address;
            
            // Store the player in our maps
            this.players.set(socket.id, newPlayer);
            this.gameState.players.set(socket.id, newPlayer);

            // Send the current players to the new client
            socket.emit('currentPlayers', Array.from(this.players.values()));

            // Send the new player to all other players
            socket.broadcast.emit('newPlayer', newPlayer);

            // Handle player movement with rate limiting
            let lastMovementUpdate = 0;
            const movementUpdateInterval = 50; // Minimum 50ms between updates (20 updates per second max)
            
            socket.on('playerMovement', (movementData) => {
                const now = Date.now();
                // Rate limit movement updates
                if (now - lastMovementUpdate < movementUpdateInterval) return;
                lastMovementUpdate = now;
                
                const player = this.players.get(socket.id);
                if (!player) return;
                
                // Update player position
                player.position = movementData.position;
                player.rotation = movementData.rotation;
                
                // Send the movement to all other players
                socket.broadcast.emit('playerPosition', {
                    id: socket.id,
                    position: player.position,
                    rotation: player.rotation
                });
            });

            // Handle disconnect event
            socket.on('disconnect', () => {
                const player = this.players.get(socket.id);
                
                if (player) {
                    this.log(`Player disconnected: ${socket.id}`);
                    
                    // Mark as disconnected but keep for a short time
                    player.connected = false;
                    player.disconnectedAt = Date.now();
                    
                    // Set a timeout to remove player after a delay (allow for short disconnects)
                    setTimeout(() => {
                        // Check if player is still disconnected and hasn't reconnected with a new socket
                        const currentPlayer = this.players.get(socket.id);
                        if (currentPlayer && !currentPlayer.connected) {
                            // Now actually remove the player
                            this.players.delete(socket.id);
                            this.gameState.players.delete(socket.id);
                            
                            this.log(`Player removed after disconnect timeout: ${socket.id}`);
                            
                            // Notify all clients
                            this.io.emit('playerLeft', socket.id);
                        }
                    }, 30000); // 30 second grace period for reconnection
                    
                    // Notify all clients immediately about the disconnect
                    socket.broadcast.emit('playerDisconnected', socket.id);
                }
            });

            // Handle player state updates
            socket.on('playerState', (data) => {
                const player = this.players.get(socket.id);
                if (player) {
                    // Update stats that the server allows clients to update
                    if (data.karma !== undefined) player.karma = data.karma;
                    if (data.maxKarma !== undefined) player.maxKarma = data.maxKarma;
                    if (data.mana !== undefined) player.mana = data.mana;
                    if (data.maxMana !== undefined) player.maxMana = data.maxMana;
                    if (data.path !== undefined) player.path = data.path;
                    
                    // Broadcast the state update to other players
                    socket.broadcast.emit('playerStateUpdate', {
                        id: socket.id,
                        karma: player.karma,
                        maxKarma: player.maxKarma,
                        life: player.life,
                        maxLife: player.maxLife,
                        mana: player.mana,
                        maxMana: player.maxMana,
                        path: player.path
                    });
                }
            });

            // Handle skill damage
            socket.on('skillDamage', (data) => {
                const attacker = this.players.get(socket.id);
                const target = this.players.get(data.targetId);
                
                if (!attacker || !target) return;
                
                // Prevent Illuminated players from dealing damage
                if (attacker.karma === 0) {
                    return;
                }
                
                // Verify attacker has Light path for Martial Arts
                if (data.skillName === 'martial_arts' && attacker.path === 'light') {
                    // Calculate damage based on karma levels
                    let finalDamage = data.damage;
                    
                    // Check for Illuminated status (0 karma)
                    if (target.karma === 0) {
                        // Illuminated players are immune to direct damage
                        finalDamage = 0;
                    } 
                    // Check for Forsaken status (100 karma)
                    else if (target.karma === 100) {
                        // Forsaken players are immune to direct damage
                        finalDamage = 0;
                    }
                    // Normal damage calculation
                    else {
                        // Damage increases as attacker's karma decreases (Light path)
                        const karmaMultiplier = 1 + ((50 - attacker.karma) / 50);
                        finalDamage *= karmaMultiplier;
                        
                        // Target's karma affects damage taken
                        const targetKarmaReduction = target.karma / 100; // Higher karma = more damage reduction
                        finalDamage *= (1 - targetKarmaReduction * 0.5); // Max 50% reduction at 100 karma
                    }
                    
                    // Round the final damage
                    finalDamage = Math.round(finalDamage);
                    
                    if (finalDamage > 0) {
                        // Apply damage
                        target.life = Math.max(0, target.life - finalDamage);
                        
                        // Emit life update immediately
                        this.io.emit('lifeUpdate', {
                            id: data.targetId,
                            life: target.life,
                            maxLife: target.maxLife
                        });
                        
                        // Karma effects from combat - only on kills
                        if (target.life === 0) {
                            // Killing reduces karma toward darkness
                            attacker.karma = Math.min(100, attacker.karma + 10);
                            this.updatePlayerEffects(attacker);
                            
                            // Emit karma update for attacker
                            this.io.emit('karmaUpdate', {
                                id: attacker.id,
                                karma: attacker.karma,
                                maxKarma: attacker.maxKarma,
                                effects: attacker.effects
                            });
                        }
                        
                        // Emit skill effect to all clients for visual feedback
                        this.io.emit('skillEffect', {
                            type: 'damage',
                            attackerId: socket.id,
                            targetId: data.targetId,
                            damage: finalDamage,
                            skillName: data.skillName,
                            isCritical: finalDamage > data.damage * 1.5
                        });
                    } else {
                        // Emit immunity effect if no damage was dealt
                        this.io.emit('skillEffect', {
                            type: 'immune',
                            targetId: data.targetId,
                            reason: target.karma === 0 ? 'illuminated' : 'forsaken'
                        });
                    }
                }
            });
            
            // Add karmaAction handler - exactly as in the original
            socket.on('karmaAction', (data) => {
                const player = this.players.get(socket.id);
                const target = this.players.get(data.targetId);
                
                if (!player || !target) return;
                
                // Rate limit karma actions to once every 5 seconds
                const now = Date.now();
                const lastAction = player.lastKarmaAction || 0;
                
                if (now - lastAction >= 5000) {
                    const amount = data.action === 'give' ? 1 : -1;
                    target.karma = Math.max(0, Math.min(target.maxKarma, target.karma + amount));
                    player.lastKarmaAction = now;

                    // Update effects
                    this.updatePlayerEffects(target);
                    
                    // Broadcast karma update
                    this.io.emit('karmaUpdate', {
                        id: target.id,
                        karma: target.karma,
                        maxKarma: target.maxKarma,
                        effects: target.effects
                    });
                }
            });

            // Add karmaUpdate handler - exactly as in the original
            socket.on('karmaUpdate', (data) => {
                const player = this.players.get(socket.id);
                if (player) {
                    // Update only karma in server state
                    player.karma = data.karma;
                    player.maxKarma = data.maxKarma;
                    
                    // Update effects
                    this.updatePlayerEffects(player);
                    
                    // Broadcast karma update only
                    this.io.emit('karmaUpdate', {
                        id: socket.id,
                        karma: data.karma,
                        maxKarma: data.maxKarma,
                        effects: player.effects
                    });
                }
            });

            // Add manaUpdate handler - exactly as in the original
            socket.on('manaUpdate', (data) => {
                const player = this.players.get(socket.id);
                if (player) {
                    player.mana = data.mana;
                    player.maxMana = data.maxMana;
                    
                    this.io.emit('manaUpdate', {
                        id: socket.id,
                        mana: data.mana,
                        maxMana: data.maxMana
                    });
                }
            });

            // Add playerDied handler - exactly as in the original
            socket.on('playerDied', (data) => {
                const player = this.players.get(socket.id);
                if (player) {
                    // Remove player from server state
                    this.players.delete(socket.id);
                    this.gameState.players.delete(socket.id);
                    this.lastUpdateTime.delete(socket.id);
                    
                    // Notify all clients that the player has died and should be removed
                    this.io.emit('playerLeft', socket.id);
                    console.log(`Player died and left: ${socket.id} (Total Players: ${this.players.size})`);
                }
            });
        });
    }

    createPlayer(socketId) {
        return {
            id: socketId,
            position: {
                x: Math.random() * 80 - 40,  // Random position between -40 and 40
                y: 0,
                z: Math.random() * 80 - 40
            },
            rotation: {
                y: 0
            },
            life: 100,
            maxLife: 100,
            mana: 100,
            maxMana: 100,
            karma: 50,
            maxKarma: 100,
            path: "neutral",
            effects: [],
            lastAction: 0,
            lastKarmaAction: 0,
            lastLifeUpdate: 0,
            connected: true, // New field to track connection status
            ip: null, // New field to track IP address
            disconnectedAt: null // New field to track disconnection time
        };
    }

    startGameLoop() {
        const tickRate = 60; // Updates per second
        const tickInterval = 1000 / tickRate;

        setInterval(() => {
            this.update();
        }, tickInterval);
    }

    update() {
        // Update the game state
        this.gameState.timestamp = Date.now();
        
        // Update time-based effects for each player
        this.players.forEach(player => {
            if (player.effects) {
                for (const [effectId, effect] of Object.entries(player.effects)) {
                    if (effect.duration && effect.startTime) {
                        const elapsedTime = Date.now() - effect.startTime;
                        if (elapsedTime >= effect.duration) {
                            delete player.effects[effectId];
                        }
                    }
                }
            }
        });
        
        // Sync player maps to ensure consistency
        this.syncPlayerMaps();
        
        // Broadcast the game state update if we have players
        if (this.players.size > 0) {
            this.updateCount = (this.updateCount || 0) + 1;
            
            // Log player count at a reduced frequency (every 300 updates instead of 60)
            if (this.updateCount % 300 === 0) {
                this.log(`Game update: Broadcasting ${this.players.size} players`, 'info', true, 'broadcast');
            }
            
            // Emit the full state update - includes all players and timestamp
            this.io.emit('gameStateUpdate', {
                players: Array.from(this.players.values()),
                timestamp: this.gameState.timestamp
            });
        }
    }
    
    // New method to ensure player maps are in sync
    syncPlayerMaps() {
        // Check for players in the main map that are not in the game state
        for (const [playerId, player] of this.players.entries()) {
            if (!this.gameState.players.has(playerId)) {
                this.gameState.players.set(playerId, player);
                this.log(`Sync: Added missing player ${playerId} to game state`, 'warn');
            }
        }
        
        // Check for players in the game state that are not in the main map
        for (const [playerId, player] of this.gameState.players.entries()) {
            if (!this.players.has(playerId)) {
                this.players.set(playerId, player);
                this.log(`Sync: Added missing player ${playerId} to main player map`, 'warn');
            }
        }
    }

    updatePlayerEffects(player) {
        // Calculate effects based on karma
        const effects = [];
        
        if (player.karma >= 75) effects.push('enlightened');
        else if (player.karma <= 25) effects.push('cursed');
        
        if (player.karma >= 60) effects.push('blessed');
        else if (player.karma <= 40) effects.push('haunted');
        
        player.effects = effects;
    }
} 