import io from 'socket.io-client';
import * as THREE from 'three';

export class NetworkManager {
    constructor(game) {
        this.game = game;
        this.socket = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.isOffline = false;
        this.serverURL = process.env.NODE_ENV === 'production' 
            ? window.location.origin 
            : 'http://localhost:3000';
        
        // Rate limiting for position updates
        this.lastPositionUpdate = 0;
        this.updateRate = 100; // ms between updates (10 updates per second)
        this.positionQueue = [];
        this.lastNetworkLog = 0;
        this.lastPositionLog = 0;
        this.logFrequency = 5000; // Only log every 5 seconds
        
        // Anti-duplication settings
        this._handlersInitialized = false;
        this._creatingPlayers = new Set();
        this._lastStateUpdate = 0;
        this._minTimeBetweenUpdates = 200; // 5 updates per second max
        this._connectionAttempts = 0;
        this._maxReconnectAttempts = 5;
        this._reconnectDelay = 2000; // Start with 2 second delay
        this._reconnectBackoff = 1.5; // Multiply delay by this factor on each attempt
    }

    async connect() {
        if (this.isConnected || this.isConnecting) {
            this.log('Already connected or connecting, ignoring connect call', 'debug');
            return;
        }
        
        this.isConnecting = true;
        this._connectionAttempts++;
        
        try {
            // Prevent duplicate connections
            if (this.socket) {
                // If we already have a socket that might be in reconnecting state,
                // don't create a new one, just wait for it to reconnect
                this.log('Socket already exists, waiting for reconnection...', 'info');
                this.isConnecting = false;
                return;
            }
            
            this.log(`Connecting to server at ${this.serverURL}`, 'info');
            
            // Clear previous socket instances if they exist
            if (window.socket) {
                this.log('Found global socket instance, closing it first', 'warn');
                try {
                    window.socket.close();
                    window.socket = null;
                } catch (err) {
                    this.log('Error closing previous socket', 'error');
                }
            }
            
            // Create socket with reconnection config
            this.socket = io(this.serverURL, {
                reconnection: true,
                reconnectionAttempts: this._maxReconnectAttempts,
                reconnectionDelay: this._reconnectDelay,
                reconnectionDelayMax: 10000,
                timeout: 10000,
                autoConnect: true
            });
            
            // Store globally (helps with debugging)
            window.socket = this.socket;
            
            // Set up basic handlers
            this.setupSocketHandlers();
            
            // Set up the remaining game-specific handlers
            // (We do this after successful connection)
            
            // Wait for connection
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);
                
                this.socket.once('connect', () => {
                    clearTimeout(timeout);
                    this.isConnected = true;
                    this._connectionAttempts = 0; // Reset on successful connection
                    this._reconnectDelay = 2000; // Reset delay
                    resolve();
                });
                
                this.socket.once('connect_error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });
            
            this.setupRemainingHandlers();
            
            return true;
        } catch (error) {
            this.log(`Connection error: ${error.message}`, 'error');
            
            // Implement exponential backoff for reconnection
            const delay = this._reconnectDelay * Math.pow(this._reconnectBackoff, this._connectionAttempts - 1);
            this.log(`Will retry in ${Math.round(delay/1000)} seconds (attempt ${this._connectionAttempts})`, 'info');
            
            // Schedule a reconnection attempt
            if (this._connectionAttempts <= this._maxReconnectAttempts) {
                setTimeout(() => {
                    this.isConnecting = false;
                    this.connect();
                }, delay);
            } else {
                this.log('Max reconnection attempts reached, entering offline mode', 'warn');
                this.isConnecting = false;
                this.enterOfflineMode();
            }
            
            return false;
        } finally {
            this.isConnecting = false;
        }
    }

    setupSocketHandlers() {
        if (!this.socket) {
            this.log('Cannot setup handlers: No socket connection', 'warn');
            return;
        }

        this.log('Setting up socket handlers', 'info');

        // Clean up any stale event listeners before adding new ones
        this.socket.removeAllListeners('connect');
        this.socket.removeAllListeners('disconnect');
        this.socket.removeAllListeners('error');
        this.socket.removeAllListeners('reconnect');
        this.socket.removeAllListeners('reconnect_attempt');
        this.socket.removeAllListeners('reconnect_error');
        this.socket.removeAllListeners('reconnect_failed');

        // Handle successful connection
        this.socket.on('connect', () => {
            this.log(`Connected to server with socket ID: ${this.socket.id}`, 'info');
            this.isConnected = true;
            
            // Clean up any duplicate or orphaned players when we connect
            this.cleanupAllNonLocalPlayers();
            
            // Make sure we have a local player with the correct ID
            if (!this.game.localPlayer || this.game.localPlayer.userData?.playerId !== this.socket.id) {
                // Create a new local player with our socket ID
                this.createLocalPlayer().then(player => {
                    if (!player) {
                        this.log('Failed to create local player after connection', 'error');
                    }
                });
            }
        });

        // Handle disconnect
        this.socket.on('disconnect', (reason) => {
            this.log(`Disconnected from server. Reason: ${reason}`, 'warn');
            this.isConnected = false;
            
            // Don't destroy player on disconnect - we might reconnect
        });

        // Handle reconnect attempt
        this.socket.on('reconnect_attempt', (attemptNumber) => {
            this.log(`Reconnection attempt ${attemptNumber}`, 'info');
        });

        // Handle successful reconnection
        this.socket.on('reconnect', (attemptNumber) => {
            this.log(`Reconnected to server after ${attemptNumber} attempts`, 'info');
            this.isConnected = true;
            
            // Clean up potentially stale players
            this.cleanupAllNonLocalPlayers();
        });

        // Handle reconnection error
        this.socket.on('reconnect_error', (error) => {
            this.log(`Reconnection error: ${error.message}`, 'error');
        });

        // Handle reconnection failure
        this.socket.on('reconnect_failed', () => {
            this.log('Failed to reconnect to server after max attempts', 'error');
            
            // Enter offline mode if reconnection fails
            this.enterOfflineMode();
        });

        // Handle connection error
        this.socket.on('connect_error', (error) => {
            this.log(`Connection error: ${error.message}`, 'error');
            
            // Don't enter offline mode immediately, let the retry mechanism work
        });
    }
    
