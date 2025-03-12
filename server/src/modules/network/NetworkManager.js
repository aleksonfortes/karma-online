/**
 * NetworkManager.js - Server-side network management
 * 
 * Handles socket connections, message validation, and rate limiting
 */
import { Server } from 'socket.io';

export class NetworkManager {
    constructor(httpServer, gameManager) {
        this.gameManager = gameManager;
        this.lastUpdateTime = new Map();
        this.playerLastPositions = new Map();
        this._lastLogs = {};
        
        // Initialize socket server with the same options as in the original implementation
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
            // Create new player through the game manager
            const player = this.gameManager.addPlayer(socket.id);
            
            // Log player connection with total count
            console.log(`Player connected: ${socket.id} (Total Players: ${this.gameManager.getPlayerCount()})`);
            
            // Send current game state to new player
            socket.emit('initGameState', {
                players: this.gameManager.getAllPlayers(),
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
                
                // Update player through game manager
                const success = this.gameManager.updatePlayerMovement(socket.id, sanitizedData);
                if (success) {
                    // Get updated player
                    const player = this.gameManager.getPlayer(socket.id);
                    
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
                const player = this.gameManager.removePlayer(socket.id);
                if (player) {
                    this.lastUpdateTime.delete(socket.id);
                    this.io.emit('playerLeft', socket.id);
                    console.log(`Player left: ${player.displayName} (Total Players: ${this.gameManager.getPlayerCount()})`);
                }
            });
        });
    }
    
    /**
     * Broadcast a full player list to all connected clients
     */
    broadcastPlayerList() {
        if (this.gameManager.getPlayerCount() > 0) {
            this.io.emit('fullPlayersSync', this.gameManager.getAllPlayers());
        }
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
        if (!this.gameManager.getPlayer(socketId)) {
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
}

export default NetworkManager;
