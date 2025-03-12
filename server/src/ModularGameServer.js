/**
 * ModularGameServer.js - Main server entry point for modular implementation
 * 
 * Initializes and coordinates the game server components
 */
import { Server } from 'socket.io';
import GameConstants from './config/GameConstants.js';

// Game server implementation
export class ModularGameServer {
    constructor(httpServer) {
        console.log('ModularGameServer: Initializing...');
        
        // Initialize socket.io with the same configuration as the original
        this.io = new Server(httpServer, {
            cors: {
                origin: ["https://localhost:5173", "https://localhost:3000"],
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling'],
            secure: true
        });

        // Initialize player management
        this.players = new Map();
        this.gameState = {
            players: new Map(),
            lastUpdate: Date.now()
        };
        this.lastUpdateTime = new Map();
        this.playerLastPositions = new Map();
        
        // Set up socket handlers
        this.setupSocketHandlers();
        
        // Start the game loop
        this.startGameLoop();
        
        console.log('ModularGameServer: Initialization complete');
    }
    
    /**
     * Broadcast the current player list to all clients
     */
    broadcastPlayerList() {
        if (this.players.size > 0) {
            this.io.emit('fullPlayersSync', Array.from(this.players.values()));
        }
    }
    
    /**
     * Utility logging function with optional throttling
     */
    log(message, level = 'info', throttle = false, throttleKey = null, throttleTime = 30000) {
        // If throttling is requested, check if we should log based on time
        if (throttle && throttleKey) {
            const now = Date.now();
            if (!this._lastLogs) this._lastLogs = {};
            
            // If we haven't logged this message recently, or it's the first time
            if (!this._lastLogs[throttleKey] || now - this._lastLogs[throttleKey] > throttleTime) {
                this._lastLogs[throttleKey] = now;
                console[level](`[ModularGameServer] ${message}`);
            }
        } else {
            // Regular non-throttled logging
            console[level](`[ModularGameServer] ${message}`);
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
            path: String(data.path || 'neutral'),
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
        if (!this.players.has(socketId)) {
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
     * Enhanced input validation
     */
    validatePlayerData(data) {
        if (!data || typeof data !== 'object') return false;
        const requiredFields = ['position', 'rotation', 'path', 'karma', 'maxKarma', 'mana', 'maxMana'];
        return requiredFields.every(field => {
            const value = data[field];
            return value !== undefined &&
                   (typeof value === 'number' || 
                    (typeof value === 'object' && 
                     !Array.isArray(value) && 
                     value !== null));
        });
    }

    /**
     * Set up socket event handlers
     */
    setupSocketHandlers() {
        console.log('ModularGameServer: Setting up socket handlers');
        
        this.io.on('connection', (socket) => {
            // Create new player
            const player = this.createPlayer(socket.id);
            this.players.set(socket.id, player);
            
            // Log player connection with total count
            console.log(`Player connected: ${socket.id} (Total Players: ${this.players.size})`);
            
            // Send current game state to new player
            socket.emit('initGameState', {
                players: Array.from(this.players.values()),
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
                if (!this.verifyMessageSignature(data, null)) { // Placeholder signature
                    this.logSecurityEvent(`Invalid message signature from player ${socket.id}`);
                    return;
                }
                const sanitizedData = this.sanitizeMovementData(data);
                if (!sanitizedData) {
                    this.logSecurityEvent(`Invalid movement data from player ${socket.id}`);
                    return;
                }
                const player = this.players.get(socket.id);
                if (player) {
                    player.position = sanitizedData.position;
                    player.rotation = sanitizedData.rotation;
                    player.path = sanitizedData.path;
                    player.karma = sanitizedData.karma;
                    player.maxKarma = sanitizedData.maxKarma;
                    
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

            // Handle disconnection
            socket.on('disconnect', () => {
                const player = this.players.get(socket.id);
                if (player) {
                    this.players.delete(socket.id);
                    this.gameState.players.delete(socket.id);
                    this.lastUpdateTime.delete(socket.id);
                    this.io.emit('playerLeft', socket.id);
                    console.log(`Player left: ${player.displayName || socket.id} (Total Players: ${this.players.size})`);
                }
            });
        });
    }

    /**
     * Create a new player with default values
     */
    createPlayer(socketId) {
        return {
            id: socketId,
            position: { ...GameConstants.PLAYER.SPAWN_POSITION },
            rotation: { ...GameConstants.PLAYER.DEFAULT_ROTATION },
            life: GameConstants.PLAYER.DEFAULT_LIFE,
            maxLife: GameConstants.PLAYER.DEFAULT_MAX_LIFE,
            mana: GameConstants.PLAYER.DEFAULT_MANA,
            maxMana: GameConstants.PLAYER.DEFAULT_MAX_MANA,
            karma: GameConstants.PLAYER.DEFAULT_KARMA,
            maxKarma: GameConstants.PLAYER.DEFAULT_MAX_KARMA,
            path: GameConstants.PLAYER.DEFAULT_PATH,
            effects: [],
            modelScale: GameConstants.PLAYER.MODEL_SCALE,
            displayName: `Player-${socketId.substring(0, 5)}`
        };
    }

    /**
     * Update player effects based on karma level
     */
    updatePlayerEffects(player) {
        // Reset effects
        player.effects = [];
        
        // Add effects based on karma level
        if (player.karma < 30) {
            player.effects.push('dark_aura');
        } else if (player.karma > 70) {
            player.effects.push('light_aura');
        }
        
        // Additional effects based on path
        if (player.path === 'dark') {
            player.effects.push('dark_path');
        } else if (player.path === 'light') {
            player.effects.push('light_path');
        }
    }

    /**
     * Start the game update loop
     */
    startGameLoop() {
        // Update game state every 100ms (10 times per second)
        setInterval(() => this.update(), 100);
    }
    
    /**
     * Update game state
     */
    update() {
        const now = Date.now();
        const deltaTime = now - this.gameState.lastUpdate;
        this.gameState.lastUpdate = now;
        
        // Update all players
        for (const [socketId, player] of this.players.entries()) {
            this.updatePlayerEffects(player);
        }
    }
}

export default ModularGameServer;
