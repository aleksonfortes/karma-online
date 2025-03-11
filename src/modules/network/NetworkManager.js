import io from 'socket.io-client';
import * as THREE from 'three';

export class NetworkManager {
    constructor(game) {
        this.game = game;
        this.isOfflineMode = false;
        this.isConnected = false;
        
        // Initialize socket connection with exact same options as original game
        const SERVER_URL = window.location.hostname === 'localhost' && window.location.port === '5173'
            ? 'http://localhost:3000'  // Development
            : window.location.origin;  // Production
            
        console.log('Connecting to server...');
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
                }, 5000);
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

        // Handle current players
        this.socket.on('currentPlayers', async (players) => {
            console.log('\n=== Received Current Players ===');
            console.log('Players:', players);
            
            // Clear existing players and their status bars
            this.game.playerManager.players.forEach((playerMesh) => {
                if (playerMesh.userData.statusGroup) {
                    this.game.scene.remove(playerMesh.userData.statusGroup);
                }
                this.game.scene.remove(playerMesh);
            });
            this.game.playerManager.players.clear();
            
            // Add all players
            for (const player of players) {
                if (player.id === this.socket.id) {
                    // Create local player if it doesn't exist
                    if (!this.game.localPlayer) {
                        const localPlayer = await this.game.playerManager.createPlayer(
                            player.id,
                            player.position || { x: 0, y: 3, z: 0 },
                            { y: player.rotation?.y || 0 },
                            true
                        );
                        
                        if (localPlayer) {
                            this.game.localPlayer = localPlayer;
                            this.game.scene.add(localPlayer);
                            this.game.playerManager.players.set(player.id, localPlayer);
                            
                            // Update player stats
                            this.game.playerStats = {
                                currentLife: player.life ?? 100,
                                maxLife: player.maxLife ?? 100,
                                currentMana: player.mana ?? 100,
                                maxMana: player.maxMana ?? 100,
                                currentKarma: player.karma ?? 50,
                                maxKarma: player.maxKarma ?? 100
                            };
                        }
                    }
                } else {
                    // Create other players
                    const playerMesh = await this.game.playerManager.createPlayer(
                        player.id,
                        player.position || { x: 0, y: 3, z: 0 },
                        { y: player.rotation?.y || 0 }
                    );
                    
                    if (playerMesh) {
                        this.game.scene.add(playerMesh);
                        this.game.playerManager.players.set(player.id, playerMesh);
                        
                        // Update player stats
                        playerMesh.userData.stats = {
                            life: player.life ?? 100,
                            maxLife: player.maxLife ?? 100,
                            mana: player.mana ?? 100,
                            maxMana: player.maxMana ?? 100,
                            karma: player.karma ?? 50,
                            maxKarma: player.maxKarma ?? 100
                        };
                    }
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

        // Handle new player
        this.socket.on('newPlayer', async (player) => {
            if (player.id === this.socket.id) {
                // If this is us, make sure we're in the players Map
                if (!this.game.playerManager.players.has(player.id) && this.game.localPlayer) {
                    this.game.playerManager.players.set(player.id, this.game.localPlayer);
                }
                return;
            }
            
            console.log('Creating new player:', player.id);
            const playerMesh = await this.game.playerManager.createPlayer(
                player.id,
                player.position || { x: 0, y: 3, z: 0 },
                { y: player.rotation?.y || 0 }
            );
            
            if (playerMesh) {
                this.game.scene.add(playerMesh);
                this.game.playerManager.players.set(player.id, playerMesh);
                
                // Update player stats
                playerMesh.userData.stats = {
                    life: player.life ?? 100,
                    maxLife: player.maxLife ?? 100,
                    mana: player.mana ?? 100,
                    maxMana: player.maxMana ?? 100,
                    karma: player.karma ?? 50,
                    maxKarma: player.maxKarma ?? 100
                };
            }
        });

        // Handle player left/disconnection
        this.socket.on('playerLeft', (playerId) => {
            console.log('\n=== Player Left ===');
            console.log('Player ID:', playerId);
            this.removePlayer(playerId);
        });

        // Handle player disconnected (temporary)
        this.socket.on('playerDisconnected', (playerId) => {
            console.log('\n=== Player Temporarily Disconnected ===');
            console.log('Player ID:', playerId);
            const player = this.game.playerManager.players.get(playerId);
            if (player) {
                // Visual indication of disconnected state
                player.traverse((child) => {
                    if (child.isMesh && child.material) {
                        child.material.transparent = true;
                        child.material.opacity = 0.5;
                    }
                });
            }
        });

        // Handle disconnect
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
            this.cleanup();
        });

        // Handle player movement
        this.socket.on('playerMoved', (player) => {
            if (player.id === this.socket.id) return;
            
            const playerMesh = this.game.playerManager.players.get(player.id);
            if (playerMesh) {
                // Update position
                playerMesh.position.set(
                    player.position.x,
                    player.position.y,
                    player.position.z
                );
                playerMesh.rotation.y = player.rotation?.y || 0;
                
                // Update stats
                if (!playerMesh.userData.stats) {
                    playerMesh.userData.stats = {};
                }
                
                const stats = {
                    ...playerMesh.userData.stats,
                    life: player.life,
                    maxLife: player.maxLife,
                    mana: player.mana,
                    maxMana: player.maxMana,
                    karma: player.karma,
                    maxKarma: player.maxKarma
                };
                
                playerMesh.userData.stats = stats;
                if (this.game.updatePlayerStatus) {
                    this.game.updatePlayerStatus(playerMesh, stats);
                }
            }
        });

        // Handle game state update - exactly like original
        this.socket.on('gameStateUpdate', (data) => {
            if (!data.players) return;
            
            data.players.forEach(player => {
                if (player.id === this.socket.id) return;
                
                const playerMesh = this.game.playerManager.players.get(player.id);
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
        });

        // Handle stats update - exactly like original
        this.socket.on('statsUpdate', (data) => {
            console.log('Received statsUpdate:', data);
            const playerMesh = this.game.playerManager.players.get(data.id);
            if (!playerMesh) {
                console.log('Player mesh not found for stats update:', data.id);
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

            console.log('Updated player stats:', {
                playerId: data.id,
                oldLife: oldStats.life,
                newLife: data.life,
                oldMana: oldStats.mana,
                newMana: data.mana
            });

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

        // Handle life update - exactly like original
        this.socket.on('lifeUpdate', (data) => {
            const playerMesh = this.game.playerManager.players.get(data.id);
            if (!playerMesh) {
                console.log('Player mesh not found for life update:', data.id);
                return;
            }

            // Update stored life stats
            if (!playerMesh.userData.stats) {
                playerMesh.userData.stats = {};
            }
            
            const oldLife = playerMesh.userData.stats.life;
            playerMesh.userData.stats.life = data.life;
            playerMesh.userData.stats.maxLife = data.maxLife;
            
            // Update visual status bars
            if (this.game.updatePlayerStatus) {
                this.game.updatePlayerStatus(playerMesh, playerMesh.userData.stats);
            }

            // If this is our player, update the main UI and check for death
            if (data.id === this.socket.id) {
                const previousLife = this.game.playerStats.currentLife;
                this.game.playerStats.currentLife = data.life;
                this.game.playerStats.maxLife = data.maxLife;
                if (this.game.updateStatusBars) {
                    this.game.updateStatusBars();
                }
                
                // Check for death
                if (this.game.playerStats.currentLife === 0 && previousLife > 0) {
                    if (this.game.handlePlayerDeath) {
                        this.game.handlePlayerDeath();
                    }
                }
                
                console.log('🛡️ Life Updated:', {
                    oldLife: previousLife,
                    newLife: this.game.playerStats.currentLife,
                    maxLife: this.game.playerStats.maxLife,
                    died: this.game.playerStats.currentLife === 0
                });
            }
        });

        // Handle mana update - exactly like original
        this.socket.on('manaUpdate', (data) => {
            const playerMesh = this.game.playerManager.players.get(data.id);
            if (!playerMesh) {
                console.log('Player mesh not found for mana update:', data.id);
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

        // Handle karma update - exactly like original
        this.socket.on('karmaUpdate', (data) => {
            const playerMesh = this.game.playerManager.players.get(data.id);
            if (!playerMesh) {
                console.log('Player mesh not found for karma update:', data.id);
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

        // Handle skill effect - exactly like original
        this.socket.on('skillEffect', (data) => {
            const targetMesh = this.game.playerManager.players.get(data.targetId);
            if (!targetMesh) {
                console.warn('🎯 Skill Effect: Target not found', {
                    targetId: data.targetId,
                    type: data.type
                });
                return;
            }

            if (data.type === 'damage') {
                console.log('⚔️ Damage Effect:', {
                    targetId: data.targetId,
                    damage: data.damage,
                    oldLife: targetMesh.userData.stats?.life,
                    isLocalPlayer: data.targetId === this.socket.id
                });

                // Find the character model's material (it's a child of the player mesh)
                let characterMaterial;
                targetMesh.traverse((child) => {
                    if (child.isMesh && child.material) {
                        characterMaterial = child.material;
                    }
                });

                if (!characterMaterial) {
                    console.warn('Character material not found for damage effect');
                    return;
                }
                
                // Create damage number with unique ID
                const damageId = `damage-${Date.now()}-${Math.random()}`;
                const damageText = document.createElement('div');
                damageText.id = damageId;
                damageText.textContent = data.isCritical ? `${data.damage}!` : data.damage;
                damageText.style.position = 'fixed';
                damageText.style.color = data.isCritical ? '#ff0000' : '#ffffff';
                damageText.style.fontSize = data.isCritical ? '24px' : '20px';
                damageText.style.fontWeight = 'bold';
                damageText.style.textShadow = '2px 2px 2px rgba(0,0,0,0.5)';
                damageText.style.pointerEvents = 'none';
                damageText.style.zIndex = '1000';
                document.body.appendChild(damageText);
            }
        });
    }

    async createLocalPlayer() {
        try {
            const player = await this.game.playerManager.createPlayer(
                this.socket.id,
                { x: 0, y: 3, z: 0 },
                { y: 0 },
                true
            );
            
            if (player) {
                this.game.localPlayer = player;
                this.game.scene.add(player);
                this.game.playerManager.players.set(this.socket.id, player);
                
                // Send initial state to server - exactly like original
                this.sendPlayerState();
            }
            
            return player;
        } catch (error) {
            console.error('Error creating local player:', error);
            return null;
        }
    }

    // Send player state - exactly like original
    sendPlayerState() {
        if (!this.socket?.connected || !this.game.localPlayer) return;
        
        const playerState = {
            id: this.socket.id,
            position: {
                x: this.game.localPlayer.position.x,
                y: this.game.localPlayer.position.y,
                z: this.game.localPlayer.position.z
            },
            rotation: {
                y: this.game.localPlayer.rotation.y
            },
            path: this.game.playerStats?.path,
            karma: this.game.playerStats?.currentKarma ?? 50,
            maxKarma: this.game.playerStats?.maxKarma ?? 100,
            life: this.game.playerStats?.currentLife ?? 100,
            maxLife: this.game.playerStats?.maxLife ?? 100,
            mana: this.game.playerStats?.currentMana ?? 100,
            maxMana: this.game.playerStats?.maxMana ?? 100,
            timestamp: Date.now()
        };
        
        this.socket.volatile.emit('playerMovement', playerState);
    }

    // Update method - exactly like original game
    update() {
        // Skip if not connected or no local player
        if (!this.socket?.connected || !this.game.localPlayer) return;
        
        // Send player state if player has moved
        const now = Date.now();
        if (!this.lastStateUpdate || now - this.lastStateUpdate >= 50) { // Send at most every 50ms
            this.sendPlayerState();
            this.lastStateUpdate = now;
        }
    }

    removePlayer(playerId) {
        const player = this.game.playerManager.players.get(playerId);
        if (player) {
            // Remove status group from scene
            if (player.userData.statusGroup) {
                this.game.scene.remove(player.userData.statusGroup);
            }
            this.game.scene.remove(player);
            this.game.playerManager.players.delete(playerId);
        }
    }

    cleanup() {
        // Clear all players
        this.game.playerManager.players.forEach((player) => {
            if (player.userData.statusGroup) {
                this.game.scene.remove(player.userData.statusGroup);
            }
            this.game.scene.remove(player);
        });
        this.game.playerManager.players.clear();

        // Clear local player
        if (this.game.localPlayer) {
            if (this.game.localPlayer.userData.statusGroup) {
                this.game.scene.remove(this.game.localPlayer.userData.statusGroup);
            }
            this.game.scene.remove(this.game.localPlayer);
            this.game.localPlayer = null;
        }

        // Reset game state
        if (this.game.cleanup) {
            this.game.cleanup();
        }
    }
} 