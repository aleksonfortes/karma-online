// Mock THREE.js
const mockTHREE = {
  Vector3: jest.fn().mockImplementation((x = 0, y = 0, z = 0) => ({
    x, y, z,
    set: jest.fn().mockImplementation(function(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }),
    clone: jest.fn().mockReturnThis(),
    distanceTo: jest.fn().mockReturnValue(5)
  })),
  Quaternion: jest.fn().mockImplementation((x = 0, y = 0, z = 0, w = 1) => ({
    x, y, z, w,
    set: jest.fn(),
    clone: jest.fn().mockReturnThis()
  })),
  MathUtils: {
    radToDeg: jest.fn(rad => rad * (180 / Math.PI)),
    degToRad: jest.fn(deg => deg * (Math.PI / 180))
  },
  Scene: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    remove: jest.fn()
  })),
  Object3D: jest.fn().mockImplementation(() => ({
    position: { x: 0, y: 0, z: 0, set: jest.fn() },
    rotation: { x: 0, y: 0, z: 0, set: jest.fn() },
    quaternion: { x: 0, y: 0, z: 0, w: 1, set: jest.fn() },
    add: jest.fn(),
    remove: jest.fn(),
    traverse: jest.fn(callback => callback({ isMesh: true, material: { color: { r: 1, g: 1, b: 1, copy: jest.fn() } } }))
  })),
  Mesh: jest.fn().mockImplementation(() => ({
    position: { x: 0, y: 0, z: 0, set: jest.fn() },
    rotation: { x: 0, y: 0, z: 0, set: jest.fn() },
    quaternion: { x: 0, y: 0, z: 0, w: 1, set: jest.fn() },
    userData: {},
    add: jest.fn(),
    remove: jest.fn(),
    traverse: jest.fn(callback => callback({ isMesh: true, material: { color: { r: 1, g: 1, b: 1, copy: jest.fn() } } }))
  })),
  BoxGeometry: jest.fn(),
  MeshBasicMaterial: jest.fn().mockImplementation(() => ({
    color: { r: 1, g: 1, b: 1, copy: jest.fn() }
  })),
  Color: jest.fn().mockImplementation(() => ({
    r: 1, g: 0, b: 0,
    copy: jest.fn(),
    clone: jest.fn().mockReturnThis()
  }))
};

// Create mock socket
const createMockSocket = () => ({
  on: jest.fn(),
  emit: jest.fn(),
  connected: true,
  getEmittedEvents: jest.fn().mockImplementation((eventName) => {
    return this.emit.mock.calls.filter(call => call[0] === eventName);
  })
});

// Create mock player
const createMockPlayer = (THREE, id = 'test-player-id') => {
  const player = new THREE.Mesh();
  player.position = new THREE.Vector3(0, 0, 0);
  player.rotation = { y: 0 };
  player.quaternion = new THREE.Quaternion();
  player.userData = { 
    stats: { 
      life: 100, 
      maxLife: 100,
      karma: 50,
      maxKarma: 100
    },
    type: 'networkPlayer',
    id
  };
  return player;
};

// Create mock game
const createMockGame = (THREE, mockPlayer) => ({
  scene: new THREE.Scene(),
  localPlayer: mockPlayer,
  localPlayerId: mockPlayer.userData.id,
  playerManager: {
    players: new Map([[mockPlayer.userData.id, mockPlayer]]),
    updatePlayerPosition: jest.fn(),
    updatePlayerRotation: jest.fn(),
    createPlayer: jest.fn().mockResolvedValue(mockPlayer),
    removePlayer: jest.fn()
  },
  uiManager: {
    updateStatusBars: jest.fn(),
    updatePlayerStatus: jest.fn()
  },
  environmentManager: {
    updateWeather: jest.fn(),
    updateTimeOfDay: jest.fn(),
    applyEffects: jest.fn()
  },
  worldState: {
    activeEvents: [],
    worldFlags: {},
    gameTime: 0
  }
});

