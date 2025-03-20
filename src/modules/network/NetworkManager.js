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
        this.socket = null;
        this.connected = false;
        this.wasDisconnected = false;
        this.reconnectAttempts = 0;
        this.lastStateUpdate = 0;
        
        // Connection state tracking
        this.connectionState = {
            isReconnecting: false,
            reconnectAttempts: 0,
            maxReconnectAttempts: 5,
            reconnectDelay: 2000,
            maxReconnectDelay: 30000
        };
        
        // Store pending updates for players that haven't been created yet
        this.pendingUpdates = new Map();
        
        // Fix for monster manager waiting
        this.pendingMonsterData = null;
        this.monsterManagerCheckInterval = null;
        
        // Connect to the server after initializing all fields
        this.connect();
    }
    
    /**
     * Connect to the server using socket.io
     */
    connect() {
        try {
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
            
            // Set up handlers after socket is created
            this.setupSocketHandlers();
        } catch (error) {
            console.error('Error connecting to server:', error);
            // Retry connection after a delay
            setTimeout(() => this.attemptReconnect(), 2000);
        }
    }
    
    /**
     * Wait for the MonsterManager to be initialized before processing monster data
     * Periodically checks if the monster manager is ready and processes pending monster data
     */
    waitForMonsterManager() {
        // Clear any existing interval
        if (this.monsterManagerCheckInterval) {
            clearInterval(this.monsterManagerCheckInterval);
        }
        
        // Set up a check interval if not already set
        this.monsterManagerCheckInterval = setInterval(() => {
            if (this.game.monsterManager && this.game.monsterManager.initialized) {
                console.log('Monster manager now initialized, processing pending monster data');
                
                // Process the pending monster data
                if (this.pendingMonsterData) {
                    this.game.monsterManager.processServerMonsters(this.pendingMonsterData);
                    this.pendingMonsterData = null;
                }
                
                // Clear the interval
                clearInterval(this.monsterManagerCheckInterval);
                this.monsterManagerCheckInterval = null;
            }
        }, 100);
        
        // Safety timeout to prevent infinite checking - clear after 10 seconds
        setTimeout(() => {
            if (this.monsterManagerCheckInterval) {
                console.warn('Monster manager still not initialized after 10 seconds, clearing check interval');
                clearInterval(this.monsterManagerCheckInterval);
                this.monsterManagerCheckInterval = null;
            }
        }, 10000);
    }

    async init() {
        return new Promise((resolve) => {
            // Make sure we have a socket connection
            if (!this.socket) {
                try {
                    // Try to connect
                    this.connect();
                } catch (error) {
                    console.error('Failed to create socket connection:', error);
                    resolve(false);
                    return;
                }
            }
            
            if (this.socket) {
                // If already connected, resolve immediately
                if (this.connected) {
                    resolve(true);
                    return;
                }
                
                // Listen for connection
                this.socket.once('connect', () => {
                    this.connected = true;
                    resolve(true);
                });
                
                // Listen for connection error
                this.socket.once('connect_error', () => {
                    console.warn('Failed to connect to server');
                    resolve(false);
                });
                
                // Set a timeout
                setTimeout(() => {
                    if (!this.connected) {
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
            return false; // Return false to indicate failure
        }

        // Handle successful connection
        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
            this.connected = true;
            
            // Reset reconnection state
            this.connectionState.isReconnecting = false;
            this.connectionState.reconnectAttempts = 0;
            this.reconnectAttempts = 0;
            
            // Show connection message
            this.showConnectionStatus('Connected to server!', true);
            
            // Request state synchronization when connecting
            this.requestStateSync();
        });
        
        // Handle connection error
        this.socket.on('connect_error', (error) => {
            console.warn('Connection error:', error.message);
            this.connected = false;
            
            // Only attempt to reconnect if not already reconnecting
            if (!this.connectionState.isReconnecting) {
                this.connectionState.isReconnecting = true;
                setTimeout(() => {
                    this.attemptReconnect();
                }, 2000); // Wait 2 seconds before attempting to reconnect
            }
        });

        // Handle disconnection
        this.socket.on('disconnect', (reason) => {
            console.warn('Disconnected from server. Reason:', reason);
            this.connected = false;
            
            // Disable player controls
            if (this.game.controls) {
                this.game.controls.forward = false;
                this.game.controls.backward = false;
                this.game.controls.left = false;
                this.game.controls.right = false;
            }
            
            // Show disconnection message
            this.showConnectionStatus('Disconnected from server. Attempting to reconnect...');
            
            // Attempt to reconnect after a short delay
            if (!this.connectionState.isReconnecting) {
                this.connectionState.isReconnecting = true;
                setTimeout(() => {
                    this.attemptReconnect();
                }, 2000); // Wait 2 seconds before attempting to reconnect
            }
        });
        
        // Handle full game state synchronization from server
        this.socket.on('game_state_sync', (data) => {
            this.handleGameStateSync(data);
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
                maxMana: data.maxMana,
                experience: data.experience,
                level: data.level
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
                this.game.playerStats.experience = data.experience;
                this.game.playerStats.level = data.level;
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
                // This prevents the health bar from updating while damage animations are playing
                if (playerMesh.userData.processingDamageEffect) {
                    if (isSignificantChange) {
                        console.log(`Skipping life update for ${data.id} - processing damage effect`);
                    }
                    
                    // Instead of updating immediately, schedule an update after the damage effect completes
                    // Store the server values for later use
                    playerMesh.userData.serverLife = data.life;
                    playerMesh.userData.serverMaxLife = data.maxLife;
                    
                    return;
                }
                
                // Also skip if there was a recent damage effect (within the last 700ms)
                // This ensures we don't override damage animations too quickly
                const now = Date.now();
                const lastDamageTime = playerMesh.userData.lastDamageTime || 0;
                if (now - lastDamageTime < 700) {
                    if (isSignificantChange) {
                        console.log(`Delaying life update for ${data.id} - too soon after damage effect (${now - lastDamageTime}ms)`);
                    }
                    
                    // Store the values for delayed update
                    playerMesh.userData.serverLife = data.life;
                    playerMesh.userData.serverMaxLife = data.maxLife;
                    playerMesh.userData.pendingHealthUpdate = true;
                    
                    // Schedule update after delay
                    setTimeout(() => {
                        if (playerMesh && !playerMesh.userData.processingDamageEffect) {
                            playerMesh.userData.pendingHealthUpdate = false;
                            
                            // Only update if no new damage effects have occurred
                            if (now >= playerMesh.userData.lastDamageTime) {
                                // Update health
                                this.game.playerManager.updateHealthBarWithServerValues(playerMesh);
                            }
                        }
                    }, 700 - (now - lastDamageTime));
                    
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
                    
                    // Make other player invisible when dead
                    if (data.id !== this.socket.id) {
                        playerMesh.visible = false;
                        
                        // IMPORTANT: Immediately move dead player to temple position
                        // This ensures they don't appear at death location before respawning
                        playerMesh.position.set(0, 0, 0); // Temple is at origin
                        
                        console.log(`Made dead player ${data.id} invisible in lifeUpdate and moved to temple`);
                    }
                    
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
                        
                        // NOTE: Do NOT make player visible here
                        // This will be handled by the playerRespawned event instead
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
                        
                        // Update UI with the updated playerStats object
                        if (this.game.uiManager) {
                            this.game.uiManager.updateStatusBars(this.game.playerStats);
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
            
            // Check if target is in temple safe zone - no damage effects in temple
            if (this.game.environmentManager && 
                this.game.environmentManager.isInTempleSafeZone && 
                targetPlayer.position && 
                this.game.environmentManager.isInTempleSafeZone(targetPlayer.position)) {
                console.log('Target in temple safe zone - ignoring damage effect');
                return; // Don't apply damage effects when target is in temple
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
            
            // IMPORTANT FIX: Don't update health bar or stats here
            // Just save expected values for reference only
            if (targetPlayer.userData.stats) {
                // Calculate the expected new health for reference only
                const currentHealth = targetPlayer.userData.stats.life || 100;
                const newHealth = Math.max(0, currentHealth - data.damage);
                const maxHealth = targetPlayer.userData.stats.maxLife || 100;
                
                // Store expected values, but don't modify stats or update visuals
                // This avoids double updates with lifeUpdate events
                targetPlayer.userData.expectedDamage = data.damage;
                targetPlayer.userData.expectedHealth = newHealth;
                
                // Log for debugging
                console.log(`Damage effect visualization applied to ${data.targetId} for ${data.damage} damage. Actual health update will come from server.`);
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
                
                // Calculate experience required for next level
                if (data.stats.level) {
                    const baseExp = 100; // Same as server's GameConstants.EXPERIENCE.BASE_EXPERIENCE
                    const scalingFactor = 1.5; // Same as server's GameConstants.EXPERIENCE.SCALING_FACTOR
                    
                    // Calculate experience needed for the current level
                    const expForCurrentLevel = baseExp * Math.pow(scalingFactor, data.stats.level - 1);
                    this.game.playerStats.experienceToNextLevel = expForCurrentLevel;
                }
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
                this.game.uiManager.updateStatusBars(this.game.playerStats);
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

        // Handle player killed event (when another player was killed)
        this.socket.on('playerKilled', (data) => {
            console.log('Received player killed event:', data);
            
            // Get the player that was killed
            const killedPlayer = this.game.playerManager.players.get(data.id);
            if (killedPlayer) {
                // Mark player as dead
                if (!killedPlayer.userData) killedPlayer.userData = {};
                killedPlayer.userData.isDead = true;
                
                // Make killed player invisible
                killedPlayer.visible = false;
                
                // IMPORTANT: Immediately move killed player to temple position
                // This ensures they don't appear at death location before respawning
                killedPlayer.position.set(0, 0, 0); // Temple is at origin
                
                console.log(`Made killed player ${data.id} invisible and moved to temple`);
                
                // Show kill notification if we're the killer
                if (data.killerId === this.socket.id && this.game.uiManager) {
                    this.game.uiManager.showNotification(`You killed another player!`, '#00ff00');
                }
            }
        });
        
        // Handle respawn confirmation
        this.socket.on('respawnConfirmed', (data) => {
            console.log('=======================================');
            console.log('RESPAWN CONFIRMED:', data);
            console.log('Local player before respawn:', 
                this.game.localPlayer ? 
                `visible: ${this.game.localPlayer.visible}, position: ${JSON.stringify({
                    x: this.game.localPlayer.position.x,
                    y: this.game.localPlayer.position.y,
                    z: this.game.localPlayer.position.z
                })}` : 'null');
            
            // CRITICAL: Check if player exists
            if (!this.game.localPlayer) {
                console.error('Local player not found during respawn confirmation');
                return;
            }
            
            // Make sure we have temple position data
            if (!data.position) {
                console.error('No position data in respawn confirmation');
                return;
            }
            
            // STEP 1: Keep player invisible during teleport
            this.game.localPlayer.visible = false;
            console.log('Set player invisible for teleportation');
            
            // STEP 2: IMMEDIATELY teleport player to temple position
            const templePosX = data.position.x;
            const templePosY = data.position.y;
            const templePosZ = data.position.z;
            
            this.game.localPlayer.position.set(templePosX, templePosY, templePosZ);
            console.log(`Teleported player to temple at: ${templePosX}, ${templePosY}, ${templePosZ}`);
            
            // Set player rotation to correct direction (facing south)
            if (data.rotation) {
                this.game.localPlayer.rotation.y = data.rotation.y;
                console.log(`Set player rotation to: ${data.rotation.y}`);
            } else {
                // Default rotation (south) if not provided
                this.game.localPlayer.rotation.y = 0;
                console.log(`Set player rotation to default (south): 0`);
            }
            
            // STEP 3: Reset camera position immediately
            if (this.game.cameraManager && this.game.cameraManager.resetCamera) {
                this.game.cameraManager.resetCamera();
                console.log('Camera position reset to follow player at temple');
            } else {
                console.error('Cannot reset camera - cameraManager or resetCamera method not available');
            }
            
            // STEP 4: Update player stats before making visible
            if (this.game.playerStats) {
                this.game.playerStats.currentLife = data.life;
                this.game.playerStats.maxLife = data.maxLife;
                
                // Update death count from server if provided
                if (data.deathCount !== undefined) {
                    this.game.playerStats.deaths = data.deathCount;
                    console.log(`Updated player death count: ${data.deathCount}`);
                }
                
                console.log(`Updated player stats: Life ${this.game.playerStats.currentLife}/${this.game.playerStats.maxLife}`);
                
                // Update UI
                if (this.game.uiManager) {
                    this.game.uiManager.updateStatusBars(this.game.playerStats);
                    this.game.uiManager.hideDeathScreen();
                    console.log('Updated UI status bars and hid death screen');
                }
            }
            
            // Also store death count in player userData for reference
            if (this.game.localPlayer && data.deathCount !== undefined) {
                if (!this.game.localPlayer.userData) {
                    this.game.localPlayer.userData = {};
                }
                this.game.localPlayer.userData.deathCount = data.deathCount;
            }
            
            // STEP 5: Mark player as alive
            this.game.isAlive = true;
            this.playerDead = false;
            console.log('Marked player as alive');
            
            // STEP 6: Re-enable controls
            if (this.game.controlsManager && this.game.controlsManager.enableControls) {
                this.game.controlsManager.enableControls();
                console.log('Re-enabled player controls');
            }
            
            // STEP 7: FINALLY make player visible after a short delay
            setTimeout(() => {
                if (this.game.localPlayer) {
                    // Double-check position before making visible
                    console.log(`Player position before making visible: ${JSON.stringify({
                        x: this.game.localPlayer.position.x.toFixed(2),
                        y: this.game.localPlayer.position.y.toFixed(2),
                        z: this.game.localPlayer.position.z.toFixed(2)
                    })}`);
                    
                    // Make absolutely sure we're at temple position
                    this.game.localPlayer.position.set(templePosX, templePosY, templePosZ);
                    
                    // Make player visible
                    this.game.localPlayer.visible = true;
                    console.log('Player made visible at temple position');
                    
                    // Reset camera one more time for good measure
                    if (this.game.cameraManager && this.game.cameraManager.resetCamera) {
                        this.game.cameraManager.resetCamera();
                        console.log('Camera position reset again after player made visible');
                    }
                    
                    // Show respawn notification
                    if (this.game.uiManager) {
                        this.game.uiManager.showNotification('You have respawned in the temple!', '#00ff00');
                        console.log('Showed respawn notification');
                    }
                }
                console.log('=======================================');
            }, 300); // Slightly longer delay to ensure everything is set up
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
            
            // Mark player as alive
            if (!playerMesh.userData) playerMesh.userData = {};
            playerMesh.userData.isDead = false;
            
            // Make player visible again
            playerMesh.visible = true;
            console.log(`Made respawned player ${data.id} visible again`);
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
                    console.log('Received monster update:', updateData);
                    
                    // Add special handling for monster death updates
                    if (updateData.isAlive === false) {
                        console.log(`Monster ${updateData.monsterId} marked as not alive - handling as death`);
                        this.game.monsterManager.handleMonsterDeath(updateData.monsterId);
                        
                        // If this was the targeted monster, clear target
                        if (this.game.targetingManager && 
                            this.game.targetingManager.currentTarget && 
                            this.game.targetingManager.currentTarget.id === updateData.monsterId) {
                            this.game.targetingManager.clearTarget();
                        }
                    } else {
                        // Normal update for living monsters
                        this.game.monsterManager.processMonsterUpdate(updateData);
                    }
                } else {
                    console.log('Monster manager not fully initialized yet, ignoring monster update');
                    // Updates can be safely ignored as they'll be included in the next full monster_data
                }
            }
        });
        
        // Handle monster death event
        this.socket.on('monster_death', (data) => {
            console.log('Received monster death event:', data);
            if (this.game.monsterManager && this.game.monsterManager.initialized) {
                const monsterId = data.monsterId;
                if (monsterId) {
                    // Mark monster as dead in client state
                    this.game.monsterManager.handleMonsterDeath(monsterId);
                    
                    // If this was the targeted monster, clear target
                    if (this.game.targetingManager && 
                        this.game.targetingManager.currentTarget && 
                        this.game.targetingManager.currentTarget.id === monsterId) {
                        this.game.targetingManager.clearTarget();
                    }
                }
            }
        });
        
        // Handle monster respawn event
        this.socket.on('monster_respawn', (data) => {
            console.log('Monster respawn:', data);
            
            if (!this.game.monsterManager) {
                console.warn('Monster manager not initialized yet for respawn');
                return;
            }
            
            if (!data.monster || !data.monster.id) {
                console.warn('Invalid monster respawn data received:', data);
                return;
            }
            
            // Enhanced logging for respawn events
            console.log(`Processing respawn for monster ${data.monster.id} at position:`, data.monster.position);
            
            // IMPROVED APPROACH: Create monster as completely new
            // First, check if this is a brand new monster or old one
            const existingMonster = this.game.monsterManager.getMonsterById(data.monster.id);
            if (existingMonster) {
                // This is an existing monster ID - remove it first to ensure clean state
                console.log(`Removing existing monster ${data.monster.id} before respawning`);
                this.game.monsterManager.removeMonster(data.monster.id);
            }
            
            // Important: Force the isAlive property to be true for the new monster
            const monsterData = {
                ...data.monster,
                isAlive: true,
                health: data.monster.health || 100,
                maxHealth: data.monster.maxHealth || 100
            };
            
            // Create a new monster with the provided data
            console.log(`Creating respawned monster with ID ${monsterData.id}`);
            const newMonster = this.game.monsterManager.createMonster(monsterData);
            
            // Show notification if this monster is near the player
            if (this.game.localPlayer) {
                const playerPos = this.game.localPlayer.position;
                const monsterPos = monsterData.position;
                
                // Calculate distance to player
                const dx = playerPos.x - monsterPos.x;
                const dz = playerPos.z - monsterPos.z;
                const distanceToPlayer = Math.sqrt(dx * dx + dz * dz);
                
                // Only show notification for monsters that spawn near the player
                if (distanceToPlayer < 50) {
                    this.game.uiManager.showNotification(
                        `A monster has appeared nearby!`, 
                        '#FF9900'
                    );
                    
                    // Play sound for nearby monster spawn
                    if (this.game.soundManager) {
                        this.game.soundManager.playSound('monster_spawn');
                    }
                }
            }
        });
        
        // Handle monster damage to player
        this.socket.on('monsterDamage', (data) => {
            console.log('Received monster damage event:', data);
            
            // CRITICAL FIX #1: Add more robust check for dead monsters
            if (this.game.monsterManager && data.monsterId) {
                const monster = this.game.monsterManager.getMonsterById(data.monsterId);
                
                // Check all possible death conditions
                if (!monster) {
                    console.log(`Ignoring damage from non-existent monster ${data.monsterId}`);
                    return; // Monster doesn't exist, ignore damage
                }
                
                if (monster.isAlive === false || monster.health <= 0) {
                    console.log(`Ignoring damage from dead monster ${data.monsterId} (isAlive=${monster.isAlive}, health=${monster.health})`);
                    
                    // CRITICAL FIX: Force server sync to ensure the server knows the monster is dead
                    this.socket.emit('client_monster_state', {
                        monsterId: data.monsterId,
                        clientState: {
                            isAlive: false,
                            health: 0
                        }
                    });
                    
                    // Re-apply death handling just to be safe
                    this.game.monsterManager.handleMonsterDeath(data.monsterId);
                    return; // Don't apply damage from dead monsters
                }
                
                // Extra logging for debugging
                console.log(`Monster ${data.monsterId} damage accepted, current monster state: isAlive=${monster.isAlive}, health=${monster.health}`);
            }
            
            // Check if player is in temple safe zone - no damage in temple
            if (this.game.environmentManager && 
                this.game.localPlayer && 
                this.game.environmentManager.isInTempleSafeZone && 
                this.game.environmentManager.isInTempleSafeZone(this.game.localPlayer.position)) {
                console.log('Player in temple safe zone - ignoring monster damage');
                return; // Don't apply damage when in temple
            }
            
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
        
        // Handle experience gain when killing a monster
        this.socket.on('experienceGain', (data) => {
            console.log('Received experience gain event:', data);
            
            // Update player stats
            if (this.game.playerStats) {
                this.game.playerStats.experience = data.totalExperience;
                this.game.playerStats.level = data.level;
                
                // Calculate experience required for next level using the same formula as server
                const baseExp = 100; // Same as server's GameConstants.EXPERIENCE.BASE_EXPERIENCE
                const scalingFactor = 1.5; // Same as server's GameConstants.EXPERIENCE.SCALING_FACTOR
                
                // Calculate experience needed for the current level
                const expForCurrentLevel = baseExp * Math.pow(scalingFactor, data.level - 1);
                this.game.playerStats.experienceToNextLevel = expForCurrentLevel;
                
                // Ensure path is maintained when leveling up
                if (data.path) {
                    this.game.playerStats.path = data.path;
                    
                    // Also update karma manager if available
                    if (this.game.karmaManager) {
                        this.game.karmaManager.chosenPath = data.path;
                    }
                }
                
                // Update the UI status bars for experience
                if (this.game.uiManager) {
                    this.game.uiManager.updateStatusBars(this.game.playerStats);
                }
            }
            
            // Use the new experience gain notification
            if (this.game.uiManager && this.game.uiManager.showExperienceGain) {
                this.game.uiManager.showExperienceGain(
                    data.amount,
                    data.levelUp,
                    data.level
                );
            }
        });
        
        // Handle player damaged event
        this.socket.on('playerDamaged', (data) => {
            // Log damage event
            console.log(`Player ${data.targetId} damaged by ${data.sourceId} for ${data.damage} damage`);
            
            // Ignore if the target player doesn't exist
            const targetPlayer = this.game.playerManager.getPlayerById(data.targetId);
            if (!targetPlayer) {
                console.warn(`Target player ${data.targetId} not found`);
                return;
            }
            
            // Check if target is in temple safe zone
            if (this.game.environmentManager && 
                this.game.environmentManager.isInTempleSafeZone && 
                targetPlayer.position && 
                this.game.environmentManager.isInTempleSafeZone(targetPlayer.position)) {
                console.log('Target in temple safe zone - ignoring damage effect');
                return; // Don't apply damage effects when target is in temple
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
            
            // REMOVED: Don't update the health bar immediately
            // Let the server's health update handle this to avoid double updates
            // We'll store the expected values but not update the visual
            if (targetPlayer.userData.stats) {
                // Calculate the expected new health (for reference only)
                const currentHealth = targetPlayer.userData.stats.life || 100;
                const newHealth = Math.max(0, currentHealth - data.damage);
                const maxHealth = targetPlayer.userData.stats.maxLife || 100;
                
                // Store these values for reference but don't update visuals yet
                targetPlayer.userData.expectedServerLife = newHealth;
                targetPlayer.userData.expectedServerMaxLife = maxHealth;
            }
            
            // Clear the processing flag after a delay
            setTimeout(() => {
                targetPlayer.userData.processingDamageEffect = false;
            }, 1000);
        });
        
        return true; // Return true to indicate success
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
        console.log('Handling reconnection to server');
        
        // Track that we're reconnecting
        this.connectionState.isReconnecting = true;
        
        // Request full game state synchronization from server
        this.requestStateSync();
        
        // Request specific player data
        if (this.socket) {
            this.socket.emit('requestPlayerReset');
            console.log('Requested player reset from server');
        }
        
        // Reset death state
        this.playerDead = false;
        
        // Reset pending inputs
        this.pendingInputs = [];
        
        // Start the periodic health check
        this.startPeriodicHealthCheck();
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
        if (!this.connected || !this.socket || !this.game?.localPlayer) return;
        
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

    update(delta, isOfflineMode = false) {
        // In offline mode, skip network operations but update local state
        if (isOfflineMode) {
            // Still update any local state needed even in offline mode
            if (this.game?.localPlayer) {
                // Update local player position if needed
                const now = Date.now();
                if (!this.lastStateUpdate || now - this.lastStateUpdate >= 100) { 
                    this.lastStateUpdate = now;
                }
            }
            return;
        }
        
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
                    maxKarma: player.maxKarma ?? 100,
                    experience: player.experience ?? 0,
                    level: player.level ?? 1
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
                
                // Skip if there's a pending health update scheduled
                if (playerMesh.userData.pendingHealthUpdate) {
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
                    
                    // Check if we should delay correction due to recent damage
                    const timeNow = Date.now();
                    const lastDamageTime = playerMesh.userData.lastDamageTime || 0;
                    const timeSinceLastDamage = timeNow - lastDamageTime;
                    
                    // If damage was applied recently, don't override it yet - let animation complete
                    if (timeSinceLastDamage < 1000) {
                        return; 
                    }
                    
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
     * Handle the full game state synchronization from server
     * @param {Object} data - The game state data
     */
    handleGameStateSync(data) {
        if (!data || !data.timestamp) return;
        
        console.log('Received game state sync from server');
        
        // Synchronize players
        if (data.players && Array.isArray(data.players)) {
            data.players.forEach(playerData => {
                // Don't sync the local player's position, only health and other stats
                const isLocalPlayer = playerData.id === this.socket.id;
                
                if (isLocalPlayer) {
                    // For local player, just update stats but not position (to avoid rubberbanding)
                    if (this.game.playerManager && this.game.playerManager.localPlayer) {
                        // Update health and other stats
                        if (this.game.playerStats) {
                            this.game.playerStats.updateHealth(playerData.life, playerData.maxLife);
                        }
                        
                        // Update dead state if needed
                        if (playerData.isDead !== this.playerDead) {
                            this.playerDead = playerData.isDead;
                            
                            if (playerData.isDead) {
                                this.handlePlayerDeath();
                            }
                        }
                    }
                } else {
                    // For other players, update all properties
                    const existingPlayer = this.game.playerManager?.players.get(playerData.id);
                    
                    if (existingPlayer) {
                        // Update player position if they've moved significantly
                        if (this.hasPositionChanged(existingPlayer.position, playerData.position)) {
                            existingPlayer.position.copy(playerData.position);
                            // Update player mesh position
                            if (existingPlayer.mesh) {
                                existingPlayer.mesh.position.copy(playerData.position);
                            }
                        }
                        
                        // Update health and other stats
                        existingPlayer.life = playerData.life;
                        existingPlayer.maxLife = playerData.maxLife;
                        existingPlayer.isDead = playerData.isDead;
                        
                        // Update health bar if available
                        if (this.game.ui && typeof this.game.ui.updatePlayerHealthBar === 'function') {
                            this.game.ui.updatePlayerHealthBar(existingPlayer);
                        }
                    } else {
                        // Store for later if player manager not ready
                        this.pendingUpdates.set(playerData.id, playerData);
                    }
                }
            });
        }
        
        // Synchronize monsters
        if (data.monsters && Array.isArray(data.monsters) && this.game.monsterManager) {
            data.monsters.forEach(monsterData => {
                const monster = this.game.monsterManager.getMonsterById(monsterData.id);
                
                if (monster) {
                    // Update health
                    monster.health = monsterData.health;
                    
                    // Update position if significant change - avoid unnecessary updates
                    if (this.hasPositionChanged(monster.position, monsterData.position, 0.15)) {
                        // Store the original position for reference
                        const originalPosition = monster.position ? { 
                            x: monster.position.x, 
                            y: monster.position.y, 
                            z: monster.position.z 
                        } : null;
                        
                        // Update data position
                        monster.position = monsterData.position;
                        
                        // Update mesh position if it exists
                        if (monster.mesh) {
                            // Add a flag to indicate this is a sync update
                            monster.mesh.userData.syncUpdate = true;
                            
                            // Update position in mesh, keeping Y offset consistent
                            monster.mesh.position.set(
                                monsterData.position.x,
                                monsterData.position.y + 2.0, // Keep the height adjustment consistent
                                monsterData.position.z
                            );
                        }
                    }
                    
                    // Update health bar
                    this.game.monsterManager.updateHealthBar(monster);
                    
                    // Handle death state
                    if (monsterData.isDead && monster.health > 0) {
                        monster.health = 0;
                        this.game.monsterManager.handleMonsterDeath(monster.id);
                    }
                } else {
                    // Store for later if monster manager not ready or monster not loaded yet
                    if (this.pendingMonsterData === null) {
                        this.pendingMonsterData = [];
                    }
                    this.pendingMonsterData.push(monsterData);
                }
            });
        }
    }
    
    /**
     * Request game state synchronization from the server
     */
    requestStateSync() {
        if (this.socket && this.connected) {
            console.log('Requesting game state sync from server');
            try {
                this.socket.emit('request_sync');
            } catch (error) {
                console.error('Error requesting game state sync:', error);
            }
        } else {
            console.warn('Cannot request sync: Socket not connected');
        }
    }
    
    /**
     * Attempt to reconnect to the server
     */
    attemptReconnect() {
        if (this.connectionState.reconnectAttempts >= this.connectionState.maxReconnectAttempts) {
            console.warn('Maximum reconnection attempts reached');
            return;
        }
        
        this.connectionState.reconnectAttempts++;
        console.log(`Attempting to reconnect (attempt ${this.connectionState.reconnectAttempts}/${this.connectionState.maxReconnectAttempts})...`);
        
        try {
            // Close existing socket if it exists
            if (this.socket) {
                this.socket.close();
            }
            
            // Create a new connection
            const SERVER_URL = getServerUrl();
            this.socket = io(SERVER_URL, {
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: this.connectionState.reconnectDelay,
                autoConnect: true,
                forceNew: true
            });
            
            // Set up handlers again
            this.setupSocketHandlers();
        } catch (error) {
            console.error('Error during reconnection attempt:', error);
        }
    }
    
    /**
     * Utility to check if position has changed significantly
     */
    hasPositionChanged(currentPos, newPos, threshold = 0.5) {
        if (!currentPos || !newPos) return true;
        
        const dx = Math.abs(currentPos.x - newPos.x);
        const dy = Math.abs(currentPos.y - newPos.y);
        const dz = Math.abs(currentPos.z - newPos.z);
        
        return dx > threshold || dy > threshold || dz > threshold;
    }

    /**
     * Show connection status message to the user
     * @param {string} message - The message to display
     * @param {boolean} success - Whether this is a success message
     */
    showConnectionStatus(message, success = false) {
        // Check if UI is available
        if (this.game.ui && typeof this.game.ui.showMessage === 'function') {
            this.game.ui.showMessage(message, success ? 'success' : 'error');
            return;
        }
        
        // If no UI system, create a simple overlay
        let statusElement = document.getElementById('connection-status');
        
        // Create element if it doesn't exist
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.id = 'connection-status';
            statusElement.style.position = 'fixed';
            statusElement.style.top = '10px';
            statusElement.style.left = '50%';
            statusElement.style.transform = 'translateX(-50%)';
            statusElement.style.padding = '10px 20px';
            statusElement.style.borderRadius = '5px';
            statusElement.style.fontFamily = 'Arial, sans-serif';
            statusElement.style.fontWeight = 'bold';
            statusElement.style.zIndex = '1000';
            document.body.appendChild(statusElement);
        }
        
        // Update element content and style
        statusElement.textContent = message;
        statusElement.style.backgroundColor = success ? 'rgba(0, 128, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
        statusElement.style.color = '#ffffff';
        
        // Remove success message after a few seconds
        if (success) {
            setTimeout(() => {
                if (statusElement && statusElement.parentNode) {
                    statusElement.parentNode.removeChild(statusElement);
                }
            }, 3000);
        }
    }

    /**
     * Use a skill and validate with the server
     * @param {string} targetId - The ID of the target
     * @param {string} skillName - The name of the skill to use
     * @param {number} damage - The damage the skill should do
     * @returns {Promise} - A promise that resolves when the server confirms the skill
     */
    useSkill(targetId, skillName, damage = 0) {
        // Check if we have network connection
        if (!this.socket) {
            console.warn('Cannot use skill: No network connection');
            // Show error message to player
            if (this.game.uiManager) {
                this.game.uiManager.showNotification('Cannot use skills: Network connection lost', '#ff0000');
            }
            return false;
        }
        
        // Skip if player is dead
        if (this.playerDead) {
            console.warn('Cannot use skill: Player is dead');
            if (this.game.uiManager) {
                this.game.uiManager.showNotification('Cannot use skills while dead', '#ff0000');
            }
            return false;
        }
        
        // Check if target is dead
        const targetPlayer = this.game.playerManager.players.get(targetId);
        if (targetPlayer && targetPlayer.userData && targetPlayer.userData.isDead) {
            console.warn('Cannot use skill: Target player is dead');
            if (this.game.uiManager) {
                this.game.uiManager.showNotification('Cannot attack a dead player', '#ff0000');
            }
            return false;
        }
        
        // Extra check: Don't allow attacking invisible players (they might be in respawn state)
        if (targetPlayer && !targetPlayer.visible) {
            console.warn('Cannot use skill: Target player is invisible/respawning');
            if (this.game.uiManager) {
                this.game.uiManager.showNotification('Cannot attack a player who is respawning', '#ff0000');
            }
            return false;
        }
        
        // Create a unique request ID to track this skill use
        const requestId = `${this.socket.id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        
        // Debugging info
        console.log(`Attempting to use ${skillName} on target ${targetId} with damage ${damage}`);
        
        // Track if we've already received damage feedback for this skill
        let damageProcessed = false;
        
        // Return a promise that resolves when the server confirms the skill hit
        return new Promise((resolve) => {
            // Create a one-time listener for skill damage confirmation
            const confirmationListener = (data) => {
                if (data.targetId === targetId && data.skillName === skillName) {
                    // Clear timeout and remove listeners
                    clearTimeout(timeout);
                    this.socket.off('skillDamage', confirmationListener);
                    this.socket.off('errorMessage', errorListener);
                    
                    console.log(`Skill hit confirmed: ${skillName} on ${targetId} for ${data.damage} damage`);
                    damageProcessed = true;
                    resolve({ success: true });
                }
            };
            
            // Create a one-time listener for error messages (skill rejected)
            const errorListener = (data) => {
                if (data.type === 'combat') {
                    // If we get any combat error after trying to use a skill, assume it failed
                    console.log(`Server rejected skill: ${data.message}`);
                    
                    // Remove both listeners to prevent memory leaks
                    this.socket.off('skillDamage', confirmationListener);
                    this.socket.off('errorMessage', errorListener);
                    
                    // Clear the timeout since we received a response
                    clearTimeout(timeout);
                    
                    // Don't resolve if damage was already processed
                    if (!damageProcessed) {
                        // Pass the specific error message to allow proper handling
                        resolve({ success: false, errorType: data.message });
                    }
                }
            };
            
            // Look for life update events - we might get these before skill confirmation
            const lifeUpdateListener = (data) => {
                if (data.id === targetId) {
                    console.log(`Detected life update for target ${targetId} - likely from our skill use`);
                    // Mark that damage was processed
                    damageProcessed = true;
                    
                    // Since we've seen the damage effect, consider this a success
                    // only if we haven't already resolved with an error
                    setTimeout(() => {
                        // If still waiting after a short delay, resolve as success
                        if (!resolved) {
                            clearTimeout(timeout);
                            this.socket.off('skillDamage', confirmationListener);
                            this.socket.off('errorMessage', errorListener);
                            this.socket.off('lifeUpdate', lifeUpdateListener);
                            resolve({ success: true });
                            resolved = true;
                        }
                    }, 100);
                }
            };
            
            // Track if we've resolved the promise
            let resolved = false;
            
            // Set a timeout to resolve the promise in case we never get a confirmation
            const timeout = setTimeout(() => {
                if (!resolved) {
                    this.socket.off('skillDamage', confirmationListener);
                    this.socket.off('errorMessage', errorListener);
                    this.socket.off('lifeUpdate', lifeUpdateListener);
                    console.log('No server response for skill use, assuming failed');
                    
                    // If we've already processed damage, consider this a success despite timeout
                    if (damageProcessed) {
                        console.log('Damage was processed, considering skill use successful despite timeout');
                        resolve({ success: true });
                    } else {
                        resolve({ success: false, errorType: 'timeout' });
                    }
                    resolved = true;
                }
            }, 2000); // 2 second timeout (increased from 1 second)
            
            // Add the listeners
            this.socket.on('skillDamage', confirmationListener);
            this.socket.on('errorMessage', errorListener);
            this.socket.on('lifeUpdate', lifeUpdateListener);
            
            try {
                // Send the skill use event to the server
                this.socket.emit('useSkill', {
                    targetId: targetId,
                    skillName: skillName,
                    damage: damage
                });
                
                console.log(`Sent ${skillName} skill use on target ${targetId} to server`);
            } catch (error) {
                console.error('Error sending skill use to server:', error);
                clearTimeout(timeout);
                this.socket.off('skillDamage', confirmationListener);
                this.socket.off('errorMessage', errorListener);
                this.socket.off('lifeUpdate', lifeUpdateListener);
                resolved = true;
                resolve({ success: false, errorType: 'client_error' });
            }
        });
    }

    /**
     * Apply any pending updates for a player
     * @param {string} playerId - The ID of the player to apply updates for
     * @returns {boolean} - Whether any updates were applied
     */
    applyPendingUpdates(playerId) {
        // Check if we have any pending updates for this player
        if (!this.pendingUpdates || !this.pendingUpdates.has(playerId)) {
            return false;
        }
        
        // Get the player object
        const player = this.game.playerManager.getPlayerById(playerId);
        if (!player) {
            console.warn(`Cannot apply pending updates: Player ${playerId} not found`);
            return false;
        }
        
        console.log(`Applying ${this.pendingUpdates.get(playerId).length} pending updates for player ${playerId}`);
        
        // Process all pending updates for this player
        const updates = this.pendingUpdates.get(playerId);
        for (const update of updates) {
            if (update.type === 'lifeUpdate') {
                if (!player.userData) player.userData = {};
                if (!player.userData.stats) player.userData.stats = {};
                
                player.userData.stats.life = update.data.life;
                player.userData.stats.maxLife = update.data.maxLife;
                
                // Update health bar if possible
                if (this.game.playerManager.updateHealthBar) {
                    this.game.playerManager.updateHealthBar(player);
                }
            } else if (update.type === 'manaUpdate') {
                if (!player.userData) player.userData = {};
                if (!player.userData.stats) player.userData.stats = {};
                
                player.userData.stats.mana = update.data.mana;
                player.userData.stats.maxMana = update.data.maxMana;
            } else if (update.type === 'position') {
                // Apply position update
                if (update.position) {
                    player.position.x = update.position.x;
                    player.position.y = update.position.y;
                    player.position.z = update.position.z;
                }
                
                // Apply rotation update if available
                if (update.rotation) {
                    player.rotation.y = update.rotation.y;
                }
            }
        }
        
        // Clear pending updates for this player
        this.pendingUpdates.delete(playerId);
        
        return true;
    }
    
    /**
     * Store an update for a player that hasn't been created yet
     * @param {string} playerId - The ID of the player to store the update for
     * @param {Object} update - The update data to store
     * @returns {boolean} - Whether the update was stored
     */
    storePendingUpdate(playerId, update) {
        // Initialize the updates array if it doesn't exist
        if (!this.pendingUpdates.has(playerId)) {
            this.pendingUpdates.set(playerId, []);
        }
        
        // Add the update to the pending updates
        this.pendingUpdates.get(playerId).push(update);
        
        console.log(`Stored pending update for player ${playerId}:`, update);
        return true;
    }

    /**
     * Get a player by ID
     * @param {string} playerId - The ID of the player to get
     * @returns {Object|null} - The player object or null if not found
     */
    getPlayerById(playerId) {
        if (!playerId || !this.game.playerManager || !this.game.playerManager.players) {
            return null;
        }
        
        return this.game.playerManager.players.get(playerId) || null;
    }
}