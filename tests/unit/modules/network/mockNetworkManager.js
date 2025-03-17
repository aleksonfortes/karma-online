/**
 * Mock implementation of NetworkManager for testing
 */

export class MockNetworkManager {
  constructor(game) {
    this.game = game;
    this.isConnected = false;
    this.wasDisconnected = false;
    this.socket = null;
    this.pendingUpdates = new Map();
    this.lastServerPositions = new Map();
    this.applyCorrection = true;
    this.initialized = false;
    this.lastUpdateTime = 0;
    this.updateInterval = 100; // ms
  }
  
  init() {
    this.socket = this.createSocket();
    this.setupSocketListeners();
    this.initialized = true;
  }
  
  createSocket() {
    return {
      id: 'socket-123',
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      connected: true
    };
  }
  
  setupSocketListeners() {
    // Mock implementation of setting up socket listeners
    if (this.socket) {
      this.socket.on('connect', this.handleConnect.bind(this));
      this.socket.on('disconnect', this.handleDisconnect.bind(this));
      this.socket.on('initialPosition', this.handleInitialPosition.bind(this));
      this.socket.on('playerJoined', this.handlePlayerJoined.bind(this));
      this.socket.on('playerLeft', this.handlePlayerLeft.bind(this));
      this.socket.on('playerUpdate', this.handlePlayerUpdate.bind(this));
      this.socket.on('positionCorrection', this.handlePositionCorrection.bind(this));
      this.socket.on('batchPositionUpdate', this.handleBatchPositionUpdate.bind(this));
      this.socket.on('batchStateUpdate', this.handleBatchStateUpdate.bind(this));
      this.socket.on('batchDamageUpdate', this.handleBatchDamageUpdate.bind(this));
      this.socket.on('worldStateUpdate', this.handleWorldStateUpdate.bind(this));
    }
  }
  
  connect() {
    this.isConnected = true;
    this.socket.connected = true;
    this.handleConnect();
  }
  
  disconnect() {
    this.isConnected = false;
    this.wasDisconnected = true;
    this.socket.connected = false;
    this.handleDisconnect();
  }
  
  handleConnect() {
    this.isConnected = true;
    
    if (this.wasDisconnected) {
      this.handleReconnection();
    } else {
      this.socket.emit('requestStateUpdate');
    }
  }
  
  handleDisconnect() {
    this.isConnected = false;
    this.wasDisconnected = true;
  }
  
  handleReconnection() {
    // Mock implementation of reconnection logic
    this.wasDisconnected = false;
    
    // Clear existing players if playerManager exists
    if (this.game.playerManager) {
      this.game.playerManager.players.clear();
      
      // Create a local player for testing
      if (this.game.localPlayerId) {
        const player = this.game.playerManager.createLocalPlayer({
          id: this.game.localPlayerId,
          position: { x: 0, y: 0, z: 0 },
          rotation: { y: 0 }
        });
        
        // Set as local player
        this.game.playerManager.localPlayer = player;
      }
    }
  }
  
  handleInitialPosition(positionData) {
    const localPlayer = this.game.playerManager?.localPlayer || this.game.localPlayer;
    
    if (!localPlayer) {
      return;
    }
    
    if (positionData.position) {
      localPlayer.position.x = positionData.position.x;
      localPlayer.position.y = positionData.position.y;
      localPlayer.position.z = positionData.position.z;
      
      if (positionData.rotation) {
        localPlayer.rotation.y = positionData.rotation.y;
      }
    } else {
      localPlayer.position.x = positionData.x;
      localPlayer.position.y = positionData.y;
      localPlayer.position.z = positionData.z;
      
      if (positionData.rotation !== undefined) {
        localPlayer.rotation.y = positionData.rotation;
      }
    }
  }
  
  handlePlayerJoined(playerData) {
    if (!this.game.playerManager) return;
    
    this.game.playerManager.createNetworkPlayer(playerData);
  }
  