// Mock NetworkManager methods
const mockNetworkManagerMethods = (networkManager, mockGame) => {
  // Mock removePlayer method
  networkManager.removePlayer = jest.fn();
  
  // Mock applyPendingUpdates method
  networkManager.applyPendingUpdates = jest.fn().mockImplementation((playerId, updates) => {
    const player = mockGame.playerManager.players.get(playerId);
    if (player && updates && updates.length > 0) {
      updates.forEach(update => {
        if (update.type === 'position' && update.position) {
          // Check if player has position property
          if (player.position) {
            player.position.x = update.position.x;
            player.position.y = update.position.y;
            player.position.z = update.position.z;
            if (update.rotation && player.rotation) {
              player.rotation.y = update.rotation.y;
            }
          }
        } else if (update.type === 'life') {
          if (!player.userData.stats) player.userData.stats = {};
          player.userData.stats.life = update.life;
          player.userData.stats.maxLife = update.maxLife;
          
          // Update UI if it's the local player and UI manager exists
          if (playerId === mockGame.localPlayerId && mockGame.uiManager && mockGame.uiManager.updateStatusBars) {
            mockGame.uiManager.updateStatusBars(update.life, update.maxLife);
          }
        } else if (update.type === 'karma') {
          if (!player.userData.stats) player.userData.stats = {};
          player.userData.stats.karma = update.karma;
          player.userData.stats.maxKarma = update.maxKarma;
          
          // Update UI if it's the local player and UI manager exists
          if (playerId === mockGame.localPlayerId && mockGame.uiManager && mockGame.uiManager.updatePlayerStatus) {
            mockGame.uiManager.updatePlayerStatus(update.karma, update.maxKarma);
          }
        }
      });
    }
  });
  
  // Mock emitPlayerMovement method
  networkManager.emitPlayerMovement = jest.fn().mockImplementation(function() {
    if (!this.game || !this.game.localPlayer || !this.socket) return;
    
    this.socket.emit('playerMovement', {
      position: {
        x: this.game.localPlayer.position.x,
        y: this.game.localPlayer.position.y,
        z: this.game.localPlayer.position.z
      },
      rotation: {
        y: this.game.localPlayer.rotation ? this.game.localPlayer.rotation.y : 0
      }
    });
  });
  
  // Mock createNetworkPlayer method
  networkManager.createNetworkPlayer = jest.fn().mockImplementation(async function(playerData) {
    if (!this.game || !this.game.playerManager) return false;
    
    try {
      await this.game.playerManager.createPlayer(
        playerData.id,
        playerData.position,
        playerData.rotation,
        false
      );
      return true;
    } catch (error) {
      console.error(`Error creating network player ${playerData.id}:`, error);
      return false;
    }
  });
  
  // Mock createDamageEffect method
  networkManager.createDamageEffect = jest.fn().mockImplementation(function(targetPlayer, damage, isCritical) {
    if (targetPlayer && targetPlayer.material && targetPlayer.material.color) {
      // Change color to red
      targetPlayer.material.color.r = 1;
      targetPlayer.material.color.g = 0;
      targetPlayer.material.color.b = 0;
      return true;
    }
    return false;
  });
  
  // Mock world state update methods
  networkManager.updateWorldState = jest.fn().mockImplementation(function(worldState) {
    if (!this.game) return;
    
    // Update world state properties
    if (worldState.activeEvents) {
      this.game.worldState.activeEvents = worldState.activeEvents;
    }
    
    if (worldState.worldFlags) {
      this.game.worldState.worldFlags = {
        ...this.game.worldState.worldFlags,
        ...worldState.worldFlags
      };
    }
  });
  
  networkManager.updateEnvironment = jest.fn().mockImplementation(function(environment) {
    if (!this.game || !this.game.environmentManager) return;
    
    // Update environment properties
    if (environment.weather) {
      this.game.environmentManager.updateWeather(environment.weather);
    }
    
    if (environment.timeOfDay) {
      this.game.environmentManager.updateTimeOfDay(environment.timeOfDay);
    }
    
    if (environment.effects) {
      this.game.environmentManager.applyEffects(environment.effects);
    }
  });
  
  networkManager.updateGameTime = jest.fn().mockImplementation(function(gameTime) {
    if (!this.game) return;
    
    // Update game time
    this.game.worldState.gameTime = gameTime;
  });
  
  // Mock event handling method
  networkManager.handleGameEvent = jest.fn();
  
  return networkManager;
};

