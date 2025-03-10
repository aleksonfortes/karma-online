import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

export class GameServer {
    constructor(httpServer) {
        console.log('GameServer: Initializing...');
        this.io = new Server(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
            transports: ['websocket', 'polling']
        });

        this.players = new Map();
        this.gameState = {
            players: new Map(),
            lastUpdate: Date.now()
        };
        this.lastUpdateTime = new Map();
        this.lastStateTime = new Map();

        // Debug: Periodically log the number of connected players
        setInterval(() => {
            // Check if player count matches socket count
            const socketCount = this.io.sockets.sockets.size;
            const playerCount = this.players.size;
            
            if (socketCount !== playerCount) {
                console.log(`[WARNING] Player count mismatch: ${playerCount} players vs ${socketCount} sockets`);
                
                // Check for and cleanup stale players
                let cleaned = 0;
                this.players.forEach((player, socketId) => {
                    // Check if socket still exists
                    if (!this.io.sockets.sockets.has(socketId)) {
                        console.log(`Cleaning up stale player: ${player.displayName} (${socketId})`);
                        this.players.delete(socketId);
                        this.gameState.players.delete(socketId);
                        this.lastUpdateTime.delete(socketId);
                        this.lastStateTime.delete(socketId);
                        cleaned++;
                    }
                });
                
                if (cleaned > 0) {
                    console.log(`Cleaned up ${cleaned} stale players. New count: ${this.players.size}`);
                    // Broadcast to all clients to update their player lists
                    this.io.emit('syncPlayers');
                }
            }
            
            // Check for duplicate players (same position/name)
            const positions = new Map();
            const nameCounts = {};
            const playersToRemove = [];
            
            this.players.forEach((player, socketId) => {
                // Check for duplicate names
                const name = player.displayName;
                nameCounts[name] = (nameCounts[name] || 0) + 1;
                
                // Check for duplicate positions (exactly the same)
                if (player.position) {
                    const posKey = `${player.position.x},${player.position.y},${player.position.z}`;
                    if (positions.has(posKey)) {
                        // Potential duplicate - check when they last moved
                        const lastUpdate = this.lastUpdateTime.get(socketId) || 0;
                        const now = Date.now();
                        
                        // If no movement for 2 minutes, consider it a ghost
                        if (now - lastUpdate > 120000) {
                            console.log(`Found potential ghost player: ${player.displayName} (${socketId}) - no movement for ${(now - lastUpdate)/1000}s`);
                            playersToRemove.push(socketId);
                        }
                    } else {
                        positions.set(posKey, socketId);
                    }
                }
            });
            
            // Log duplicate names
            for (const [name, count] of Object.entries(nameCounts)) {
                if (count > 1) {
                    console.log(`Warning: Found ${count} players with the same name: ${name}`);
                }
            }
            
            // Remove ghost players
            if (playersToRemove.length > 0) {
                playersToRemove.forEach(socketId => {
                    console.log(`Removing ghost player: ${this.players.get(socketId)?.displayName} (${socketId})`);
                    this.players.delete(socketId);
                    this.gameState.players.delete(socketId);
                    this.lastUpdateTime.delete(socketId);
                    this.lastStateTime.delete(socketId);
                });
                
                console.log(`Cleaned up ${playersToRemove.length} ghost players. New count: ${this.players.size}`);
                
                // Notify all clients to update their player lists
                this.io.emit('syncPlayers');
            }
        }, 30000); // Check every 30 seconds

