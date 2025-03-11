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
    
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`Player connected: ${socket.id}`);
            
            // Create new player
            const player = this.createPlayer(socket.id);
            this.players.set(socket.id, player);
            this.gameState.players.set(socket.id, player); // Also add to gameState.players to match original
            
            // Send current players to new player
            socket.emit('currentPlayers', Array.from(this.players.values()));
            
            // Broadcast new player to others
            socket.broadcast.emit('newPlayer', player);

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

            // Handle disconnection - exactly as in the original
            socket.on('disconnect', () => {
                const player = this.players.get(socket.id);
                if (player) {
                    this.players.delete(socket.id);
                    this.gameState.players.delete(socket.id);
                    this.lastUpdateTime.delete(socket.id);
                    this.io.emit('playerLeft', socket.id);
                    console.log(`Player left: ${socket.id} (Total Players: ${this.players.size})`);
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
        const tickRate = 60; // Updates per second
        const tickInterval = 1000 / tickRate;

        setInterval(() => {
            this.update();
        }, tickInterval);
    }

    update() {
        // Update game state
        this.gameState.lastUpdate = Date.now();

        // Process any time-based effects
        for (const [_, player] of this.gameState.players) {
            this.updatePlayerEffects(player);
        }

        // Broadcast game state if needed
        if (this.gameState.players.size > 0) {
            this.io.emit('gameStateUpdate', {
                players: Array.from(this.gameState.players.values()),
                timestamp: this.gameState.lastUpdate
            });
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