    // Add method to handle offline mode
    enterOfflineMode() {
        console.log('Entering offline mode');
        this.isOffline = true;
        this.isConnected = false;
        this.isConnecting = false;
        
        // Clean up any existing socket connection
        if (this.socket) {
            console.log('Cleaning up socket connection for offline mode');
            this.socket.off('connect');
            this.socket.off('disconnect');
            this.socket.off('connect_error');
            this.socket.disconnect();
            this.socket = null;
        }
        
        // Create offline player if needed
        if (!this.game.localPlayer) {
            console.log('Creating offline player');
            this.initializeLocalPlayerOffline();
        }
        
        // Show offline notification to the user
        if (this.game.uiManager) {
            this.game.uiManager.showNotification('Playing in offline mode', 'info');
            this.game.uiManager.hideLoadingScreen();
        }
    }

    async init() {
        try {
            this.isConnecting = true;
            
            // Try to detect the actual server port
            let serverUrl = this.serverURL;
            
            // If in development, try to detect the actual port
            if (import.meta.env.DEV) {
                try {
                    const detectedPort = await this.detectServerPort();
                    serverUrl = `${window.location.protocol}//${window.location.hostname}:${detectedPort}`;
                    console.log(`Detected server port: ${detectedPort}`);
                } catch (err) {
                    console.warn('Failed to detect server port, using default:', this.serverURL);
                }
            }
            
            if (serverUrl) {
                console.log('Connecting to server at:', serverUrl);
                
                // Import Socket.io client dynamically
                const { io } = await import('socket.io-client');
                
                // Check if there's already a socket and clean it up
                if (this.socket) {
                    console.log('Cleaning up existing socket before creating a new one');
                    this.socket.disconnect();
                    this.socket = null;
                }
                
                // Create the socket connection
                this.socket = io(serverUrl, {
                    transports: ['websocket', 'polling'],
                    upgrade: true,
                    reconnection: true,
                    reconnectionAttempts: 5,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 5000, // Reduced timeout to fail faster
                    autoConnect: true
                });
                
                // Setup explicit reference in the game for socket
                this.game.socket = this.socket;
                
                // Wait for connection with a shorter timeout
                const connected = await Promise.race([
                    new Promise((resolve) => {
                        this.socket.once('connect', () => {
                            console.log('Connected to server with socket ID:', this.socket.id);
                            this.isConnected = true;
                            this.isConnecting = false;
                            resolve(true);
                        });
                    }),
                    new Promise((resolve) => {
                        this.socket.once('connect_error', (error) => {
                            console.error('Socket connection error:', error);
                            resolve(false);
                        });
                    }),
                    new Promise((resolve) => setTimeout(() => {
                        console.warn('Socket connection timeout');
                        resolve(false);
                    }, 5000))
                ]);
                
                if (!connected) {
                    console.warn('Failed to connect to server, entering offline mode');
                    this.enterOfflineMode();
                    return false;
                }
                
                // Setup socket event handlers
                this.setupSocketHandlers();
                
                // Initialize multiplayer with delay to ensure socket is ready
                setTimeout(() => this.setupMultiplayer(), 500);
                
                return true;
            } else {
                console.warn('No server URL provided, initializing in offline mode');
                this.enterOfflineMode();
                return false;
            }
        } catch (error) {
            console.error('Failed to initialize network connection:', error);
            
            // Fall back to offline mode if connection fails
            this.enterOfflineMode();
            return false;
        } finally {
            this.isConnecting = false;
        }
    }
    
    setupMultiplayer() {
        console.log('Setting up multiplayer...');
        
        try {
            // Wait a bit to ensure everything is loaded
            setTimeout(async () => {
                // Clean up any existing players first
                this.cleanupAllNonLocalPlayers();
                
                // Create local player if socket is connected and doesn't exist
                if (this.socket && this.socket.connected && !this.game.localPlayer) {
                    console.log('Creating local player during multiplayer setup');
                    await this.createLocalPlayer();
                }
            }, 1000);
        } catch (error) {
            console.error('Error setting up multiplayer:', error);
        }
    }
    
