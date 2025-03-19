import io from 'socket.io-client';
import * as THREE from 'three';
import { getServerUrl } from '../../config.js';

// Client-side constants that mirror server constants
const NETWORK_CONSTANTS = {
    POSITION_UPDATE_INTERVAL: 50, // ms between position updates
    SERVER_RECONCILIATION_THRESHOLD: 0.5, // Distance threshold for position correction
    DEFAULT_SPAWN_POSITION: { x: 0, y: 3, z: 0 }
};

export class NetworkManager {
    constructor(game) {
        this.game = game;
        this.isConnected = false;
        this.reconnecting = false;
        this.reconnectAttempts = 0;
        this.wasDisconnected = false;
        
        // Use the server URL from the centralized configuration
        const SERVER_URL = getServerUrl();
            
        console.log('Connecting to server at:', SERVER_URL);
        this.socket = io(SERVER_URL, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            autoConnect: true,
            forceNew: true // Each tab is a new player
        });
        
        // Set up handlers
        this.setupSocketHandlers();
        
        // Player state
        this.playerDead = false;
        
        // Movement tracking for optimizing network updates
        this.lastPositionUpdate = { x: 0, y: 0, z: 0 };
        this.lastRotationUpdate = { y: 0 };
        this.positionUpdateThreshold = 0.1;
        this.rotationUpdateThreshold = 0.1;
        this._lastPathChoiceSent = null;
        
        // Health check interval for ensuring consistent health values
        this.healthCheckInterval = null;
        
        // Store last server positions for reconciliation
        this.lastServerPositions = new Map();
        this.pendingInputs = [];
        this.pendingUpdates = new Map(); // Store updates for players that don't exist yet
        this.lastHealthLog = {};
        
