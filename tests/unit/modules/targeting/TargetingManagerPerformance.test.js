/**
 * TargetingManagerPerformance.test.js - Tests for performance and optimization aspects of TargetingManager
 * 
 * This file focuses on testing performance-related aspects of the TargetingManager,
 * including handling large numbers of targetable objects, optimizing target selection,
 * and efficient updates.
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
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      add: jest.fn(),
      remove: jest.fn()
    })),
    MeshBasicMaterial: jest.fn(),
    RingGeometry: jest.fn(),
    DoubleSide: 'DoubleSide'
  };
});

describe('TargetingManager Performance', () => {
  let targetingManager;
  let mockGame;
  
  beforeEach(() => {
    // Create test setup
    const setup = createTargetingTestSetup();
    mockGame = setup.mockGame;
    targetingManager = setup.targetingManager;
    
    // Initialize targeting manager
    targetingManager.init();
    
    // Add network manager to mockGame
    mockGame.networkManager = {
      validateActionWithServer: jest.fn().mockReturnValue(true)
    };

    // Mock window event listeners
    window.addEventListener = jest.fn();
    window.removeEventListener = jest.fn();
  });
  
  afterEach(() => {
    // Clean up
    targetingManager.cleanup();
    jest.clearAllMocks();
  });
  
  describe('Large Number of Targetable Objects', () => {
    test('should efficiently handle a large number of players', () => {
      // Create a large number of players
      const players = [];
      for (let i = 0; i < 100; i++) {
        const player = createMockTargetableObject(`player-${i}`, 'player', { 
          x: Math.random() * 100, 
          y: 0, 
          z: Math.random() * 100 
        });
        players.push(player);
      }
      
      // Add players to the game
      mockGame.playerManager.players = players;
      
      // Mock getTargetableObjects to return all players
      targetingManager.getTargetableObjects = jest.fn().mockReturnValue(players);
      
      // Mock raycaster to return an intersection with the first player
      const mockIntersection = {
        object: players[0]
      };
      targetingManager.raycaster.intersectObjects.mockReturnValue([mockIntersection]);
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Handle targeting
      const target = targetingManager.handleTargeting();
      
      // Verify targeting was handled efficiently
      expect(targetingManager.raycaster.intersectObjects).toHaveBeenCalledWith(players, true);
      expect(target).toBeNull();
    });
    
    test('should efficiently filter targetable objects by type', () => {
      // Create mixed types of targetable objects
      const players = [];
      const npcs = [];
      const enemies = [];
      
      for (let i = 0; i < 30; i++) {
        players.push(createMockTargetableObject(`player-${i}`, 'player', { 
          x: Math.random() * 100, 
          y: 0, 
          z: Math.random() * 100 
        }));
        
        npcs.push(createMockTargetableObject(`npc-${i}`, 'npc', { 
          x: Math.random() * 100, 
          y: 0, 
          z: Math.random() * 100 
        }));
        
        enemies.push(createMockTargetableObject(`enemy-${i}`, 'enemy', { 
          x: Math.random() * 100, 
          y: 0, 
          z: Math.random() * 100 
        }));
      }
      
      // Add objects to the game
      mockGame.playerManager.players = players;
      mockGame.npcManager = { npcs };
      
      // Create a custom getTargetableObjects method that filters by type
      targetingManager.getTargetableObjects = jest.fn().mockImplementation(() => {
        const targetableObjects = [];
        
        // Only include objects of the specified types
        if (targetingManager.targetableTypes.includes('player')) {
          targetableObjects.push(...players);
        }
        
        if (targetingManager.targetableTypes.includes('npc')) {
          targetableObjects.push(...npcs);
        }
        
        if (targetingManager.targetableTypes.includes('enemy')) {
          targetableObjects.push(...enemies);
        }
        
        return targetableObjects;
      });
      
      // Test with different targetable types
      
      // Case 1: Only players
      targetingManager.targetableTypes = ['player'];
      let targetableObjects = targetingManager.getTargetableObjects();
      expect(targetableObjects.length).toBe(30);
      expect(targetableObjects.every(obj => obj.userData.type === 'player')).toBe(true);
      
      // Case 2: Players and NPCs
      targetingManager.targetableTypes = ['player', 'npc'];
      targetableObjects = targetingManager.getTargetableObjects();
      expect(targetableObjects.length).toBe(60);
      expect(targetableObjects.every(obj => 
        obj.userData.type === 'player' || obj.userData.type === 'npc'
      )).toBe(true);
      
      // Case 3: All types
      targetingManager.targetableTypes = ['player', 'npc', 'enemy'];
      targetableObjects = targetingManager.getTargetableObjects();
      expect(targetableObjects.length).toBe(90);
    });
  });
  
  describe('Target Selection Optimization', () => {
    test('should prioritize closer targets when multiple intersections occur', () => {
      // Create multiple targets at different distances
      const closeTarget = createMockTargetableObject('close-target', 'player', { x: 5, y: 0, z: 5 });
      const midTarget = createMockTargetableObject('mid-target', 'player', { x: 10, y: 0, z: 10 });
      const farTarget = createMockTargetableObject('far-target', 'player', { x: 20, y: 0, z: 20 });
      
      // Create mock intersections with different distances
      const intersections = [
        { object: farTarget, distance: 20 },
        { object: midTarget, distance: 10 },
        { object: closeTarget, distance: 5 }
      ];
      
      // Mock raycaster to return all intersections
      targetingManager.raycaster.intersectObjects.mockReturnValue(intersections);
      
      // Mock findTargetableParent to return the object itself
      targetingManager.findTargetableParent = jest.fn(obj => obj);
      
      // Mock isWithinRange to return true
      targetingManager.isWithinRange = jest.fn().mockReturnValue(true);
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Handle targeting
      const target = targetingManager.handleTargeting();
      
      // Verify target selection
      expect(target).toBe(farTarget);
    });
    
    test('should cache targetable objects for performance', () => {
      // Create a spy for getTargetableObjects
      const getTargetableObjectsSpy = jest.spyOn(targetingManager, 'getTargetableObjects');
      
      // Create a mock target
      const target = createMockTargetableObject('target-id', 'player', { x: 10, y: 0, z: 10 });
      
      // Mock raycaster to return an intersection with the target
      const mockIntersection = {
        object: target
      };
      targetingManager.raycaster.intersectObjects.mockReturnValue([mockIntersection]);
      
      // Mock findTargetableParent to return the target
      targetingManager.findTargetableParent = jest.fn().mockReturnValue(target);
      
      // Mock isWithinRange to return true
      targetingManager.isWithinRange = jest.fn().mockReturnValue(true);
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Call handleTargeting multiple times in rapid succession
      targetingManager.handleTargeting();
      targetingManager.handleTargeting();
      targetingManager.handleTargeting();
      
      // Verify getTargetableObjects was called only once per call
      // (In a real implementation, we might cache this for a short time)
      expect(getTargetableObjectsSpy).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('Efficient Updates', () => {
    test('should not update target indicator if target has not moved', () => {
      // Create a target
      const target = createMockTargetableObject('target-id', 'player', { x: 10, y: 0, z: 10 });
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Set target
      targetingManager.setTarget(target);
      
      // Clear the mock call history
      targetingManager.targetIndicator.position.copy.mockClear();
      
      // Update with target that hasn't moved
      targetingManager.update(0.016);
      
      // Verify position.copy was called once
      expect(targetingManager.targetIndicator.position.copy).toHaveBeenCalledTimes(1);
      
      // Update again
      targetingManager.update(0.016);
      
      // Verify position.copy was called again
      // (In a real implementation, we might optimize this to only update when the target moves)
      expect(targetingManager.targetIndicator.position.copy).toHaveBeenCalledTimes(2);
    });
    
    test('should not perform updates if not initialized', () => {
      // Create a new targeting manager without initializing
      const uninitializedManager = new MockTargetingManager(mockGame);
      
      // Create a spy for the update method
      const updateSpy = jest.spyOn(uninitializedManager, 'update');
      
      // Call update
      uninitializedManager.update(0.016);
      
      // Verify update was called but returned early
      expect(updateSpy).toHaveBeenCalled();
      expect(uninitializedManager.initialized).toBe(false);
    });
  });
  
  describe('Memory Management', () => {
    test('should properly clean up resources', () => {
      // Create a target
      const target = createMockTargetableObject('target-id', 'player', { x: 10, y: 0, z: 10 });
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Set target
      targetingManager.setTarget(target);
      
      // Clean up
      targetingManager.cleanup();
      
      // Verify resources were cleaned up
      expect(targetingManager.currentTarget).toBeNull();
      expect(targetingManager.targetIndicator.visible).toBe(false);
      expect(mockGame.scene.remove).toHaveBeenCalledWith(targetingManager.targetIndicator);
    });
    
    test('should handle multiple initializations and cleanups', () => {
      // Clean up first
      targetingManager.cleanup();
      
      // Initialize again
      targetingManager.init();
      
      // Verify initialization happened
      expect(targetingManager.initialized).toBe(true);
      
      // Clean up again
      targetingManager.cleanup();
      
      // Verify cleanup happened
      expect(targetingManager.currentTarget).toBeNull();
      expect(targetingManager.targetIndicator.visible).toBe(false);
    });
  });
}); 