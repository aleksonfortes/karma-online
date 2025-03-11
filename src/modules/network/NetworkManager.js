import io from 'socket.io-client';
import * as THREE from 'three';

export class NetworkManager {
    constructor(game, serverUrl) {
        this.game = game;
        
        // Determine the server URL based on environment
        if (serverUrl) {
            this.SERVER_URL = serverUrl;
        } else {
            // Check if we're in development or production
            const isProduction = import.meta.env.PROD;
            const port = window.location.port || (isProduction ? '3000' : '5173');
            
            // Try to detect the server port from the page URL first
            const serverPort = isProduction ? port : '3000';
            
            // In development, connect to the Node.js server
            this.SERVER_URL = isProduction 
                ? window.location.origin
                : `${window.location.protocol}//${window.location.hostname}:${serverPort}`;
        }
        
        // Will store socket.io instance
        this.socket = null;
        
        // Track whether we're in offline mode
        this.isOffline = false;
        
        // Store movement targets for interpolation
        this.movementTargets = new Map();
        
        // Store previous positions for smoothing
        this.previousPositions = new Map();
        
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.initialSyncComplete = false;
        this.lastUpdateTime = Date.now();
        
        // Logging control
        this.lastNetworkLog = 0;
        this.logFrequency = 5000; // Log at most once every 5 seconds
        
        // Movement interpolation settings
        this.lerpFactor = 0.2; // Smoothing factor
        
        // New additions
        this.hasMovedSinceLogin = false; // Track first movement
        
        // Update tracking
        this.lastPositionUpdate = 0;
        this.lastStateUpdate = 0;
        
        // For last update times
        this.lastPositionSend = 0;
        this.lastStateSend = 0;
    }
    
    // Try to detect the actual server port by making a test connection
    async detectServerPort() {
        // Start with the default port
        let port = 3000;
        const maxPort = port + 10; // Try up to 10 ports
        
        // Try each port until we find one that works
        while (port <= maxPort) {
            try {
                const testUrl = `${window.location.protocol}//${window.location.hostname}:${port}`;
                
                // Try to fetch from this port
                const response = await fetch(`${testUrl}/api/status`, { 
                    method: 'HEAD',
                    signal: AbortSignal.timeout(1000) // Timeout after 1 second
                });
                
                if (response.ok) {
                    return port;
                }
            } catch (err) {
                // Connection failed, try next port
            }
            
            port++;
        }
        
        // If all ports failed, return default
        return 3000;
    }
    
