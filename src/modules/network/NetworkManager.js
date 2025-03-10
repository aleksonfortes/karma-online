import io from 'socket.io-client';
import * as THREE from 'three';

export class NetworkManager {
    constructor(game, serverUrl) {
        this.game = game;
        this.SERVER_URL = serverUrl || 'http://localhost:3000';
        this.socket = null;
        this.isConnected = false;
        this.isOffline = false;
        this.wasConnectedBefore = false;
        this.initialSyncComplete = false;
        
        // Movement interpolation settings
        this.lerpFactor = 0.15; // Smoothing factor - higher means more responsive
        
        // Update tracking
        this.lastPositionUpdate = 0;
        this.lastStateUpdate = 0;
        this.lastUpdateTime = 0;
        this.logFrequency = 500; // Log frequency in milliseconds
        this.lastNetworkLog = 0;
    }
    
    async init() {
        console.log('Initializing Network Manager');
        
        try {
            // Try to connect to server
            await this.setupMultiplayer();
            return true;
        } catch (error) {
            console.warn('Failed to connect to server, using offline mode:', error.message);
            this.isOffline = true;
            
            // Initialize local player in offline mode
            this.initializeLocalPlayerOffline();
            
            return true; // Still return true to continue game initialization
        }
    }
    
    setupMultiplayer() {
        console.log('Connecting to server...');
        
        // Create socket connection
        this.socket = io(this.SERVER_URL, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        // Store socket in game for direct access
        this.game.socket = this.socket;
        
        return new Promise((resolve, reject) => {
            // Set up connection timeout
            const timeout = setTimeout(() => {
                if (!this.socket.connected) {
                    console.warn('Connection timeout');
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
            
            // Handle connection success
            this.socket.once('connect', () => {
                clearTimeout(timeout);
                console.log('Connected to server with ID:', this.socket.id);
                this.isConnected = true;
                
                // Set up socket event handlers
                this.setupSocketListeners();
                
                // Request initial state update
                this.socket.emit('requestStateUpdate');
                
                resolve();
            });
            
            // Handle connection error
            this.socket.once('connect_error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }
    
    setupSocketListeners() {
        if (!this.socket) return;
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
        });
        
        // Process current players when we first connect
        this.socket.on('currentPlayers', (players) => {
            this.log('Received current players list with ' + players.length + ' players');
            this.updatePlayerList(players);
        });
        
        // Handle new player joining
        this.socket.on('newPlayer', (player) => {
            this.log('New player joined: ' + player.id.substring(0, 8));
            this.updatePlayerList([player]);
        });
        
        // Handle player leaving
        this.socket.on('playerLeft', (playerId) => {
            console.log('Player left:', playerId.substring(0, 8));
            this.removePlayer(playerId);
        });
        
        // Handle player movement updates
        this.socket.on('playerMoved', (playerData) => {
            this.updatePlayerPosition(playerData);
        });
    }
    
    initializeLocalPlayerOffline() {
        console.log('Initializing player in offline mode');
        
        // Create a local player even without server connection
        if (this.game.playerManager) {
            this.game.playerManager.createPlayer('local-player', { x: 0, y: 3, z: 0 })
                .then(player => {
                    console.log('Local player created in offline mode');
                })
                .catch(error => {
                    console.error('Failed to create local player in offline mode:', error);
                });
        }
    }
    
    updatePlayerList(playerList) {
        this.log('Processing player list: ' + playerList.length + ' players');
        
        // Process all players in the list
        playerList.forEach(async (player) => {
            // Skip undefined players
            if (!player || !player.id) {
                console.warn('Received invalid player data:', player);
                return;
            }
            
            try {
                if (player.id === this.socket?.id) {
                    // This is the local player - make sure it exists
                    if (!this.game.localPlayer) {
                        console.log('Creating local player:', player.id);
                        
                        // Create the local player through PlayerManager
                        const localPlayer = await this.game.playerManager.createPlayer(
                            player.id, 
                            player.position || { x: 0, y: 3, z: 0 },
                            { y: player.rotation?.y || 0 }
                        );
                        
                        console.log('Local player created successfully at:', localPlayer.position);
                    } else {
                        // Update existing local player
                        const existingPlayer = this.game.localPlayer;
                        
                        if (player.position && !this.initialSyncComplete) {
                            // Only update position from server during initial sync
                            existingPlayer.position.set(
                                player.position.x,
                                player.position.y,
                                player.position.z
                            );
                            console.log('Updated local player position from server:', existingPlayer.position);
                        }
                    }
                } else {
                    // Handle other players
                    const existingPlayer = this.game.players.get(player.id);
                    
                    if (!existingPlayer) {
                        console.log('Creating remote player:', player.id);
                        
                        // Create a new player if they don't exist
                        await this.game.playerManager.createPlayer(
                            player.id,
                            player.position || { x: 0, y: 3, z: 0 },
                            { y: player.rotation?.y || 0 }
                        );
                    } else {
                        // Update existing remote player
                        
                        // Update position
                        if (player.position) {
                            existingPlayer.position.set(
                                player.position.x,
                                player.position.y,
                                player.position.z
                            );
                        }
                        
                        // Update rotation
                        if (player.rotation) {
                            existingPlayer.rotation.y = player.rotation.y;
                        }
                    }
                }
            } catch (error) {
                console.error(`Error processing player ${player.id}:`, error);
            }
        });
        
        // After processing all players in the current list, set initialSyncComplete
        if (!this.initialSyncComplete) {
            this.initialSyncComplete = true;
            console.log('Initial player sync complete');
        }
    }
    
    updatePlayerPosition(playerData) {
        // Skip if data is missing or this is our own player
        if (!playerData || !playerData.id || playerData.id === this.socket?.id) {
            return;
        }
        
        try {
            // Get the player from the map
            const player = this.game.players.get(playerData.id);
            
            // If player doesn't exist, try to create it
            if (!player) {
                this.log('Player ' + playerData.id.substring(0, 8) + ' not found - creating new player');
                this.updatePlayerList([playerData]);
                return;
            }
            
            // Make sure player has position and rotation
            if (!player.position || !player.rotation) {
                return;
            }
            
            // Update position
            if (playerData.position) {
                player.position.set(
                    playerData.position.x,
                    playerData.position.y,
                    playerData.position.z
                );
            }
            
            // Update rotation
            if (playerData.rotation) {
                player.rotation.y = playerData.rotation.y;
            }
        } catch (error) {
            console.error('Error updating player position:', error);
        }
    }
    
    sendPlayerPosition() {
        if (!this.socket?.connected || !this.game.localPlayer) {
            return;
        }
        
        // Send position to server
        this.socket.emit('playerMovement', {
            position: {
                x: this.game.localPlayer.position.x,
                y: this.game.localPlayer.position.y,
                z: this.game.localPlayer.position.z
            },
            rotation: {
                y: this.game.localPlayer.rotation.y
            }
        });
    }
    
    removePlayer(playerId, broadcast = true) {
        console.log(`Removing player: ${playerId.substring(0, 8)}`);
        
        // Get the player before removing from map
        const player = this.game.players.get(playerId);
        if (!player) {
            console.warn(`Cannot remove player ${playerId}: player not found in map`);
            return;
        }
        
        try {
            // Remove player mesh from scene
            this.game.scene.remove(player);
            
            // Clean up any associated resources
            if (player.geometry) player.geometry.dispose();
            if (player.material) {
                if (Array.isArray(player.material)) {
                    player.material.forEach(mat => mat.dispose());
                } else {
                    player.material.dispose();
                }
            }
            
            // Remove from game's player map
            this.game.players.delete(playerId);
            
            console.log(`Player ${playerId} removed`);
            
            // Only notify server about player removal if broadcast is true
            // This is false during reconnection cleanup to avoid duplicate removal events
            if (broadcast && this.socket && this.isConnected) {
                this.socket.emit('playerLeft', playerId);
            }
        } catch (error) {
            console.error(`Error removing player ${playerId}:`, error);
        }
    }
    
    cleanup() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.isConnected = false;
    }
    
    update() {
        const now = Date.now();
        const deltaTime = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;
        
        // Don't process if we're not connected or in offline mode
        if (!this.isConnected || this.isOffline) {
            return;
        }
        
        // Safety check - players need to be an instance of Map
        if (!this.game.players || !(this.game.players instanceof Map)) {
            return;
        }
        
        // Send position updates if we have a valid local player
        if (this.socket && this.game.localPlayer) {
            if (now - this.lastPositionUpdate > 50) { // 20 times per second max
                this.sendPlayerPosition();
                this.lastPositionUpdate = now;
            }
        }
        
        try {
            // Interpolate positions and rotations for all remote players
            this.game.players.forEach((player, playerId) => {
                // Skip null players or the local player
                if (!player || playerId === this.socket?.id || playerId === 'local' || playerId === 'local-temp') {
                    return;
                }
                
                // Make sure player has position and rotation
                if (!player.position || !player.rotation) {
                    return;
                }
                
                // Interpolate rotation (with safety checks)
                if (player.rotation && typeof player.rotation.y !== 'undefined') {
                    const targetRot = player.rotation.y;
                    const currentRot = player.rotation.y;
                    
                    // Calculate shortest rotation path
                    let diff = targetRot - currentRot;
                    if (diff > Math.PI) diff -= Math.PI * 2;
                    if (diff < -Math.PI) diff += Math.PI * 2;
                    
                    // Lerp rotation
                    player.rotation.y += diff * this.lerpFactor;
                    
                    // If we're close enough, remove the target
                    if (Math.abs(diff) < 0.01) {
                        // No need to remove target rotation as it's not stored
                    }
                }
            });
        } catch (err) {
            console.error('Error in NetworkManager.update:', err);
        }
    }
    
    // Add a rate-limited logging function
    log(message) {
        const now = Date.now();
        // Only log once per logFrequency milliseconds 
        if (now - this.lastNetworkLog > this.logFrequency) {
            console.log(`[Network] ${message}`);
            this.lastNetworkLog = now;
        }
    }
}