/**
 * Mock implementation of UIManager for testing
 */

export class MockUIManager {
  constructor(game) {
    this.game = game;
    this.initialized = false;
    this.statusBars = {
      health: { value: 100, max: 100 },
      karma: { value: 50, max: 100 }
    };
    this.isDeathScreenVisible = false;
    this.isDialogueVisible = false;
    this.interactionLabels = new Map();
    this.notifications = [];
  }
  
  init() {
    this.initialized = true;
  }
  
  updateStatusBars(health, maxHealth, karma, maxKarma) {
    this.statusBars.health.value = health;
    this.statusBars.health.max = maxHealth;
    this.statusBars.karma.value = karma;
    this.statusBars.karma.max = maxKarma;
  }
  
  showDeathScreen() {
    this.isDeathScreenVisible = true;
  }
  
  hideDeathScreen() {
    this.isDeathScreenVisible = false;
  }
  
  createHealthBar(player) {
    return {
      mesh: { position: { set: jest.fn() } },
      update: jest.fn(),
      setHealth: jest.fn()
    };
  }
  
  createNameTag(player, name) {
    return {
      mesh: { position: { set: jest.fn() } },
      update: jest.fn(),
      setName: jest.fn()
    };
  }
  
  showDialogue(npcType, dialogueText) {
    this.isDialogueVisible = true;
    this.currentDialogue = {
      npcType,
      text: dialogueText
    };
  }
  
  hideDialogue() {
    this.isDialogueVisible = false;
    this.currentDialogue = null;
  }
  
  showInteractionLabel(id, text) {
    this.interactionLabels.set(id, text);
  }
  
  hideInteractionLabel(id) {
    this.interactionLabels.delete(id);
  }
  
  showNotification(message, type = 'info') {
    this.notifications.push({
      message,
      type,
      timestamp: Date.now()
    });
  }
  
  clearNotifications() {
    this.notifications = [];
  }
  
  updatePlayerList(players) {
    this.playerList = players;
  }
  
  updateMinimap(playerPosition) {
    this.minimapPosition = playerPosition;
  }
  
  toggleInventory() {
    this.isInventoryVisible = !this.isInventoryVisible;
  }
  
  toggleSkills() {
    this.isSkillsVisible = !this.isSkillsVisible;
  }
  
  toggleSettings() {
    this.isSettingsVisible = !this.isSettingsVisible;
  }
} 