    async init() {
        try {
            // Try to detect the actual server port
            let serverUrl = this.SERVER_URL;
            
            // If in development, try to detect the actual port
            if (import.meta.env.DEV) {
                try {
                    const detectedPort = await this.detectServerPort();
                    serverUrl = `${window.location.protocol}//${window.location.hostname}:${detectedPort}`;
                } catch (err) {
                    // Use default URL if detection fails
                }
            }
            
            if (serverUrl) {
                // Import Socket.io client dynamically
                const { io } = await import('socket.io-client');
                
                // Create the socket connection
                this.socket = io(serverUrl, {
                    transports: ['websocket', 'polling'],
                    upgrade: true,
                    reconnection: true,
                    reconnectionAttempts: 5,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 20000,
                    autoConnect: true
                });
                
                // Wait for connection to establish before proceeding
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Socket connection timeout'));
                    }, 10000);
                    
                    this.socket.on('connect', () => {
                        clearTimeout(timeout);
                        console.log('Connected to server');
                        resolve();
                    });
                    
                    this.socket.on('connect_error', (error) => {
                        console.error('Socket connection error:', error);
                    });
                });
                
                // Setup socket event handlers
                this.setupSocketHandlers();
                
                // Initialize multiplayer with delay to ensure socket is ready
                setTimeout(() => this.setupMultiplayer(), 500);
            } else {
                this.initializeLocalPlayerOffline();
            }
        } catch (error) {
            console.error('Failed to initialize network connection:', error);
            
            // Fall back to offline mode if connection fails
            this.initializeLocalPlayerOffline();
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
        // Check for duplicate players in the scene (log once)
        const playerCount = {};
        let duplicatesFound = false;
        this.game.scene.children.forEach(obj => {
            if (obj.userData && obj.userData.isPlayer) {
                const playerId = obj.userData.id;
                playerCount[playerId] = (playerCount[playerId] || 0) + 1;
                if (playerCount[playerId] > 1) {
                    duplicatesFound = true;
                }
            }
        });
        
        if (duplicatesFound) {
            console.warn(`Duplicate players detected in scene. This may cause issues.`);
        }
        
        try {
            // First, identify and remove any players not in the new list (except local player)
            const newPlayerIds = new Set(playerList.map(p => p.id));
            const currentPlayers = Array.from(this.game.players.keys());
            const localPlayerId = this.socket?.id;
            
            for (const playerId of currentPlayers) {
                // Don't remove the local player
                if (playerId === localPlayerId) continue;
                
                // If a player is not in the new list, remove it
                if (!newPlayerIds.has(playerId)) {
                    this.removePlayer(playerId, false); // Don't broadcast removal
                }
            }
            
            // Process all players from the server
            for (const player of playerList) {
                if (player.id === this.socket?.id) {
                    // This is our local player
                    if (!this.game.localPlayer) {
                        // Create the local player at temple center
                        const localPlayer = await this.game.playerManager.createPlayer(
                            player.id, 
                            { x: 0, y: 3, z: 0 }, // Always spawn at temple center
                            { y: player.rotation?.y || 0 }
                        );
                        
                        // Set as local player in Game
                        this.game.localPlayer = localPlayer;
                        this.game.isAlive = true;
                        
                        // Add to scene and players map
                        this.game.scene.add(localPlayer);
                        this.game.players.set(player.id, localPlayer);
                        
                        // Update status with server-provided values
                        this.updatePlayerStats(player.id, {
                            life: player.life || 100,
                            maxLife: player.maxLife || 100,
                            mana: player.mana || 100,
                            maxMana: player.maxMana || 100,
                            karma: player.karma || 50,
                            maxKarma: player.maxKarma || 100
                        });
                    }
                } else {
                    // This is another player
                    if (!this.game.players.has(player.id)) {
                        // Create remote player
                        const playerMesh = await this.game.playerManager.createPlayer(
                            player.id,
                            player.position,
                            { y: player.rotation?.y || 0 }
                        );
                        
                        this.game.scene.add(playerMesh);
                        this.game.players.set(player.id, playerMesh);
                        
                        // Update stats for this player
                        const stats = {
                            life: player.life || 100,
                            maxLife: player.maxLife || 100,
                            mana: player.mana || 100,
                            maxMana: player.maxMana || 100,
                            karma: player.karma || 50,
                            maxKarma: player.maxKarma || 100
                        };
                        
                        this.updatePlayerStats(player.id, stats);
                    }
                }
            }
        } catch (error) {
            console.error('Error updating player list:', error);
        }
    }
    
    updatePlayerPosition(playerData) {
        if (!playerData || !playerData.id) {
            console.warn('Received invalid player data for position update');
            return;
        }
        
        try {
            // Skip updates for our own player (we handle that locally)
            if (playerData.id === this.socket?.id) return;
            
            // Get player from map
            const player = this.game.players.get(playerData.id);
            
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
                console.log(`Player ${playerData.id} teleported - distance: ${distanceToTarget}`);
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
            console.error('Error updating player position:', error);
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
            // Get the player by ID
            const player = this.game.players.get(playerId);
            if (!player) {
                this.log(`Player ${playerId} not found for stat update`);
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
            console.error('Error updating player stats:', error);
        }
    }
    
    // Send player position to server
    sendPlayerPosition() {
        // Skip if socket is not connected or player doesn't exist
        if (!this.socket?.connected || !this.game.localPlayer) {
            return;
        }
        
        // Send player position and rotation to server
        this.socket.emit('playerMovement', {
            position: {
                x: this.game.localPlayer.position.x,
                y: this.game.localPlayer.position.y,
                z: this.game.localPlayer.position.z
            },
            rotation: {
                y: this.game.localPlayer.rotation.y
            },
            // Include other player stats
            path: this.game.playerStats.path,
            karma: this.game.playerStats.currentKarma,
            maxKarma: this.game.playerStats.maxKarma,
            mana: this.game.playerStats.currentMana,
            maxMana: this.game.playerStats.maxMana
        });
    }
    
    // Add the missing sendPlayerState method
    sendPlayerState() {
        if (!this.socket?.connected || !this.game.localPlayer) {
            return;
        }
        
        // Send complete player state to server (just like sendPlayerPosition)
        this.socket.emit('playerState', {
            position: {
                x: this.game.localPlayer.position.x,
                y: this.game.localPlayer.position.y,
                z: this.game.localPlayer.position.z
            },
            rotation: {
                y: this.game.localPlayer.rotation.y
            },
            path: this.game.playerStats ? this.game.playerStats.path : null,
            karma: this.game.playerStats ? this.game.playerStats.currentKarma : 50,
            maxKarma: this.game.playerStats ? this.game.playerStats.maxKarma : 100,
            life: this.game.playerStats ? this.game.playerStats.currentLife : 100,
            maxLife: this.game.playerStats ? this.game.playerStats.maxLife : 100,
            mana: this.game.playerStats ? this.game.playerStats.currentMana : 100,
            maxMana: this.game.playerStats ? this.game.playerStats.maxMana : 100
        });
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
    
    initializeLocalPlayerOffline() {
        console.log('Initializing player in offline mode');
        
        // Create a local player even without server connection
        if (this.game.playerManager) {
            this.game.playerManager.loadCharacterModel()
                .then(player => {
                    // Set as local player in both Game and PlayerManager
                    this.game.localPlayer = player;
                    this.game.playerManager.localPlayer = player;
                    
                    // Add to scene and players map with a generated ID
                    this.game.scene.add(player);
                    this.game.players.set('local-player', player);
                    
                    // Update stats
                    this.game.updatePlayerStatus(player, {
                        life: this.game.playerStats.currentLife,
                        maxLife: this.game.playerStats.maxLife,
                        mana: this.game.playerStats.currentMana,
                        maxMana: this.game.playerStats.maxMana,
                        karma: this.game.playerStats.currentKarma,
                        maxKarma: this.game.playerStats.maxKarma
                    });
                    
                    console.log('Local player created in offline mode');
                })
                .catch(error => {
                    console.error('Failed to create local player in offline mode:', error);
                });
        }
    }
    
    removePlayer(playerId, broadcast = true) {
        // Get the player before removing from map
        const player = this.game.players.get(playerId);
        if (!player) {
            return;
        }
        
        try {
            // Skip if this is local player
            if (player === this.game.localPlayer) {
                return;
            }
            
            // Check if player is already being removed
            if (player.userData && player.userData.isBeingRemoved) {
                return;
            }
            
            // Mark as being removed
            if (player.userData) player.userData.isBeingRemoved = true;
            
            // Remove status group from scene
            if (player.userData && player.userData.statusGroup) {
                this.game.scene.remove(player.userData.statusGroup);
                player.userData.statusGroup = null;
            }
            
            // Remove player mesh from scene
            this.game.scene.remove(player);
            
            // Traverse all children and dispose resources
            player.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            if (mat.map) mat.map.dispose();
                            mat.dispose();
                        });
                    } else if (child.material.map) {
                        child.material.map.dispose();
                        child.material.dispose();
                    }
                }
            });
            
            // Remove from player map
            this.game.players.delete(playerId);
            
            // Broadcast to server if needed
            if (broadcast && this.socket && this.socket.connected) {
                this.socket.emit('playerLeft', playerId);
            }
        } catch (error) {
            console.error(`Error removing player ${playerId}:`, error);
        }
    }
    
    // New method to scan scene for orphaned player models
    cleanupOrphanedPlayers() {
        // Find and remove any orphaned player models in the scene
        let removed = 0;
        
        // Look for objects with isPlayer flag that are not in our players map
        this.game.scene.traverse(object => {
            if (object.userData && object.userData.isPlayer) {
                // Check if this object corresponds to a player in our map
                let isOrphaned = true;
                
                // Check if this object is in the players map
                for (const playerObj of this.game.players.values()) {
                    if (object === playerObj) {
                        isOrphaned = false;
                        break;
                    }
                }
                
                // If it's orphaned, remove it
                if (isOrphaned) {
                    console.log('Removing orphaned player model:', object.uuid);
                    this.game.scene.remove(object);
                    
                    // Clean up associated status group if it exists
                    if (object.userData.statusGroup) {
                        this.game.scene.remove(object.userData.statusGroup);
                    }
                    
                    removed++;
                }
            }
        });
        
        if (removed > 0) {
            console.log(`Removed ${removed} orphaned player models from scene`);
        }
        
        return removed;
    }
    
    // New method to force remove all players except local player
    forceCleanAllPlayers() {
        console.log('Force cleaning ALL players from scene');
        
        // Get count of players before cleanup
        const beforeCount = this.game.players.size;
        
        // First, remove all players from the map
        const playerIds = Array.from(this.game.players.keys());
        for (const playerId of playerIds) {
            // Skip the local player if we want to preserve it
            if (playerId === this.socket?.id && this.game.localPlayer) {
                continue;
            }
            
            // Get the player
            const player = this.game.players.get(playerId);
            if (!player) continue;
            
            // Remove from scene
            if (this.game.scene && this.game.scene.children.includes(player)) {
                this.game.scene.remove(player);
            }
            
            // Remove from players map
            this.game.players.delete(playerId);
            
            console.log(`Removed player ${playerId}`);
        }
        
        // Double check for any orphaned character models in the scene
        this.cleanupOrphanedPlayers();
        
        console.log(`Force cleanup complete. Removed ${beforeCount - this.game.players.size} players.`);
    }
    
    cleanup() {
        console.log('NetworkManager: Cleaning up connection and players');
        
        // Disconnect socket
        if (this.socket) {
            console.log('Disconnecting from server');
            
            // Remove all event listeners first
            this.socket.off();
            
            // Then disconnect
            this.socket.disconnect();
            this.socket = null;
        }
        
        // Remove all players except the local player
        const localPlayerId = this.game.localPlayer ? this.game.localPlayer.userData?.id : null;
        
        // Get a list of all player IDs to avoid modifying while iterating
        const playerIds = Array.from(this.game.players.keys());
        
        // Remove each player that isn't the local player
        for (const playerId of playerIds) {
            if (playerId !== localPlayerId) {
                console.log(`Removing player during cleanup: ${playerId}`);
                this.removePlayer(playerId, false);
            }
        }
        
        console.log('NetworkManager cleanup complete');
    }
    
    // Called during the game animation loop to interpolate player movements
    update(deltaTime) {
        // Skip if game is paused or there are no players
        if (!this.game.players || this.game.players.size === 0) return;
        
        try {
            // Update all players with interpolation
            this.game.players.forEach(player => {
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
            console.error('Error in NetworkManager.update:', error);
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

    setupSocketHandlers() {
        if (!this.socket) {
            console.error('Socket not initialized');
            return;
        }
        
        console.log('Setting up socket handlers');
        
        // Force cleanup players on reconnection to prevent ghosts
        this.socket.on('connect', () => {
            console.log('Connected to server');
            
            // Clean up any existing players except local player on reconnect
            this.cleanupAllNonLocalPlayers();
            
            // Then create or update the local player
            if (!this.game.localPlayer || !this.game.players.has(this.socket.id)) {
                console.log('Creating local player after connection');
                this.game.playerManager.createLocalPlayer();
            } else if (this.game.localPlayer) {
                // Update the ID if needed
                const oldId = this.game.localPlayer.userData.id;
                if (oldId !== this.socket.id) {
                    console.log(`Updating local player ID from ${oldId} to ${this.socket.id}`);
                    this.game.localPlayer.userData.id = this.socket.id;
                    
                    // Update players map
                    this.game.players.delete(oldId);
                    this.game.players.set(this.socket.id, this.game.localPlayer);
                }
            }
        });
        
        // Handle disconnection
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });
        
        // Handle current players list from server
        this.socket.on('currentPlayers', (players) => {
            console.log('Received current players list from server:', players.length, 'players');
            // This is the initial player list from server - replace all existing players
            this.updatePlayerList(players);
        });
        
        this.setupRemainingHandlers();
    }

    // Add method to create damage text display
    createDamageText(targetMesh, damage, isCritical = false) {
        if (!targetMesh || !this.game.camera) return;
        
        try {
            // Create damage number with unique ID
            const damageId = `damage-${Date.now()}-${Math.random()}`;
            const damageText = document.createElement('div');
            damageText.id = damageId;
            damageText.textContent = isCritical ? `${damage}!` : damage;
            damageText.style.position = 'fixed';
            damageText.style.color = isCritical ? '#ff0000' : '#ffffff';
            damageText.style.fontSize = isCritical ? '24px' : '20px';
            damageText.style.fontWeight = 'bold';
            damageText.style.textShadow = '2px 2px 2px rgba(0,0,0,0.5)';
            damageText.style.pointerEvents = 'none';
            damageText.style.zIndex = '1000';
            document.body.appendChild(damageText);
            
            // Get screen position for damage number
            const updatePosition = () => {
                const vector = new THREE.Vector3();
                vector.setFromMatrixPosition(targetMesh.matrixWorld);
                vector.y += 2;
                
                // Convert to screen coordinates
                const widthHalf = window.innerWidth / 2;
                const heightHalf = window.innerHeight / 2;
                vector.project(this.game.camera);
                
                const x = (vector.x * widthHalf) + widthHalf;
                const y = -(vector.y * heightHalf) + heightHalf;
                
                damageText.style.left = `${x}px`;
                damageText.style.top = `${y}px`;
            };
            
            // Initial position
            updatePosition();
            
            // Animate damage number
            const startTime = performance.now();
            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const duration = 1000; // 1 second animation
                
                if (elapsed < duration) {
                    const progress = elapsed / duration;
                    damageText.style.opacity = 1 - progress;
                    damageText.style.transform = `translateY(${-50 * progress}px)`;
                    updatePosition(); // Update position each frame
                    requestAnimationFrame(animate);
                } else {
                    // Ensure the element is removed
                    const element = document.getElementById(damageId);
                    if (element) {
                        element.remove();
                    }
                }
            };
            
            requestAnimationFrame(animate);
            
            // Backup cleanup after 2 seconds in case animation fails
            setTimeout(() => {
                const element = document.getElementById(damageId);
                if (element) {
                    element.remove();
                }
            }, 2000);
        } catch (error) {
            console.error('Error creating damage text:', error);
        }
    }
    
    // Add method to create immunity text
    createImmunityText(targetMesh, reason) {
        if (!targetMesh || !this.game.camera) return;
        
        try {
            // Create immunity text with unique ID
            const immuneId = `immune-${Date.now()}-${Math.random()}`;
            const immuneText = document.createElement('div');
            immuneText.id = immuneId;
            immuneText.textContent = reason === 'illuminated' ? 'IMMUNE ✨' : 'IMMUNE 🌑';
            immuneText.style.position = 'fixed';
            immuneText.style.color = reason === 'illuminated' ? '#ffff00' : '#800080';
            immuneText.style.fontSize = '20px';
            immuneText.style.fontWeight = 'bold';
            immuneText.style.textShadow = '2px 2px 2px rgba(0,0,0,0.5)';
            immuneText.style.pointerEvents = 'none';
            immuneText.style.zIndex = '1000';
            document.body.appendChild(immuneText);
            
            // Get screen position
            const updatePosition = () => {
                const vector = new THREE.Vector3();
                vector.setFromMatrixPosition(targetMesh.matrixWorld);
                vector.y += 2;
                
                // Convert to screen coordinates
                const widthHalf = window.innerWidth / 2;
                const heightHalf = window.innerHeight / 2;
                vector.project(this.game.camera);
                
                const x = (vector.x * widthHalf) + widthHalf;
                const y = -(vector.y * heightHalf) + heightHalf;
                
                immuneText.style.left = `${x}px`;
                immuneText.style.top = `${y}px`;
            };
            
            // Initial position
            updatePosition();
            
            // Animate immunity text
            const startTime = performance.now();
            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const duration = 1500; // 1.5 second animation
                
                if (elapsed < duration) {
                    const progress = elapsed / duration;
                    immuneText.style.opacity = 1 - progress;
                    immuneText.style.transform = `translateY(${-50 * progress}px)`;
                    updatePosition(); // Update position each frame
                    requestAnimationFrame(animate);
                } else {
                    // Ensure the element is removed
                    const element = document.getElementById(immuneId);
                    if (element) {
                        element.remove();
                    }
                }
            };
            
            requestAnimationFrame(animate);
            
            // Backup cleanup after 2 seconds in case animation fails
            setTimeout(() => {
                const element = document.getElementById(immuneId);
                if (element) {
                    element.remove();
                }
            }, 2000);
        } catch (error) {
            console.error('Error creating immunity text:', error);
        }
    }
    
    // Helper method to flash a character with a color
    flashCharacter(character, color) {
        if (!character) return;
        
        try {
            // Find meshes in the character model
            let meshesToFlash = [];
            
            character.traverse((child) => {
                if (child.isMesh && child.material) {
                    meshesToFlash.push(child);
                }
            });
            
            // If no meshes found, use the character itself if it has material
            if (meshesToFlash.length === 0 && character.material) {
                meshesToFlash.push(character);
            }
            
            // Flash each mesh
            meshesToFlash.forEach(mesh => {
                // Store original color
                const originalColor = mesh.material.color ? mesh.material.color.clone() : new THREE.Color(0xffffff);
                const originalEmissive = mesh.material.emissive ? mesh.material.emissive.clone() : null;
                
                // Set flash color
                mesh.material.color.setHex(color);
                if (mesh.material.emissive) {
                    mesh.material.emissive.setHex(color === 0xffff00 ? 0x666600 : 0x400040);
                }
                
                // Reset after delay
                setTimeout(() => {
                    if (mesh.material) {
                        if (mesh.material.color) {
                            mesh.material.color.copy(originalColor);
                        }
                        if (mesh.material.emissive && originalEmissive) {
                            mesh.material.emissive.copy(originalEmissive);
                        }
                    }
                }, 200);
            });
        } catch (error) {
            console.error('Error flashing character:', error);
        }
    }
    
    // Method to create damage visual effect (enhanced version)
    createDamageEffect(position) {
        if (!position || !this.game.scene) return;
        
        try {
            // Create a visual effect with particle system
            const particleCount = 10;
            const particles = new THREE.Group();
            
            for (let i = 0; i < particleCount; i++) {
                const size = 0.1 + Math.random() * 0.2;
                const geometry = new THREE.SphereGeometry(size, 8, 8);
                const material = new THREE.MeshBasicMaterial({
                    color: 0xff0000,
                    transparent: true,
                    opacity: 0.7
                });
                
                const particle = new THREE.Mesh(geometry, material);
                
                // Random position around impact point
                const offset = new THREE.Vector3(
                    (Math.random() - 0.5) * 1,
                    Math.random() * 1.5,
                    (Math.random() - 0.5) * 1
                );
                
                particle.position.copy(position).add(offset);
                particle.userData.velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.1,
                    0.05 + Math.random() * 0.1,
                    (Math.random() - 0.5) * 0.1
                );
                
                particles.add(particle);
            }
            
            this.game.scene.add(particles);
            
            // Animate particles
            let elapsed = 0;
            const animate = () => {
                elapsed += 0.05;
                
                if (elapsed > 1.5) {
                    // Remove particles
                    this.game.scene.remove(particles);
                    particles.traverse(child => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) child.material.dispose();
                    });
                    return;
                }
                
                // Update particle positions and opacity
                particles.traverse(child => {
                    if (child.isMesh) {
                        // Apply velocity
                        if (child.userData.velocity) {
                            child.position.add(child.userData.velocity);
                            // Add gravity
                            child.userData.velocity.y -= 0.005;
                        }
                        
                        // Fade out gradually
                        if (child.material && child.material.opacity) {
                            child.material.opacity = Math.max(0, 0.7 - elapsed * 0.5);
                        }
                    }
                });
                
                requestAnimationFrame(animate);
            };
            
            animate();
        } catch (error) {
            console.error('Error creating damage effect:', error);
        }
    }

    setupRemainingHandlers() {
        if (!this.socket) return;
        
        // Handle new player joining
        this.socket.on('newPlayer', (player) => {
            console.log('New player joined:', player.id);
            
            // Skip if it's us (we already have our player)
            if (player.id === this.socket.id) {
                console.log('Skipping self player creation');
                return;
            }
            
            // Create and add new player
            this.game.playerManager.createPlayer(
                player.id, 
                player.position || { x: 0, y: 0, z: 0 },
                { y: player.rotation?.y || 0 }
            ).then(playerModel => {
                // Add to scene and players map
                this.game.scene.add(playerModel);
                this.game.players.set(player.id, playerModel);
                
                // Initialize stats
                const stats = {
                    life: player.life || 100,
                    maxLife: player.maxLife || 100,
                    mana: player.mana || 100,
                    maxMana: player.maxMana || 100,
                    karma: player.karma || 50,
                    maxKarma: player.maxKarma || 100
                };
                
                this.updatePlayerStats(player.id, stats);
            });
        });
        
        // Handle player disconnection
        this.socket.on('playerLeft', (playerId) => {
            console.log('Player left:', playerId);
            this.removePlayer(playerId);
        });
        
        // Handle player movement updates
        this.socket.on('playerMoved', (playerData) => {
            this.updatePlayerPosition(playerData);
        });
        
        // Handle life updates
        this.socket.on('lifeUpdate', (data) => {
            this.updatePlayerStats(data.id, {
                life: data.life,
                maxLife: data.maxLife
            });
        });
        
        // Handle karma updates
        this.socket.on('karmaUpdate', (data) => {
            this.updatePlayerStats(data.id, {
                karma: data.karma,
                maxKarma: data.maxKarma,
                effects: data.effects
            });
        });
        
        // Handle mana updates
        this.socket.on('manaUpdate', (data) => {
            this.updatePlayerStats(data.id, {
                mana: data.mana,
                maxMana: data.maxMana
            });
        });
        
        // Handle skill effect visualizations
        this.socket.on('skillEffect', (data) => {
            if (data.type === 'damage') {
                const targetMesh = this.game.players.get(data.targetId);
                if (targetMesh) {
                    this.createDamageText(targetMesh, data.damage, data.isCritical);
                    this.createDamageEffect(targetMesh.position.clone());
                    
                    // Add flash effect to the target
                    this.flashCharacter(targetMesh, 0xff0000);
                }
            } else if (data.type === 'immune') {
                const targetMesh = this.game.players.get(data.targetId);
                if (targetMesh) {
                    this.createImmunityText(targetMesh, data.reason);
                }
            }
        });
        
        // Handle full player sync response - but don't setup a loop
        this.socket.on('fullPlayersSync', (players) => {
            console.log('Received full players sync:', players.length, 'players');
            this.updatePlayerList(players);
        });
    }

    // Add a new remote network player
    async addNetworkPlayer(playerId, playerData) {
        console.log(`Adding network player: ${playerId}`);
        
        // Skip if this is the local player
        if (playerId === this.socket.id) {
            console.log(`Skipping local player creation in addNetworkPlayer`);
            return;
        }
        
        // Skip if player already exists
        if (this.game.players.has(playerId)) {
            console.log(`Player ${playerId} already exists, not creating again`);
            return this.game.players.get(playerId);
        }
        
        try {
            // Create player at the position specified in the data
            const position = playerData.position || { x: 0, y: 3, z: 0 };
            const rotation = playerData.rotation || { y: 0 };
            
            // Create the player using the PlayerManager
            const player = await this.game.playerManager.createPlayer(playerId, position, rotation);
            
            // Update player stats with the data from server
            if (player) {
                this.updatePlayerStats(playerId, {
                    life: playerData.life || 100,
                    maxLife: playerData.maxLife || 100,
                    mana: playerData.mana || 100,
                    maxMana: playerData.maxMana || 100,
                    karma: playerData.karma || 50,
                    maxKarma: playerData.maxKarma || 100
                });
                
                // Add path if available
                if (playerData.path) {
                    player.userData.path = playerData.path;
                }
                
                console.log(`Network player ${playerId} added successfully`);
                return player;
            }
        } catch (error) {
            console.error(`Error adding network player ${playerId}:`, error);
        }
        
        return null;
    }

    cleanupAllNonLocalPlayers() {
        console.log("Force cleaning all non-local players");
        
        // Get the local player ID
        const localPlayerId = this.socket?.id;
        const playersToRemove = [];
        
        // Find all players that aren't the local player
        this.game.players.forEach((player, id) => {
            if (id !== localPlayerId) {
                playersToRemove.push(id);
            }
        });
        
        // Remove all non-local players
        let removedCount = 0;
        for (const id of playersToRemove) {
            if (this.removePlayer(id, false)) {
                removedCount++;
            }
        }
        
        // Check for orphaned players in scene
        let orphanCount = 0;
        this.game.scene.children.forEach(obj => {
            if (obj.userData && obj.userData.isPlayer) {
                if (!this.game.players.has(obj.userData.id)) {
                    console.warn(`Found orphaned player in scene: ${obj.userData.id}`);
                    this.game.scene.remove(obj);
                    orphanCount++;
                }
            }
        });
        
        console.log(`Cleanup complete. Removed ${removedCount} players. Found ${orphanCount} orphans.`);
    }

    async createLocalPlayer() {
        // Only proceed if socket is connected
        if (!this.socket || !this.socket.connected) {
            console.log('Cannot create local player: Socket not connected');
            return null;
        }
        
        if (!this.socket.id) {
            console.log('Cannot create local player: No socket ID available');
            return null;
        }
        
        // Create local player
        console.log(`Creating local player with ID: ${this.socket.id}`);
        return await this.game.playerManager.createLocalPlayer();
    }
} 