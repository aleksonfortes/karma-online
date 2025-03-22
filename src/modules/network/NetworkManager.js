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
        this.connectAttempts = 0;
        this.maxConnectAttempts = 5;
        this.reconnectAttempt = 0;  // Add this line to properly track reconnection attempts
        this.pendingUpdates = new Map();
        this.lastHealthLog = {};
        this.pendingMonsterData = null;
        this.monsterManagerCheckInterval = null;
        this.playerMoveDebounce = {};
        this.playerDead = false;
        this.playerRejoiningSafeZone = false;
        this.lastServerUpdateTime = 0;
        this.lastKarmaUpdate = 0;
        this._handlersInitialized = false;
        this._lastPathChoiceSent = 0;
        
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
        
        // Flag to track whether socket handlers have been initialized
        this._handlersInitialized = false;
        
        // Connect to server and setup event listeners
        this.connect();
    }
    
    /**
     * Connect to the server using socket.io
     */
    connect() {
        try {
            // Get the player name from localStorage
            const playerName = localStorage.getItem('playerName') || 'Player';
            
            // Get the server URL - either from game instance or fallback
            const SERVER_URL = this.game.SERVER_URL || getServerUrl();
            
            console.log(`Connecting to server at: ${SERVER_URL} with name: ${playerName}`);
            
            // Include the player name as a query parameter
            this.socket = io(SERVER_URL, {
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                autoConnect: true,
                forceNew: true, // Each tab is a new player
                query: {
                    playerName: playerName
                }
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
            console.error('Cannot set up socket handlers: socket not initialized');
            return;
        }
        
        // Setup existing socket handlers
        
        // Clean up previous handlers to prevent duplicates
        if (this._handlersInitialized) {
            console.log('Cleaning up previous socket handlers to prevent duplicates');
            this.socket.removeAllListeners('connect');
            this.socket.removeAllListeners('connect_error');
            this.socket.removeAllListeners('disconnect');
            this.socket.removeAllListeners('playerJoined');
            this.socket.removeAllListeners('playerLeft');
            this.socket.removeAllListeners('playerMovement');
            this.socket.removeAllListeners('lifeUpdate');
            this.socket.removeAllListeners('manaUpdate');
            this.socket.removeAllListeners('karmaUpdate');
            this.socket.removeAllListeners('gameStateSync');
            this.socket.removeAllListeners('respawnConfirmed');
            this.socket.removeAllListeners('playerRespawned');
            this.socket.removeAllListeners('playerResetConfirmed');
            this.socket.removeAllListeners('skillDamage');
            this.socket.removeAllListeners('errorMessage');
            // Add other events that should be cleaned up
        }

        // Handle successful connection
        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
            this.connected = true;
            
            // Reset reconnection state
            this.connectionState.isReconnecting = false;
            this.connectionState.reconnectAttempts = 0;
            this.reconnectAttempts = 0;
            
            // No longer needed since we always require server connection
            // this.showConnectionStatus('Connected to server!', true);
            
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
            console.log('Disconnected from server. Reason:', reason);
            this.connected = false;
            
            // Show disconnection message - we keep this as it's useful information
            this.showConnectionStatus('Server connection lost. Attempting to reconnect...', false);
            
            // Only make game unplayable if the game is initialized
            if (this.game.isInitialized) {
                this.game.isUnplayable = true;
                console.warn('Game is now unplayable due to network issues');
            }
            
            // Disable player controls
            if (this.game.controls) {
                this.game.controls.forward = false;
                this.game.controls.backward = false;
                this.game.controls.left = false;
                this.game.controls.right = false;
            }
            
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
                console.log('Processing players from initGameState:');
                Object.entries(gameState.players).forEach(([id, player]) => {
                    console.log(`Player ${id} detailed data:`, {
                        id: player.id,
                        displayName: player.displayName,
                        position: player.position
                    });
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
                    
                    // Store player ID, displayName and stats in userData
                    playerMesh.userData.playerId = player.id;
                    
                    // Enhanced logging for displayName issue
                    console.log(`Setting displayName for player ${player.id}:`, {
                        receivedName: player.displayName,
                        fallbackName: `Player-${player.id.substring(0, 5)}`,
                        finalName: player.displayName || `Player-${player.id.substring(0, 5)}`
                    });
                    
                    playerMesh.userData.displayName = player.displayName || `Player-${player.id.substring(0, 5)}`;
                    
                    // Additional check to verify displayName was set correctly
                    console.log(`Verification - displayName in userData:`, {
                        id: player.id,
                        displayNameInUserData: playerMesh.userData.displayName,
                        allUserDataKeys: Object.keys(playerMesh.userData)
                    });
                    
                    playerMesh.userData.stats = stats;
                    
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
            // Handle both single player updates and batch updates
            if (data.players && Array.isArray(data.players)) {
                // This is a batch update
                data.players.forEach(playerData => {
                    // Use the source from the batch update if available, otherwise mark as periodic
                    const playerDataWithSource = {
                        ...playerData,
                        source: data.source || 'periodic'
                    };
                    this.handlePlayerStatsUpdate(playerDataWithSource);
                });
            } else if (data.id) {
                // This is a single player update - use source if available
                const playerDataWithSource = {
                    ...data,
                    source: data.source || 'periodic'
                };
                this.handlePlayerStatsUpdate(playerDataWithSource);
            }
        });

        // Handle life update
        this.socket.on('lifeUpdate', (data) => {
            // Only log significant health changes (more than 5% change)
            if (!data || !data.id) {
                return;
            }

            // Calculate if this is a significant change (for logging purposes)
            const isSignificantChange = !this.lastHealthLog || 
                !this.lastHealthLog[data.id] || 
                Math.abs((this.lastHealthLog[data.id] || 0) - data.life) > (data.maxLife * 0.05);
            
            if (isSignificantChange) {
                // Store this health value for future comparison
                if (!this.lastHealthLog) this.lastHealthLog = {};
                this.lastHealthLog[data.id] = data.life;
                
                // Only log significant health changes
                console.log(`Life update received for ${data.id}: ${data.life}/${data.maxLife}`);
            }

            // Skip if this is a final update and it's for us
            if (data.id === this.socket.id && data.final === true) {
                // Process directly through the global handler which will consider source
                const playerData = {
                    id: data.id,
                    life: data.life,
                    maxLife: data.maxLife,
                    source: 'life_update',
                    isHealing: data.isHealing === true,
                    isPersistent: data.isPersistent === true,
                    skillName: data.skillName || null // Pass the skill name from the server
                };
                
                this.handlePlayerStatsUpdate(playerData);
                return;
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
                
                // Skip animation delays for persistent healing (life drain, etc.)
                const isPersistent = data.isPersistent === true;
                const isHealing = data.isHealing === true;
                
                // Only apply animation delay if it's not a persistent healing update
                if (!isPersistent && now - lastDamageTime < 700) {
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
                
                // Log detailed info for life drain healing to help debugging
                if (data.isHealing && data.skillName === 'life_drain') {
                    console.log(`[LIFE DRAIN HEALING] Updating player ${data.id} health: ${previousLife} → ${data.life}`);
                    console.log(`[LIFE DRAIN HEALING] Update flags: isPersistent=${isPersistent}, isHealing=${isHealing}, skillName=${data.skillName}`);
                }
                
                // Update life values
                playerMesh.userData.stats.life = data.life;
                playerMesh.userData.stats.maxLife = data.maxLife;
                playerMesh.userData.stats.currentLife = data.life; // Ensure currentLife is also updated
                
                // Store server values for future reference
                playerMesh.userData.serverLife = data.life;
                playerMesh.userData.serverMaxLife = data.maxLife;
                
                // Record when we received this authoritative update
                playerMesh.userData.lastServerUpdateTime = Date.now();
                
                // Add extra flag for life drain healing to ensure client preserves this value
                if (data.skillName === 'life_drain' && isHealing) {
                    playerMesh.userData.lastLifeDrainHealTime = Date.now();
                    playerMesh.userData.lastHealAmount = data.life - previousLife;
                }
                
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
                        // Store previous life for detecting healing effects
                        const previousLocalLife = this.game.playerStats.currentLife; 
                        
                        // Log more details about life updates for debugging
                        console.log(`[LOCAL PLAYER LIFE] Update: ${previousLocalLife} → ${data.life} (healing=${isHealing}, drain=${data.skillName === 'life_drain'})`);
                        
                        // Check for persistent healing flag (life drain, etc.) or direct life_drain skill healing
                        const isLifeDrainHealing = data.skillName === 'life_drain' && isHealing;
                        const hasHealthIncreased = data.life > previousLocalLife;
                        
                        if ((isPersistent && isHealing && hasHealthIncreased) || isLifeDrainHealing) {
                            console.log(`Applying healing: ${previousLocalLife} → ${data.life} (source: ${data.skillName || 'unknown'})`);
                            
                            // Show healing effect if we have a skillsManager
                            if (this.game.skillsManager && this.game.localPlayer) {
                                this.game.skillsManager.createHealingEffect(
                                    this.game.localPlayer.position.clone(),
                                    data.skillName === 'life_drain' ? 0x990000 : 0x00ff00
                                );
                            }
                            
                            // Ensure healing is persistent - store last heal time
                            this.lastHealTime = Date.now();
                            this.lastHealAmount = data.life - previousLocalLife;
                            
                            // Mark this heal in the local player object too
                            if (this.game.localPlayer && this.game.localPlayer.userData) {
                                this.game.localPlayer.userData.lastHealTime = Date.now();
                                this.game.localPlayer.userData.lastHealAmount = data.life - previousLocalLife;
                            }
                        }
                        
                        // Update current life values
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
            // Debug counter for this particular event handler being called
            this._manaUpdateCallCount = (this._manaUpdateCallCount || 0) + 1;
            console.log(`[ManaUpdate Call #${this._manaUpdateCallCount}] Received mana update - Handler ID: ${this._handlersInitialized}`);
            
            // Ignore if no data
            if (!data || data.id === undefined) return;
            
            // Detailed verbose logging to trace mana changes for debugging
            console.log(`MANA UPDATE from server: ID=${data.id}, mana=${data.mana}, maxMana=${data.maxMana}`);
            
            // Get player mesh
            const playerMesh = this.game.playerManager.players.get(data.id);
            
            // Get server mana value, defaulting to 0 if undefined
            const serverMana = data.mana !== undefined ? data.mana : 0;
            const serverMaxMana = data.maxMana || 100;
            
            // Process update for other players' meshes
            if (playerMesh) {
                // Initialize player userData if needed
                if (!playerMesh.userData) playerMesh.userData = {};
                if (!playerMesh.userData.stats) playerMesh.userData.stats = {};
                
                // Get current mana
                const currentMana = playerMesh.userData.stats.mana !== undefined ? 
                    playerMesh.userData.stats.mana : 100;
                
                // Critical fix: log the update for clarity
                console.log(`Updating player mesh mana: ${currentMana} → ${serverMana} (Player: ${data.id})`);
                
                // Always update other players' mana state
                playerMesh.userData.stats.mana = serverMana;
                playerMesh.userData.stats.maxMana = serverMaxMana;
                
                // Update visual status bars if available
                if (this.game.updatePlayerStatus) {
                    this.game.updatePlayerStatus(playerMesh, playerMesh.userData.stats);
                }
            }
            
            // Special handling for local player
            if (data.id === this.socket.id && this.game.playerStats) {
                const localCurrentMana = this.game.playerStats.currentMana !== undefined ? 
                    this.game.playerStats.currentMana : 100;
                
                // Instead of directly updating, use handlePlayerStatsUpdate with source
                if (serverMana !== localCurrentMana) {
                    // Create a player data object with source for handlePlayerStatsUpdate
                    const playerData = {
                        id: data.id,
                        mana: serverMana,
                        maxMana: serverMaxMana,
                        source: 'mana_update' // Mark the source of this update
                    };
                    
                    // Process through the unified handler
                    this.handlePlayerStatsUpdate(playerData);
                } else {
                    console.log(`Mana already at ${serverMana}, no update needed`);
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
                
                // Use handlePlayerStatsUpdate for mana with respawn source
                if (data.mana !== undefined || data.maxMana !== undefined) {
                    const playerData = {
                        id: this.socket.id,
                        mana: data.mana,
                        maxMana: data.maxMana,
                        source: 'respawn' // Mark this as a respawn update
                    };
                    
                    this.handlePlayerStatsUpdate(playerData);
                    console.log(`Updated player mana during respawn: ${data.mana}`);
                }
                
                // Update death count from server if provided
                if (data.deathCount !== undefined) {
                    this.game.playerStats.deaths = data.deathCount;
                    console.log(`Updated player death count: ${data.deathCount}`);
                }
                
                console.log(`Updated player stats: Life ${this.game.playerStats.currentLife}/${this.game.playerStats.maxLife}, Mana ${this.game.playerStats.currentMana}/${this.game.playerStats.maxMana}`);
                
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
                this.game.environmentManager.isInTempleSafeZone && 
                targetPlayer.position && 
                this.game.environmentManager.isInTempleSafeZone(targetPlayer.position)) {
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
        
        // Handle experience gain notification
        this.socket.on('experienceGain', (data) => {
            // Keep only essential logging
            if (data.levelUp) {
                console.log(`Player leveled up to ${data.level}!`);
            }
            
            // Create a player data object compatible with handlePlayerStatsUpdate
            const playerData = {
                id: this.socket.id,
                life: data.life,
                maxLife: data.maxLife,
                mana: data.mana,
                maxMana: data.maxMana,
                experience: data.totalExperience,
                level: data.level,
                source: 'experience_gain' // Mark the source of this update
            };
            
            // Process the update using the unified handler
            this.handlePlayerStatsUpdate(playerData);
            
            // Calculate experience required for next level using the same formula as server
            if (this.game.playerStats) {
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
                
                // Removed detailed stats logging here
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
        
        // Track last state sync request to prevent spam
        this.lastStateSyncRequest = 0;
        this.stateSyncCooldown = 2000; // 2 seconds cooldown between requests
        
        // Debug for mana updates: Count how many times handlers are registered
        console.log(`Socket handlers setup completed - ${this._handlersInitialized ? 'previously initialized' : 'first initialization'}`);
        
        // Mark handlers as initialized to prevent duplicate events
        this._handlersInitialized = true;
        
        // Handle skill learning result
        this.socket.on('skillLearningResult', (result) => {
            console.log('Received skill learning result:', result);
            
            if (result.success) {
                // Add the new skill
                if (this.game.skillsManager) {
                    this.game.skillsManager.addSkill(result.skillId);
                    console.log(`Skill ${result.skillId} added successfully`);
                }
                
                // Update the UI
                if (this.game.uiManager) {
                    this.game.uiManager.updateSkillBar();
                    this.game.uiManager.showNotification(`You learned ${result.skillId}`, '#00cc00');
                }
            } else {
                // Show error message
                if (this.game.uiManager) {
                    this.game.uiManager.showNotification(result.message, '#ff0000');
                }
            }
        });

        // Handle player visibility changes (for Embrace Void skill)
        this.socket.on('player_visibility_change', (data) => {
            console.log('Received player visibility change:', data);
            
            // DEBUG: Log current players before visibility change
            console.log('Current players before visibility change:', 
                Array.from(this.game.playerManager.players.keys()).join(', '));
            
            // For local player, we don't fully hide the model - we keep it semi-transparent
            // This way the player can still see where they are
            if (data.playerId === this.socket.id) {
                console.log('[LOCAL] Received visibility change for local player:', !data.visible);
                
                // Don't modify local player's visibility directly - it's managed by the skill effect
                // Just ensure userData exists and flag is set
                if (this.game.localPlayer) {
                    if (!this.game.localPlayer.userData) {
                        this.game.localPlayer.userData = {};
                    }
                    
                    this.game.localPlayer.userData.isInvisible = !data.visible;
                    
                    // If becoming invisible, trigger the invisibility effect
                    if (!data.visible && this.game.skillsManager) {
                        console.log('Triggering local invisibility effect');
                        this.game.skillsManager.createEmbraceVoidEffect(data.duration || 10000);
                    } 
                    // If becoming visible again and not already handled by skill effect duration
                    else if (data.visible && this.game.skillsManager && this.game.skillsManager.invisibilityEffectData) {
                        console.log('Ending local invisibility effect early');
                        this.game.skillsManager.clearInvisibilityState();
                    }
                }
                return;
            }
            
            // Handle other players' visibility
            const playerMesh = this.game.playerManager.players.get(data.playerId);
            if (!playerMesh) {
                console.warn(`Player mesh not found for visibility change: ${data.playerId}`);
                return;
            }
            
            // Update player visibility
            playerMesh.visible = data.visible;
            
            // Store invisibility state for reference
            if (!playerMesh.userData) playerMesh.userData = {};
            playerMesh.userData.isInvisible = !data.visible;
            
            // Add visual effect for other players becoming invisible
            if (!data.visible && this.game.skillsManager) {
                // Create smoke effect at player position
                const playerPos = playerMesh.position.clone();
                this.game.skillsManager.createSmokePuff(playerPos, 0x000000, 1.5);
                
                console.log(`Made player ${data.playerId} invisible`);
            }
            
            // Add visual effect for other players becoming visible
            if (data.visible && this.game.skillsManager) {
                // Create smoke effect at player position
                const playerPos = playerMesh.position.clone();
                this.game.skillsManager.createSmokePuff(playerPos, 0x202020, 1);
                
                console.log(`Made player ${data.playerId} visible again`);
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

    /**
     * Handle reconnection
     */
    handleReconnection() {
        console.log('Handling reconnection...');
        
        // Store the current player state before reconnection
        const currentMana = this.game.playerStats?.currentMana;
        const currentMaxMana = this.game.playerStats?.maxMana;
        const currentPath = this.game.playerStats?.path;
        
        // Send a message to request server-side reset
        this.socket.emit('requestPlayerReset', { 
            position: this.game.localPlayer?.position 
        });
        
        // Set up handler for reset confirmation
        this.socket.once('playerResetConfirmed', (data) => {
            console.log('Player reset confirmed by server');
            
            // Restore mana values if they exist
            if (currentMana !== undefined && this.game.playerStats) {
                this.game.playerStats.currentMana = currentMana;
                console.log(`Preserved mana during reconnection: ${currentMana}`);
            }
            
            if (currentMaxMana !== undefined && this.game.playerStats) {
                this.game.playerStats.maxMana = currentMaxMana;
            }
            
            // Restore path if it exists
            if (currentPath && this.game.playerStats) {
                this.game.playerStats.path = currentPath;
                console.log(`Preserved path during reconnection: ${currentPath}`);
            }
            
            // Update UI
            if (this.game.uiManager && this.game.uiManager.updateStatusBars) {
                this.game.uiManager.updateStatusBars(this.game.playerStats);
            }
            
            // Request state synchronization
            this.requestStateSync();
        });
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
        
        // Get accurate mana values from playerStats if available, then fall back to userData
        const currentMana = this.game.playerStats?.currentMana !== undefined ? 
            this.game.playerStats.currentMana : 
            (this.game.localPlayer.userData.stats?.mana !== undefined ? 
                this.game.localPlayer.userData.stats.mana : 100);
                
        const maxMana = this.game.playerStats?.maxMana || 
            this.game.localPlayer.userData.stats?.maxMana || 100;
        
        // Send current player state to server with correct mana values
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
            mana: currentMana, // Use the accurate value from above
            maxMana: maxMana   // Use the accurate value from above
        });
    }

    /**
     * Update function called every frame
     * @param {number} delta - Time since last frame in seconds
     */
    update(delta) {
        // Check if we've received a server update within a reasonable time
        // This helps detect silent disconnections
        const timeSinceLastUpdate = Date.now() - this.lastServerUpdateTime;
        
        // Only check for silent disconnections after the player has been active for a while
        if (this.socket && this.lastServerUpdateTime > 0 && timeSinceLastUpdate > 15000) {
            // If we haven't received a server update in the last 15 seconds, consider reconnecting
            console.warn(`No server update received in ${Math.round(timeSinceLastUpdate / 1000)} seconds`);
            
            // Try to ping the server to check connection
            this.socket.emit('ping');
            
            // Reset lastServerUpdateTime to avoid repeated reconnection attempts
            this.lastServerUpdateTime = Date.now();
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
        console.log('Creating network player with data:', { 
            id: player.id,
            displayName: player.displayName,
            position: player.position 
        });
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
                
                // Store player ID, displayName and stats
                playerMesh.userData.playerId = player.id;
                
                // Enhanced logging for displayName issue
                console.log(`Setting displayName for player ${player.id}:`, {
                    receivedName: player.displayName,
                    fallbackName: `Player-${player.id.substring(0, 5)}`,
                    finalName: player.displayName || `Player-${player.id.substring(0, 5)}`
                });
                
                playerMesh.userData.displayName = player.displayName || `Player-${player.id.substring(0, 5)}`;
                
                // Additional check to verify displayName was set correctly
                console.log(`Verification - displayName in userData:`, {
                    id: player.id,
                    displayNameInUserData: playerMesh.userData.displayName,
                    allUserDataKeys: Object.keys(playerMesh.userData)
                });
                
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
                
                console.log(`Added network player ${player.id} (${playerMesh.userData.displayName}) with health bar`);
                
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
        // Only set up socket handlers if not already initialized
        if (!this._handlersInitialized && this.socket) {
            console.log('Initializing socket handlers from initialize method');
            this.setupSocketHandlers();
        } else if (this._handlersInitialized) {
            console.log('Socket handlers already initialized, skipping setup');
        }
        
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
        if (!data || !data.players || !Array.isArray(data.players)) {
            console.warn('Received invalid game state sync data:', data);
            return;
        }
        
        console.log('Received game state sync from server');
        
        // Store current mana values before processing sync
        const currentMana = this.game.playerStats?.currentMana;
        const currentMaxMana = this.game.playerStats?.maxMana;
        
        // Process each player update
        data.players.forEach(playerData => {
            // Skip if no player ID
            if (!playerData.id) return;
            
            // Handle the player update
            const player = this.game.playerManager.players.get(playerData.id);
            
            if (player) {
                // Update existing player data
                
                // Don't update position for local player - server might have outdated position
                if (playerData.id !== this.socket.id && playerData.position) {
                    player.position.copy(new THREE.Vector3(
                        playerData.position.x,
                        playerData.position.y,
                        playerData.position.z
                    ));
                }
                
                // Update player health if provided
                if (typeof playerData.life === 'number' && typeof playerData.maxLife === 'number') {
                    if (!player.userData) player.userData = {};
                    if (!player.userData.stats) player.userData.stats = {};
                    
                    player.userData.stats.life = playerData.life;
                    player.userData.stats.maxLife = playerData.maxLife;
                    
                    // Update health bar if exists
                    if (player.healthBar) {
                        player.healthBar.updateHealth(playerData.life, playerData.maxLife);
                    }
                }
                
                // Handle player death state
                if (playerData.isDead) {
                    player.visible = false;
                }
            } else {
                // Only create new players for others - we should already have our own local player
                if (playerData.id !== this.socket.id) {
                    this.createNetworkPlayer({
                        ...playerData,
                        position: new THREE.Vector3(
                            playerData.position.x,
                            playerData.position.y,
                            playerData.position.z
                        )
                    });
                }
            }
            
            // Update player stats for local player only
            if (playerData.id === this.socket.id && this.game.playerStats) {
                // Update life stats
                this.game.playerStats.currentLife = playerData.life;
                this.game.playerStats.maxLife = playerData.maxLife;
                
                // Mark player as dead if server says so
                if (playerData.isDead && !this.playerDead) {
                    this.playerDead = true;
                    this.game.isAlive = false;
                    this.handlePlayerDeath();
                }
                
                // Add source to playerData and use handlePlayerStatsUpdate for mana
                if (playerData.mana !== undefined) {
                    // Create a copy with source information
                    const playerDataWithSource = {
                        ...playerData,
                        source: 'game_state_sync'
                    };
                    
                    // Process through the unified handler which will decide whether to accept it
                    this.handlePlayerStatsUpdate(playerDataWithSource);
                }
                
                // Update UI
                this.updateStatusBars();
            }
        });
        
        // Process monster updates if available
        if (data.monsters && Array.isArray(data.monsters) && this.game.monsterManager) {
            data.monsters.forEach(monsterData => {
                // Check if the monster exists in our world
                const monster = this.game.monsterManager.getMonsterById(monsterData.id);
                
                if (monster) {
                    // Update existing monster health
                    if (typeof monsterData.health === 'number') {
                        // Only update if server health is different
                        if (monster.health !== monsterData.health) {
                            const oldHealth = monster.health;
                            monster.health = monsterData.health;
                            console.log(`Monster ${monsterData.id} health synced from ${oldHealth} to ${monsterData.health} (server authority)`);
                            
                            // Update health bar
                            this.game.monsterManager.updateHealthBar(monster);
                        }
                    }
                    
                    // Handle monster death state if needed
                    if (monsterData.isDead && monster.isAlive) {
                        console.log(`Monster ${monsterData.id} is dead according to server - updating local state`);
                        this.game.monsterManager.handleMonsterDeath(monsterData.id);
                    }
                } else if (!monsterData.isDead) {
                    // Monster doesn't exist locally but should - let monster manager handle it
                    console.log(`Monster ${monsterData.id} exists on server but not client - requesting state`);
                    this.socket.emit('request_monster_state', { monsterId: monsterData.id });
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
        console.log(`Attempting to reconnect (attempt ${this.reconnectAttempt}/5)...`);
        if (this.reconnectAttempt > 5) {
            console.error('Maximum reconnection attempts reached');
            // Always require server connection - no offline mode
            this.showConnectionError('Could not connect to server. Please refresh the page to try again.');
            return;
        }
        
        try {
            this.reconnectAttempt++;
            
            // Get the server URL
            const SERVER_URL = this.game.SERVER_URL || getServerUrl();
            console.log(`Using VITE_SOCKET_URL: ${SERVER_URL}`);
            
            // Create a new socket connection
            this.socket = io(SERVER_URL, {
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });
            
            console.log('Setting up socket handlers during reconnection');
            this.setupSocketHandlers();
        } catch (error) {
            console.error('Error during reconnection attempt:', error);
            
            // Try again after a delay (increasing with each attempt)
            setTimeout(() => this.attemptReconnect(), 2000 * this.reconnectAttempt);
        }
    }
    
    /**
     * Show a connection error message
     * @param {string} message - The error message to display
     */
    showConnectionError(message) {
        if (this.game && this.game.uiManager) {
            // Show error message
            this.game.uiManager.showNotification(message, '#ff0000', 0);
            
            // Display a modal with retry button
            const modal = document.createElement('div');
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            modal.style.zIndex = '10000';
            modal.style.display = 'flex';
            modal.style.flexDirection = 'column';
            modal.style.justifyContent = 'center';
            modal.style.alignItems = 'center';
            
            const content = document.createElement('div');
            content.style.padding = '30px';
            content.style.backgroundColor = '#333';
            content.style.borderRadius = '10px';
            content.style.color = 'white';
            content.style.textAlign = 'center';
            content.style.maxWidth = '80%';
            
            const title = document.createElement('h2');
            title.textContent = 'Connection Error';
            
            const text = document.createElement('p');
            text.textContent = message;
            
            const button = document.createElement('button');
            button.textContent = 'Retry Connection';
            button.style.padding = '10px 20px';
            button.style.marginTop = '20px';
            button.style.backgroundColor = '#4CAF50';
            button.style.border = 'none';
            button.style.borderRadius = '5px';
            button.style.color = 'white';
            button.style.cursor = 'pointer';
            
            button.addEventListener('click', () => {
                location.reload();
            });
            
            content.appendChild(title);
            content.appendChild(text);
            content.appendChild(button);
            modal.appendChild(content);
            document.body.appendChild(modal);
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

    /**
     * Handle player stats update, preserving mana values
     */
    handlePlayerStatsUpdate(playerData) {
        if (!playerData || !playerData.id) return;
        
        const playerId = playerData.id;
        const currentPlayer = this.game.playerManager?.players.get(playerId);
        
        // For other players, just update their stats directly
        if (currentPlayer && playerId !== this.socket.id) {
            if (!currentPlayer.userData) {
                currentPlayer.userData = {};
            }
            if (!currentPlayer.userData.stats) {
                currentPlayer.userData.stats = {};
            }
            
            // Update their stats
            currentPlayer.userData.stats.life = playerData.life ?? currentPlayer.userData.stats.life;
            currentPlayer.userData.stats.maxLife = playerData.maxLife ?? currentPlayer.userData.stats.maxLife;
            currentPlayer.userData.stats.mana = playerData.mana ?? currentPlayer.userData.stats.mana;
            currentPlayer.userData.stats.maxMana = playerData.maxMana ?? currentPlayer.userData.stats.maxMana;
            
            // Update their health bar if available
            if (currentPlayer.healthBar) {
                currentPlayer.healthBar.updateHealth(
                    currentPlayer.userData.stats.life, 
                    currentPlayer.userData.stats.maxLife
                );
            }
            return;
        }
        
        // Handle local player stats
        if (playerId === this.socket.id && this.game.playerStats) {
            // Special check for health updates - only accept health updates in certain situations:
            // 1. When our current health is undefined (initialization)
            // 2. When we're dead/respawning
            // 3. When receiving health from specific events (not periodic updates)
            // 4. For Life Drain healing
            const currentLife = this.game.playerStats.currentLife;
            const newLife = playerData.life;
            const isFromPeriodicUpdate = !playerData.source || playerData.source === 'periodic';
            const isFromSpecificEvent = playerData.source === 'life_update' || 
                                       playerData.source === 'respawn' || 
                                       playerData.source === 'experience_gain' ||
                                       playerData.source === 'skill_effect' ||
                                       playerData.source === 'regeneration';
            const isFromLifeDrain = playerData.skillName === 'life_drain';
            const isHealing = newLife > currentLife;
            
            const acceptLifeUpdate = 
                currentLife === undefined || 
                !this.game.isAlive ||
                isFromSpecificEvent ||
                !isFromPeriodicUpdate ||
                (isHealing && (isFromLifeDrain || playerData.isPersistent));
                
            if (playerData.life !== undefined && acceptLifeUpdate) {
                console.log(`Setting local player health to ${playerData.life} from server (source: ${playerData.source || 'unknown'}, healing: ${isHealing})`);
                this.game.playerStats.currentLife = playerData.life;
                
                // Sync with userData for consistency
                if (this.game.localPlayer && this.game.localPlayer.userData) {
                    if (!this.game.localPlayer.userData.stats) {
                        this.game.localPlayer.userData.stats = {};
                    }
                    this.game.localPlayer.userData.stats.life = playerData.life;
                    
                    // Also store last healing time and amount if healing
                    if (isHealing) {
                        this.game.localPlayer.userData.lastHealTime = Date.now();
                        this.game.localPlayer.userData.lastHealAmount = newLife - currentLife;
                    }
                }
            } else if (playerData.life !== undefined && playerData.life !== this.game.playerStats.currentLife) {
                console.log(`Ignoring server health update: ${playerData.life} (current: ${this.game.playerStats.currentLife}, source: ${playerData.source || 'unknown'})`);
            }
            
            // Only accept mana updates in certain situations:
            // 1. When our current mana is undefined (initialization)
            // 2. When we're dead/respawning
            // 3. When receiving mana from specific events (not periodic updates)
            const acceptManaUpdate = 
                this.game.playerStats.currentMana === undefined || 
                !this.game.isAlive ||
                isFromSpecificEvent ||
                !isFromPeriodicUpdate;
                
            if (playerData.mana !== undefined && acceptManaUpdate) {
                console.log(`Setting local player mana to ${playerData.mana} from server (source: ${playerData.source || 'unknown'})`);
                this.game.playerStats.currentMana = playerData.mana;
                
                // Sync with userData for consistency
                if (this.game.localPlayer && this.game.localPlayer.userData) {
                    if (!this.game.localPlayer.userData.stats) {
                        this.game.localPlayer.userData.stats = {};
                    }
                    this.game.localPlayer.userData.stats.mana = playerData.mana;
                    console.log(`Also synced localPlayer.userData.stats.mana=${playerData.mana}`);
                }
            } else if (playerData.mana !== undefined) {
                console.log(`Ignoring server mana update: ${playerData.mana} (current: ${this.game.playerStats.currentMana}, source: ${playerData.source || 'unknown'})`);
            }
            
            // Update max life and mana if provided
            if (playerData.maxLife !== undefined) {
                this.game.playerStats.maxLife = playerData.maxLife;
            }
            if (playerData.maxMana !== undefined) {
                this.game.playerStats.maxMana = playerData.maxMana;
            }
            
            // Only update karma if provided
            if (playerData.karma !== undefined) {
                this.game.playerStats.currentKarma = playerData.karma;
            }
            if (playerData.maxKarma !== undefined) {
                this.game.playerStats.maxKarma = playerData.maxKarma;
            }
            
            // Only update experience and level if provided
            if (playerData.experience !== undefined) {
                this.game.playerStats.experience = playerData.experience;
            }
            if (playerData.level !== undefined) {
                this.game.playerStats.level = playerData.level;
            }
            
            // Path should only be updated if it doesn't exist or is null
            if (playerData.path && (!this.game.playerStats.path || this.game.playerStats.path === null)) {
                this.game.playerStats.path = playerData.path;
            }
            
            // Update UI
            if (this.game.uiManager && typeof this.game.uiManager.updateStatusBars === 'function') {
                this.game.uiManager.updateStatusBars(this.game.playerStats);
            }
        }
    }

    /**
     * Helper method to update status bars through the UI manager
     */
    updateStatusBars() {
        if (this.game.updateStatusBars) {
            this.game.updateStatusBars();
        } else if (this.game.uiManager && this.game.uiManager.updateStatusBars) {
            this.game.uiManager.updateStatusBars(this.game.playerStats);
        }
    }

    /**
     * Send a request to learn a skill
     * @param {string} skillId - The ID of the skill to learn
     * @returns {Promise} Promise that resolves with the skill learning result
     */
    requestLearnSkill(skillId) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected || !this.socket) {
                console.error('Cannot request skill learning: not connected to server');
                reject({ success: false, message: 'Not connected to server' });
                return;
            }
            
            console.log(`Sending request to learn skill: ${skillId}`);
            
            // Set up one-time listener for the response
            const responseHandler = (response) => {
                console.log(`Received skill learning response:`, response);
                resolve(response);
            };
            
            const errorHandler = (error) => {
                console.error(`Error learning skill:`, error);
                reject(error);
            };
            
            // Register listeners
            this.socket.once('skillLearningResult', responseHandler);
            this.socket.once('errorMessage', errorHandler);
            
            // Set timeout to prevent hanging promises
            const timeout = setTimeout(() => {
                // Clean up listeners
                this.socket.off('skillLearningResult', responseHandler);
                this.socket.off('errorMessage', errorHandler);
                resolve({ success: false, message: 'Server response timeout' });
            }, 5000);
            
            // Send the request
            this.socket.emit('learnSkill', { skillId }, (ack) => {
                // If server supports acknowledgments
                if (ack && typeof ack === 'object') {
                    clearTimeout(timeout);
                    this.socket.off('skillLearningResult', responseHandler);
                    this.socket.off('errorMessage', errorHandler);
                    resolve(ack);
                }
            });
        });
    }

    /**
     * Check if dev mode is available for this user
     * @returns {boolean} True if dev mode is available, false otherwise
     */
    isDevModeAvailable() {
        // Dev mode should be disabled in production
        // This is a placeholder for potential future development modes
        if (process.env.NODE_ENV === 'development' && this.socket) {
            // Only allow dev mode for specific users or in development
            return true;
        }
        return false;
    }
}