// Create a batch stats update handler
const createBatchStatsUpdateHandler = () => function(data) {
  // Skip if no players in the update
  if (!data.players || data.players.length === 0) {
    return;
  }
  
  // Process each player's stats
  data.players.forEach(playerData => {
    if (playerData.id) {
      const player = this.game.playerManager.players.get(playerData.id);
      if (player && player.userData) {
        // Initialize stats object if it doesn't exist
        if (!player.userData.stats) {
          player.userData.stats = {};
        }
        
        // Update life if provided
        if (playerData.life !== undefined) {
          player.userData.stats.life = playerData.life;
          player.userData.stats.maxLife = playerData.maxLife || player.userData.stats.maxLife || 100;
          
          // Update UI if it's the local player
          if (playerData.id === this.game.localPlayerId && this.game.uiManager && this.game.uiManager.updateStatusBars) {
            this.game.uiManager.updateStatusBars(
              player.userData.stats.life,
              player.userData.stats.maxLife
            );
          }
        }
        
        // Update karma if provided
        if (playerData.karma !== undefined) {
          player.userData.stats.karma = playerData.karma;
          player.userData.stats.maxKarma = playerData.maxKarma || player.userData.stats.maxKarma || 100;
          
          // Update UI if it's the local player
          if (playerData.id === this.game.localPlayerId && this.game.uiManager && this.game.uiManager.updatePlayerStatus) {
            this.game.uiManager.updatePlayerStatus(
              player.userData.stats.karma,
              player.userData.stats.maxKarma
            );
          }
        }
      }
    }
  });
};