  handlePlayerLeft(playerId) {
    if (!this.game.playerManager) return;
    
    this.game.playerManager.removePlayer(playerId);
  }
  
  handlePlayerUpdate(updateData) {
    if (!this.game.playerManager) return;
    
    const { id, ...data } = updateData;
    
    // Create a properly formatted update object
    const update = {
      type: data.type || 'position',
      ...data
    };
    
    // Apply the update directly
    if (this.game.playerManager.applyServerUpdate) {
      this.game.playerManager.applyServerUpdate(id, update);
    } else {
      // Fallback for tests that don't have applyServerUpdate
      if (this.game.playerManager.players.has(id)) {
        const player = this.game.playerManager.players.get(id);
        
        if (update.type === 'position' && update.position) {
          player.position.x = update.position.x;
          player.position.y = update.position.y;
          player.position.z = update.position.z;
          
          if (update.rotation) {
            player.rotation.y = update.rotation.y;
          }
        } else if (update.type === 'health' && update.life !== undefined) {
          player.userData.stats.life = update.life;
          if (update.maxLife !== undefined) {
            player.userData.stats.maxLife = update.maxLife;
          }
        }
      }
    }
  }
  
  handlePositionCorrection(correctionData) {
    const localPlayer = this.game.playerManager?.localPlayer || this.game.localPlayer;
    
    if (!localPlayer) {
      return;
    }
    
    const serverPos = correctionData.position;
    
    // Store the server position for future reference
    this.lastServerPositions.set(this.socket.id, {
      position: { ...serverPos },
      time: Date.now()
    });
    
    // Apply the correction directly if flag is set
    if (this.applyCorrection) {
      localPlayer.position.x = serverPos.x;
      localPlayer.position.y = serverPos.y;
      localPlayer.position.z = serverPos.z;
    }
  }
  
  sendPlayerState() {
    if (!this.isConnected || !this.socket) return;
    
    const localPlayer = this.game.playerManager?.localPlayer || this.game.localPlayer;
    
    if (!localPlayer) return;
    
    const playerState = {
      position: {
        x: localPlayer.position.x,
        y: localPlayer.position.y,
        z: localPlayer.position.z
      },
      rotation: {
        y: localPlayer.rotation.y
      }
    };
    
    this.socket.emit('playerState', playerState);
  }
  
  applyPendingUpdates(playerId, updates) {
    if (!updates) {
      // If no updates provided, use any stored in pendingUpdates
      updates = this.pendingUpdates.get(playerId);
      if (!updates) return;
      
      this.pendingUpdates.delete(playerId);
    }
    
    // Apply each update
    updates.forEach(update => {
      // Create a properly formatted update object
      const formattedUpdate = {
        type: update.type || 'position',
        ...update
      };
      
      // Apply the update directly
      if (this.game.playerManager && this.game.playerManager.applyServerUpdate) {
        this.game.playerManager.applyServerUpdate(playerId, formattedUpdate);
      } else {
        // Fallback for tests that don't have applyServerUpdate
        if (this.game.playerManager && this.game.playerManager.players.has(playerId)) {
          const player = this.game.playerManager.players.get(playerId);
          
          if (formattedUpdate.type === 'position' && formattedUpdate.position) {
            player.position.x = formattedUpdate.position.x;
            player.position.y = formattedUpdate.position.y;
            player.position.z = formattedUpdate.position.z;
            
            if (formattedUpdate.rotation) {
              player.rotation.y = formattedUpdate.rotation.y;
            }
          } else if (formattedUpdate.type === 'health' && formattedUpdate.life !== undefined) {
            player.userData.stats.life = formattedUpdate.life;
            if (formattedUpdate.maxLife !== undefined) {
              player.userData.stats.maxLife = formattedUpdate.maxLife;
            }
          }
        }
      }
    });
  }
  