    async updatePlayerList(playerList) {
        try {
            // Limit the frequency of this log to reduce spam
            const now = Date.now();
            if (!this._lastPlayerListLog || now - this._lastPlayerListLog > 5000) {
                this.log(`Processing player list: ${playerList.length} players`, 'info');
                this._lastPlayerListLog = now;
            } else {
                this.log(`Processing player list: ${playerList.length} players`, 'debug');
            }
            
            // DEFENSIVE: Make sure playerManager and players exist
            if (!this.game.playerManager) {
                this.log("Player manager is undefined - cannot update player list", 'error');
                return;
            }
            
            // Ensure players collection exists
            if (!this.game.playerManager.players) {
                this.game.playerManager.players = new Map();
            }
            
            // First, perform a thorough duplicate check in the scene
            // Get all player IDs from the incoming list
            const incomingPlayerIds = new Set(playerList.map(player => player.id));
            
            // Add our local player ID to ensure we don't remove it
            if (this.socket?.id) {
                incomingPlayerIds.add(this.socket.id);
            }
            
            // Find ALL player objects in the scene
            const playerObjectsInScene = [];
            this.game.scene.traverse(object => {
                if (object.userData && object.userData.playerId) {
                    playerObjectsInScene.push(object);
                }
            });
            
            // Group player objects by ID to find duplicates
            const playerObjectsByIds = {};
            for (const obj of playerObjectsInScene) {
                const playerId = obj.userData.playerId;
                if (!playerObjectsByIds[playerId]) {
                    playerObjectsByIds[playerId] = [];
                }
                playerObjectsByIds[playerId].push(obj);
            }
            
            // Remove duplicates (keep the first object for each player ID)
            let duplicatesRemoved = 0;
            for (const [playerId, objects] of Object.entries(playerObjectsByIds)) {
                // Skip if there's only one object for this player
                if (objects.length <= 1) continue;
                
                // Keep the first object (or the local player if it's in this list)
                const localPlayerObj = this.game.localPlayer && 
                    objects.find(obj => obj === this.game.localPlayer);
                
                const keepObject = localPlayerObj || objects[0];
                
                // Remove all other objects
                for (const obj of objects) {
                    if (obj !== keepObject && obj.parent) {
                        this.log(`Removing duplicate object for player ${playerId}`, 'debug');
                        obj.parent.remove(obj);
                        duplicatesRemoved++;
                    }
                }
            }
            
            if (duplicatesRemoved > 0) {
                this.log(`Removed ${duplicatesRemoved} duplicate player objects`, 'info');
            }
            
            // Create a Set of player IDs already in the scene for faster lookup
            const existingPlayerIds = new Set();
            this.game.playerManager.players.forEach((player, id) => {
                existingPlayerIds.add(id);
            });
            
            // Keep track of duplicates for removal
            const duplicatePlayerIds = new Set();
            
            // Check for duplicates in the scene
            const playerIdsInScene = new Set();
            this.game.scene.traverse(object => {
                if (object.userData && object.userData.playerId) {
                    if (playerIdsInScene.has(object.userData.playerId)) {
                        // This is a duplicate
                        duplicatePlayerIds.add(object.userData.playerId);
                    } else {
                        playerIdsInScene.add(object.userData.playerId);
                    }
                }
            });
            
            if (duplicatePlayerIds.size > 0) {
                this.log(`Duplicate players detected in scene. Will remove ${duplicatePlayerIds.size} duplicates.`, 'warn');
                // Remove duplicates here instead of just warning
                this.cleanupDuplicatePlayers(duplicatePlayerIds);
            }
            
            // Create sets of current and new player IDs for efficient comparison
            const currentPlayers = new Set(Array.from(this.game.playerManager.players.keys()));
            const newPlayers = new Set(playerList.map(player => player.id));
            
            this.log("Current player IDs in game:", Array.from(currentPlayers), 'debug');
            this.log("New player IDs from server:", Array.from(newPlayers), 'debug');
            this.log("Local player ID:", this.socket?.id, 'debug');
            
            // Remove players that are not in the updated list
            for (const playerId of currentPlayers) {
                // Skip the local player - don't remove it based on server updates
                if (playerId === this.socket?.id) continue;
                
                // Skip offline player IDs which start with "offline-"
                if (playerId.startsWith('offline-')) {
                    this.log(`Removing player ${playerId} as they're not in the updated list`, 'debug');
                    this.removePlayer(playerId, false);
                    continue;
                }
                
                if (!newPlayers.has(playerId)) {
                    this.log(`Removing player ${playerId} as they're not in the updated list`, 'debug');
                    this.removePlayer(playerId, false);
                }
            }
            
            // Add or update players from the server list
            for (const playerData of playerList) {
                const playerId = playerData.id;
                
                // Skip processing the local player from the server update
                if (playerId === this.socket?.id) continue;
                
                this.log(`Processing remote player: ${playerId}`, 'debug');
                
                // Check if this player already exists
                if (this.game.playerManager.players.has(playerId)) {
                    // Player exists, update their position if it's significantly different
                    const player = this.game.playerManager.players.get(playerId);
                    const serverPos = playerData.position;
                    const currentPos = player.position;
                    
                    // Calculate distance between current position and server position
                    const dx = serverPos.x - currentPos.x;
                    const dy = serverPos.y - currentPos.y;
                    const dz = serverPos.z - currentPos.z;
                    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    
                    // If the distance is significant (greater than 0.5 units), update position
                    if (distance > 0.5) {
                        this.log(`Updating position for player ${playerId} - distance: ${distance.toFixed(2)}`, 'debug');
                        this.updatePlayerPosition(playerData);
                    }
                    
                    // Update animation state if needed
                    this.updatePlayerAnimation(player, playerData);
                } else {
                    // Player doesn't exist, create them
                    this.log(`Creating new remote player: ${playerId} at position: ${JSON.stringify(playerData.position)}`, 'debug');
                    try {
                        await this.addNetworkPlayer(playerId, playerData);
                    } catch (error) {
                        this.log(`Error creating remote player ${playerId}: ${error}`, 'error');
                    }
                }
            }
            
            // Final cleanup - check for any orphaned player objects in the scene not in our player map
            this.cleanupOrphanedPlayers();
            
            this.log(`Player list update complete. Total players: ${this.game.playerManager.players.size}`, 'info');
        } catch (error) {
            this.log("Error updating player list:", error, 'error');
        }
    }
    
    // New method to remove duplicate player objects from the scene
    cleanupDuplicatePlayers(duplicateIds) {
        try {
            let removed = 0;
            // First, find all mesh instances with these IDs
            const duplicateMeshes = [];
            this.game.scene.traverse(object => {
                if (object.userData && object.userData.playerId && duplicateIds.has(object.userData.playerId)) {
                    // Keep track of this object for potential removal
                    duplicateMeshes.push(object);
                }
            });
            
            // Group duplicate meshes by player ID
            const playerMeshes = {};
            duplicateMeshes.forEach(mesh => {
                const playerId = mesh.userData.playerId;
                if (!playerMeshes[playerId]) {
                    playerMeshes[playerId] = [];
                }
                playerMeshes[playerId].push(mesh);
            });
            
            // For each player ID, keep only the first mesh and remove others
            Object.entries(playerMeshes).forEach(([playerId, meshes]) => {
                // Skip the first mesh (keep it)
                for (let i = 1; i < meshes.length; i++) {
                    const mesh = meshes[i];
                    if (mesh.parent) {
                        mesh.parent.remove(mesh);
                        removed++;
                        this.log(`Removed duplicate mesh for player: ${playerId}`, 'debug');
                    }
                }
            });
            
            this.log(`Removed ${removed} duplicate player meshes`, 'info');
        } catch (error) {
            this.log("Error cleaning up duplicate players:", error, 'error');
        }
    }

