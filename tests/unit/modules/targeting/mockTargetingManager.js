/**
 * Mock implementation of TargetingManager for testing
 */

export class MockTargetingManager {
  constructor(game) {
    this.game = game;
    this.raycaster = {
      setFromCamera: jest.fn(),
      intersectObjects: jest.fn().mockReturnValue([])
    };
    this.mouse = { x: 0, y: 0 };
    this.currentTarget = null;
    this.targetIndicator = {
      position: { x: 0, y: 0, z: 0, copy: jest.fn() },
      visible: false
    };
    this.maxTargetDistance = 50;
    this.initialized = false;
    this.targetableTypes = ['player', 'npc', 'enemy'];
    
    // Bind methods
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseClick = this.handleMouseClick.bind(this);
    
    // Server authority methods
    this.validateTargetWithServer = jest.fn().mockImplementation((target) => {
      if (this.game && this.game.networkManager && this.game.networkManager.validateActionWithServer) {
        return this.game.networkManager.validateActionWithServer({
          type: 'target_select',
          targetId: target.id,
          targetType: target.userData ? target.userData.type : 'unknown'
        });
      }
      return true;
    });
    
    this.handleServerTargetConfirmation = jest.fn().mockImplementation((response) => {
      if (response.success) {
        const target = this.findTargetById(response.targetId);
        if (target) {
          this.setTarget(target);
          return true;
        }
      }
      return false;
    });
    
    this.handleServerTargetRejection = jest.fn().mockImplementation((response) => {
      this.log(`Target rejected by server: ${response.reason}`);
      this.clearTarget();
      return true;
    });
    
    this.synchronizeTargetWithServer = jest.fn().mockImplementation(() => {
      if (this.game && this.game.networkManager) {
        this.game.networkManager.requestCurrentTarget();
        return true;
      }
      return false;
    });
    
    this.applyServerTargetUpdate = jest.fn().mockImplementation((data) => {
      if (data.targetId) {
        const target = this.findTargetById(data.targetId);
        if (target) {
          this.setTarget(target);
          return true;
        }
      } else {
        this.clearTarget();
        return true;
      }
      return false;
    });
    
    this.handleServerForcedTarget = jest.fn().mockImplementation((data) => {
      if (!data || !data.targetId) return false;
      
      // Find the target object
      const targetObject = this.game.playerManager.getPlayerById(data.targetId);
      if (!targetObject) return false;
      
      // Set as current target
      this.currentTarget = targetObject;
      this.targetIndicator.visible = true;
      this.targetIndicator.position.copy(targetObject.position);
      
      return true;
    });
  }
  
  init() {
    this.log('Initializing TargetingManager');
    
    // Create target indicator
    this.createTargetIndicator();
    
    // Set up event listeners
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('click', this.handleMouseClick);
    
    this.initialized = true;
    this.log('TargetingManager initialized');
  }
  
  createTargetIndicator() {
    // In the mock, we just create a simple object
    this.targetIndicator = {
      position: { x: 0, y: 0, z: 0, copy: jest.fn() },
      visible: false,
      scale: { x: 1, y: 1, z: 1 }
    };
    
    // Add to scene
    this.game.scene.add(this.targetIndicator);
  }
  
  handleMouseMove(event) {
    // Update mouse position
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }
  
  handleMouseClick(event) {
    // Handle targeting on click
    this.handleTargeting();
  }
  
  handleTargeting(mousePosition = this.mouse) {
    this.log(`Handling targeting with mouse position: ${mousePosition}`);
    
    // Set up raycaster
    this.raycaster.setFromCamera(mousePosition, this.game.cameraManager.camera);
    
    // Get all targetable objects
    const targetableObjects = this.getTargetableObjects();
    
    // Find intersections
    const intersects = this.raycaster.intersectObjects(targetableObjects, true);
    
    if (intersects.length > 0) {
      // Get the first intersection
      const intersection = intersects[0];
      
      // Find the root object (player, NPC, etc.)
      const targetObject = this.findTargetableParent(intersection.object);
      
      if (targetObject) {
        // Check if target is within range
        if (this.isWithinRange(targetObject)) {
          // Validate target with server before setting
          const isValid = this.validateTargetWithServer(targetObject);
          if (isValid) {
            this.setTarget(targetObject);
            return targetObject;
          } else {
            this.log('Target validation failed');
            return null;
          }
        }
      }
    }
    
    // No valid target found
    this.log('No target found, clearing current target');
    this.clearTarget();
    return null;
  }
  
  getTargetableObjects() {
    const targetableObjects = [];
    
    // Add players
    if (this.game.playerManager) {
      this.game.playerManager.players.forEach(player => {
        if (player.id !== this.game.localPlayerId) {
          targetableObjects.push(player);
        }
      });
    }
    
    // Add NPCs
    if (this.game.npcManager) {
      this.game.npcManager.npcs.forEach(npc => {
        targetableObjects.push(npc);
      });
    }
    
    return targetableObjects;
  }
  
  findTargetableParent(object) {
    // Traverse up the object hierarchy to find a targetable parent
    let current = object;
    
    while (current) {
      if (current.userData && 
          (current.userData.isPlayer || 
           current.userData.isNPC || 
           current.userData.isEnemy)) {
        return current;
      }
      
      current = current.parent;
    }
    
    return null;
  }
  
  isWithinRange(targetObject) {
    if (!this.game.playerManager || !this.game.playerManager.localPlayer) {
      return false;
    }
    
    const playerPos = this.game.playerManager.localPlayer.position;
    const targetPos = targetObject.position;
    
    // Calculate distance
    const dx = targetPos.x - playerPos.x;
    const dy = targetPos.y - playerPos.y;
    const dz = targetPos.z - playerPos.z;
    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
    
    return distance <= this.maxTargetDistance;
  }
  
  setTarget(target) {
    this.log(`Setting target: ${target} with ID: ${target ? target.id : undefined}`);
    
    // Validate target with server if available
    if (this.validateTargetWithServer && target) {
      const isValid = this.validateTargetWithServer(target);
      if (!isValid) {
        this.log('Target validation failed');
        return false;
      }
    }
    
    // Set current target
    this.currentTarget = target;
    
    // Update target indicator
    if (target) {
      this.targetIndicator.visible = true;
      this.targetIndicator.position.copy(target.position);
      
      // Adjust indicator position to be at the target's feet
      this.targetIndicator.position.y = 0.1;
    }
    
    return true;
  }
  
  clearTarget() {
    this.log('Clearing target');
    
    // Clear current target
    this.currentTarget = null;
    
    // Hide target indicator
    this.targetIndicator.visible = false;
  }
  
  update(deltaTime) {
    if (!this.initialized) return;
    
    // Update target indicator position if we have a target
    if (this.currentTarget) {
      this.targetIndicator.position.copy(this.currentTarget.position);
      this.targetIndicator.position.y = 0.1;
    }
  }
  
  cleanup() {
    // Remove event listeners
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('click', this.handleMouseClick);
    
    // Remove target indicator from scene
    if (this.targetIndicator && this.game.scene) {
      this.game.scene.remove(this.targetIndicator);
    }
    
    // Clear current target
    this.clearTarget();
  }
  
  log(message) {
    console.log(message);
  }
  
  findTargetById(targetId) {
    // Find target by ID from all targetable objects
    const targetableObjects = this.getTargetableObjects();
    return targetableObjects.find(obj => obj.id === targetId);
  }
} 