        this.setupSocketHandlers();
        this.startGameLoop();
        console.log('GameServer: Initialization complete');
    }

    setupSocketHandlers() {
        console.log('GameServer: Setting up socket handlers');
        
        this.io.on('connection', (socket) => {
            // Log basic connection info
            console.log(`Socket connected: ${socket.id}`);
            
            // Clean up any potential duplicate players
            for (const [socketId, player] of this.players.entries()) {
                // If this player has a different socket ID but same display name (likely a reconnect)
                if (socketId !== socket.id && player.displayName === `Player ${socket.id.slice(0, 4)}`) {
                    console.log(`Found potential stale player with same display name: ${player.displayName} (${socketId})`);
                    
                    // Remove the stale player
                    this.players.delete(socketId);
                    this.gameState.players.delete(socketId);
                    this.lastUpdateTime.delete(socketId);
                    this.lastStateTime.delete(socketId);
                    
                    // Notify all clients to remove this player
                    this.io.emit('playerLeft', socketId);
                    console.log(`Cleaned up stale player with ID ${socketId}`);
                }
            }
            
            // Check if socket ID already exists (reconnection case)
            const existingPlayer = this.players.get(socket.id);
            if (existingPlayer) {
                console.log(`Player reconnected: ${existingPlayer.displayName} (Total Players: ${this.players.size})`);
                
                // Reset player position to temple center on reconnect
                existingPlayer.position = {
                    x: 0,
                    y: 3,
                    z: 0
                };
                
                // Send updated player list to reconnected player
                socket.emit('currentPlayers', Array.from(this.players.values()));
                
                // Broadcast updated player to others
                socket.broadcast.emit('playerMoved', {
                    id: socket.id,
                    position: existingPlayer.position,
                    rotation: existingPlayer.rotation,
                    path: existingPlayer.path,
                    karma: existingPlayer.karma,
                    maxKarma: existingPlayer.maxKarma,
                    life: existingPlayer.life,
                    maxLife: existingPlayer.maxLife,
                    mana: existingPlayer.mana,
                    maxMana: existingPlayer.maxMana
                });
                
                console.log(`Sent updated player data for reconnected player ${socket.id}`);
            } else {
                // Create new player for first-time connection
                const player = this.createPlayer(socket.id);
                this.players.set(socket.id, player);
                
                // Log player connection WITH total player count
                console.log(`Player connected: ${player.displayName} (Total Players: ${this.players.size})`);
                
                // Send current players to new player
                socket.emit('currentPlayers', Array.from(this.players.values()));
                
                // Broadcast new player to others
                socket.broadcast.emit('newPlayer', player);
            }

            // Handle disconnect to clean up player data
            socket.on('disconnect', () => {
                const player = this.players.get(socket.id);
                if (player) {
                    // Log disconnect
                    console.log(`Player disconnected: ${player.displayName} (${socket.id})`);
                    
                    // Remove from all data structures
                    this.players.delete(socket.id);
                    this.gameState.players.delete(socket.id);
                    this.lastUpdateTime.delete(socket.id);
                    this.lastStateTime.delete(socket.id);
                    
                    // Notify all clients about player leaving
                    this.io.emit('playerLeft', socket.id);
                    console.log(`Player left: ${player.displayName} (Total Players: ${this.players.size})`);
                    
                    // Force garbage collection of player data
                    player.position = null;
                    player.rotation = null;
                    player.effects = null;
                } else {
                    // This shouldn't happen, but let's handle it anyway
                    console.warn(`Disconnect event for socket ${socket.id} but no player found`);
                }
                
                // Double check for stale socket references
                const socketStillExists = this.io.sockets.sockets.has(socket.id);
                if (socketStillExists) {
                    console.warn(`Socket ${socket.id} still exists after disconnect - attempting forced cleanup`);
                    
                    // Try to force socket cleanup
                    try {
                        const socketObj = this.io.sockets.sockets.get(socket.id);
                        if (socketObj && typeof socketObj.disconnect === 'function') {
                            socketObj.disconnect(true);
                        }
                        // Remove from collection
                        this.io.sockets.sockets.delete(socket.id);
                    } catch (e) {
                        console.error('Error during forced socket cleanup:', e);
                    }
                }
            });

            // Handle player movement with rate limiting
            socket.on('playerMovement', (data) => {
                const player = this.players.get(socket.id);
                if (player) {
                    const now = Date.now();
                    const lastUpdate = this.lastUpdateTime.get(socket.id) || 0;
                    
                    // Only update if at least 50ms has passed since last update
                    if (now - lastUpdate >= 50) {
                        player.position = data.position;
                        player.rotation = data.rotation;
                        player.path = data.path;
                        player.karma = data.karma;
                        player.maxKarma = data.maxKarma;
                        
                        // Don't update life from client movement updates
                        // This prevents client-side life regeneration
                        player.mana = data.mana;
                        player.maxMana = data.maxMana;
                        this.lastUpdateTime.set(socket.id, now);
                        
                        // Broadcast movement to other players
                        socket.broadcast.emit('playerMoved', {
                            id: socket.id,
                            position: data.position,
                            rotation: data.rotation,
                            path: data.path,
                            karma: data.karma,
                            maxKarma: data.maxKarma,
                            life: player.life, // Send server's life value
                            maxLife: player.maxLife,
                            mana: data.mana,
                            maxMana: data.maxMana
                        });
                    }
                }
            });

            // Handle player synchronization request
            socket.on('requestPlayersSync', () => {
                // Send current players list to requester
                socket.emit('fullPlayersSync', Array.from(this.players.values()));
                
                // Log the sync request
                console.log(`Player ${socket.id.substring(0, 8)} requested a full players sync. Sent ${this.players.size} players.`);
                
                // Also broadcast sync event to all clients to ensure everyone is in sync
                socket.broadcast.emit('syncPlayers');
            });

            // Handle player state updates - similar to movement but less frequent
            socket.on('playerState', (data) => {
                const player = this.players.get(socket.id);
                if (player) {
                    // Update player state (avoiding too frequent updates)
                    const now = Date.now();
                    const lastUpdate = this.lastStateTime ? this.lastStateTime.get(socket.id) || 0 : 0;
                    
                    // Only update state every 500ms (2 times per second)
                    if (now - lastUpdate >= 500) {
                        // Update player data
                        player.position = data.position;
                        player.rotation = data.rotation;
                        player.path = data.path;
                        player.karma = data.karma;
                        player.maxKarma = data.maxKarma;
                        player.mana = data.mana;
                        player.maxMana = data.maxMana;
                        
                        // Store last update time
                        if (!this.lastStateTime) this.lastStateTime = new Map();
                        this.lastStateTime.set(socket.id, now);
                        
                        // No need to broadcast state updates to other players
                        // Movement updates are still sent more frequently and handle position/rotation
                    }
                }
            });

            // Handle skill damage
            socket.on('skillDamage', (data) => {
                const attacker = this.players.get(socket.id);
                const target = this.players.get(data.targetId);
                
                if (!attacker || !target) return;
                
                console.log('Skill damage:', {
                    attackerId: socket.id,
                    attackerPath: attacker.path,
                    attackerKarma: attacker.karma,
                    targetId: data.targetId,
                    skillName: data.skillName,
                    damage: data.damage
                });
                
                // Verify that player has the appropriate path for the skill
                if (data.skillName === 'martial_arts') {
                    // Apply actual damage based on karma levels
                    let finalDamage = data.damage;
                    
                    // Check for immunity - fully light players (karma 0) and fully dark (karma 100) are immune
                    if (target.karma === 0 || target.karma === 100) {
                        console.log('Target is immune to damage due to karma level:', target.karma);
                        finalDamage = 0;
                    } else {
                        // Apply damage modifiers based on karma
                        // Light players (low karma) do more damage to dark players (high karma)
                        const karmaMultiplier = 1 + ((50 - attacker.karma) / 50);
                        finalDamage *= karmaMultiplier;
                        
                        // Karma provides damage reduction - higher karma gives more reduction
                        const targetKarmaReduction = target.karma / 100;
                        finalDamage *= (1 - targetKarmaReduction * 0.5);
                        
                        // Round to nearest integer
                        finalDamage = Math.round(finalDamage);
                    }
                    
                    console.log(`Final damage calculated: ${finalDamage}`);
                    
                    // Apply damage to target if it's greater than 0
                    if (finalDamage > 0) {
                        target.life = Math.max(0, target.life - finalDamage);
                        
                        // Broadcast life update to all players
                        this.io.emit('lifeUpdate', {
                            id: data.targetId,
                            life: target.life,
                            maxLife: target.maxLife
                        });
                        
                        // Karma effects from combat - only on kills
                        if (target.life === 0) {
                            // Killing a player increases karma by 10
                            attacker.karma = Math.min(attacker.maxKarma, attacker.karma + 10);
                            
                            // Broadcast the attacker's karma update
                            this.io.emit('karmaUpdate', {
                                id: socket.id,
                                karma: attacker.karma,
                                maxKarma: attacker.maxKarma
                            });
                        }

                        // Then emit the damage effect for visuals
                        this.io.emit('skillEffect', {
                            type: 'damage',
                            targetId: data.targetId,
                            damage: finalDamage,
                            skillName: data.skillName,
                            attackerKarma: attacker.karma,
                            targetKarma: target.karma,
                            isCritical: finalDamage > data.damage
                        });
                    } else {
                        // Emit immunity feedback
                        this.io.emit('skillEffect', {
                            type: 'immune',
                            targetId: data.targetId,
                            skillName: data.skillName,
                            reason: target.karma === 0 ? 'illuminated' : 'forsaken'
                        });
                    }
                } else {
                    console.log('Skill use failed:', {
                        reason: attacker.path !== 'light' ? 'wrong path' : 'unknown skill',
                        attackerPath: attacker.path,
                        skillName: data.skillName
                    });
                }
            });

            // Handle karma actions
            socket.on('karmaAction', (data) => {
                const player = this.players.get(socket.id);
                const target = this.players.get(data.targetId);
                
                if (player && target) {
                    const now = Date.now();
                    if (now - player.lastKarmaAction >= 1000) { // 1 second cooldown
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
                }
            });

            // Handle karma updates
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

            // Add new handler for mana updates
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

            // Handle player death
            socket.on('playerDied', () => {
                const player = this.players.get(socket.id);
                if (player) {
                    // Remove player from game state but don't disconnect
                    this.players.delete(socket.id);
                    this.gameState.players.delete(socket.id);
                    this.lastUpdateTime.delete(socket.id);
                    this.lastStateTime.delete(socket.id);
                    
                    // Notify other players
                    this.io.emit('playerLeft', socket.id);
                }
            });
        });
    }

    createPlayer(socketId) {
        return {
            id: socketId,
            position: {
                x: 0,  // Fixed position at temple center
                y: 3,  // Changed from 0 to 3 to ensure player is properly positioned above the temple floor
                z: 0
            },
            rotation: {
                y: 0
            },
            path: null,
            karma: 50,
            maxKarma: 100,
            life: 100,
            maxLife: 100,
            mana: 100,
            maxMana: 100,
            color: `hsl(${Math.random() * 360}, 70%, 50%)`,
            displayName: `Player ${socketId.slice(0, 4)}`,
            effects: [],
            lastKarmaAction: 0
        };
    }

    startGameLoop() {
        setInterval(() => {
            this.gameState.lastUpdate = Date.now();
        }, 1000 / 60);
    }

    updatePlayerEffects(player) {
        const effects = [];

        if (player.karma >= 75) effects.push('enlightened');
        else if (player.karma <= 25) effects.push('cursed');

        if (player.karma >= 60) effects.push('blessed');
        else if (player.karma <= 40) effects.push('haunted');

        player.effects = effects;
    }
} 