  requestInitialPosition() {
    return Promise.resolve({
      position: { x: 0, y: 0, z: 0 },
      rotation: { y: 0 }
    });
  }
  
  // Add missing methods for batch updates
  handleBatchPositionUpdate(batchData) {
    if (!this.game.playerManager) return;
    
    // Skip updates for local player
    const localPlayerId = this.game.localPlayerId || (this.game.playerManager.localPlayer ? this.game.playerManager.localPlayer.id : null);
    
    if (Array.isArray(batchData)) {
      batchData.forEach(posData => {
        // Skip updates for local player
        if (posData.id === localPlayerId) return;
        
        if (this.game.playerManager.players.has(posData.id)) {
          const player = this.game.playerManager.players.get(posData.id);
          
          // Apply the update
          if (this.game.playerManager.applyServerUpdate) {
            this.game.playerManager.applyServerUpdate(posData.id, {
              type: 'position',
              position: posData.position,
              rotation: posData.rotation
            });
          } else {
            // Fallback for tests
            player.position.x = posData.position.x;
            player.position.y = posData.position.y;
            player.position.z = posData.position.z;
            
            if (posData.rotation) {
              player.rotation.y = posData.rotation.y;
            }
          }
        }
      });
    }
  }
  
  handleBatchStateUpdate(batchData) {
    if (!this.game.playerManager) return;
    
    if (Array.isArray(batchData)) {
      batchData.forEach(stateData => {
        if (this.game.playerManager.players.has(stateData.id)) {
          const player = this.game.playerManager.players.get(stateData.id);
          
          // Apply the update
          if (this.game.playerManager.applyServerUpdate) {
            this.game.playerManager.applyServerUpdate(stateData.id, {
              type: 'stats',
              stats: stateData.stats
            });
          } else {
            // Fallback for tests
            if (stateData.stats) {
              Object.assign(player.userData.stats, stateData.stats);
            }
          }
        }
      });
    }
  }
  
  handleBatchDamageUpdate(batchData) {
    if (!this.game.playerManager) return;
    
    if (Array.isArray(batchData)) {
      batchData.forEach(damageData => {
        if (this.game.playerManager.players.has(damageData.id)) {
          const player = this.game.playerManager.players.get(damageData.id);
          
          // Apply the update
          if (this.game.playerManager.applyServerUpdate) {
            this.game.playerManager.applyServerUpdate(damageData.id, {
              type: 'health',
              life: damageData.life,
              maxLife: damageData.maxLife
            });
          } else {
            // Fallback for tests
            player.userData.stats.life = damageData.life;
            if (damageData.maxLife !== undefined) {
              player.userData.stats.maxLife = damageData.maxLife;
            }
          }
        }
      });
    }
  }
  
  handleWorldStateUpdate(worldData) {
    // Handle world state updates
    if (worldData.environment && this.game.environmentManager) {
      // Apply environment updates
    }
    
    if (worldData.players && this.game.playerManager) {
      worldData.players.forEach(playerData => {
        if (this.game.playerManager.players.has(playerData.id)) {
          const player = this.game.playerManager.players.get(playerData.id);
          
          // Apply position update
          if (playerData.position) {
            player.position.x = playerData.position.x;
            player.position.y = playerData.position.y;
            player.position.z = playerData.position.z;
          }
          
          // Apply rotation update
          if (playerData.rotation) {
            player.rotation.y = playerData.rotation.y;
          }
          
          // Apply stats update
          if (playerData.stats) {
            Object.assign(player.userData.stats, playerData.stats);
          }
        }
      });
    }
  }
  
  // Add update method for NetworkManagerEdgeCases.test.js
  update(deltaTime = 16) {
    if (!this.isConnected) return;
    
    const now = Date.now();
    const elapsed = now - this.lastUpdateTime;
    
    // Send player state if update interval has elapsed
    if (elapsed >= this.updateInterval) {
      this.sendPlayerState();
      this.lastUpdateTime = now;
    }
  }
} 