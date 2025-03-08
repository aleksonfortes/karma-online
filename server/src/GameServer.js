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

    setupSocketHandlers() {
        console.log('GameServer: Setting up socket handlers');
        
        this.io.on('connection', (socket) => {
            console.log(`Player connected: ${socket.id}`);

            // Only create players for browser clients
            if (socket.handshake.headers['user-agent']?.includes('Mozilla')) {
                // Initialize player data
                const player = this.createPlayer(socket.id);
                
                // Add player to the game state
                this.players.set(socket.id, player);
                this.gameState.players.set(socket.id, player);
                console.log(`Player joined: ${player.displayName} (Total Players: ${this.players.size})`);

                // Send current game state to the new player
                const currentPlayers = Array.from(this.gameState.players.values());
                socket.emit('currentPlayers', currentPlayers);

                // Notify other players about the new player
                socket.broadcast.emit('newPlayer', player);
            }

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
                        this.lastUpdateTime.set(socket.id, now);
                        
                        // Broadcast movement to other players
                        socket.broadcast.emit('playerMoved', {
                            id: socket.id,
                            position: data.position,
                            rotation: data.rotation
                        });
                    }
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
                    // Update player's stats in server state
                    player.karma = data.karma;
                    player.maxKarma = data.maxKarma;
                    player.life = data.life;
                    player.maxLife = data.maxLife;
                    player.mana = data.mana;
                    player.maxMana = data.maxMana;
                    
                    // Update effects
                    this.updatePlayerEffects(player);
                    
                    // Broadcast to ALL clients including sender for consistency
                    this.io.emit('karmaUpdate', {
                        id: socket.id,
                        karma: data.karma,
                        maxKarma: data.maxKarma,
                        life: data.life,
                        maxLife: data.maxLife,
                        mana: data.mana,
                        maxMana: data.maxMana,
                        effects: player.effects
                    });
                }
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                const player = this.players.get(socket.id);
                if (player) {
                    this.players.delete(socket.id);
                    this.gameState.players.delete(socket.id);
                    this.lastUpdateTime.delete(socket.id);
                    this.io.emit('playerLeft', socket.id);
                    console.log(`Player left: ${player.displayName} (Total Players: ${this.players.size})`);
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

    validateMovement(data) {
        // Implement movement validation logic
        // Check for speed hacks, teleporting, etc.
        const maxSpeed = 10; // units per second
        const timeDelta = (Date.now() - this.gameState.lastUpdate) / 1000;
        
        if (!data.position || !data.rotation) return false;
        
        // Basic position validation
        if (Math.abs(data.position.x) > 1000 || 
            Math.abs(data.position.y) > 1000 || 
            Math.abs(data.position.z) > 1000) {
            return false;
        }

        // Speed validation
        const speed = Math.sqrt(
            Math.pow(data.position.x, 2) + 
            Math.pow(data.position.z, 2)
        ) / timeDelta;

        return speed <= maxSpeed;
    }

    validateKarmaAction(data) {
        // Implement karma action validation
        const player = this.players.get(data.playerId);
        if (!player) return false;

        // Check cooldown
        const cooldown = 1000; // 1 second
        if (Date.now() - player.lastKarmaAction < cooldown) {
            return false;
        }

        // Validate action type and target
        return ['give', 'take'].includes(data.action) && 
               this.gameState.players.has(data.targetId);
    }

    processKarmaAction(player, data) {
        const target = this.gameState.players.get(data.targetId);
        if (!target) return { success: false };

        const amount = data.action === 'give' ? 1 : -1;
        target.karma += amount;
        player.lastKarmaAction = Date.now();

        // Calculate and apply effects
        const effects = this.calculateKarmaEffects(target.karma);
        target.effects = effects;

        return {
            success: true,
            effect: {
                type: data.action,
                amount,
                effects
            }
        };
    }

    calculateKarmaEffects(karma) {
        // Implement karma effects calculation
        const effects = [];
        
        if (karma >= 10) effects.push('enlightened');
        else if (karma <= -10) effects.push('cursed');
        
        if (Math.abs(karma) >= 5) {
            effects.push(karma > 0 ? 'blessed' : 'haunted');
        }

        return effects;
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