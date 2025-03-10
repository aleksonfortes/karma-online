import io from 'socket.io-client';
import * as THREE from 'three';

export class NetworkManager {
    constructor(game, serverUrl) {
        this.game = game;
        this.socket = null;
        this.isConnected = false;
        this.isOffline = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.SERVER_URL = serverUrl || 'http://localhost:3000'; // Default if not provided
        this.initialSyncComplete = false;
        this.lastUpdateTime = Date.now();
        
        // Logging control
        this.lastNetworkLog = 0;
        this.logFrequency = 5000; // Log at most once every 5 seconds
        
        // Movement interpolation settings
        this.lerpFactor = 0.15; // Smoothing factor - higher means more responsive
        
        // New additions
        this.verifiedPlayerIds = new Set(); // Track verified player IDs
        this.hasMovedSinceLogin = false; // Track first movement
        
        // Update tracking
        this.lastPositionUpdate = 0;
        this.lastStateUpdate = 0;
    }
    
    async init() {
        console.log('Initializing Network Manager');
        
        try {
            // Try to connect to server
            await this.setupMultiplayer();
            
            // Schedule an initial cleanup after the scene has fully loaded
            setTimeout(() => {
                console.log('Running initial scene cleanup...');
                this.forceCleanAllPlayers();
                this.socket?.emit('requestPlayersSync');
            }, 5000); // Run 5 seconds after initialization
            
            return true;
        } catch (error) {
            console.warn('Failed to connect to server, using offline mode:', error.message);
            this.isOffline = true;
            
            // Notify game about offline mode
            if (this.game.onNetworkEvent) {
                this.game.onNetworkEvent('offlineMode');
            }
            
            // Initialize local player in offline mode
            this.initializeLocalPlayerOffline();
            
            return true; // Still return true to continue game initialization
        }
    }
    
    setupMultiplayer() {
        console.log('Setting up multiplayer connection to:', this.SERVER_URL);
        
        // Create socket connection
        this.socket = io(this.SERVER_URL, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        // Store socket in game for direct access
        this.game.socket = this.socket;
        
        // Set up socket event handlers
        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
            this.isConnected = true;
            
            // Clear ALL existing players when reconnecting (more aggressive cleanup)
            if (this.wasConnectedBefore) {
                this.log('Reconnected to server, cleaning up ALL player data for fresh state');
                
                // Use our new force cleanup method
                this.forceCleanAllPlayers();
                
                // Clear local player variable but save the reference
                this.game.localPlayer = null;
                this.game.playerManager.localPlayer = null;
                
                // Reset the camera position for reconnection
                const defaultPosition = { x: 0, y: 8, z: 15 };
                this.game.camera.position.set(
                    defaultPosition.x,
                    defaultPosition.y,
                    defaultPosition.z
                );
                this.game.camera.lookAt(0, 3, 0); // Look at temple center
                
                console.log('Cleared all players for reconnection. Players map size:', this.game.players.size);
            }
            
            this.wasConnectedBefore = true;
            this.initialSyncComplete = false; // Force a full sync
            this.hasMovedSinceLogin = false; // Reset movement flag
            
            // Send initial player data
            this.socket.emit('playerJoin', {
                id: this.socket.id,
                position: { x: 0, y: 3, z: 0 },
                rotation: { y: 0 },
                stats: this.game.playerStats
            });
        });
        
