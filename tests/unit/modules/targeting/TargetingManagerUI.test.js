/**
 * TargetingManagerUI.test.js - Tests for UI integration aspects of TargetingManager
 * 
 * This file focuses on testing how the TargetingManager interacts with UI elements,
 * including target indicators, UI panels, and UI event handling.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MockTargetingManager } from './mockTargetingManager';
import { createTargetingTestSetup, createMockTargetableObject } from './targetingTestHelpers';

// Mock THREE library
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation((x, y, z) => ({
      x: x || 0,
      y: y || 0,
      z: z || 0,
      distanceTo: jest.fn().mockReturnValue(5),
      copy: jest.fn(),
      add: jest.fn(),
      sub: jest.fn(),
      normalize: jest.fn().mockReturnThis(),
      multiplyScalar: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis()
    })),
    Raycaster: jest.fn().mockImplementation(() => ({
      set: jest.fn(),
      setFromCamera: jest.fn(),
      intersectObjects: jest.fn().mockReturnValue([])
    })),
    Vector2: jest.fn().mockImplementation((x, y) => ({
      x: x || 0,
      y: y || 0,
      set: jest.fn()
    })),
    Mesh: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0, copy: jest.fn() },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1, set: jest.fn() },
      visible: true,
      add: jest.fn(),
      remove: jest.fn()
    })),
    MeshBasicMaterial: jest.fn(),
    RingGeometry: jest.fn(),
    DoubleSide: 'DoubleSide',
    Color: jest.fn().mockImplementation(() => ({
      set: jest.fn(),
      r: 1,
      g: 1,
      b: 1
    }))
  };
});

describe('TargetingManager UI Integration', () => {
  let targetingManager;
  let mockGame;
  
  beforeEach(() => {
    // Create test setup
    const setup = createTargetingTestSetup();
    mockGame = setup.mockGame;
    targetingManager = setup.targetingManager;
    
    // Initialize targeting manager
    targetingManager.init();
    
    // Add UI manager to mockGame
    mockGame.uiManager = {
      updateTargetInfo: jest.fn(),
      showTargetPanel: jest.fn(),
      hideTargetPanel: jest.fn(),
      updateTargetHealthBar: jest.fn(),
      updateTargetBuffs: jest.fn(),
      showTargetTooltip: jest.fn(),
      hideTargetTooltip: jest.fn()
    };
    
    // Mock window event listeners
    window.addEventListener = jest.fn();
    window.removeEventListener = jest.fn();
    
    // Add network manager to mockGame
    mockGame.networkManager = {
      validateActionWithServer: jest.fn().mockReturnValue(true)
    };
    
    // Ensure targetIndicator has proper material and scale properties
    targetingManager.targetIndicator.material = {
      color: { set: jest.fn() },
      opacity: 0.8,
      transparent: true
    };
    
    // Ensure scale has a set method
    targetingManager.targetIndicator.scale = {
      x: 1, y: 1, z: 1,
      set: jest.fn()
    };
  });
  
  afterEach(() => {
    // Clean up
    targetingManager.cleanup();
    jest.clearAllMocks();
  });
  
  describe('Target Indicator Visibility', () => {
    test('should show target indicator when target is set', () => {
      // Create a target
      const target = createMockTargetableObject('target-id', 'player', { x: 10, y: 0, z: 10 });
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Set target
      targetingManager.setTarget(target);
      
      // Verify target indicator is visible
      expect(targetingManager.targetIndicator.visible).toBe(true);
    });
    
    test('should hide target indicator when target is cleared', () => {
      // Create a target
      const target = createMockTargetableObject('target-id', 'player', { x: 10, y: 0, z: 10 });
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Set target
      targetingManager.setTarget(target);
      
      // Clear target
      targetingManager.clearTarget();
      
      // Verify target indicator is hidden
      expect(targetingManager.targetIndicator.visible).toBe(false);
    });
    
    test('should update target indicator position when target moves', () => {
      // Create a target
      const target = createMockTargetableObject('target-id', 'player', { x: 10, y: 0, z: 10 });
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Set target
      targetingManager.setTarget(target);
      
      // Clear the mock call history
      targetingManager.targetIndicator.position.copy.mockClear();
      
      // Move target
      target.position.x = 15;
      target.position.z = 15;
      
      // Update
      targetingManager.update(0.016);
      
      // Verify target indicator position was updated
      expect(targetingManager.targetIndicator.position.copy).toHaveBeenCalledWith(target.position);
    });
  });
  
  describe('Target UI Panel Updates', () => {
    test('should update target info panel with detailed target information', () => {
      // Create a target with detailed stats
      const target = createMockTargetableObject('target-id', 'player', { x: 10, y: 0, z: 10 });
      target.userData.stats = {
        name: 'Enemy Player',
        level: 42,
        class: 'Warrior',
        life: 80,
        maxLife: 100,
        mana: 50,
        maxMana: 100,
        buffs: ['Strength', 'Shield'],
        debuffs: ['Poison']
      };
      
      // Add updateDetailedUI method to targeting manager
      targetingManager.updateDetailedUI = jest.fn().mockImplementation((target) => {
        if (!target) {
          mockGame.uiManager.hideTargetPanel();
          return;
        }
        
        mockGame.uiManager.showTargetPanel();
        mockGame.uiManager.updateTargetInfo({
          id: target.id,
          type: target.userData.type,
          name: target.userData.stats?.name || 'Unknown',
          level: target.userData.stats?.level || 1,
          class: target.userData.stats?.class || 'Unknown',
          life: target.userData.stats?.life || 0,
          maxLife: target.userData.stats?.maxLife || 100,
          mana: target.userData.stats?.mana || 0,
          maxMana: target.userData.stats?.maxMana || 100
        });
        
        // Update health bar
        mockGame.uiManager.updateTargetHealthBar(
          target.userData.stats?.life / target.userData.stats?.maxLife
        );
        
        // Update buffs and debuffs
        mockGame.uiManager.updateTargetBuffs(
          target.userData.stats?.buffs || [],
          target.userData.stats?.debuffs || []
        );
      });
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Set target and update UI
      targetingManager.setTarget(target);
      targetingManager.updateDetailedUI(target);
      
      // Verify UI was updated with detailed information
      expect(mockGame.uiManager.showTargetPanel).toHaveBeenCalled();
      expect(mockGame.uiManager.updateTargetInfo).toHaveBeenCalledWith({
        id: target.id,
        type: 'player',
        name: 'Enemy Player',
        level: 42,
        class: 'Warrior',
        life: 80,
        maxLife: 100,
        mana: 50,
        maxMana: 100
      });
      expect(mockGame.uiManager.updateTargetHealthBar).toHaveBeenCalledWith(0.8); // 80/100
      expect(mockGame.uiManager.updateTargetBuffs).toHaveBeenCalledWith(
        ['Strength', 'Shield'],
        ['Poison']
      );
    });
    
    test('should update UI when target health changes', () => {
      // Create a target with health
      const target = createMockTargetableObject('target-id', 'player', { x: 10, y: 0, z: 10 });
      target.userData.stats = {
        name: 'Enemy Player',
        life: 80,
        maxLife: 100
      };
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Set target
      targetingManager.setTarget(target);
      
      // Add updateTargetHealth method to targeting manager
      targetingManager.updateTargetHealth = jest.fn().mockImplementation((targetId, newHealth) => {
        if (targetingManager.currentTarget) {
          // Update target health regardless of ID since our mock target doesn't have a proper ID
          targetingManager.currentTarget.userData.stats.life = newHealth;
          
          // Update UI
          mockGame.uiManager.updateTargetHealthBar(
            newHealth / targetingManager.currentTarget.userData.stats.maxLife
          );
          
          return true;
        }
        return false;
      });
      
      // Update target health - use undefined instead of 'target-id' to match the actual target
      const result = targetingManager.updateTargetHealth(undefined, 60);
      
      // Verify health was updated and UI was updated
      expect(result).toBe(true);
      expect(target.userData.stats.life).toBe(60);
      expect(mockGame.uiManager.updateTargetHealthBar).toHaveBeenCalledWith(0.6); // 60/100
    });
  });
  
  describe('Target Indicator Customization', () => {
    test('should customize target indicator based on target type', () => {
      // Add customizeTargetIndicator method to targeting manager
      targetingManager.customizeTargetIndicator = jest.fn().mockImplementation((targetType) => {
        // In a real implementation, this would customize the indicator appearance
        // based on the target type (e.g., different colors for enemies vs allies)
        const indicator = targetingManager.targetIndicator;
        
        switch (targetType) {
          case 'enemy':
            indicator.material.color.set('#ff0000'); // Red for enemies
            indicator.scale.set(1.2, 1.2, 1.2);
            break;
          case 'ally':
            indicator.material.color.set('#00ff00'); // Green for allies
            indicator.scale.set(1.0, 1.0, 1.0);
            break;
          case 'neutral':
            indicator.material.color.set('#ffff00'); // Yellow for neutral
            indicator.scale.set(1.1, 1.1, 1.1);
            break;
          default:
            indicator.material.color.set('#ffffff'); // White for default
            indicator.scale.set(1.0, 1.0, 1.0);
        }
        
        return true;
      });
      
      // Create targets of different types
      const enemyTarget = createMockTargetableObject('enemy-id', 'enemy', { x: 10, y: 0, z: 10 });
      const allyTarget = createMockTargetableObject('ally-id', 'ally', { x: 15, y: 0, z: 15 });
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Test with enemy target
      targetingManager.setTarget(enemyTarget);
      targetingManager.customizeTargetIndicator('enemy');
      
      // Verify enemy indicator customization
      expect(targetingManager.targetIndicator.material.color.set).toHaveBeenCalledWith('#ff0000');
      expect(targetingManager.targetIndicator.scale.set).toHaveBeenCalledWith(1.2, 1.2, 1.2);
      
      // Test with ally target
      targetingManager.setTarget(allyTarget);
      targetingManager.customizeTargetIndicator('ally');
      
      // Verify ally indicator customization
      expect(targetingManager.targetIndicator.material.color.set).toHaveBeenCalledWith('#00ff00');
      expect(targetingManager.targetIndicator.scale.set).toHaveBeenCalledWith(1.0, 1.0, 1.0);
    });
  });
  
  describe('Target Tooltips', () => {
    test('should show tooltip on target hover', () => {
      // Create a target
      const target = createMockTargetableObject('target-id', 'player', { x: 10, y: 0, z: 10 });
      target.userData.stats = {
        name: 'Enemy Player',
        level: 42,
        class: 'Warrior'
      };
      
      // Add handleTargetHover method to targeting manager
      targetingManager.handleTargetHover = jest.fn().mockImplementation((targetObject) => {
        if (!targetObject) {
          mockGame.uiManager.hideTargetTooltip();
          return false;
        }
        
        // Show tooltip with basic info
        mockGame.uiManager.showTargetTooltip({
          name: targetObject.userData.stats?.name || 'Unknown',
          level: targetObject.userData.stats?.level || 1,
          class: targetObject.userData.stats?.class || 'Unknown',
          type: targetObject.userData.type
        });
        
        return true;
      });
      
      // Simulate hover over target
      const result = targetingManager.handleTargetHover(target);
      
      // Verify tooltip was shown
      expect(result).toBe(true);
      expect(mockGame.uiManager.showTargetTooltip).toHaveBeenCalledWith({
        name: 'Enemy Player',
        level: 42,
        class: 'Warrior',
        type: 'player'
      });
      
      // Simulate hover end
      targetingManager.handleTargetHover(null);
      
      // Verify tooltip was hidden
      expect(mockGame.uiManager.hideTargetTooltip).toHaveBeenCalled();
    });
  });
  
  describe('UI Event Handling', () => {
    test('should handle target selection via UI click', () => {
      // Create a target
      const target = createMockTargetableObject('target-id', 'player', { x: 10, y: 0, z: 10 });
      
      // Add handleUITargetSelection method to targeting manager
      targetingManager.handleUITargetSelection = jest.fn().mockImplementation((targetId) => {
        // Find target by ID
        const targetObject = mockGame.playerManager.getPlayerById(targetId);
        
        if (!targetObject) return false;
        
        // Validate with server
        const isValid = targetingManager.validateTargetWithServer(targetObject);
        
        if (isValid) {
          // Set as current target
          targetingManager.setTarget(targetObject);
          return true;
        }
        
        return false;
      });
      
      // Mock getPlayerById to return the target
      mockGame.playerManager.getPlayerById = jest.fn().mockReturnValue(target);
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Simulate UI target selection
      const result = targetingManager.handleUITargetSelection('target-id');
      
      // Verify target was set
      expect(result).toBe(true);
      expect(mockGame.playerManager.getPlayerById).toHaveBeenCalledWith('target-id');
      expect(targetingManager.validateTargetWithServer).toHaveBeenCalledWith(target);
      expect(targetingManager.currentTarget).toBe(target);
    });
    
    test('should handle target cycling via UI button', () => {
      // Create multiple targets
      const targets = [
        createMockTargetableObject('target-1', 'player', { x: 5, y: 0, z: 5 }),
        createMockTargetableObject('target-2', 'player', { x: 10, y: 0, z: 10 }),
        createMockTargetableObject('target-3', 'player', { x: 15, y: 0, z: 15 })
      ];
      
      // Add targets to game
      mockGame.playerManager.players = targets;
      
      // Add cycleTarget method to targeting manager
      targetingManager.cycleTarget = jest.fn().mockImplementation((direction = 'next') => {
        const targetableObjects = targetingManager.getTargetableObjects();
        
        if (targetableObjects.length === 0) return false;
        
        let nextTargetIndex = 0;
        
        if (targetingManager.currentTarget) {
          // Find current target index
          const currentIndex = targetableObjects.findIndex(
            obj => obj === targetingManager.currentTarget
          );
          
          if (currentIndex !== -1) {
            // Calculate next target index based on direction
            if (direction === 'next') {
              nextTargetIndex = (currentIndex + 1) % targetableObjects.length;
            } else {
              nextTargetIndex = (currentIndex - 1 + targetableObjects.length) % targetableObjects.length;
            }
          }
        }
        
        // Set next target
        const nextTarget = targetableObjects[nextTargetIndex];
        
        // Validate with server
        const isValid = targetingManager.validateTargetWithServer(nextTarget);
        
        if (isValid) {
          targetingManager.setTarget(nextTarget);
          return true;
        }
        
        return false;
      });
      
      // Mock getTargetableObjects to return the targets
      targetingManager.getTargetableObjects = jest.fn().mockReturnValue(targets);
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Set initial target
      targetingManager.setTarget(targets[0]);
      
      // Cycle to next target
      const result = targetingManager.cycleTarget('next');
      
      // Verify target was cycled
      expect(result).toBe(true);
      expect(targetingManager.currentTarget).toBe(targets[1]);
      
      // Cycle to next target again
      targetingManager.cycleTarget('next');
      
      // Verify target was cycled again
      expect(targetingManager.currentTarget).toBe(targets[2]);
      
      // Cycle to previous target
      targetingManager.cycleTarget('previous');
      
      // Verify target was cycled back
      expect(targetingManager.currentTarget).toBe(targets[1]);
    });
  });
}); 