        // Storage for monster data received before monster manager is initialized
        this.pendingMonsterData = null;
    }

    async init() {
        return new Promise((resolve) => {
            if (this.socket) {
                // Listen for connection
                this.socket.once('connect', () => {
                    this.isConnected = true;
                    resolve(true);
                });
                
                // Listen for connection error
                this.socket.once('connect_error', () => {
                    console.warn('Failed to connect to server');
                    resolve(false);
                });
                
                // Set a timeout
                setTimeout(() => {
                    if (!this.isConnected) {
                        console.warn('Connection timeout');
                        resolve(false);
                    }
                }, 10000);
            } else {
                resolve(false);
            }
        });
    }

    setupSocketHandlers() {
        if (!this.socket) {
            console.warn('Cannot setup handlers: No socket connection');
            return;
        }

        // Handle successful connection
        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
            this.isConnected = true;
            this.wasDisconnected = false;
            
            // Reset reconnection state
            this.reconnecting = false;
            this.reconnectAttempts = 0;
            
            // If we were previously disconnected, this is a reconnection
            if (this.wasDisconnected) {
                console.log('Reconnected to server, handling reconnection');
                this.handleReconnection();
            } else {
                // Only request state update if not reconnecting
                this.socket.emit('requestStateUpdate');
            }
            
            // Start the periodic health check
            this.startPeriodicHealthCheck();
        });

        // Handle connection error
        this.socket.on('connect_error', (error) => {
            console.error('Failed to connect to server:', error);
        });

        // Handle initial game state
        this.socket.on('initGameState', (gameState) => {
            console.log('Received initial game state:', gameState);
            
            // Create all existing players
            if (gameState.players) {
                Object.entries(gameState.players).forEach(([id, player]) => {
                    if (id !== this.socket.id) {
                        // Use async function without waiting for it to complete
                        // This is fine because each player is created independently
                        this.createNetworkPlayer(player).catch(error => {
                            console.error(`Failed to create network player ${id}:`, error);
                        });
                    }
                });
            }
            
            // Always create a new local player - matching original game behavior
            // This ensures if a player is disconnected, they start over
            this.createLocalPlayer();
            
            // Process NPCs from server if they exist
            if (gameState.npcs && this.game.npcManager) {
                // Only process NPCs if we don't already have NPCs loaded
                // This prevents duplicate NPCs during reconnection
                if (this.game.npcManager.npcs.size === 0) {
                    console.log('Processing NPCs from server:', gameState.npcs);
                    this.game.npcManager.processServerNPCs(gameState.npcs);
                } else {
                    console.log('NPCs already loaded, skipping creation');
                }
            }
            
            // Process monster data if available
            if (gameState.monsters && this.game.monsterManager) {
                // Only process monster data if the monster manager is fully initialized
                if (this.game.monsterManager.initialized) {
                    this.game.monsterManager.processServerMonsters(gameState.monsters);
                } else {
                    console.log('Monster manager not fully initialized, storing monster data for later processing');
                    // Store monster data to process after initialization
                    this.pendingMonsterData = gameState.monsters;
                    // Check periodically if monster manager has initialized and process data when ready
                    this.waitForMonsterManager();
                }
            }
            
            // Send our initial state to all players
            if (this.game.localPlayer) {
                this.sendPlayerState();
                
                // Only send karma update if player stats exist
                if (this.game.playerStats) {
                    // Also send initial karma update
                    this.socket.emit('karmaUpdate', {
                        id: this.socket.id,
                        karma: this.game.playerStats.currentKarma,
                        maxKarma: this.game.playerStats.maxKarma,
                        life: this.game.playerStats.currentLife,
                        maxLife: this.game.playerStats.maxLife,
                        mana: this.game.playerStats.currentMana,
                        maxMana: this.game.playerStats.maxMana
                    });
                }
            }
        });
        
        // Handle initial position response
        this.socket.on('initialPosition', (positionData) => {
            if (this.game.localPlayer) {
                // Set the authoritative position from server
                this.game.localPlayer.position.set(
                    positionData.position.x,
                    positionData.position.y,
                    positionData.position.z
                );
                
                if (positionData.rotation) {
                    this.game.localPlayer.rotation.y = positionData.rotation.y;
                }
                
                console.log('Set initial position from server:', positionData.position);
            }
        });
        
        // Handle respawn position response
        this.socket.on('respawnPosition', (positionData) => {
            if (this.game.localPlayer) {
                // Set the authoritative respawn position from server
                this.game.localPlayer.position.set(
                    positionData.position.x,
                    positionData.position.y,
                    positionData.position.z
                );
                
                if (positionData.rotation) {
                    this.game.localPlayer.rotation.y = positionData.rotation.y;
                }
                
                console.log('Player respawned at server position:', positionData.position);
            }
        });
        
        // Handle server position correction
        this.socket.on('positionCorrection', (correctionData) => {
            if (this.game.localPlayer) {
                const serverPos = correctionData.position;
                const currentPos = this.game.localPlayer.position;
                
                // Calculate distance between server and client positions
                const dx = serverPos.x - currentPos.x;
                const dy = serverPos.y - currentPos.y;
                const dz = serverPos.z - currentPos.z;
                const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                
                // If distance exceeds threshold, correct position
                if (distance > NETWORK_CONSTANTS.SERVER_RECONCILIATION_THRESHOLD) {
                    console.log('Server correction applied, distance:', distance);
                    
                    // Smoothly interpolate to correct position
                    const lerpFactor = 0.3; // Adjust for smoother or more immediate correction
                    currentPos.x += dx * lerpFactor;
                    currentPos.y += dy * lerpFactor;
                    currentPos.z += dz * lerpFactor;
                    
                    if (correctionData.rotation) {
                        this.game.localPlayer.rotation.y = correctionData.rotation.y;
                    }
                }
                
                // Store the server position for future reference
                this.lastServerPositions.set(this.socket.id, {
                    position: { ...serverPos },
                    time: Date.now()
                });
                
                // Reset pending position update flag
                if (this.game.playerManager) {
                    this.game.playerManager.pendingPositionUpdate = false;
                }
            }
        });

        // Handle new player joining
        this.socket.on('newPlayer', async (player) => {
            // Skip if this is our own player - we already have it
            if (player.id === this.socket.id) {
                console.log('Received our own player data from server, skipping creation');
                return;
            }
            
            console.log('New player joined:', player);
            
            // Only create if the player doesn't already exist
            if (!this.game.playerManager.players.has(player.id)) {
                this.createNetworkPlayer(player).catch(error => {
                    console.error(`Failed to create network player ${player.id}:`, error);
                });
            } else {
                console.log(`Player ${player.id} already exists, not creating again`);
            }
        });

        // Handle player movement
        this.socket.on('playerMoved', (data) => {
            // Don't update local player from server data (except for corrections)
            if (data.id === this.socket.id) return;
            
            const player = this.game.playerManager.players.get(data.id);
            if (player) {
                // Update network player position from server data
                player.position.set(data.position.x, data.position.y, data.position.z);
                player.rotation.y = data.rotation.y;
                
                // Update player stats
                if (!player.userData) player.userData = {};
                player.userData.path = data.path;
                
                if (!player.userData.stats) player.userData.stats = {};
                player.userData.stats.karma = data.karma;
                player.userData.stats.maxKarma = data.maxKarma;
                player.userData.stats.life = data.life;
                player.userData.stats.maxLife = data.maxLife;
                player.userData.stats.mana = data.mana;
                player.userData.stats.maxMana = data.maxMana;
                
                // Update visual effects based on path
                this.game.playerManager.updatePlayerColor(player);
            }
        });

        // Handle current players - exactly like original
        this.socket.on('currentPlayers', async (players) => {
            console.log('\n=== Received Current Players ===');
            console.log('Players:', players);
            
            // First, create the local player if it doesn't exist yet
            if (!this.game.localPlayer && this.socket && this.socket.id) {
                const localPlayerData = players.find(p => p.id === this.socket.id);
                if (localPlayerData) {
                    console.log('Creating local player from currentPlayers data');
                    await this.createLocalPlayer();
                }
            }
            
            // Remove all network players (non-local)
            this.game.playerManager.players.forEach((playerMesh, playerId) => {
                if (playerId !== this.socket.id) {
                    if (playerMesh.userData.statusGroup) {
                        this.game.scene.remove(playerMesh.userData.statusGroup);
                    }
                    this.game.scene.remove(playerMesh);
                    this.game.playerManager.players.delete(playerId);
                }
            });
            
            // Add all network players
            for (const player of players) {
                // Skip local player - we already have it
                if (player.id === this.socket.id) {
                    console.log('Skipping local player in currentPlayers loop');
                    continue;
                }
                
                // Create network player
                const playerMesh = await this.game.playerManager.createPlayer(
                    player.id,
                    player.position,
                    { y: player.rotation.y || 0 },
                    false // isLocal = false for network players
                );
                
                if (playerMesh) {
                    this.game.scene.add(playerMesh);
                    
                    const stats = {
                        life: player.life ?? 100,
                        maxLife: player.maxLife ?? 100,
                        mana: player.mana ?? 100,
                        maxMana: player.maxMana ?? 100,
                        karma: player.karma ?? 50,
                        maxKarma: player.maxKarma ?? 100
                    };
                    
                    // Force creation and update of status bars
                    if (this.game.updatePlayerStatus) {
                        this.game.updatePlayerStatus(playerMesh, stats);
                    }
                    this.game.playerManager.players.set(player.id, playerMesh);
                    
                    console.log(`Added network player ${player.id} with status bars:`, stats);
                }
            }
            
            // Send our initial state to all players
            if (this.game.localPlayer) {
                this.sendPlayerState();
                
                // Only send karma update if player stats exist
                if (this.game.playerStats) {
                    // Also send initial karma update
                    this.socket.emit('karmaUpdate', {
                        id: this.socket.id,
                        karma: this.game.playerStats.currentKarma,
                        maxKarma: this.game.playerStats.maxKarma,
                        life: this.game.playerStats.currentLife,
                        maxLife: this.game.playerStats.maxLife,
                        mana: this.game.playerStats.currentMana,
                        maxMana: this.game.playerStats.maxMana
                    });
                }
            }
        });

        // Handle player left
        this.socket.on('playerLeft', (playerId) => {
            console.log('\n=== Player Left ===');
            console.log('Player ID:', playerId);
            this.removePlayer(playerId);
        });

        // Handle disconnect
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            
            // Set connection status flags
            this.isConnected = false;
            this.wasDisconnected = true;
            
            // Disable player controls
            this.game.controls.forward = false;
            this.game.controls.backward = false;
            this.game.controls.left = false;
            this.game.controls.right = false;
            
            // Optionally, display a message to the user
            alert('Disconnected from server. Please check your connection.');
            
            // Remove all players from the scene
            this.game.playerManager.players.forEach((playerMesh, playerId) => {
                if (playerMesh.userData.statusGroup) {
                    this.game.scene.remove(playerMesh.userData.statusGroup);
                }
                this.game.scene.remove(playerMesh);
            });
            this.game.playerManager.players.clear();
        });

        // Handle game state update
        this.socket.on('gameStateUpdate', (data) => {
            if (!data.players) return;
            
            Object.entries(data.players).forEach(([id, player]) => {
                if (id === this.socket.id) return;
                
                const playerMesh = this.game.playerManager.players.get(id);
                if (playerMesh) {
                    // Update position and rotation
                    playerMesh.position.set(
                        player.position.x,
                        player.position.y,
                        player.position.z
                    );
                    playerMesh.rotation.y = player.rotation._y || player.rotation.y || 0;
                    
                    // Update stats if provided
                    if (player.karma !== undefined || player.life !== undefined || player.mana !== undefined) {
                        const stats = {
                            life: player.life ?? playerMesh.userData.stats?.life ?? 100,
                            maxLife: player.maxLife ?? playerMesh.userData.stats?.maxLife ?? 100,
                            mana: player.mana ?? playerMesh.userData.stats?.mana ?? 100,
                            maxMana: player.maxMana ?? playerMesh.userData.stats?.maxMana ?? 100,
                            karma: player.karma ?? playerMesh.userData.stats?.karma ?? 50,
                            maxKarma: player.maxKarma ?? playerMesh.userData.stats?.maxKarma ?? 100
                        };
                        
                        // Store the stats in the mesh's userData
                        playerMesh.userData.stats = stats;
                        
                        // Update the status bars
                        if (this.game.updatePlayerStatus) {
                            this.game.updatePlayerStatus(playerMesh, stats);
                        }
                    }
                    
                    // Check for death
                    if (player.life <= 0 && !this.playerDead) {
                        this.playerDead = true;
                        this.handlePlayerDeath();
                    } else if (player.life > 0 && this.playerDead) {
                        this.playerDead = false;
                    }
                }
            });
            
            // Process NPC updates if they exist
            if (data.npcs && this.game.npcManager) {
                this.game.npcManager.processNPCUpdates(data.npcs);
            }
        });

        // Handle NPC updates from server
        this.socket.on('npcUpdates', (npcData) => {
            if (this.game.npcManager) {
                this.game.npcManager.processNPCUpdates(npcData);
            }
        });
        
        // Handle NPC interaction result
        this.socket.on('npcInteractionResult', (result) => {
            console.log('Received NPC interaction result:', result);
            // The UI manager will handle showing the dialogue based on the NPC type
            if (this.game.uiManager && this.game.uiManager.showDialogue && result.type) {
                this.game.uiManager.showDialogue(result.type);
            }
        });

        // Handle stats update
        this.socket.on('statsUpdate', (data) => {
            const playerMesh = this.game.playerManager.players.get(data.id);
            if (!playerMesh) {
                return;
            }

            // Update the player's stats
            if (!playerMesh.userData.stats) {
                playerMesh.userData.stats = {};
            }

            const oldStats = { ...playerMesh.userData.stats };
            playerMesh.userData.stats = {
                ...playerMesh.userData.stats,
                life: data.life,
                maxLife: data.maxLife,
                mana: data.mana,
                maxMana: data.maxMana
            };

            // Update the visual status bars
            if (this.game.updatePlayerStatus) {
                this.game.updatePlayerStatus(playerMesh, playerMesh.userData.stats);
            }

            // If this is our player, update the main UI
            if (data.id === this.socket.id) {
                this.game.playerStats.currentLife = data.life;
                this.game.playerStats.maxLife = data.maxLife;
                this.game.playerStats.currentMana = data.mana;
                this.game.playerStats.maxMana = data.maxMana;
                if (this.game.updateStatusBars) {
                    this.game.updateStatusBars();
                }
            }
        });

        // Handle batch stats updates from server
        this.socket.on('statsUpdate', (data) => {
            // Skip if no players in the update
            if (!data.players || data.players.length === 0) {
                return;
            }
            
            // Get the timestamp of this update
            const timestamp = data.timestamp || Date.now();
            
            // Process each player's stats
            data.players.forEach(playerData => {
                // Get the player mesh
                const playerMesh = this.game.playerManager.players.get(playerData.id);
                if (!playerMesh) {
                    return;
                }
                
                // Check for unique update ID to prevent race conditions
                if (playerData.updateId) {
                    // Skip if we've already processed this exact update
                    if (playerMesh.userData.lastUpdateId === playerData.updateId) {
                        return;
                    }
                    
                    // Store the update ID
                    playerMesh.userData.lastUpdateId = playerData.updateId;
                } else {
                    // Fall back to timestamp checking for older server versions
                    const lastTimestamp = playerMesh.userData.lastStatsUpdateTimestamp || 0;
                    if (timestamp <= lastTimestamp) {
                        return;
                    }
                    
                    // Store the timestamp of this update
                    playerMesh.userData.lastStatsUpdateTimestamp = timestamp;
                }
                
                // Initialize player stats if needed
                if (!playerMesh.userData.stats) {
                    playerMesh.userData.stats = {};
                }
                
                // Check if the current health value is different from what the server says
                if (playerMesh.userData.stats.life !== playerData.life) {
                    console.log(`Correcting health values for player ${playerData.id} from ${playerMesh.userData.stats.life} to ${playerData.life}`);
                }
                
                // Store the server values as the absolute source of truth
                playerMesh.userData.serverLife = playerData.life;
                playerMesh.userData.serverMaxLife = playerData.maxLife;
                
                // Update player stats with server values (server authority)
                playerMesh.userData.stats.life = playerData.life;
                playerMesh.userData.stats.maxLife = playerData.maxLife;
                
                // Set player ID for better debugging
                if (!playerMesh.userData.playerId) {
                    playerMesh.userData.playerId = playerData.id;
                }
                
                // Create health bar if it doesn't exist
                if (!playerMesh.userData.healthBar) {
                    this.game.playerManager.createHealthBar(playerMesh);
                }
                
                // Force unlock health updates for server stats
                // This ensures server stats can always update the health bar
                playerMesh.userData.healthLocked = false;
                
                // Update the health bar immediately with server values
                // This ensures health bars always reflect the server state
                if (this.game.playerManager.updateHealthBarWithServerValues) {
                    this.game.playerManager.updateHealthBarWithServerValues(playerMesh);
                } else {
                    // Fallback to regular update if the new method isn't available
                    this.game.playerManager.updateHealthBar(playerMesh);
                }
                
                // If this is our player, update the main UI
                if (playerData.id === this.socket.id) {
                    // Update player stats first
                    this.game.playerStats.currentLife = playerData.life;
                    this.game.playerStats.maxLife = playerData.maxLife;
                    
                    // Then update the UI
                    if (this.game.uiManager && this.game.playerStats) {
                        this.game.uiManager.updateStatusBars(this.game.playerStats);
                    }
                    
                    // Check for death
                    if (playerData.life <= 0 && !this.playerDead) {
                        this.playerDead = true;
                        this.handlePlayerDeath();
                    } else if (playerData.life > 0 && this.playerDead) {
                        this.playerDead = false;
                    }
                }
            });
        });

        // Handle life update
        this.socket.on('lifeUpdate', (data) => {
            // Only log significant health changes (more than 5% change)
            const isSignificantChange = !this.lastHealthLog || 
                !this.lastHealthLog[data.id] || 
                Math.abs(this.lastHealthLog[data.id] - data.life) > (data.maxLife * 0.05);
            
            if (isSignificantChange) {
                // Store this health value for future comparison
                if (!this.lastHealthLog) this.lastHealthLog = {};
                this.lastHealthLog[data.id] = data.life;
                
                // Only log significant health changes
                console.log(`Life update received for ${data.id}: ${data.life}/${data.maxLife}`);
            }
            
            try {
                // Get the player mesh
                const playerMesh = this.game.playerManager.players.get(data.id);
                
                if (!playerMesh) {
                    if (isSignificantChange) {
                        console.warn(`Player mesh not found for life update: ${data.id}`);
                    }
                    
                    // Store the update for later application if this player doesn't exist yet
                    if (!this.pendingUpdates.has(data.id)) {
                        this.pendingUpdates.set(data.id, []);
                    }
                    this.pendingUpdates.get(data.id).push({
                        type: 'lifeUpdate',
                        data: { ...data }
                    });
                    
                    if (isSignificantChange) {
                        console.log(`Stored life update for future player: ${data.id}`);
                    }
                    return;
                }
                
                // Skip if we're currently processing a damage effect for this player
                if (playerMesh.userData.processingDamageEffect) {
                    if (isSignificantChange) {
                        console.log(`Skipping life update for ${data.id} - processing damage effect`);
                    }
                    return;
                }
                
                // Update the player's stats
                if (!playerMesh.userData.stats) {
                    playerMesh.userData.stats = {};
                }
                
                // Store previous life value to detect death
                const previousLife = playerMesh.userData.stats.life || data.maxLife;
                
                // Update life values
                playerMesh.userData.stats.life = data.life;
                playerMesh.userData.stats.maxLife = data.maxLife;
                playerMesh.userData.stats.currentLife = data.life; // Ensure currentLife is also updated
                
                // Store server values for future reference
                playerMesh.userData.serverLife = data.life;
                playerMesh.userData.serverMaxLife = data.maxLife;
                
                // Record when we received this authoritative update
                playerMesh.userData.lastServerUpdateTime = Date.now();
                
                // Update the health bar
                this.game.playerManager.updateHealthBar(playerMesh);
                
                // If health is zero or less, mark player as dead
                if (data.life <= 0) {
                    playerMesh.userData.isDead = true;
                    
                    // If this player is the current target, clear the target display immediately
                    if (this.game.targetingManager && 
                        this.game.targetingManager.currentTarget && 
                        this.game.targetingManager.currentTarget.id === data.id) {
                        console.log(`Clearing target display for dead player: ${data.id}`);
                        this.game.targetingManager.clearTarget();
                    }
                    
                    // If this is our player, handle death
                    if (data.id === this.socket.id && this.game.isAlive) {
                        this.game.isAlive = false;
                        this.playerDead = true;
                        
                        // Clear any target the player might have when they die
                        if (this.game.targetingManager) {
                            this.game.targetingManager.clearTarget();
                        }
                        
                        if (this.game.playerManager) {
                            this.game.playerManager.handlePlayerDeath(this.game.localPlayer);
                        }
                        
                        // Show death screen
                        if (this.game.uiManager) {
                            this.game.uiManager.showDeathScreen();
                        }
                    }
                } else {
                    // If player was previously marked as dead but now has health, remove dead flag
                    if (playerMesh.userData.isDead) {
                        playerMesh.userData.isDead = false;
                    }
                    
                    // Always update the target display if this player is our current target
                    if (this.game.targetingManager && 
                        this.game.targetingManager.currentTarget && 
                        this.game.targetingManager.currentTarget.id === data.id) {
                        
                        // Get the target's name and level
                        const name = playerMesh.userData.name || `Player ${data.id}`;
                        const level = playerMesh.userData.stats.level || 1;
                        
                        // Update the target display with new health values
                        if (this.game.uiManager) {
                            if (isSignificantChange) {
                                console.log(`Updating target display for player ${data.id}: ${data.life}/${data.maxLife}`);
                            }
                            this.game.uiManager.updateTargetDisplay(
                                name, 
                                data.life, 
                                data.maxLife, 
                                'player', 
                                level
                            );
                        }
                    }
                }
                
                // If this is our player, update the UI
                if (data.id === this.socket.id) {
                    if (this.game.playerStats) {
                        this.game.playerStats.currentLife = data.life;
                        this.game.playerStats.maxLife = data.maxLife;
                        
                        // Update UI
                        if (this.game.uiManager) {
                            this.game.uiManager.updateStatusBars();
                        }
                    }
                }
            } catch (error) {
                console.error('Error in lifeUpdate handler:', error);
            }
        });

        // Handle mana update
        this.socket.on('manaUpdate', (data) => {
            const playerMesh = this.game.playerManager.players.get(data.id);
            if (!playerMesh) {
                return;
            }

            // Update stored mana stats
            if (!playerMesh.userData.stats) {
                playerMesh.userData.stats = {};
            }
            
            playerMesh.userData.stats.mana = data.mana;
            playerMesh.userData.stats.maxMana = data.maxMana;
            
            // Update visual status bars
            if (this.game.updatePlayerStatus) {
                this.game.updatePlayerStatus(playerMesh, playerMesh.userData.stats);
            }

            // If this is our player, update the main UI
            if (data.id === this.socket.id) {
                this.game.playerStats.currentMana = data.mana;
                this.game.playerStats.maxMana = data.maxMana;
                if (this.game.updateStatusBars) {
                    this.game.updateStatusBars();
                }
            }
        });

        // Handle karma update
        this.socket.on('karmaUpdate', (data) => {
            const playerMesh = this.game.playerManager.players.get(data.id);
            if (!playerMesh) {
                // Queue the update for when the player is created
                console.log(`Queueing karma update for player ${data.id} that doesn't exist yet`);
                if (!this.pendingUpdates.has(data.id)) {
                    this.pendingUpdates.set(data.id, []);
                }
                this.pendingUpdates.get(data.id).push({
                    type: 'karmaUpdate',
                    data: data
                });
                return;
            }

            // Update stored karma stats
            if (!playerMesh.userData.stats) {
                playerMesh.userData.stats = {};
            }
            
            playerMesh.userData.stats.karma = data.karma;
            playerMesh.userData.stats.maxKarma = data.maxKarma;
            
            // Update visual status bars
            if (this.game.updatePlayerStatus) {
                this.game.updatePlayerStatus(playerMesh, playerMesh.userData.stats);
            }

            // If this is our player, update the main UI and effects
            if (data.id === this.socket.id) {
                this.game.playerStats.currentKarma = data.karma;
                this.game.playerStats.maxKarma = data.maxKarma;
                if (this.game.updateStatusBars) {
                    this.game.updateStatusBars();
                }
                if (this.game.updateKarmaEffects) {
                    this.game.updateKarmaEffects();
                }
            }
        });

        // Handle damage effect
        this.socket.on('damageEffect', (data) => {
            // Get the target player
            let targetPlayer;
            if (data.targetId === this.socket.id) {
                targetPlayer = this.game.localPlayer;
            } else {
                targetPlayer = this.game.playerManager.players.get(data.targetId);
            }
            
            if (!targetPlayer) {
                console.warn(`Target player not found for damage effect: ${data.targetId}`);
                return;
            }
            
            // Prevent processing multiple damage effects in quick succession
            if (targetPlayer.userData && targetPlayer.userData.processingDamageEffect) {
                return;
            }
            
            // Mark player as processing damage effect
            if (targetPlayer.userData) {
                targetPlayer.userData.processingDamageEffect = true;
                targetPlayer.userData.lastDamageTime = Date.now();
            }
            
            // Get the source entity (player or monster)
            let sourceEntity;
            if (data.sourceType === 'monster') {
                // Source is a monster
                if (this.game.monsterManager) {
                    const monster = this.game.monsterManager.getMonsterById(data.sourceId);
                    if (monster) {
                        sourceEntity = monster.mesh;
                    }
                }
            } else {
                // Source is a player (default)
                if (data.sourceId === this.socket.id) {
                    sourceEntity = this.game.localPlayer;
                } else {
                    sourceEntity = this.game.playerManager.players.get(data.sourceId);
                }
            }
            
            // Create visual effect between source and target
            if (sourceEntity && targetPlayer && this.game.skillsManager) {
                if (data.skillName === 'monster_attack') {
                    // Monster attack effect
                    this.game.skillsManager.createAttackEffect(targetPlayer, '#ff0000', 0.5);
                } else {
                    // Player skill effect
                    this.game.skillsManager.createSkillEffect(
                        data.skillName,
                        sourceEntity.position,
                        targetPlayer.position
                    );
                }
                
                // Create damage number
                this.game.skillsManager.createDamageNumber(
                    targetPlayer,
                    data.damage,
                    true,
                    data.isCritical
                );
            }
            
            // Update the health bar immediately with the expected new health
            if (targetPlayer.userData.stats) {
                // Calculate the expected new health
                const currentHealth = targetPlayer.userData.stats.life || 100;
                const newHealth = Math.max(0, currentHealth - data.damage);
                const maxHealth = targetPlayer.userData.stats.maxLife || 100;
                
                // Store these values for immediate visual feedback
                targetPlayer.userData.serverLife = newHealth;
                targetPlayer.userData.serverMaxLife = maxHealth;
                
                // Update the player's stats
                targetPlayer.userData.stats.life = newHealth;
                targetPlayer.userData.stats.maxLife = maxHealth;
                
                // Update the health bar
                this.game.playerManager.updateHealthBar(targetPlayer);
                
                // If this is our player, update the UI
                if (data.targetId === this.socket.id) {
                    if (this.game.playerStats) {
                        this.game.playerStats.currentLife = newHealth;
                        this.game.playerStats.maxLife = maxHealth;
                        
                        // Update UI
                        if (this.game.uiManager) {
                            this.game.uiManager.updateStatusBars(this.game.playerStats);
                        }
                    }
                }
            }
            
            // Clear the processing flag after a delay
            setTimeout(() => {
                targetPlayer.userData.processingDamageEffect = false;
            }, 1000);
        });

        // Handle player state request response
        this.socket.on('playerState', (data) => {
            console.log('Received player state from server:', data);
            
            if (!data) {
                console.error('Received invalid player state data');
                return;
            }
            
            // Update player stats
            if (this.game.playerStats && data.stats) {
                Object.assign(this.game.playerStats, data.stats);
            }
            
            // Set path in karma manager
            if (data.path && this.game.karmaManager) {
                this.game.karmaManager.chosenPath = data.path;
            }
            
            // Add skills
            if (data.skills && Array.isArray(data.skills) && this.game.skillsManager) {
                console.log('Adding skills from server:', data.skills);
                data.skills.forEach(skillId => {
                    this.game.skillsManager.addSkill(skillId);
                });
            }
            
            // Update UI
            if (this.game.uiManager) {
                this.game.uiManager.updateSkillBar();
            }
            
            console.log('Player state updated from server');
        });

        // Handle path selection result
        this.socket.on('pathSelectionResult', (result) => {
            this.handlePathSelectionResult(result);
        });

        // Handle reconnect
        this.socket.on('reconnect', () => {
            this.handleReconnection();
        });

        // Handle player died event
        this.socket.on('playerDied', (data) => {
            console.log('Received player died event:', data);
            
            // Show appropriate death message based on killer type
            if (this.game.uiManager) {
                if (data.killerType === 'monster') {
                    this.game.uiManager.showNotification(`You were killed by a monster!`, '#ff0000');
                } else {
                    this.game.uiManager.showNotification(`You were killed by another player!`, '#ff0000');
                }
            }
        });
        
        // Handle respawn confirmation
        this.socket.on('respawnConfirmed', (data) => {
            console.log('Respawn confirmed:', data);
            
            // Update player position
            if (this.game.localPlayer && data.position) {
                this.game.localPlayer.position.set(
                    data.position.x,
                    data.position.y,
                    data.position.z
                );
            }
            
            // Update player stats
            if (this.game.playerStats) {
                this.game.playerStats.currentLife = data.life;
                this.game.playerStats.maxLife = data.maxLife;
                
                // Update UI
                if (this.game.uiManager) {
                    this.game.uiManager.updateStatusBars();
                    this.game.uiManager.hideDeathScreen();
                    this.game.uiManager.showNotification('You have respawned!', '#00ff00');
                }
            }
            
            // Mark player as alive
            this.game.isAlive = true;
            this.playerDead = false;
            
            // Re-enable controls if available
            if (this.game.controlsManager && this.game.controlsManager.enableControls) {
                this.game.controlsManager.enableControls();
            }
            
            // Reset camera if needed
            if (this.game.cameraManager && this.game.cameraManager.resetCamera) {
                this.game.cameraManager.resetCamera();
            }
        });
        
        // Handle player respawn (for other players)
        this.socket.on('playerRespawned', (data) => {
            console.log('Player respawned:', data);
            
            // Skip if this is our own player - already handled by respawnConfirmed
            if (data.id === this.socket.id) {
                return;
            }
            
            // Get the player mesh
            const playerMesh = this.game.playerManager.players.get(data.id);
            if (!playerMesh) {
                console.warn(`Player mesh not found for respawn: ${data.id}`);
                return;
            }
            
            // Update player position
            if (data.position) {
                playerMesh.position.set(data.position.x, data.position.y, data.position.z);
            }
            
            // Update player stats
            if (data.stats) {
                if (!playerMesh.userData.stats) {
                    playerMesh.userData.stats = {};
                }
                
                playerMesh.userData.stats.life = data.stats.life;
                playerMesh.userData.stats.maxLife = data.stats.maxLife;
                
                // Update health bar
                this.game.playerManager.updateHealthBar(playerMesh);
            }
        });

        // Set up monster data handler
        this.socket.on('monster_data', (monsterData) => {
            if (this.game.monsterManager) {
                if (this.game.monsterManager.initialized) {
                    this.game.monsterManager.processServerMonsters(monsterData);
                } else {
                    console.log('Monster manager not fully initialized yet, storing monster data for later processing');
                    this.pendingMonsterData = monsterData;
                    this.waitForMonsterManager();
                }
            }
        });
        
        // Set up monster update handler
        this.socket.on('monster_update', (updateData) => {
            if (this.game.monsterManager) {
                if (this.game.monsterManager.initialized) {
                    this.game.monsterManager.processMonsterUpdate(updateData);
                } else {
                    console.log('Monster manager not fully initialized yet, ignoring monster update');
                    // Updates can be safely ignored as they'll be included in the next full monster_data
                }
            }
        });
        
        // Handle monster damage to player
        this.socket.on('monsterDamage', (data) => {
            console.log('Received monster damage event:', data);
            
            // Create visual damage effect
            if (this.game.localPlayer && this.socket.id === data.targetId) {
                // Flash the screen red for player damage
                this.game.uiManager.flashDamageEffect();
                
                // Show damage number
                if (this.game.skillsManager) {
                    this.game.skillsManager.createDamageNumber(
                        this.game.localPlayer, 
                        data.damage, 
                        true // Mark as received damage
                    );
                }
                
                // Show notification for significant damage
                if (data.damage > 20) {
                    this.game.uiManager.showNotification(
                        `You received ${data.damage} damage from a monster!`, 
                        '#ff3333'
                    );
                }
                
                // Update local player stats
                if (this.game.playerStats) {
                    // Apply damage to local stats
                    this.game.playerStats.currentLife = data.health;
                    this.game.playerStats.maxLife = data.maxHealth;
                    
                    // Update UI
                    this.game.uiManager.updateStatusBars(this.game.playerStats);
                }
                
                // Play hit sound
                if (this.game.soundManager) {
                    this.game.soundManager.playSound('player_hit');
                }
            }
        });
    }

    handlePathSelectionResult(result) {
        console.log('Received path selection result:', result);
        
        if (result.success) {
            // Set the chosen path in the karma manager
            this.game.karmaManager.setChosenPath(result.path);
            
            // Update player stats
            if (this.game.playerStats) {
                this.game.playerStats.path = result.path;
            }
            
            // Add skills received from server
            if (result.skills && Array.isArray(result.skills) && this.game.skillsManager) {
                console.log('Adding skills from server:', result.skills);
                result.skills.forEach(skillId => {
                    this.game.skillsManager.addSkill(skillId);
                });
                
                // Force update UI after adding skills
                if (this.game.uiManager) {
                    console.log('Updating skill bar after adding skills');
                    this.game.uiManager.updateSkillBar();
                }
            }
            
            console.log(`Path selection confirmed by server: ${result.path}`);
            
            // Update player color based on path
            if (this.game.playerManager && this.game.playerManager.updatePlayerColor) {
                this.game.playerManager.updatePlayerColor(result.path);
            }
        } else {
            console.error('Path selection failed:', result.message);
            
            // Reset the path locally since server rejected it
            if (this.game.karmaManager) {
                this.game.karmaManager.chosenPath = null;
            }
            
            if (this.game.playerStats) {
                this.game.playerStats.path = null;
            }
            
            // Show error message
            if (this.game.uiManager) {
                this.game.uiManager.showNotification(result.message || 'Path selection failed', '#ff0000');
            }
        }
    }

    handleReconnection() {
        console.log('Handling reconnection...');
        
        // Request player list to sync game state
        if (this.socket) {
            console.log('Requesting player list after reconnection');
            this.socket.emit('requestPlayerList');
            
            // Also request state update - this is needed for reconnection test
            this.socket.emit('requestStateUpdate');
        }
        
        // Apply any pending updates for players
        this.applyPendingUpdates();
        
        // Reset reconnection state
        this.wasDisconnected = false;
        
        // In the original game, reconnection meant starting over with a new player
        // We're keeping this for backward compatibility
        console.log('Reconnected to server - creating new player as per original game behavior');
        
        if (this.game && this.game.playerManager) {
            this.game.playerManager.createLocalPlayer();
        }
    }

    async createLocalPlayer() {
        try {
            // Check if local player already exists
            if (this.game.localPlayer) {
                console.warn('NetworkManager: Local player already exists, not creating a new one');
                return this.game.localPlayer;
            }
            
            // Check if we have a valid socket connection
            if (!this.socket || !this.socket.id) {
                console.error('NetworkManager: Cannot create local player without valid socket connection');
                return null;
            }
            
            console.log('NetworkManager: Creating local player with ID:', this.socket.id);
            
            // Use server-provided position or default
            const position = NETWORK_CONSTANTS.DEFAULT_SPAWN_POSITION;
            
            const player = await this.game.playerManager.createPlayer(
                this.socket.id,
                position,
                { y: 0 },
                true
            );
            
            if (player) {
                this.game.localPlayer = player;
                this.game.scene.add(player);
                this.game.playerManager.players.set(this.socket.id, player);
                
                // Send initial state to server
                this.sendPlayerState();
                
                // Apply any pending updates for this player
                this.applyPendingUpdates(this.socket.id);
            }
            
            return player;
        } catch (error) {
            console.error('Error creating local player:', error);
            return null;
        }
    }

    /**
     * Create a local player with the correct ID
     * @param {Object} position - The position to create the player at
     */
    createLocalPlayer(position = { x: 0, y: 0, z: 0 }) {
        // Use the socket ID as the player ID
        const playerId = this.socket ? this.socket.id : 'offline-player';
        
        // Create the local player with the correct ID
        this.game.playerManager.createLocalPlayer(playerId, position);
        
        // Log the creation
        console.log(`Created local player with ID: ${playerId}`);
    }

    sendPlayerState() {
        if (!this.isConnected || !this.socket || !this.game?.localPlayer) return;
        
        // Send current player state to server
        this.socket.emit('playerMovement', {
            position: {
                x: this.game.localPlayer.position.x,
                y: this.game.localPlayer.position.y,
                z: this.game.localPlayer.position.z
            },
            rotation: {
                y: this.game.localPlayer.rotation.y
            },
            path: this.game.localPlayer.userData.path || null,
            karma: this.game.localPlayer.userData.stats?.karma || 50,
            maxKarma: this.game.localPlayer.userData.stats?.maxKarma || 100,
            mana: this.game.localPlayer.userData.stats?.mana || 100,
            maxMana: this.game.localPlayer.userData.stats?.maxMana || 100
        });
    }

    update() {
        // Skip if not connected or no local player
        if (!this.socket?.connected || !this.game?.localPlayer) return;
        
        // Send player state if player has moved
        const now = Date.now();
        if (!this.lastStateUpdate || now - this.lastStateUpdate >= 100) { 
            this.sendPlayerState();
            this.lastStateUpdate = now;
        }
    }

    removePlayer(playerId) {
        const playerMesh = this.game.playerManager.players.get(playerId);
        if (playerMesh) {
            // Remove status bars if they exist
            if (playerMesh.userData.statusGroup) {
                this.game.scene.remove(playerMesh.userData.statusGroup);
            }
            
            // Remove player mesh from scene
            this.game.scene.remove(playerMesh);
            
            // Remove from players map
            this.game.playerManager.players.delete(playerId);
            
            console.log(`Removed player ${playerId}`);
        }
    }

    cleanup() {
        console.log('Cleaning up NetworkManager');
        
        // Disconnect socket if connected
        if (this.socket && this.socket.connected) {
            this.socket.disconnect();
        }
        
        // Reset controls if available
        if (this.game.controls && typeof this.game.controls.resetKeys === 'function') {
            this.game.controls.resetKeys();
        } else if (this.game.controlsManager && typeof this.game.controlsManager.resetKeys === 'function') {
            this.game.controlsManager.resetKeys();
        }
        
        // Clear any pending timers
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        // Clear any UI elements
        if (this.connectionStatusElement) {
            document.body.removeChild(this.connectionStatusElement);
            this.connectionStatusElement = null;
        }
    }

    async createNetworkPlayer(player) {
        console.log('Creating network player:', player.id);
        try {
            const playerMesh = await this.game.playerManager.createPlayer(
                player.id,
                player.position,
                { y: player.rotation.y || 0 },
                false // not local
            );
            
            if (playerMesh) {
                this.game.scene.add(playerMesh);
                
                // Initialize player stats
                const stats = {
                    life: player.life ?? 100,
                    maxLife: player.maxLife ?? 100,
                    mana: player.mana ?? 100,
                    maxMana: player.maxMana ?? 100,
                    karma: player.karma ?? 50,
                    maxKarma: player.maxKarma ?? 100
                };
                
                // Store player ID and stats
                playerMesh.userData.playerId = player.id;
                playerMesh.userData.stats = stats;
                
                // Force creation and update of status bars
                if (this.game.updatePlayerStatus) {
                    this.game.updatePlayerStatus(playerMesh, stats);
                }
                
                // Make sure the health bar is created and updated
                if (!playerMesh.userData.healthBar) {
                    this.game.playerManager.createHealthBar(playerMesh);
                }
                
                this.game.playerManager.players.set(player.id, playerMesh);
                
                console.log(`Added network player ${player.id} with health bar`);
                
                // Request a life update for this player to ensure health bar is correct
                this.socket.emit('requestLifeUpdate', { playerId: player.id });
                
                // Apply any pending updates for this player
                this.applyPendingUpdates(player.id);
            }
        } catch (error) {
            console.error(`Error creating network player ${player.id}:`, error);
        }
    }

    sendPathChoice(path) {
        // Check if we've already sent a path choice recently
        if (this._lastPathChoiceSent && (Date.now() - this._lastPathChoiceSent < 2000)) {
            console.log('Ignoring duplicate path choice request - already sent within the last 2 seconds');
            return;
        }
        
        console.log('Sending path choice to server:', path);
        this.socket.emit('choosePath', { path });
        
        // Record the time we sent this request to prevent duplicates
        this._lastPathChoiceSent = Date.now();
    }

    /**
     * Create a visual damage effect on a player
     * @param {THREE.Object3D} targetPlayer - The player that took damage
     * @param {number} damage - The amount of damage dealt
     * @param {boolean} isCritical - Whether the damage is critical
     */
    createDamageEffect(targetPlayer, damage, isCritical = false) {
        if (!targetPlayer) return;
        
        // Find the character model's material (it's a child of the player mesh)
        let characterMaterial;
        targetPlayer.traverse((child) => {
            if (child.isMesh && child.material) {
                characterMaterial = child.material;
            }
        });
        
        // Flash the target player red
        if (characterMaterial) {
            const originalColor = characterMaterial.color ? characterMaterial.color.clone() : new THREE.Color(0xffffff);
            characterMaterial.color = new THREE.Color(0xff0000);
            
            setTimeout(() => {
                characterMaterial.color.copy(originalColor);
            }, 200);
        }
        
        // Create a damage number that floats up from the player's head
        if (this.game.scene && targetPlayer.position) {
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
            
            // Position the damage number above the player's head
            const updatePosition = () => {
                if (!targetPlayer.position || !this.game.cameraManager || !this.game.cameraManager.camera) return;
                
                // Convert 3D position to screen position
                const position = new THREE.Vector3();
                position.copy(targetPlayer.position);
                position.y += 2; // Position above the player's head
                
                // Project the 3D position to 2D screen coordinates
                position.project(this.game.cameraManager.camera);
                
                // Convert to screen coordinates
                const x = (position.x * 0.5 + 0.5) * window.innerWidth;
                const y = (-(position.y * 0.5) + 0.5) * window.innerHeight;
                
                // Update the position of the damage text
                damageText.style.left = `${x}px`;
                damageText.style.top = `${y}px`;
            };
            
            // Initial position
            updatePosition();
            
            // Animate the damage number
            let animationFrame = 0;
            const animate = () => {
                animationFrame++;
                
                // Update position
                updatePosition();
                
                // Move upward and fade out
                const opacity = 1 - (animationFrame / 60);
                damageText.style.transform = `translateY(-${animationFrame * 2}px)`;
                damageText.style.opacity = opacity;
                
                if (opacity > 0 && document.getElementById(damageId)) {
                    requestAnimationFrame(animate);
                } else {
                    // Remove the element when animation is complete
                    if (document.getElementById(damageId)) {
                        document.body.removeChild(damageText);
                    }
                }
            };
            
            // Start animation
            requestAnimationFrame(animate);
        }
    }

    handlePlayerDeath() {
        console.log('Local player has died');
        
        // Use existing death handling if available
        if (this.game.handlePlayerDeath) {
            this.game.handlePlayerDeath();
            return;
        }
        
        // Show death screen if UI manager is available
        if (this.game.uiManager && this.game.uiManager.showDeathScreen) {
            this.game.uiManager.showDeathScreen();
        } else {
            // Fallback to basic death handling
            const deathMessage = document.createElement('div');
            deathMessage.id = 'death-screen';
            deathMessage.style.position = 'fixed';
            deathMessage.style.top = '50%';
            deathMessage.style.left = '50%';
            deathMessage.style.transform = 'translate(-50%, -50%)';
            deathMessage.style.color = '#ff0000';
            deathMessage.style.fontSize = '32px';
            deathMessage.style.fontWeight = 'bold';
            deathMessage.style.textAlign = 'center';
            deathMessage.style.zIndex = '1000';
            document.body.appendChild(deathMessage);
            
            // Add respawn button
            const respawnButton = document.createElement('button');
            respawnButton.textContent = 'Respawn';
            respawnButton.style.display = 'block';
            respawnButton.style.margin = '20px auto';
            respawnButton.style.padding = '10px 20px';
            respawnButton.style.fontSize = '18px';
            respawnButton.onclick = () => {
                // Request respawn from server
                this.socket.emit('respawn');
                
                // Remove death screen
                const deathScreen = document.getElementById('death-screen');
                if (deathScreen) {
                    document.body.removeChild(deathScreen);
                }
                
                // Reset player state
                this.playerDead = false;
                
                // Restore player stats
                if (this.game.playerStats) {
                    // Update player health
                    this.game.playerStats.currentLife = 100;
                }
                
                // Update UI
                if (this.game.uiManager) {
                    this.game.uiManager.updateStatusBars();
                }
            };
            deathMessage.appendChild(respawnButton);
            deathMessage.textContent = 'YOU DIED';
        }
        
        // Disable controls if available
        if (this.game.controlsManager && this.game.controlsManager.disableControls) {
            this.game.controlsManager.disableControls();
        }
    }

    initialize() {
        this.setupSocketHandlers();
        this.setupGameListeners();
        
        // Start periodic health check to ensure health values stay consistent
        this.startPeriodicHealthCheck();
    }

    startPeriodicHealthCheck() {
        // Clear any existing interval
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        // Set up a new interval to check health values periodically
        this.healthCheckInterval = setInterval(() => {
            // Check all players
            this.game.playerManager.players.forEach((playerMesh, playerId) => {
                // Skip if player doesn't have stored server values
                if (playerMesh.userData.serverLife === undefined) {
                    return;
                }
                
                // Skip if we're in a damage effect processing - this avoids conflicts
                if (playerMesh.userData.processingDamageEffect) {
                    return;
                }
                
                // Skip if health is locked - this indicates a recent update to the health bar
                if (playerMesh.userData.healthLocked) {
                    return;
                }
                
                // Check if current health values match stored server values
                if (playerMesh.userData.stats && 
                    (playerMesh.userData.stats.life !== playerMesh.userData.serverLife || 
                     playerMesh.userData.stats.maxLife !== playerMesh.userData.serverMaxLife)) {
                    
                    // Only correct if:
                    // 1. Health has increased (implying server regeneration)
                    // 2. Or more than 5 seconds have passed since last damage effect
                    const timeNow = Date.now();
                    const lastDamageTime = playerMesh.userData.lastDamageTime || 0;
                    const timeSinceLastDamage = timeNow - lastDamageTime;
                    
                    // Only make corrections in the following cases:
                    const shouldCorrect = 
                        // If server health is higher (implies regeneration)
                        playerMesh.userData.serverLife > playerMesh.userData.stats.life || 
                        // Or if the server health is lower and it's a significant difference (>5%)
                        (playerMesh.userData.serverLife < playerMesh.userData.stats.life && 
                         Math.abs(playerMesh.userData.serverLife - playerMesh.userData.stats.life) / 
                         playerMesh.userData.serverMaxLife > 0.05) ||
                        // Or if at least 5 seconds have passed since last damage (avoids visual glitches)
                        timeSinceLastDamage > 5000;
                    
                    if (shouldCorrect) {
                        console.log(`Correcting health values for player ${playerId} from ${playerMesh.userData.stats.life} to ${playerMesh.userData.serverLife}`);
                        
                        // Restore the server values
                        playerMesh.userData.stats.life = playerMesh.userData.serverLife;
                        playerMesh.userData.stats.maxLife = playerMesh.userData.serverMaxLife;
                        
                        // Update the health bar
                        this.game.playerManager.updateHealthBar(playerMesh);
                    } else {
                        // If we don't correct, we should still track that the server has a different value
                        console.log(`Deferring health correction for player ${playerId} - too soon after damage (${timeSinceLastDamage}ms)`);
                    }
                }
            });
        }, 2000); // Check every 2 seconds
    }

    stopPeriodicHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Apply any pending updates for a player that were received before the player was created
     * @param {string} playerId - The ID of the player to apply updates for
     */
    applyPendingUpdates(playerId) {
        if (!this.pendingUpdates || !this.pendingUpdates.has(playerId)) {
            return;
        }
        
        // Get the player directly through the PlayerManager
        const player = this.game.playerManager.getPlayerById(playerId);
        if (!player) {
            console.warn(`Cannot apply pending updates for player ${playerId} - player not found`);
            return;
        }
        
        // Process all pending updates for this player
        const updates = this.pendingUpdates.get(playerId);
        for (const update of updates) {
            switch (update.type) {
                case 'lifeUpdate':
                    // First check if the PlayerManager has an updatePlayerLife method
                    if (this.game.playerManager && typeof this.game.playerManager.updatePlayerLife === 'function') {
                        this.game.playerManager.updatePlayerLife(player, update.data.life, update.data.maxLife);
                    } 
                    // For backward compatibility, try player.updateLife method
                    else if (typeof player.updateLife === 'function') {
                        player.updateLife(update.data.life, update.data.maxLife);
                    } 
                    // Fallback to direct manipulation
                    else {
                        // Get the player mesh now that it should exist
                        const playerMesh = this.game.playerManager.players.get(playerId);
                        if (!playerMesh) {
                            continue;
                        }
                        
                        // Update the player's stats
                        if (!playerMesh.userData.stats) {
                            playerMesh.userData.stats = {};
                        }
                        
                        playerMesh.userData.stats.life = update.data.life;
                        playerMesh.userData.stats.maxLife = update.data.maxLife;
                        
                        // Update the health bar
                        this.game.playerManager.updateHealthBar(playerMesh);
                        
                        // If this is our player, update the UI
                        if (this.socket && playerId === this.socket.id && this.game.playerStats) {
                            this.game.playerStats.currentLife = update.data.life;
                            this.game.playerStats.maxLife = update.data.maxLife;
                            
                            // Update UI
                            if (this.game.uiManager) {
                                this.game.uiManager.updateStatusBars();
                            }
                        }
                    }
                    break;
                    
                case 'statsUpdate':
                    // Handle stats update similarly
                    const playerForStats = this.game.playerManager.players.get(playerId);
                    if (playerForStats && update.data.stats) {
                        if (!playerForStats.userData.stats) {
                            playerForStats.userData.stats = {};
                        }
                        
                        // Update all stats
                        Object.assign(playerForStats.userData.stats, update.data.stats);
                        
                        // Update health bar
                        this.game.playerManager.updateHealthBar(playerForStats);
                        
                        // Update UI for local player
                        if (this.socket && playerId === this.socket.id && this.game.playerStats && this.game.uiManager) {
                            Object.assign(this.game.playerStats, update.data.stats);
                            this.game.uiManager.updateStatusBars();
                        }
                    }
                    break;
                    
                case 'positionUpdate':
                    // Handle position updates
                    if (update.data && update.data.position) {
                        const pos = update.data.position;
                        if (player.position && typeof player.position.set === 'function') {
                            player.position.set(pos.x, pos.y, pos.z);
                        }
                    }
                    break;
                    
                case 'karmaUpdate':
                    // Handle karma update similarly
                    const playerForKarma = this.game.playerManager.players.get(playerId);
                    if (playerForKarma && update.data) {
                        if (!playerForKarma.userData.stats) {
                            playerForKarma.userData.stats = {};
                        }
                        
                        // Update karma stats
                        playerForKarma.userData.stats.karma = update.data.karma;
                        playerForKarma.userData.stats.maxKarma = update.data.maxKarma;
                        
                        // Update visual status bars
                        if (this.game.updatePlayerStatus) {
                            this.game.updatePlayerStatus(playerForKarma, playerForKarma.userData.stats);
                        }
                        
                        // Update UI for local player
                        if (this.socket && playerId === this.socket.id && this.game.playerStats && this.game.uiManager) {
                            this.game.playerStats.currentKarma = update.data.karma;
                            this.game.playerStats.maxKarma = update.data.maxKarma;
                            this.game.uiManager.updateStatusBars();
                        }
                    }
                    break;
                    
                // Add cases for other update types as needed
            }
        }
        
        // Clear the pending updates for this player
        this.pendingUpdates.delete(playerId);
    }

    /**
     * Emit the local player's movement to the server
     * Sends current position and rotation data
     */
    emitPlayerMovement() {
        // Skip if we're not connected
        if (!this.isConnected) {
            return;
        }
        
        // Skip if there's no local player
        if (!this.game?.playerManager?.localPlayer) {
            return;
        }
        
        const localPlayer = this.game.playerManager.localPlayer;
        
        // Emit the player movement
        this.socket.emit('playerMovement', {
            position: localPlayer.position,
            quaternion: localPlayer.quaternion
        });
    }

    /**
     * Send a skill use request to the server
     * @param {string} targetId - The ID of the target player
     * @param {string} skillId - The ID of the skill to use
     */
    useSkill(targetId, skillId) {
        // Skip if we're not connected
        if (!this.isConnected) {
            console.log('Cannot use skill - not connected to server');
            return;
        }
        
        // Emit the skill usage to the server
        this.socket.emit('useSkill', {
            targetId,
            skillId
        });
    }

    /**
     * Emit that the local player is ready to the server
     * and request the current player list
     */
    emitPlayerReady() {
        // Skip if we're not connected
        if (!this.isConnected) {
            return;
        }
        
        // Emit player ready event
        this.socket.emit('playerReady');
        
        // Request current player list
        this.socket.emit('requestPlayerList');
    }

    requestPlayerList() {
        if (!this.socket) {
            console.warn('Cannot request player list: No socket connection');
            return;
        }
        
        // Request current player list
        this.socket.emit('requestPlayerList');
    }

    /**
     * Wait for the monster manager to initialize and then process pending monster data
     */
    waitForMonsterManager() {
        // Check every 500ms if the monster manager is ready
        const checkInterval = setInterval(() => {
            if (this.game.monsterManager && this.game.monsterManager.initialized) {
                // If there's pending monster data, process it
                if (this.pendingMonsterData) {
                    console.log('Monster manager now initialized, processing pending monster data');
                    this.game.monsterManager.processServerMonsters(this.pendingMonsterData);
                    this.pendingMonsterData = null;
                }
                // Stop checking
                clearInterval(checkInterval);
            }
        }, 500);
        
        // Set a timeout to stop checking after 10 seconds to prevent potential memory leaks
        setTimeout(() => {
            clearInterval(checkInterval);
            // If we still have pending data, log a warning
            if (this.pendingMonsterData) {
                console.warn('Monster manager did not initialize within timeout period');
            }
        }, 10000);
    }
}