        // Handle disconnect - mark as offline but don't clean up yet
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
        });
        
        this.socket.on('connect_error', (err) => {
            console.log('Connection error:', err.message);
        });
        
        // Process current players when we first connect
        this.socket.on('currentPlayers', (players) => {
            this.log('Received current players list with ' + players.length + ' players');
            
            // Check for and log any potential duplicates in the server data
            const playerIds = players.map(p => p.id);
            const duplicateIds = playerIds.filter((id, index) => playerIds.indexOf(id) !== index);
            
            if (duplicateIds.length > 0) {
                console.warn('Duplicate player IDs detected in server data:', duplicateIds);
            }
            
            // Use force cleanup to ensure a clean slate
            this.forceCleanAllPlayers();
            
            // Now that we've cleaned up, update with fresh data
            this.updatePlayerList(players);
            
            // Run an additional orphan cleanup after processing to catch any stray models
            setTimeout(() => {
                this.cleanupOrphanedPlayers();
            }, 1000); // Run cleanup after a short delay
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
        
        // Handle player movement updates - silently process without logging
        this.socket.on('playerMoved', (playerData) => {
            try {
                // Check if playerData is valid
                if (!playerData || !playerData.id) {
                    console.error('Received invalid playerData in playerMoved event:', playerData);
                    return;
                }
                
                // First verify this player ID exists in the server player list
                if (!this.verifiedPlayerIds.has(playerData.id)) {
                    this.log(`First movement from unverified player ${playerData.id.substring(0, 8)} - requesting sync`);
                    this.socket.emit('requestPlayersSync');
                    this.verifiedPlayerIds.add(playerData.id);
                }
                
                // For debug logging - periodically log player movements
                const now = Date.now();
                if (now - (this._lastMovementLog || 0) > 5000) {
                    this.log(`Movement update from player ${playerData.id.substring(0, 8)} at position: ${JSON.stringify(playerData.position)}`);
                    this._lastMovementLog = now;
                }
                
                // Update as normal
                this.updatePlayerPosition(playerData);
            } catch (error) {
                console.error('Error handling playerMoved event:', error);
            }
        });
        
        // Handle player life updates
        this.socket.on('lifeUpdate', (data) => {
            this.log(`Life update for player ${data.id.substring(0, 8)}: ${data.life}/${data.maxLife}`);
            
            const playerMesh = this.game.players.get(data.id);
            if (!playerMesh) {
                this.log(`Player ${data.id} not found for life update`);
                return;
            }
            
            // Store previous life value for death detection
            const previousLife = playerMesh.userData?.stats?.life;
            
            // Update player stats
            this.updatePlayerStats(data.id, { 
                life: data.life, 
                maxLife: data.maxLife 
            });
            
            // If this is the local player, update the game's player stats and check for death
            if (data.id === this.socket.id) {
                const localPreviousLife = this.game.playerStats.currentLife;
                this.game.playerStats.currentLife = data.life;
                this.game.playerStats.maxLife = data.maxLife;
                
                // Update UI
                if (this.game.uiManager) {
                    this.game.uiManager.updateStatusBars();
                }
                
                // Check for death
                if (data.life === 0 && localPreviousLife > 0) {
                    this.log('Player died, handling death');
                    if (this.game.playerManager && this.game.playerManager.handlePlayerDeath) {
                        this.game.playerManager.handlePlayerDeath(playerMesh);
                    }
                }
                
                this.log(`Life Updated: ${localPreviousLife} → ${data.life}/${data.maxLife} (died: ${data.life === 0})`);
            }
        });
        
        // Handle karma updates
        this.socket.on('karmaUpdate', (data) => {
            this.log(`Karma update for player ${data.id.substring(0, 8)}: ${data.karma}/${data.maxKarma}`);
            this.updatePlayerStats(data.id, { 
                karma: data.karma, 
                maxKarma: data.maxKarma,
                effects: data.effects
            });
        });
        
        // Handle mana updates
        this.socket.on('manaUpdate', (data) => {
            this.log(`Mana update for player ${data.id.substring(0, 8)}: ${data.mana}/${data.maxMana}`);
            this.updatePlayerStats(data.id, { 
                mana: data.mana, 
                maxMana: data.maxMana 
            });
        });
        
        // Handle skill effects
        this.socket.on('skillEffect', (data) => {
            if (data.type === 'damage') {
                this.log(`Skill damage: ${data.targetId.substring(0, 8)} took ${data.damage} damage from ${data.skillName}`);
                
                // Find the target in the game
                const target = this.game.players.get(data.targetId);
                if (!target) return;
                
                // Create visual damage effect
                this.createDamageEffect(target.position);
                
                // Display damage number
                this.createDamageText(target, data.damage, data.isCritical);
                
                // Flash target red to indicate damage
                this.flashCharacter(target, 0xff0000);
            } else if (data.type === 'immune') {
                const target = this.game.players.get(data.targetId);
                if (!target) return;
                
                // Display immunity text
                this.createImmunityText(target, data.reason);
                
                // Flash target with immunity color
                const immunityColor = data.reason === 'illuminated' ? 0xffff00 : 0x800080;
                this.flashCharacter(target, immunityColor);
            }
        });
        
        // Handle full player sync from server
        this.socket.on('fullPlayersSync', (players) => {
            try {
                this.log(`Received FULL players sync with ${players.length} players from request by player ${players.requestedBy || 'unknown'}`);
                
                // Force cleanup everything first
                this.forceCleanAllPlayers();
                
                // Process the sync data
                this.updatePlayerList(players);
                
                // Mark initial sync as complete
                if (!this.initialSyncComplete) {
                    this.log('Initial sync completed');
                    this.initialSyncComplete = true;
                }
                
                // Log players after sync
                this.log(`After sync: ${this.game.players.size} players in scene`);
                
                // Debug output of all player positions
                this.game.players.forEach((player, id) => {
                    this.log(`Player ${id.substring(0, 8)} position: ${JSON.stringify({
                        x: player.position.x.toFixed(2),
                        y: player.position.y.toFixed(2),
                        z: player.position.z.toFixed(2)
                    })}`);
                });
                
                // If our local player exists, log its position
                if (this.game.localPlayer) {
                    this.log(`Local player position after sync: ${JSON.stringify({
                        x: this.game.localPlayer.position.x.toFixed(2),
                        y: this.game.localPlayer.position.y.toFixed(2),
                        z: this.game.localPlayer.position.z.toFixed(2)
                    })}`);
                }
            } catch (error) {
                console.error('Error handling fullPlayersSync event:', error);
            }
        });
        
        // Handle sync request from another client
        this.socket.on('syncPlayers', () => {
            this.log('Received sync request from server, requesting full player list');
            
            // Request current players from server
            this.socket.emit('requestPlayersSync');
            
            // Also clean up any orphaned players
            this.cleanupOrphanedPlayers();
        });
        
        return new Promise((resolve, reject) => {
            // Set timeout for connection
            const connectionTimeout = setTimeout(() => {
                if (!this.isConnected) {
                    reject(new Error('Connection timeout'));
                }
            }, 5000);
            
            // Handle connection success
            this.socket.once('connect', () => {
                clearTimeout(connectionTimeout);
                resolve(true);
            });
            
            // Handle connection error
            this.socket.once('connect_error', (err) => {
                clearTimeout(connectionTimeout);
                reject(err);
            });
        });
    }
    
    updatePlayerList(playerList) {
        this.log('Processing player list: ' + playerList.length + ' players');
        
        // Track created or updated players in this cycle
        const processedPlayerIds = new Set();
        
        // Process all players in the list
        playerList.forEach(async (player) => {
            // Skip undefined players
            if (!player || !player.id) {
                console.warn('Received invalid player data:', player);
                return;
            }
            
            // Keep track of processed IDs
            processedPlayerIds.add(player.id);
            
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
                        
                        // Set as local player in both Game and PlayerManager
                        this.game.localPlayer = localPlayer;
                        this.game.playerManager.localPlayer = localPlayer;
                        this.game.isAlive = true;
                        
                        // Add to scene and players map
                        if (!this.game.scene.children.includes(localPlayer)) {
                            this.game.scene.add(localPlayer);
                        }
                        
                        // Ensure we have only one entry for local player
                        if (this.game.players.has(player.id)) {
                            const existingPlayer = this.game.players.get(player.id);
                            if (existingPlayer !== localPlayer) {
                                // Remove duplicates
                                this.log(`Removing duplicate local player for ID ${player.id}`);
                                this.game.scene.remove(existingPlayer);
                                if (existingPlayer.userData?.statusGroup) {
                                    this.game.scene.remove(existingPlayer.userData.statusGroup);
                                }
                            }
                        }
                        
                        // Set in players map
                        this.game.players.set(player.id, localPlayer);
                        
                        // Update stats if they exist
                        const stats = {
                            life: player.life || 100,
                            maxLife: player.maxLife || 100,
                            mana: player.mana || 100,
                            maxMana: player.maxMana || 100,
                            karma: player.karma || 50,
                            maxKarma: player.maxKarma || 100
                        };
                        
                        this.game.updatePlayerStatus(localPlayer, stats);
                        console.log('Local player created successfully at:', localPlayer.position);
                    } else {
                        // Update existing local player
                        const existingPlayer = this.game.localPlayer;
                        
                        if (player.position) {
                            // Always update position from server during sync requests
                            // This ensures that the server's position is authoritative
                            existingPlayer.position.set(
                                player.position.x,
                                player.position.y,
                                player.position.z
                            );
                            
                            // Log the position update for debugging
                            this.log(`Updated local player position from sync: ${JSON.stringify(player.position)}`);
                        }
                        
                        // Update stats if they've changed
                        const stats = {
                            life: player.life !== undefined ? player.life : this.game.playerStats.currentLife,
                            maxLife: player.maxLife !== undefined ? player.maxLife : this.game.playerStats.maxLife,
                            mana: player.mana !== undefined ? player.mana : this.game.playerStats.currentMana,
                            maxMana: player.maxMana !== undefined ? player.maxMana : this.game.playerStats.maxMana,
                            karma: player.karma !== undefined ? player.karma : this.game.playerStats.currentKarma,
                            maxKarma: player.maxKarma !== undefined ? player.maxKarma : this.game.playerStats.maxKarma
                        };
                        
                        this.game.updatePlayerStatus(existingPlayer, stats);
                        
                        // Make sure we're using the same reference in players map
                        if (this.game.players.get(player.id) !== existingPlayer) {
                            this.log(`Updating local player reference in players map for ${player.id}`);
                            this.game.players.set(player.id, existingPlayer);
                        }
                    }
                } else {
                    // Handle other players
                    const existingPlayer = this.game.players.get(player.id);
                    
                    if (!existingPlayer) {
                        console.log('Creating remote player:', player.id);
                        
                        // Create a new player if they don't exist
                        const otherPlayer = await this.game.playerManager.createPlayer(
                            player.id,
                            player.position || { x: 0, y: 3, z: 0 },
                            { y: player.rotation?.y || 0 }
                        );
                        
                        // Add to scene if not already there
                        if (!this.game.scene.children.includes(otherPlayer)) {
                            this.game.scene.add(otherPlayer);
                        }
                        
                        // Add to players map
                        this.game.players.set(player.id, otherPlayer);
                        
                        // Update stats
                        const stats = {
                            life: player.life || 100,
                            maxLife: player.maxLife || 100,
                            mana: player.mana || 100,
                            maxMana: player.maxMana || 100,
                            karma: player.karma || 50,
                            maxKarma: player.maxKarma || 100
                        };
                        
                        this.game.updatePlayerStatus(otherPlayer, stats);
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
                        
                        // Update stats
                        const stats = {
                            life: player.life !== undefined ? player.life : (existingPlayer.userData?.stats?.life || 100),
                            maxLife: player.maxLife !== undefined ? player.maxLife : (existingPlayer.userData?.stats?.maxLife || 100),
                            mana: player.mana !== undefined ? player.mana : (existingPlayer.userData?.stats?.mana || 100),
                            maxMana: player.maxMana !== undefined ? player.maxMana : (existingPlayer.userData?.stats?.maxMana || 100),
                            karma: player.karma !== undefined ? player.karma : (existingPlayer.userData?.stats?.karma || 50),
                            maxKarma: player.maxKarma !== undefined ? player.maxKarma : (existingPlayer.userData?.stats?.maxKarma || 100)
                        };
                        
                        this.game.updatePlayerStatus(existingPlayer, stats);
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
        
        // More aggressive cleanup of players that aren't in the current list
        // (except local player)
        const playersToRemove = [];
        
        this.game.players.forEach((player, id) => {
            if (!processedPlayerIds.has(id) && id !== this.socket?.id && id !== 'local') {
                this.log(`Player ${id} not in current player list, marking for removal`);
                playersToRemove.push(id);
            }
        });
        
        // Remove players in a separate loop to avoid issues with modifying the map during iteration
        if (playersToRemove.length > 0) {
            this.log(`Removing ${playersToRemove.length} stale players`);
            playersToRemove.forEach(id => {
                this.removePlayer(id, false); // Don't broadcast removal
            });
        }
        
        // Log the current player count
        this.log(`Current player count after update: ${this.game.players.size}`);
    }
    
    updatePlayerPosition(playerData) {
        if (!playerData || !playerData.id) {
            console.warn('Received invalid player data for position update:', playerData);
            return;
        }
        
        try {
            // Skip updates for our own player (we handle that locally)
            if (playerData.id === this.socket?.id) return;
            
            // Get player from map
            const player = this.game.players.get(playerData.id);
            
            // If player doesn't exist, request a sync
            if (!player) {
                this.log(`Received position update for unknown player ${playerData.id.substring(0, 8)} - requesting sync`);
                this.socket?.emit('requestPlayersSync');
                return;
            }
            
            // If this is the first movement for this player, verify the scene is clean
            if (!player.userData.hasMoved) {
                this.log(`First movement for player ${playerData.id.substring(0, 8)} - checking for duplicates`);
                player.userData.hasMoved = true;
                
                // Check for duplicate player models with similar positions
                let duplicatesFound = false;
                this.game.scene.traverse(object => {
                    // Skip self and the local player
                    if (object === player || object === this.game.localPlayer) {
                        return;
                    }
                    
                    // Look for objects near this player that might be duplicates
                    if (object.isMesh && object.position && object.userData) {
                        const distance = object.position.distanceTo(player.position);
                        if (distance < 2 && object !== player) {
                            this.log(`Found potential duplicate of player ${playerData.id.substring(0, 8)} at distance ${distance.toFixed(2)}`);
                            duplicatesFound = true;
                        }
                    }
                });
                
                if (duplicatesFound) {
                    this.log('Duplicates found - running cleanup');
                    this.cleanupOrphanedPlayers();
                }
            }
            
            // Store previous position for interpolation
            const previousPosition = player.position.clone();
            
            // Create target position for smooth interpolation
            if (!player.userData) player.userData = {};
            player.userData.targetPosition = new THREE.Vector3(
                playerData.position.x,
                playerData.position.y,
                playerData.position.z
            );
            
            // For large jumps, update position immediately
            if (previousPosition.distanceTo(player.userData.targetPosition) > 5) {
                player.position.copy(player.userData.targetPosition);
            }
            
            // Update target rotation
            if (playerData.rotation !== undefined) {
                player.userData.targetRotation = playerData.rotation.y;
                
                // For large rotation changes, update immediately
                const currentRotation = player.rotation.y;
                const targetRotation = playerData.rotation.y;
                let rotationDiff = Math.abs(targetRotation - currentRotation);
                if (rotationDiff > Math.PI) rotationDiff = Math.PI * 2 - rotationDiff;
                
                if (rotationDiff > Math.PI / 2) {
                    player.rotation.y = targetRotation;
                }
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
                this.game.updatePlayerStatus(player, statsToUpdate);
            }
            
            // Update status bars position to match player
            if (player.userData.statusGroup) {
                const worldPosition = new THREE.Vector3();
                player.getWorldPosition(worldPosition);
                player.userData.statusGroup.position.set(
                    worldPosition.x,
                    worldPosition.y + 2.0,
                    worldPosition.z
                );
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
    
    sendPlayerPosition() {
        if (!this.socket?.connected || !this.game.localPlayer) {
            return;
        }
        
        // First movement - trigger a ghost cleanup
        if (!this.hasMovedSinceLogin) {
            this.log('First player movement detected - triggering cleanup');
            this.cleanupOrphanedPlayers();
            this.hasMovedSinceLogin = true;
            
            // Request a synchronization of all players
            this.socket.emit('requestPlayersSync');
        }
        
        // Send complete player state to server (position, rotation, stats)
        this.socket.emit('playerMovement', {
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
        console.log(`Removing player: ${playerId.substring(0, 8)}`);
        
        // Get the player before removing from map
        const player = this.game.players.get(playerId);
        if (!player) {
            console.warn(`Cannot remove player ${playerId}: player not found in map`);
            return;
        }
        
        try {
            // Remove status group from scene
            if (player.userData && player.userData.statusGroup) {
                this.game.scene.remove(player.userData.statusGroup);
            }
            
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
    
    // New method to scan scene for orphaned player models
    cleanupOrphanedPlayers() {
        this.log('Scanning scene for orphaned player models...');
        let removedCount = 0;
        
        // Find all mesh objects that look like players
        this.game.scene.traverse(object => {
            // Skip the local player
            if (object === this.game.localPlayer) {
                return;
            }
            
            // Look for objects that have model or player-like properties
            if (object.isMesh && object.userData && 
                (object.userData.isPlayer || 
                 object.userData.stats || 
                 object.userData.statusGroup ||
                 (object.name && object.name.includes('player')))) {
                
                // Check if this object is in our players map
                let isTracked = false;
                this.game.players.forEach((player) => {
                    if (player === object) {
                        isTracked = true;
                    }
                });
                
                // If not tracked, remove it
                if (!isTracked) {
                    this.log(`Found orphaned player model: ${object.name || 'unnamed'}`);
                    
                    // Remove status group if it exists
                    if (object.userData && object.userData.statusGroup) {
                        this.game.scene.remove(object.userData.statusGroup);
                    }
                    
                    // Remove the object
                    this.game.scene.remove(object);
                    
                    // Clean up resources
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(mat => mat.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                    
                    removedCount++;
                }
            }
        });
        
        if (removedCount > 0) {
            this.log(`Removed ${removedCount} orphaned player models from scene`);
        } else {
            this.log('No orphaned player models found in scene');
        }
        
        return removedCount;
    }
    
    // New method to force remove all players except local player
    forceCleanAllPlayers() {
        this.log('FORCE CLEANING ALL PLAYERS EXCEPT LOCAL PLAYER');
        
        // Get count of players before cleanup
        const beforeCount = this.game.players.size;
        
        // Store local player reference and ID
        const localPlayer = this.game.localPlayer;
        const localPlayerId = this.socket?.id;
        
        // Get all player IDs except local player
        const playerIds = [];
        this.game.players.forEach((player, id) => {
            if (id !== localPlayerId && player !== localPlayer) {
                playerIds.push(id);
            }
        });
        
        // Remove all those players
        playerIds.forEach(id => {
            this.removePlayer(id, false);
        });
        
        // Clean up any orphaned models
        const orphansRemoved = this.cleanupOrphanedPlayers();
        
        this.log(`Force cleanup complete. Removed ${beforeCount - this.game.players.size} tracked players and ${orphansRemoved} orphaned models.`);
    }
    
    cleanup() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.isConnected = false;
    }
    
    // Add a new update method to interpolate player positions
    update() {
        const now = Date.now();
        const deltaTime = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;
        
        // Don't process if we're not connected or in offline mode
        if (!this.isConnected || this.isOffline) {
            return;
        }
        
        // Periodic orphaned player check (every 30 seconds)
        if (!this.lastOrphanCheck || now - this.lastOrphanCheck > 30000) {
            this.cleanupOrphanedPlayers();
            this.lastOrphanCheck = now;
        }
        
        // Safety check - players need to be an instance of Map
        if (!this.game.players || !(this.game.players instanceof Map)) {
            return;
        }
        
        // Verify local player state
        if (this.socket && this.game.localPlayer) {
            // Check for excessive player count - trigger cleanup if needed
            if (this.game.players.size > 2) {
                this.log(`Player count (${this.game.players.size}) seems high, running cleanup check`);
                // Run a cleanup every 10 seconds if player count seems too high
                if (!this.lastExcessiveCleanup || now - this.lastExcessiveCleanup > 10000) {
                    this.cleanupOrphanedPlayers();
                    this.lastExcessiveCleanup = now;
                }
            }
            
            // Only send position updates if we have a valid local player
            try {
                if (now - this.lastPositionUpdate > 50) { // 20 times per second max
                    this.sendPlayerPosition();
                    this.lastPositionUpdate = now;
                }
                
                if (now - this.lastStateUpdate > 500) { // 2 times per second max
                    this.sendPlayerState();
                    this.lastStateUpdate = now;
                }
            } catch (error) {
                console.error('Error sending player updates:', error);
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
                
                // Check if the player has target position/rotation
                if (player.userData && player.userData.targetPosition) {
                    // Calculate distance to target
                    const targetPos = player.userData.targetPosition;
                    const currentPos = player.position;
                    
                    // Lerp position (with safety checks)
                    if (currentPos && targetPos && typeof currentPos.lerp === 'function') {
                        currentPos.lerp(targetPos, this.lerpFactor);
                        
                        // If we're close enough, remove the target
                        if (typeof currentPos.distanceTo === 'function' && 
                            currentPos.distanceTo(targetPos) < 0.01) {
                            delete player.userData.targetPosition;
                        }
                    }
                }
                
                // Interpolate rotation (with safety checks)
                if (player.userData && player.userData.targetRotation !== undefined && 
                    player.rotation && typeof player.rotation.y !== 'undefined') {
                    const targetRot = player.userData.targetRotation;
                    const currentRot = player.rotation.y;
                    
                    // Calculate shortest rotation path
                    let diff = targetRot - currentRot;
                    if (diff > Math.PI) diff -= Math.PI * 2;
                    if (diff < -Math.PI) diff += Math.PI * 2;
                    
                    // Lerp rotation
                    player.rotation.y += diff * this.lerpFactor;
                    
                    // If we're close enough, remove the target
                    if (Math.abs(diff) < 0.01) {
                        delete player.userData.targetRotation;
                    }
                }
                
                // Update status bar positions for the player (with safety checks)
                if (player.userData && player.userData.statusGroup) {
                    const worldPosition = new THREE.Vector3();
                    
                    // Only call getWorldPosition if it exists
                    if (typeof player.getWorldPosition === 'function') {
                        player.getWorldPosition(worldPosition);
                        
                        if (player.userData.statusGroup.position) {
                            player.userData.statusGroup.position.set(
                                worldPosition.x, 
                                worldPosition.y + 3.0, 
                                worldPosition.z
                            );
                        }
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

    setupSocketHandlers() {
        if (!this.socket) {
            console.error('Cannot setup handlers: Socket not initialized');
            return;
        }
        
        // Handle connection events
        this.socket.on('connect', () => {
            this.log(`Connected to server with ID: ${this.socket.id}`);
            this.isConnected = true;
        });
        
        // ... rest of the existing socket handlers ...
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
} 