    cleanupOrphanedPlayers() {
        try {
            const knownPlayerIds = new Set(Array.from(this.game.playerManager.players.keys()));
            const orphanedObjects = [];
            let orphanCount = 0;
            
            // Find all player objects not in our player map
            this.game.scene.traverse(object => {
                if (object.userData && object.userData.playerId) {
                    const playerId = object.userData.playerId;
                    // If this is not a known player, it's orphaned
                    if (!knownPlayerIds.has(playerId)) {
                        orphanedObjects.push(object);
                        orphanCount++;
                        this.log(`Found orphaned player in scene: ${playerId}`, 'debug');
                    }
                }
            });
            
            // Remove all orphaned objects
            let removed = 0;
            orphanedObjects.forEach(object => {
                if (object.parent) {
                    object.parent.remove(object);
                    removed++; // Increment removed count
                }
            });
            
            this.log(`Cleanup complete. Removed ${removed} players. Found ${orphanCount} orphans.`, 'info');
        } catch (error) {
            this.log("Error cleaning up orphaned players:", error, 'error');
        }
    }
    
    updatePlayerPosition(playerData) {
        if (!playerData || !playerData.id) {
            this.log('Received invalid player data for position update', 'warn');
            return;
        }
        
        try {
            // Skip updates for our own player (we handle that locally)
            if (playerData.id === this.socket?.id) return;
            
            // Make sure player manager exists
            if (!this.game.playerManager) {
                this.log('Player manager not initialized, cannot update position', 'warn');
                return;
            }
            
            // Make sure players map exists
            if (!this.game.playerManager.players) {
                this.game.playerManager.players = new Map();
                return;
            }
            
            // Get player from the player manager
            const player = this.game.playerManager.players.get(playerData.id);
            
            // If player doesn't exist, silently return
            if (!player) return;
            
            // Store previous position for interpolation
            const previousPosition = player.position.clone();
            
            // Create target position for smooth interpolation
            if (!player.userData) player.userData = {};
            
            player.userData.targetPosition = new THREE.Vector3(
                playerData.position.x,
                playerData.position.y,
                playerData.position.z
            );
            
            // For large jumps (teleporting), update position immediately
            const distanceToTarget = previousPosition.distanceTo(player.userData.targetPosition);
            if (distanceToTarget > 10) {
                this.log(`Player ${playerData.id} teleported - distance: ${distanceToTarget}`, 'debug');
                player.position.copy(player.userData.targetPosition);
            }
            
            // Update target rotation
            if (playerData.rotation !== undefined) {
                player.userData.targetRotation = playerData.rotation.y;
            }
            
            // Update player stats if provided
            const statsToUpdate = {};
            
            // Only include stats that are provided in the update
            if (playerData.life !== undefined) statsToUpdate.life = playerData.life;
            if (playerData.maxLife !== undefined) statsToUpdate.maxLife = playerData.maxLife;
            if (playerData.mana !== undefined) statsToUpdate.mana = playerData.mana;
            if (playerData.maxMana !== undefined) statsToUpdate.maxMana = playerData.maxMana;
            if (playerData.karma !== undefined) statsToUpdate.karma = playerData.karma;
            if (playerData.maxKarma !== undefined) statsToUpdate.maxKarma = playerData.maxKarma;
            if (playerData.path !== undefined) statsToUpdate.path = playerData.path;
            
            // Update player status if there are stats changes
            if (Object.keys(statsToUpdate).length > 0) {
                this.updatePlayerStats(playerData.id, statsToUpdate);
            }
        } catch (error) {
            this.log('Error updating player position:', error, 'error');
        }
    }
    
    // Helper method to update player animation based on movement
    updatePlayerAnimation(player, playerData) {
        // Skip if player doesn't exist
        if (!player) return;
        
        // If the player has an animation mixer, we could update animations here
        // This is just a placeholder - expand as needed for your character animations
        if (player.userData && playerData.animation) {
            player.userData.animation = playerData.animation;
        }
        
        // Update the player's status bars if any stats were changed
        const statsUpdate = {};
        
        // Create a set of stats to update if they exist
        if (playerData.life !== undefined) statsUpdate.life = playerData.life;
        if (playerData.maxLife !== undefined) statsUpdate.maxLife = playerData.maxLife;
        if (playerData.mana !== undefined) statsUpdate.mana = playerData.mana;
        if (playerData.maxMana !== undefined) statsUpdate.maxMana = playerData.maxMana;
        if (playerData.karma !== undefined) statsUpdate.karma = playerData.karma;
        if (playerData.maxKarma !== undefined) statsUpdate.maxKarma = playerData.maxKarma;
        
        // Update visual representation if any stats changed
        if (Object.keys(statsUpdate).length > 0) {
            // Update visual representation
            this.game.updatePlayerStatus(player, statsUpdate);
        }
    }
    
