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
        this.isOfflineMode = false;
        this.isConnected = false;
        
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
        if (this.socket) {
            this.setupSocketHandlers();
        }
        
        // Store last server positions for reconciliation
        this.lastServerPositions = new Map();
        this.pendingInputs = [];
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
                    this.enterOfflineMode();
                    resolve(false);
                });
                
                // Set a timeout
                setTimeout(() => {
                    if (!this.isConnected) {
                        console.warn('Connection timeout');
                        this.enterOfflineMode();
                        resolve(false);
                    }
                }, 10000);
            } else {
                this.enterOfflineMode();
                resolve(false);
            }
        });
    }

    enterOfflineMode() {
        console.log('Entering offline mode');
        this.isOfflineMode = true;
        this.isConnected = false;
        
        // Clean up socket if it exists
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        // Clean up game state
        this.cleanup();
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
            this.socket.emit('requestStateUpdate');
        });

        // Handle connection error
        this.socket.on('connect_error', (error) => {
            console.error('Failed to connect to server:', error);
            this.enterOfflineMode();
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
                console.log('Processing NPCs from server:', gameState.npcs);
                this.game.npcManager.processServerNPCs(gameState.npcs);
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
                // Also send initial karma update
                this.socket.emit('karmaUpdate', {
                    id: this.socket.id,
                    karma: this.game.playerStats?.currentKarma ?? 50,
                    maxKarma: this.game.playerStats?.maxKarma ?? 100,
                    life: this.game.playerStats?.currentLife ?? 100,
                    maxLife: this.game.playerStats?.maxLife ?? 100,
                    mana: this.game.playerStats?.currentMana ?? 100,
                    maxMana: this.game.playerStats?.maxMana ?? 100
                });
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

        // Handle life update
        this.socket.on('lifeUpdate', (data) => {
            // Get the player mesh
            const playerMesh = this.game.playerManager.players.get(data.id);
            if (!playerMesh) {
                console.warn(`Player mesh not found for life update: ${data.id}`);
                return;
            }
            
            // Initialize player stats if needed
            if (!playerMesh.userData.stats) {
                playerMesh.userData.stats = {};
            }
            
            // Check if this update is newer than the last one we processed
            const timestamp = data.timestamp || Date.now();
            const lastTimestamp = playerMesh.userData.lastUpdateTimestamp || 0;
            
            // Only process updates that are newer than the last one we processed
            if (timestamp < lastTimestamp) {
                console.log(`Ignoring outdated health update for player ${data.id} (${timestamp} < ${lastTimestamp})`);
                return;
            }
            
            // Store the timestamp of this update
            playerMesh.userData.lastUpdateTimestamp = timestamp;
            
            // Store the server-provided values
            const serverLife = data.life;
            const serverMaxLife = data.maxLife || 100;
            
            // Update player stats with server values (server authority)
            playerMesh.userData.stats.life = serverLife;
            playerMesh.userData.stats.maxLife = serverMaxLife;
            
            // Set player ID for better debugging
            if (!playerMesh.userData.playerId) {
                playerMesh.userData.playerId = data.id;
            }
            
            // Create health bar if it doesn't exist
            if (!playerMesh.userData.healthBar) {
                console.log(`Creating health bar for player ${data.id}`);
                this.game.playerManager.createHealthBar(playerMesh);
                this.game.playerManager.updateHealthBar(playerMesh);
                return;
            }
            
            // LOCK MECHANISM: Only update if we're not currently processing a damage effect
            if (playerMesh.userData.processingDamageEffect) {
                console.log(`Skipping health update for player ${data.id} - currently processing damage effect`);
                return;
            }
            
            // Clear any existing update timeout
            if (playerMesh.userData.healthUpdateTimeout) {
                clearTimeout(playerMesh.userData.healthUpdateTimeout);
                playerMesh.userData.healthUpdateTimeout = null;
            }
            
            // Use a debounced update for the health bar to prevent oscillation
            playerMesh.userData.healthUpdateTimeout = setTimeout(() => {
                // Update the health bar with the final values
                this.game.playerManager.updateHealthBar(playerMesh);
                
                // Clear the timeout
                playerMesh.userData.healthUpdateTimeout = null;
            }, 300); // Longer delay to collect multiple rapid updates
            
            // If this is our player, update the main UI immediately
            if (data.id === this.socket.id) {
                // Update UI if available
                if (this.game.uiManager) {
                    if (this.game.playerStats) {
                        // Update player stats first
                        this.game.playerStats.currentLife = serverLife;
                        this.game.playerStats.maxLife = serverMaxLife;
                    }
                    
                    // Then update the UI
                    this.game.uiManager.updateStatusBars(this.game.playerStats);
                }
                
                // Check for death
                if (serverLife <= 0 && !this.playerDead) {
                    this.playerDead = true;
                    this.handlePlayerDeath();
                } else if (serverLife > 0 && this.playerDead) {
                    this.playerDead = false;
                }
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
            console.log('Received damage effect:', data);
            
            // Get the source and target players
            const sourcePlayer = this.game.playerManager.players.get(data.sourceId);
            const targetPlayer = this.game.playerManager.players.get(data.targetId);
            
            // Update target player's health bar if available
            if (targetPlayer) {
                // Set the processing flag to prevent conflicting updates
                targetPlayer.userData.processingDamageEffect = true;
                
                // Create damage effect
                if (this.game.effectsManager && this.game.effectsManager.showDamageNumber) {
                    this.game.effectsManager.showDamageNumber(targetPlayer, data.damage);
                } else {
                    // Fallback to basic damage effect
                    this.createDamageEffect(targetPlayer, data.damage);
                }
                
                // Update health bar directly with the current server values
                if (targetPlayer.userData.stats) {
                    // Force an immediate update of the health bar
                    this.game.playerManager.updateHealthBar(targetPlayer);
                }
                
                // Clear the processing flag after a delay
                setTimeout(() => {
                    targetPlayer.userData.processingDamageEffect = false;
                }, 500); // Keep the lock for 500ms to prevent oscillation
            }
            
            // Play attack animation for source player
            if (sourcePlayer && this.game.animationManager) {
                this.game.animationManager.playAnimation(sourcePlayer, 'attack');
            }
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
            this.handleReconnect();
        });

        // Handle skill damage
        this.socket.on('skillDamage', (data) => {
            console.log('Received skill damage:', data);
            
            // Get the target player mesh
            const targetPlayer = this.game.playerManager.players.get(data.targetId);
            
            if (targetPlayer) {
                // Update the target player's stats
                if (!targetPlayer.userData.stats) {
                    targetPlayer.userData.stats = {
                        life: 100,
                        maxLife: 100
                    };
                }
                
                // Apply damage
                targetPlayer.userData.stats.life = Math.max(0, targetPlayer.userData.stats.life - data.damage);
                
                // Create health bar if it doesn't exist
                if (!targetPlayer.userData.healthBar && this.game.playerManager.createHealthBar) {
                    console.log(`Creating health bar for damaged player ${data.targetId}`);
                    this.game.playerManager.createHealthBar(targetPlayer);
                }
                
                // Update the health bar visually
                this.game.playerManager.updateHealthBar(targetPlayer);
                
                // Show damage effect
                if (this.game.effectsManager && this.game.effectsManager.showDamageNumber) {
                    this.game.effectsManager.showDamageNumber(targetPlayer, data.damage);
                }
            }
            
            if (data.targetId === this.socket.id) {
                // We took damage
                if (this.game.playerStats) {
                    // Update player health
                    this.game.playerStats.currentLife = Math.max(0, this.game.playerStats.currentLife - data.damage);
                    
                    // Update UI
                    if (this.game.uiManager) {
                        this.game.uiManager.updateStatusBars();
                    }
                    
                    // Check for death
                    if (this.game.playerStats.currentLife <= 0 && this.game.isAlive) {
                        this.game.isAlive = false;
                        if (this.game.playerManager) {
                            this.game.playerManager.handlePlayerDeath(this.game.localPlayer);
                        }
                    }
                }
            }
        });
        
        // Handle player died event
        this.socket.on('playerDied', (data) => {
            console.log('Received player died event:', data);
            
            // Show death message
            if (this.game.uiManager) {
                this.game.uiManager.showNotification(`You were killed by another player!`, '#ff0000');
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
        });
        
        // Handle other player respawned
        this.socket.on('playerRespawned', (data) => {
            console.log('Player respawned:', data);
            
            // Get the player from the map
            const player = this.game.players.get(data.id);
            if (player) {
                // Update player position
                player.position.set(
                    data.position.x,
                    data.position.y,
                    data.position.z
                );
                
                // Reset visual state
                player.rotation.set(0, 0, 0);
                player.traverse((child) => {
                    if (child.isMesh && child.material) {
                        child.material.transparent = false;
                        child.material.opacity = 1.0;
                    }
                });
                
                // Reset player data
                if (player.userData) {
                    player.userData.isDead = false;
                }
            }
        });

        // Handle player respawn
        this.socket.on('playerRespawned', (data) => {
            console.log('Player respawned:', data);
            
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
            
            // If this is the local player, reset controls and camera
            if (data.id === this.socket.id) {
                console.log('Local player respawned');
                
                // Update local player stats
                if (this.game.playerStats && data.stats) {
                    this.game.playerStats.currentLife = data.stats.life;
                    this.game.playerStats.maxLife = data.stats.maxLife;
                }
                
                // Update UI
                if (this.game.uiManager) {
                    this.game.uiManager.updateStatusBars(this.game.playerStats);
                }
                
                // Reset player state
                this.playerDead = false;
                
                // Re-enable controls if available
                if (this.game.controlsManager && this.game.controlsManager.enableControls) {
                    this.game.controlsManager.enableControls();
                }
                
                // Reset camera if needed
                if (this.game.cameraManager && this.game.cameraManager.resetCamera) {
                    this.game.cameraManager.resetCamera();
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

    handleReconnect() {
        console.log('Reconnected to server - creating new player as per original game behavior');
        
        // In the original game, reconnection meant starting over
        // Remove any existing player
        if (this.game.localPlayer) {
            console.log('Removing existing local player before creating a new one');
            this.game.scene.remove(this.game.localPlayer);
            this.game.localPlayer = null;
        }
        
        // Clear existing state
        this.game.karmaManager.chosenPath = null;
        this.game.skillsManager.clearSkills();
        
        // Request server to reset our player data
        this.socket.emit('requestPlayerReset');
        
        // Set up a handler for the reset confirmation
        this.socket.once('playerResetConfirmed', () => {
            console.log('Server confirmed player reset, creating new local player');
            // Create a new player - but only if we don't have one
            this.createLocalPlayer();
            
            // Update UI
            if (this.game.uiManager) {
                this.game.uiManager.updateSkillBar();
                this.game.uiManager.showNotification('Reconnected to server. Starting over...', '#ffffff');
            }
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
            }
            
            return player;
        } catch (error) {
            console.error('Error creating local player:', error);
            return null;
        }
    }

    sendPlayerState() {
        if (!this.isConnected || !this.socket || !this.game.localPlayer) return;
        
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
        if (!this.socket?.connected || !this.game.localPlayer) return;
        
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
                if (!targetPlayer.position || !this.game.camera) return;
                
                // Convert 3D position to screen position
                const position = new THREE.Vector3();
                position.copy(targetPlayer.position);
                position.y += 2; // Position above the player's head
                
                // Project the 3D position to 2D screen coordinates
                position.project(this.game.camera);
                
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

    /**
     * Handle player death
     */
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
            deathMessage.textContent = 'YOU DIED';
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
                    this.game.uiManager.updateStatusBars(this.game.playerStats);
                }
            };
            deathMessage.appendChild(respawnButton);
        }
        
        // Disable controls if available
        if (this.game.controlsManager && this.game.controlsManager.disableControls) {
            this.game.controlsManager.disableControls();
        }
    }
}