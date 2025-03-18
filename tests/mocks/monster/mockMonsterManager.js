/**
 * Mock MonsterManager for testing
 */
export class MockMonsterManager {
  constructor(game) {
    this.game = game;
    this.monsters = new Map();
    this.monsterModels = {};
    this.initialized = false;
    
    // Add spy functions for testing
    this.log = jest.fn();
    this.init = jest.fn().mockImplementation(async () => {
      this.log('Initializing Monster Manager');
      this.initialized = true;
      this.log('Monster Manager initialized');
      return Promise.resolve();
    });
    
    this.preloadMonsterModels = jest.fn().mockImplementation(async () => {
      this.log('Preloading monster models');
      this.monsterModels['BASIC'] = this.createMockModel();
      this.monsterModels['basic'] = this.monsterModels['BASIC'];
      this.log('Monster models preloaded');
      return Promise.resolve();
    });
    
    this.handleAttack = jest.fn();
    
    this.processServerMonsters = jest.fn().mockImplementation((monsterData) => {
      this.log(`Processing server monsters: ${monsterData.length}`);
      
      // Track existing monsters to find ones that should be removed
      const existingMonsterIds = new Set(this.monsters.keys());
      
      // Process each monster from the server data
      monsterData.forEach(monster => {
        existingMonsterIds.delete(monster.id);
        
        if (this.monsters.has(monster.id)) {
          this.updateMonster(monster);
        } else {
          this.createMonster(monster);
        }
      });
      
      // Remove monsters that no longer exist
      existingMonsterIds.forEach(id => {
        this.removeMonster(id);
      });
    });
    
    this.createMonster = jest.fn().mockImplementation((monsterData) => {
      this.log(`Creating monster: ${monsterData.type} with ID ${monsterData.id}`);
      
      const monster = {
        id: monsterData.id,
        type: monsterData.type || 'BASIC',
        mesh: this.createMockMesh(),
        health: monsterData.health || 100,
        maxHealth: monsterData.maxHealth || 100,
        position: monsterData.position || { x: 0, y: 0, z: 0 },
        collisionRadius: monsterData.collisionRadius || 1
      };
      
      this.monsters.set(monsterData.id, monster);
      return monster;
    });
    
    this.createHealthBar = jest.fn().mockImplementation(() => {
      return {
        position: { set: jest.fn() },
        userData: { isBillboard: true },
        children: [{ position: { x: 0 }, scale: { x: 1 } }]
      };
    });
    
    this.updateMonster = jest.fn().mockImplementation((monsterData) => {
      const monster = this.monsters.get(monsterData.id);
      if (!monster) {
        this.log(`Monster ${monsterData.id} not found for update`);
        return;
      }
      
      // Update position
      if (monsterData.position) {
        monster.position = {
          x: monsterData.position.x,
          y: monsterData.position.y + 2.0, // Match the height adjustment in the real manager
          z: monsterData.position.z
        };
      }
      
      // Update health
      if (monsterData.health !== undefined) {
        monster.health = monsterData.health;
        monster.maxHealth = monsterData.maxHealth || monster.maxHealth;
      }
    });
    
    this.updateHealthBar = jest.fn();
    
    this.processMonsterUpdate = jest.fn().mockImplementation((updateData) => {
      const monsterId = updateData.monsterId;
      if (!monsterId) return;
      
      const monster = this.monsters.get(monsterId);
      if (!monster) {
        this.log(`Monster ${monsterId} not found for update`);
        return;
      }
      
      // Update health if provided
      if (updateData.health !== undefined) {
        monster.health = updateData.health;
        this.updateHealthBar(monster);
        
        // If this monster is currently targeted, update the target display
        const currentTarget = this.game?.targetingManager?.currentTarget;
        if (currentTarget && currentTarget.type === 'monster' && currentTarget.id === monsterId) {
          if (monster.health <= 0) {
            // When monster dies, immediately clear the target
            this.game?.targetingManager?.clearTarget();
          } else {
            // Update the target display with new health
            this.game?.uiManager?.updateTargetDisplay(
              `${monster.type} Monster`,
              monster.health,
              monster.maxHealth,
              'monster',
              1
            );
          }
        }
      }
      
      // Handle monster death
      if (updateData.health <= 0 || updateData.isAlive === false) {
        this.handleMonsterDeath(monsterId);
      }
    });
    
    this.handleMonsterDeath = jest.fn().mockImplementation((monsterId) => {
      const monster = this.monsters.get(monsterId);
      if (!monster) return;
      
      this.log(`Handling monster death: ${monsterId}`);
      monster.health = 0;
      this.updateHealthBar(monster);
      
      // Schedule removal
      setTimeout(() => {
        this.removeMonster(monsterId);
      }, 2000);
    });
    
    this.removeMonster = jest.fn().mockImplementation((monsterId) => {
      const monster = this.monsters.get(monsterId);
      if (!monster) return;
      
      this.log(`Removing monster: ${monsterId}`);
      this.monsters.delete(monsterId);
    });
    
    this.getMonsterById = jest.fn().mockImplementation((id) => {
      return this.monsters.get(id);
    });
    
    this.update = jest.fn();
    this.cleanup = jest.fn().mockImplementation(() => {
      this.monsters.clear();
    });
  }
  
  createMockModel() {
    return {
      clone: () => ({
        position: { set: jest.fn() },
        rotation: { set: jest.fn() },
        scale: { set: jest.fn() },
        traverse: jest.fn(cb => cb({ 
          isMesh: true, 
          material: { 
            clone: () => ({
              transparent: false,
              opacity: 1,
              metalness: 0.6,
              roughness: 0.4
            })
          },
          castShadow: false,
          receiveShadow: false 
        })),
        add: jest.fn(),
        userData: {}
      })
    };
  }
  
  createMockMesh() {
    return {
      position: { set: jest.fn(), x: 0, y: 0, z: 0 },
      rotation: { set: jest.fn(), y: 0 },
      scale: { set: jest.fn() },
      traverse: jest.fn(),
      add: jest.fn(),
      userData: {
        healthBar: { position: { set: jest.fn() }, userData: { isBillboard: true } },
        healthBarInner: { scale: { x: 1 }, position: { x: 0 } }
      }
    };
  }
}

export default MockMonsterManager; 