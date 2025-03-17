/**
 * Mock implementation of NPCManager for testing
 */

export class MockNPCManager {
  constructor(game) {
    this.game = game;
    this.npcs = new Map();
    this.initialized = false;
    this.interactionDistance = 5;
    this.dialogueDistance = 3;
    this.activeNPC = null;
    this.isDialogueActive = false;
  }
  
  init() {
    this.initialized = true;
    
    // Set up socket listeners if network manager exists
    if (this.game.networkManager && this.game.networkManager.socket) {
      this.game.networkManager.socket.on('server_npcs', this.processServerNPCs.bind(this));
    }
  }
  
  createNPC(id, type, position, rotation = { y: 0 }) {
    if (this.npcs.has(id)) {
      console.warn(`NPC with ID ${id} already exists.`);
      return this.npcs.get(id);
    }
    
    const npc = {
      id,
      type,
      position: { 
        x: position.x || 0, 
        y: position.y || 0, 
        z: position.z || 0,
        set: jest.fn()
      },
      rotation: { y: rotation.y || 0, set: jest.fn() },
      add: jest.fn(),
      remove: jest.fn(),
      children: [],
      traverse: jest.fn(),
      userData: {
        isNPC: true,
        type,
        interactable: true,
        dialogues: []
      },
      visible: true
    };
    
    this.npcs.set(id, npc);
    this.game.scene.add(npc);
    
    return npc;
  }
  
  removeNPC(id) {
    if (this.npcs.has(id)) {
      const npc = this.npcs.get(id);
      this.game.scene.remove(npc);
      this.npcs.delete(id);
    }
  }
  
  processServerNPCs(npcData) {
    if (!Array.isArray(npcData)) return;
    
    // Clear existing NPCs
    this.npcs.forEach((npc, id) => {
      this.removeNPC(id);
    });
    
    // Create new NPCs from server data
    npcData.forEach(data => {
      this.createNPC(data.id, data.type, data.position, data.rotation);
    });
  }
  
  updateNPCs(deltaTime) {
    // Update NPC positions, animations, etc.
    this.npcs.forEach(npc => {
      // Implement NPC behavior here
    });
    
    // Check for player-NPC interactions
    this.checkInteractions();
  }
  
  checkInteractions() {
    if (!this.game.playerManager || !this.game.playerManager.localPlayer) return;
    
    const playerPos = this.game.playerManager.localPlayer.position;
    let closestNPC = null;
    let closestDistance = Infinity;
    
    // Find the closest NPC within interaction distance
    this.npcs.forEach(npc => {
      const dx = npc.position.x - playerPos.x;
      const dy = npc.position.y - playerPos.y;
      const dz = npc.position.z - playerPos.z;
      const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
      
      if (distance < this.interactionDistance && distance < closestDistance) {
        closestDistance = distance;
        closestNPC = npc;
      }
    });
    
    // Handle interaction with closest NPC
    if (closestNPC) {
      if (closestDistance <= this.dialogueDistance) {
        // Show dialogue if close enough
        if (!this.isDialogueActive) {
          this.showDialogue(closestNPC);
        }
      } else {
        // Show interaction label if within interaction distance but not dialogue distance
        this.game.uiManager.showInteractionLabel(closestNPC.id, closestNPC.type);
      }
    } else {
      // Hide all interaction labels if no NPC is close enough
      this.npcs.forEach(npc => {
        this.game.uiManager.hideInteractionLabel(npc.id);
      });
      
      // Hide dialogue if active
      if (this.isDialogueActive) {
        this.hideDialogue();
      }
    }
  }
  
  showDialogue(npc) {
    this.activeNPC = npc;
    this.isDialogueActive = true;
    
    // Get dialogue for this NPC type
    const dialogue = this.getDialogueForNPC(npc.type);
    
    // Show dialogue in UI
    this.game.uiManager.showDialogue(npc.type, dialogue);
    
    // Hide interaction label
    this.game.uiManager.hideInteractionLabel(npc.id);
  }
  
  hideDialogue() {
    this.isDialogueActive = false;
    this.activeNPC = null;
    
    // Hide dialogue in UI
    this.game.uiManager.hideDialogue();
  }
  
  getDialogueForNPC(npcType) {
    // Mock dialogues for different NPC types
    const dialogues = {
      merchant: "Welcome to my shop! What would you like to buy?",
      guard: "Halt! State your business.",
      villager: "Hello there, traveler!",
      quest_giver: "I have a task for you, if you're interested."
    };
    
    return dialogues[npcType] || "...";
  }
  
  cleanup() {
    // Remove socket listeners
    if (this.game.networkManager && this.game.networkManager.socket) {
      this.game.networkManager.socket.off('server_npcs', this.processServerNPCs);
    }
    
    // Clear all NPCs
    this.npcs.forEach((npc, id) => {
      this.removeNPC(id);
    });
  }
} 