    // Helper method to update player stats
    updatePlayerStats(playerId, statsData) {
        try {
            // Make sure player manager exists
            if (!this.game.playerManager) {
                this.log('Player manager not initialized, cannot update stats', 'warn');
                return;
            }
            
            // Make sure players map exists
            if (!this.game.playerManager.players) {
                this.game.playerManager.players = new Map();
                return;
            }
            
            // Get the player by ID
            const player = this.game.playerManager.players.get(playerId);
            if (!player) {
                this.log(`Player ${playerId} not found for stat update`, 'warn');
                return;
            }
            
            // Initialize stats object if needed
            if (!player.userData) player.userData = {};
            if (!player.userData.stats) player.userData.stats = {};
            
            // Update player stats
            const statsToUpdate = {};
            
            if (statsData.life !== undefined) statsToUpdate.life = statsData.life;
            if (statsData.maxLife !== undefined) statsToUpdate.maxLife = statsData.maxLife;
            if (statsData.mana !== undefined) statsToUpdate.mana = statsData.mana;
            if (statsData.maxMana !== undefined) statsToUpdate.maxMana = statsData.maxMana;
            if (statsData.karma !== undefined) statsToUpdate.karma = statsData.karma;
            if (statsData.maxKarma !== undefined) statsToUpdate.maxKarma = statsData.maxKarma;
            
            // Update visual status bars if we have stats to update
            if (Object.keys(statsToUpdate).length > 0) {
                // Update the player's stored stats
                Object.assign(player.userData.stats, statsToUpdate);
                
                // Update visual status bars
                this.game.updatePlayerStatus(player, statsToUpdate);
            }
        } catch (error) {
            this.log('Error updating player stats:', error, 'error');
        }
    }
    
    // Update sendPlayerState to ensure it properly sends player state
    sendPlayerState(playerData) {
        if (!this.socket || !this.socket.connected) {
            return;
        }
        
        // Rate limit state updates
        const now = Date.now();
        if (now - this.lastStateSend < 50) { // 50ms rate limit
            return;
        }
        this.lastStateSend = now;
        
        try {
            // Send player state to server
            this.socket.emit('playerMovement', {
                position: playerData.position,
                rotation: playerData.rotation,
                path: playerData.path,
                karma: playerData.karma,
                maxKarma: playerData.maxKarma,
                life: playerData.life,
                maxLife: playerData.maxLife,
                mana: playerData.mana,
                maxMana: playerData.maxMana
            });
            
            // Occasionally log position for debugging
            if (now - this.lastPositionLog > this.logFrequency) {
                this.log(`Player position: (${playerData.position.x.toFixed(2)}, ${playerData.position.y.toFixed(2)}, ${playerData.position.z.toFixed(2)})`, 'debug');
                this.lastPositionLog = now;
            }
        } catch (error) {
            this.log('Error sending player state:', error, 'error');
        }
    }
    
    sendPlayerAction(action, data) {
        if (!this.isConnected || !this.socket) {
            return;
        }
        
        this.socket.emit('playerAction', {
            action: action,
            data: data
        });
    }
    
    // Enhance offline player creation
    async initializeLocalPlayerOffline() {
        this.log('Creating offline local player', 'info');
        this.isOffline = true;
        
        try {
            // Generate a random offline ID
            const offlineId = `offline-${Math.floor(Math.random() * 1000000)}`;
            
            // Create a local player at temple center
            const player = await this.game.playerManager.createPlayer(
                offlineId,
                { x: 0, y: 3, z: 0 },
                { y: 0 },
                false
            );
            
            // Add player to the scene and player map
            if (player) {
                // Add to scene
                this.game.scene.add(player);
                
                // Add to player manager
                this.game.playerManager.players.set(offlineId, player);
                
                // Return the created player
                return player;
            }
        } catch (error) {
            this.log('Error creating offline player:', error, 'error');
        }
        return null;
    }
    
    removePlayer(playerId, broadcast = true) {
        this.log(`Removing player: ${playerId}, broadcast: ${broadcast}`, 'debug');
        
        try {
            // Don't remove our local player if broadcast is false
            if (!broadcast && playerId === this.socket?.id) {
                this.log(`Not removing local player ${playerId} with broadcast=false`, 'debug');
                return false;
            }
            
            // Skip if player doesn't exist
            if (!this.game.playerManager.players.has(playerId)) {
                this.log(`Player ${playerId} doesn't exist in player manager, checking scene...`, 'debug');
                
                // Check if the player exists directly in the scene
                let foundInScene = false;
                this.game.scene.traverse(obj => {
                    if (obj.userData && obj.userData.playerId === playerId) {
                        this.log(`Found player ${playerId} directly in scene, removing`, 'debug');
                        if (obj.parent) {
                            obj.parent.remove(obj);
                        }
                        foundInScene = true;
                    }
                });
                
                if (!foundInScene) {
                    this.log(`Player ${playerId} not found anywhere, nothing to remove`, 'debug');
                    return false;
                }
            }
            
            // Find the player mesh
            const player = this.game.playerManager.players.get(playerId);
            
            // Try to notify the server
            if (broadcast && this.socket && this.socket.connected) {
                try {
                    this.socket.emit('playerLeft', playerId);
                    this.log(`Broadcasted player removal for ${playerId}`, 'debug');
                } catch (error) {
                    this.log(`Error broadcasting player removal:`, error, 'error');
                }
            }
            
            // Clean up any status displays for this player
            if (player && player.userData.statusGroup) {
                if (this.game.scene.children.includes(player.userData.statusGroup)) {
                    this.game.scene.remove(player.userData.statusGroup);
                }
                player.userData.statusGroup = null;
            }
            
            // Remove all children of the player mesh
            if (player) {
                // Dispose of geometries and materials to prevent memory leaks
                player.traverse(obj => {
                    if (obj.geometry) {
                        obj.geometry.dispose();
                    }
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(m => m.dispose());
                        } else {
                            obj.material.dispose();
                        }
                    }
                });
                
                // Remove from scene if it exists there
                if (player.parent) {
                    player.parent.remove(player);
                    this.log(`Removed player ${playerId} from scene`, 'debug');
                }
            }
            
