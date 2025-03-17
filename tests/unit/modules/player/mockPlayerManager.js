/**
 * Mock implementation of PlayerManager for testing
 */

export class MockPlayerManager {
  constructor(game) {
    this.game = game;
    this.players = new Map();
    this.localPlayer = null;
    this.initialized = false;
  }
  
  init() {
    this.initialized = true;
  }
  
  createLocalPlayer(playerData) {
    const player = this.createPlayer(playerData.id, playerData.position, playerData.rotation, true);
    this.localPlayer = player;
    return player;
  }
  
  createNetworkPlayer(playerData) {
    return this.createPlayer(playerData.id, playerData.position, playerData.rotation, false);
  }
  
  createPlayer(id, position, rotation = { y: 0 }, isLocal = false) {
    if (this.players.has(id)) {
      console.warn(`Player with ID ${id} already exists.`);
      return this.players.get(id);
    }
    
    const player = {
      id,
      position: { 
        x: position?.x || 0, 
        y: position?.y || 0, 
        z: position?.z || 0,
        set: jest.fn()
      },
      rotation: { y: rotation?.y || 0, set: jest.fn() },
      add: jest.fn(),
      remove: jest.fn(),
      children: [],
      traverse: jest.fn(),
      userData: {
        stats: {
          life: 100,
          maxLife: 100,
          karma: 50,
          maxKarma: 100,
          level: 1,
          experience: 0
        },
        isPlayer: true,
        isDead: false,
        isMoving: false,
        lastDamageTime: 0
      },
      healthBar: {
        mesh: { position: { set: jest.fn() } },
        update: jest.fn()
      },
      nameTag: {
        mesh: { position: { set: jest.fn() } }
      },
      visible: true
    };
    
    this.players.set(id, player);
    this.game.scene.add(player);
    
    return player;
  }
  
  removePlayer(id) {
    if (this.players.has(id)) {
      const player = this.players.get(id);
      this.game.scene.remove(player);
      this.players.delete(id);
    }
  }
  
  updatePlayerHealth(id, health) {
    if (this.players.has(id)) {
      const player = this.players.get(id);
      player.userData.stats.life = health;
    }
  }
  
  damagePlayer(id, damage) {
    if (this.players.has(id)) {
      const player = this.players.get(id);
      player.userData.stats.life = Math.max(0, player.userData.stats.life - damage);
      
      if (player.userData.stats.life <= 0) {
        player.userData.isDead = true;
        if (id === this.game.localPlayerId) {
          this.game.uiManager.showDeathScreen();
        }
      }
      
      this.game.uiManager.updateStatusBars(
        player.userData.stats.life,
        player.userData.stats.maxLife,
        player.userData.stats.karma,
        player.userData.stats.maxKarma
      );
    }
  }
  
  respawnPlayer(id, position) {
    if (this.players.has(id)) {
      const player = this.players.get(id);
      player.userData.isDead = false;
      player.userData.stats.life = player.userData.stats.maxLife;
      
      if (position) {
        player.position.x = position.x;
        player.position.y = position.y;
        player.position.z = position.z;
      }
      
      if (id === this.game.localPlayerId) {
        this.game.uiManager.hideDeathScreen();
      }
    }
  }
  
  updateStatusBars(id) {
    if (this.players.has(id)) {
      const player = this.players.get(id);
      this.game.uiManager.updateStatusBars(
        player.userData.stats.life,
        player.userData.stats.maxLife,
        player.userData.stats.karma,
        player.userData.stats.maxKarma
      );
    }
  }
  
  updateHealthBarPosition(player) {
    if (player && player.healthBar && player.healthBar.mesh) {
      player.healthBar.mesh.position.set(
        player.position.x,
        player.position.y + 2.5,
        player.position.z
      );
    }
  }
  
  updateNameTagPosition(player) {
    if (player && player.nameTag && player.nameTag.mesh) {
      player.nameTag.mesh.position.set(
        player.position.x,
        player.position.y + 3,
        player.position.z
      );
    }
  }
  
  applyServerUpdate(id, updateData) {
    if (!this.players.has(id)) return;
    
    const player = this.players.get(id);
    
    switch (updateData.type) {
      case 'position':
        if (updateData.position) {
          player.position.set(
            updateData.position.x,
            updateData.position.y,
            updateData.position.z
          );
        }
        if (updateData.rotation) {
          player.rotation.y = updateData.rotation.y;
        }
        break;
        
      case 'health':
        player.userData.stats.life = updateData.life;
        player.userData.stats.maxLife = updateData.maxLife;
        this.game.uiManager.updateStatusBars(
          player.userData.stats.life,
          player.userData.stats.maxLife,
          player.userData.stats.karma,
          player.userData.stats.maxKarma
        );
        break;
        
      case 'death':
        player.userData.isDead = updateData.isDead;
        if (updateData.isDead) {
          player.userData.stats.life = 0;
          if (id === this.game.localPlayerId) {
            this.game.uiManager.showDeathScreen();
          }
        }
        break;
        
      case 'stats':
        Object.assign(player.userData.stats, updateData.stats);
        break;
    }
  }
  
  handleReconnection(reconnectData) {
    this.players.clear();
    
    if (reconnectData.players) {
      reconnectData.players.forEach(playerData => {
        const player = this.createPlayer(
          playerData.id,
          playerData.position,
          playerData.rotation
        );
        
        if (playerData.stats) {
          Object.assign(player.userData.stats, playerData.stats);
        }
      });
    }
    
    if (reconnectData.localPlayerId && this.players.has(reconnectData.localPlayerId)) {
      this.localPlayer = this.players.get(reconnectData.localPlayerId);
    }
  }
  
  handlePlayerDisconnect(playerId) {
    this.removePlayer(playerId);
  }
  
  sendPlayerState() {
    this.game.networkManager.sendPlayerState();
  }
  
  applyPendingUpdates(playerId, updates) {
    this.game.networkManager.applyPendingUpdates(playerId, updates);
  }
} 