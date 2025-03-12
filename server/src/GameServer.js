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
        console.log('GameServer: Setting up socket handlers');
        
        this.io.on('connection', (socket) => {
            console.log(`Player connected: ${socket.id}`);
            
            // Create new player
            const player = this.createPlayer(socket.id);
            this.players.set(socket.id, player);
            
            // Send current game state to new player
            socket.emit('initGameState', {
                players: Array.from(this.players.values()),
                serverTime: Date.now()
            });
            
            // Broadcast new player to others
            this.io.emit('newPlayer', player);

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
                        
                        // Broadcast movement to other players
                        this.io.emit('playerMoved', {
                            id: socket.id,
                            position: data.position,
                            rotation: data.rotation,
                            path: data.path,
                            karma: data.karma,
                            maxKarma: data.maxKarma,
                            life: player.life,
                            maxLife: player.maxLife,
                            mana: data.mana,
                            maxMana: data.maxMana
                        });
                        
                        this.lastUpdateTime.set(socket.id, now);
                    }
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
            position: { x: 0, y: 3, z: 0 },
            rotation: { y: 0 },
            life: 100,
            maxLife: 100,
            mana: 100,
            maxMana: 100,
            karma: 50,
            maxKarma: 100,
            path: "neutral",
            effects: []
        };
    }

    updatePlayerEffects(player) {
        // Reset effects
        player.effects = [];
        
        // Add effects based on karma level
        if (player.karma >= 75) {
            player.effects.push('light');
        } else if (player.karma <= 25) {
            player.effects.push('dark');
        }
    }

    startGameLoop() {
        setInterval(() => this.update(), 100);
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
} 