// Create event handlers for common network events
const createEventHandlers = () => {
  const handlers = {};
  
  // Position correction handler
  handlers.positionCorrection = function(correctionData) {
    if (!correctionData || !correctionData.position || !this.game || !this.game.localPlayer) return;
    
    // Apply the server position directly (server authority)
    this.game.localPlayer.position.set(
      correctionData.position.x,
      correctionData.position.y,
      correctionData.position.z
    );
    
    // Apply rotation if provided
    if (correctionData.rotation !== undefined) {
      this.game.localPlayer.rotation.y = correctionData.rotation;
    }
    
    console.log(`Server correction applied, distance: ${
      Math.sqrt(
        Math.pow(this.lastPositionUpdate.x - correctionData.position.x, 2) +
        Math.pow(this.lastPositionUpdate.y - correctionData.position.y, 2) +
        Math.pow(this.lastPositionUpdate.z - correctionData.position.z, 2)
      )
    }`);
  };
  
  // Life update handler
  handlers.lifeUpdate = function(data) {
    if (!data || !data.id || !this.game || !this.game.playerManager) return;
    
    const player = this.game.playerManager.players.get(data.id);
    if (player && player.userData) {
      // Initialize stats object if it doesn't exist
      if (!player.userData.stats) {
        player.userData.stats = {};
      }
      
      // Update life
      player.userData.stats.life = data.life;
      
      // Update UI if it's the local player
      if (data.id === this.game.localPlayerId && this.game.uiManager && this.game.uiManager.updateStatusBars) {
        this.game.uiManager.updateStatusBars(
          player.userData.stats.life,
          player.userData.stats.maxLife || 100
        );
      }
    }
  };
  
  // Player left handler
  handlers.playerLeft = function(data) {
    if (!data || !data.id || !this.game || !this.game.playerManager) return;
    this.removePlayer(data.id);
  };
  
  // Batch position update handler
  handlers.batchPositionUpdate = function(data) {
    if (!data || !data.players || !this.game || !this.game.playerManager) return;
    
    data.players.forEach(playerData => {
      if (playerData.id && playerData.position) {
        const player = this.game.playerManager.players.get(playerData.id);
        if (player && player.position) {
          // Apply server position directly (server authority)
          player.position.set(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
          );
          
          // Apply rotation if provided
          if (playerData.rotation !== undefined && player.rotation) {
            player.rotation.y = playerData.rotation;
          }
        }
      }
    });
  };
  
  // Batch state update handler
  handlers.batchStateUpdate = function(data) {
    if (!data || !data.players || !this.game || !this.game.playerManager) return;
    
    data.players.forEach(playerData => {
      if (playerData.id) {
        const player = this.game.playerManager.players.get(playerData.id);
        if (player && player.userData) {
          // Initialize stats object if it doesn't exist
          if (!player.userData.stats) {
            player.userData.stats = {};
          }
          
          // Apply all server-provided stats
          Object.keys(playerData).forEach(key => {
            if (key !== 'id') {
              player.userData.stats[key] = playerData[key];
              
              // Update UI if it's the local player
              if (playerData.id === this.game.localPlayerId && this.game.uiManager) {
                if (key === 'life' && this.game.uiManager.updateStatusBars) {
                  this.game.uiManager.updateStatusBars(
                    player.userData.stats.life,
                    player.userData.stats.maxLife || 100
                  );
                } else if (key === 'karma' && this.game.uiManager.updatePlayerStatus) {
                  this.game.uiManager.updatePlayerStatus(
                    player.userData.stats.karma,
                    player.userData.stats.maxKarma || 100
                  );
                }
              }
            }
          });
        }
      }
    });
  };
  
  // Batch damage handler
  handlers.batchDamageUpdate = function(data) {
    if (!data || !data.damages || !this.game || !this.game.playerManager) return;
    
    data.damages.forEach(damageData => {
      if (damageData.targetId) {
        const player = this.game.playerManager.players.get(damageData.targetId);
        if (player && player.userData && player.userData.stats) {
          // Apply damage to player
          const currentLife = player.userData.stats.life;
          player.userData.stats.life = Math.max(0, currentLife - damageData.amount);
          
          // Create visual damage effect
          this.createDamageEffect(player, damageData.amount, damageData.isCritical);
          
          // Update UI if it's the local player
          if (damageData.targetId === this.game.localPlayerId && this.game.uiManager && this.game.uiManager.updateStatusBars) {
            this.game.uiManager.updateStatusBars(
              player.userData.stats.life,
              player.userData.stats.maxLife || 100
            );
          }
        }
      }
    });
  };
  
  // World state update handler
  handlers.worldStateUpdate = function(data) {
    if (!data || !this.game) return;
    
    // Update overall world state
    if (data.worldState) {
      this.updateWorldState(data.worldState);
    }
    
    // Update environment
    if (data.environment) {
      this.updateEnvironment(data.environment);
    }
    
    // Update game time
    if (data.gameTime !== undefined) {
      this.updateGameTime(data.gameTime);
    }
  };
  
  // Player spawn handler
  handlers.playerSpawn = async function(spawnData) {
    if (!spawnData || !spawnData.players || !Array.isArray(spawnData.players) || !this.game) return;
    
    // Process each player spawn
    for (const playerData of spawnData.players) {
      if (playerData.id) {
        // Create the network player
        await this.createNetworkPlayer(playerData);
      }
    }
  };
  
  return handlers;
};

module.exports = {
  mockTHREE,
  createMockSocket,
  createMockPlayer,
  createMockGame,
  mockNetworkManagerMethods,
  createBatchStatsUpdateHandler,
  createEventHandlers
}; 