            // Find and remove any orphaned objects for this player
            let extraRemoved = 0;
            this.game.scene.traverse(obj => {
                if (obj.userData && obj.userData.playerId === playerId) {
                    if (obj.parent) {
                        this.log(`Removing additional scene object for player ${playerId}`, 'debug');
                        obj.parent.remove(obj);
                        extraRemoved++;
                    }
                }
            });
            
            if (extraRemoved > 0) {
                this.log(`Removed ${extraRemoved} additional objects for player ${playerId}`, 'debug');
            }
            
            // Remove from player manager
            if (this.game.playerManager.players.has(playerId)) {
                this.game.playerManager.players.delete(playerId);
                this.log(`Removed player ${playerId} from player manager`, 'debug');
            }
            
            return true;
        } catch (error) {
            this.log(`Error removing player ${playerId}:`, error, 'error');
            return false;
        }
    }
    
    // Helper method to log with controlled verbosity
    log(message, level = 'info') {
        // Define log levels: 'error', 'warn', 'info', 'debug', 'verbose'
        // Only show logs at or above the current level
        const currentLevel = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
        
        const levels = {
            'error': 0,
            'warn': 1,
            'info': 2,
            'debug': 3,
            'verbose': 4
        };
        
        // Only log if the message's level is equal to or higher priority than current level
        if (levels[level] <= levels[currentLevel]) {
            const prefix = `[Network] ${level.toUpperCase()}: `;
            console[level](prefix + message);
        }
    }

    setupRemainingHandlers() {
        if (!this.socket) {
            this.log('Cannot setup handlers: Socket not connected', 'warn');
            return;
        }

        // Prevent duplicate calls
        if (this._handlersInitialized) {
            this.log('Handlers already initialized, skipping', 'debug');
            return;
        }
        this._handlersInitialized = true;

        // Keep track of the last time we processed each event type
        // This helps prevent event flooding
        this._lastEventTimes = {
            newPlayer: 0,
            playerDisconnected: 0,
            playerPosition: 0,
            currentPlayers: 0,
            gameStateUpdate: 0
        };

        // Debounce period in milliseconds for different event types
        const EVENT_DEBOUNCE = {
            newPlayer: 100,         // Debounce player creation
            currentPlayers: 200,     // Debounce full player list
            gameStateUpdate: 50      // Debounce state updates
        };

        // Only process events if they're outside the debounce period
        const shouldProcessEvent = (eventType) => {
            const now = Date.now();
            const lastTime = this._lastEventTimes[eventType] || 0;
            const debounce = EVENT_DEBOUNCE[eventType] || 0;
            
            if (now - lastTime > debounce) {
                this._lastEventTimes[eventType] = now;
                return true;
            }
            return false;
        };

        // Handle a player joining
        this.socket.on('newPlayer', async (playerData) => {
            try {
                // Skip duplicate newPlayer events in quick succession
                if (!shouldProcessEvent('newPlayer')) {
                    return;
                }

                this.log(`New player joined: ${playerData.id}`, 'info');

                // Skip if this is the local player
                if (playerData.id === this.socket.id) {
                    this.log('This is our local player, not creating remote player', 'debug');
                    return;
                }

                // Check if we've created this player recently from another event
                if (this.game.playerManager.players.has(playerData.id)) {
                    this.log(`Player ${playerData.id} already exists, updating position`, 'debug');
                    this.updatePlayerPosition(playerData);
                    return;
                }

                // Create the new remote player
                await this.addNetworkPlayer(playerData.id, playerData);
            } catch (error) {
                this.log('Error handling newPlayer event:', error, 'error');
            }
        });

        // Handle a player disconnecting
        this.socket.on('playerDisconnected', (playerId) => {
            try {
                this.log(`Player disconnected: ${playerId}`, 'info');
                // Always remove disconnected players right away
                this.removePlayer(playerId, false);
            } catch (error) {
                this.log('Error handling playerDisconnected event:', error, 'error');
            }
        });

        // Handle player position updates
        this.socket.on('playerPosition', (playerData) => {
            try {
                // For position updates, we don't need to debounce as much
                // Just update the position
                this.updatePlayerPosition(playerData);
            } catch (error) {
                this.log('Error handling playerPosition event:', error, 'error');
            }
        });

        // Handle full list of current players
        this.socket.on('currentPlayers', async (playerList) => {
            try {
                // Skip duplicate currentPlayers events in quick succession
                if (!shouldProcessEvent('currentPlayers')) {
                    return;
                }

                this.log(`Received current players list from server: ${playerList.length} players`, 'info');
                
                // Update the player list
                await this.updatePlayerList(playerList);
            } catch (error) {
                this.log('Error handling currentPlayers event:', error, 'error');
            }
        });

        // Handle full game state updates (which include player list)
        this.socket.on('gameStateUpdate', (data) => {
            try {
                // Only process every 100ms at most
                if (!shouldProcessEvent('gameStateUpdate')) {
                    return;
                }

                // If this update includes a player list, process it
                if (data.players && Array.isArray(data.players)) {
                    this.updatePlayerList(data.players);
                }
            } catch (error) {
                this.log('Error handling gameStateUpdate event:', error, 'error');
            }
        });

        // Rest of your event handlers...
        
        // Handle player combat events...

        this.log('All socket handlers set up successfully', 'info');
    }

    // Add a new remote network player
    async addNetworkPlayer(playerId, playerData) {
        // DEFENSIVE: If this is our own player ID, don't create a network player
        if (playerId === this.socket?.id) {
            this.log(`Not creating remote player for local player ID: ${playerId}`, 'debug');
            return null;
        }
        
        // IDEMPOTENT: Check if this player already exists in the manager or scene
        if (this.game.playerManager.players.has(playerId)) {
            this.log(`Player ${playerId} already exists, updating instead of creating`, 'debug');
            this.updatePlayerPosition(playerData);
            this.updatePlayerAnimation(this.game.playerManager.players.get(playerId), playerData);
            return this.game.playerManager.players.get(playerId);
        }
        
        // CRUCIAL: Aggressively check for and remove any duplicate player objects in the scene
        // before creating a new one
        let duplicateCount = 0;
        this.game.scene.traverse(object => {
            if (object.userData && object.userData.playerId === playerId) {
                this.log(`Found existing object for player ${playerId} in scene, removing to prevent duplication`, 'debug');
                if (object.parent) {
                    object.parent.remove(object);
                    duplicateCount++;
                }
            }
        });
        
        if (duplicateCount > 0) {
            this.log(`Removed ${duplicateCount} duplicate objects for player ${playerId} from scene`, 'info');
        }
        
        // LOCK: Set a flag to indicate we're creating this player
        // This prevents race conditions where multiple events try to create the same player
        if (this._creatingPlayers === undefined) {
            this._creatingPlayers = new Set();
        }
        
        if (this._creatingPlayers.has(playerId)) {
            this.log(`Already creating player ${playerId}, skipping duplicate creation`, 'debug');
            
            // Wait a bit for the other creation to finish
            return new Promise(resolve => {
                setTimeout(() => {
                    if (this.game.playerManager.players.has(playerId)) {
                        resolve(this.game.playerManager.players.get(playerId));
                    } else {
                        resolve(null);
                    }
                }, 100);
            });
        }
        
        try {
            // Mark that we're creating this player
            this._creatingPlayers.add(playerId);
            
            // Create a new remote player mesh
            const position = playerData.position || { x: 0, y: 0, z: 0 };
            const rotation = { y: playerData.rotation?.y || 0 };
            
            this.log(`Creating remote player mesh for ID: ${playerId}`, 'debug');
            this.log(`Position: ${JSON.stringify(position)}`, 'debug');
            this.log(`Rotation: ${JSON.stringify(rotation)}`, 'debug');
            
            const player = await this.game.playerManager.createPlayer(
                playerId,
                position,
                rotation,
                false // Not local player
            );
            
            // Add the player to the scene if it's not already there
            if (player && player.parent !== this.game.scene) {
                this.log(`Adding remote player ${playerId} to scene`, 'debug');
                this.game.scene.add(player);
            }
            
            // Ensure the player is in the player manager map
            if (player && this.game.playerManager && this.game.playerManager.players) {
                this.game.playerManager.players.set(playerId, player);
                this.log(`Added player ${playerId} to player manager, total players: ${this.game.playerManager.players.size}`, 'info');
            }
            
            // Update player stats if available
            if (playerData.stats) {
                this.updatePlayerStats(playerId, playerData.stats);
            } else {
                // Initialize with default stats
                this.updatePlayerStats(playerId, {
                    life: 100,
                    maxLife: 100,
                    mana: 100,
                    maxMana: 100,
                    karma: 50,
                    maxKarma: 100
                });
            }
            
            this.log(`Remote player ${playerId} created and added to scene`, 'info');
            return player;
        } catch (error) {
            this.log(`Error creating remote player ${playerId}:`, error, 'error');
            return null;
        } finally {
            // Always remove the creating flag when done
            this._creatingPlayers.delete(playerId);
        }
    }

    // New method to force remove all players except local player
    cleanupAllNonLocalPlayers() {
        this.log('Force cleaning all non-local players', 'info');
        
        const localPlayerId = this.socket?.id;
        let removed = 0;
        
        // Defensive check: Make sure playerManager and players map exist
        if (!this.game.playerManager) {
            this.log('Player manager not initialized, cannot clean up players', 'warn');
            return;
        }
        
        if (!this.game.playerManager.players) {
            this.log('Players map not initialized, creating new empty map', 'warn');
            this.game.playerManager.players = new Map();
            return;
        }
        
        // Remove all players from the map except local player
        // Use Array.from to get a snapshot of entries to avoid modifying during iteration
        const playerEntries = Array.from(this.game.playerManager.players.entries());
        
        for (const [playerId, player] of playerEntries) {
            // Skip the local player
            if (playerId === localPlayerId) {
                continue;
            }
            
            // Skip offline testing player if needed
            if (process.env.NODE_ENV === 'development' && playerId.startsWith('offline-')) {
                this.log(`Skipping offline test player: ${playerId}`, 'debug');
                continue;
            }
            
            // Remove the player
            this.removePlayer(playerId, false);
            removed++;
        }
        
        // Also find and remove any 3D objects in the scene with player userData
        // that might not be tracked in the players map
        const orphanedObjects = [];
        let orphanCount = 0;
        
        this.game.scene.traverse(object => {
            if (object.userData && object.userData.playerId) {
                const playerId = object.userData.playerId;
                
                // If it's not the local player and still in the scene, it's orphaned
                if (playerId !== localPlayerId) {
                    orphanedObjects.push(object);
                    orphanCount++;
                    this.log(`Found orphaned player in scene: ${playerId}`, 'debug');
                }
            }
        });
        
        // Remove all orphaned objects
        orphanedObjects.forEach(object => {
            if (object.parent) {
                object.parent.remove(object);
            }
        });
        
        this.log(`Cleanup complete. Removed ${removed} players. Found ${orphanCount} orphans.`, 'info');
    }

    async createLocalPlayer() {
        this.log('NetworkManager: Creating local player with socket ID:', this.socket?.id, 'info');
        
        // If no socket ID is available, create an offline player
        if (!this.socket || !this.socket.id) {
            this.log('No socket ID available, creating offline player', 'info');
            return this.initializeLocalPlayerOffline();
        }
        
        try {
            // Check if we already have a local player with this ID
            const existingPlayerId = this.socket.id;
            const existingPlayer = this.game.playerManager.players.get(existingPlayerId);
            
            if (existingPlayer) {
                this.log(`Player with ID ${existingPlayerId} already exists, using existing player`, 'info');
                this.game.localPlayer = existingPlayer;
                return existingPlayer;
            }
            
            // Clean up any existing local player that doesn't match our socket ID
            if (this.game.localPlayer) {
                this.log('Removing existing local player before creating new one', 'info');
                
                // Get the existing player ID
                const oldPlayerId = this.game.localPlayer.userData?.playerId;
                
                // Only remove if it's a different ID than our current socket ID
                if (oldPlayerId && oldPlayerId !== this.socket.id) {
                    // Remove from scene if it's there
                    if (this.game.localPlayer.parent) {
                        this.game.localPlayer.parent.remove(this.game.localPlayer);
                    }
                    
                    // Remove from player manager if it's there
                    if (this.game.playerManager && this.game.playerManager.players) {
                        if (this.game.playerManager.players.has(oldPlayerId)) {
                            this.game.playerManager.players.delete(oldPlayerId);
                        }
                    }
                    
                    this.game.localPlayer = null;
                } else if (oldPlayerId === this.socket.id) {
                    // We already have the correct local player, just return it
                    return this.game.localPlayer;
                }
            }
            
            // Create a new player with the socket ID
            const player = await this.game.playerManager.createPlayer(
                this.socket.id,
                { x: 0, y: 3, z: 0 }, // Start at temple center
                { y: 0 },
                true // This is a local player
            );
            
            // Set as the game's local player
            this.game.localPlayer = player;
            this.game.isAlive = true;
            
            // Make sure player manager exists
            if (!this.game.playerManager) {
                this.game.playerManager = {};
            }
            
            // Make sure players map exists
            if (!this.game.playerManager.players) {
                this.game.playerManager.players = new Map();
            }
            
            // Store the player in the player manager
            this.game.playerManager.players.set(this.socket.id, player);
            
            // Tell the server our initial position
            this.sendPlayerState({
                x: 0, y: 3, z: 0,
                rx: 0, ry: 0, rz: 0,
                animation: 'idle'
            });
            
            return player;
        } catch (error) {
            this.log('Error creating local player:', error, 'error');
            return null;
        }
    }

    // Send player position to server
    sendPosition() {
        // Skip if not connected or player doesn't exist
        if (!this.socket?.connected || !this.game.localPlayer) {
            return;
        }
        
        // Rate limit position updates
        const now = Date.now();
        if (now - this.lastPositionSend < 50) { // 50ms rate limit
            return;
        }
        this.lastPositionSend = now;
        
        try {
            // Create the base data packet
            const positionData = {
                position: {
                    x: this.game.localPlayer.position.x,
                    y: this.game.localPlayer.position.y,
                    z: this.game.localPlayer.position.z
                },
                rotation: {
                    y: this.game.localPlayer.rotation.y
                }
            };
            
            // Add player stats if they exist
            if (this.game.playerStats) {
                positionData.path = this.game.playerStats.path || 'neutral';
                positionData.karma = this.game.playerStats.currentKarma || 50;
                positionData.maxKarma = this.game.playerStats.maxKarma || 100;
                positionData.mana = this.game.playerStats.currentMana || 100;
                positionData.maxMana = this.game.playerStats.maxMana || 100;
            }
            
            // Send player position to server
            this.socket.emit('playerMovement', positionData);
        } catch (error) {
            this.log('Error sending player position:', error, 'error');
        }
    }

    // Called during the game animation loop to interpolate player movements
    update(deltaTime) {
        // Skip if game is paused
        if (!this.game || !this.game.playerManager) return;

        try {
            // Make sure we have a valid players collection
            const players = this.game.playerManager?.players;
            if (!players || players.size === 0) return;

            // Update all players with interpolation
            players.forEach(player => {
                // Skip the local player (controlled directly)
                if (player === this.game.localPlayer) return;
                
                // Handle position interpolation for remote players
                if (player.userData && player.userData.targetPosition) {
                    const currentPos = player.position;
                    const targetPos = player.userData.targetPosition;
                    
                    // Use a smaller interpolation factor for smoother movement (0.05 - 0.1)
                    const lerpFactor = 0.08;
                    
                    // Calculate interpolated position
                    currentPos.lerp(targetPos, lerpFactor);
                    
                    // If we're close enough to target, remove the target
                    if (currentPos.distanceTo(targetPos) < 0.1) {
                        delete player.userData.targetPosition;
                    }
                }
                
                // Handle rotation interpolation
                if (player.userData && player.userData.targetRotation !== undefined) {
                    const targetRot = player.userData.targetRotation;
                    const currentRot = player.rotation.y;
                    
                    // Calculate shortest rotation path
                    let diff = targetRot - currentRot;
                    if (diff > Math.PI) diff -= Math.PI * 2;
                    if (diff < -Math.PI) diff += Math.PI * 2;
                    
                    // Use a smaller interpolation factor for smoother rotation
                    const rotationLerpFactor = 0.08;
                    
                    // Lerp rotation
                    player.rotation.y += diff * rotationLerpFactor;
                    
                    // If we're close enough, remove the target
                    if (Math.abs(diff) < 0.05) {
                        delete player.userData.targetRotation;
                    }
                }
                
                // Update status bar positions to match player position
                if (player.userData && player.userData.statusGroup) {
                    const worldPosition = new THREE.Vector3();
                    player.getWorldPosition(worldPosition);
                    
                    player.userData.statusGroup.position.set(
                        worldPosition.x,
                        worldPosition.y + 2.0,
                        worldPosition.z
                    );
                    
                    // Make status group face the camera
                    if (this.game.camera) {
                        player.userData.statusGroup.quaternion.copy(this.game.camera.quaternion);
                    }
                }
            });
        } catch (error) {
            this.log('Error in NetworkManager.update:', error, 'error');
        }
    }
} 