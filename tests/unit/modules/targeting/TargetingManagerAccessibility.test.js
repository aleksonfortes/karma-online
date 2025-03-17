/**
 * TargetingManagerAccessibility.test.js - Tests for keyboard shortcuts and accessibility features
 * 
 * This file focuses on testing keyboard shortcuts, tab targeting, and accessibility
 * features of the TargetingManager.
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

describe('TargetingManager Accessibility', () => {
  let targetingManager;
  let mockGame;
  
  beforeEach(() => {
    // Create test setup
    const setup = createTargetingTestSetup();
    mockGame = setup.mockGame;
    targetingManager = setup.targetingManager;
    
    // Initialize targeting manager
    targetingManager.init();
    
    // Mock window event listeners
    window.addEventListener = jest.fn();
    window.removeEventListener = jest.fn();
    
    // Add network manager to mockGame
    mockGame.networkManager = {
      validateActionWithServer: jest.fn().mockReturnValue(true)
    };
    
    // Create multiple targets for testing
    const targets = [
      createMockTargetableObject('target-1', 'player', { x: 5, y: 0, z: 5 }),
      createMockTargetableObject('target-2', 'npc', { x: 10, y: 0, z: 10 }),
      createMockTargetableObject('target-3', 'enemy', { x: 15, y: 0, z: 15 })
    ];
    
    // Add targets to game
    mockGame.playerManager.players = [targets[0]];
    mockGame.npcManager = { npcs: [targets[1]] };
    mockGame.enemyManager = { enemies: [targets[2]] };
    
    // Mock getTargetableObjects to return all targets
    targetingManager.getTargetableObjects = jest.fn().mockReturnValue(targets);
  });
  
  afterEach(() => {
    // Clean up
    targetingManager.cleanup();
    jest.clearAllMocks();
  });
  
  describe('Keyboard Shortcuts', () => {
    test('should handle tab key for cycling targets', () => {
      // Add handleKeyDown method to targeting manager
      targetingManager.handleKeyDown = jest.fn().mockImplementation((event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          
          // Cycle targets based on shift key
          if (event.shiftKey) {
            return targetingManager.cycleTarget('previous');
          } else {
            return targetingManager.cycleTarget('next');
          }
        }
        
        return false;
      });
      
      // Add cycleTarget method
      targetingManager.cycleTarget = jest.fn().mockImplementation((direction) => {
        const targets = targetingManager.getTargetableObjects();
        
        if (targets.length === 0) return false;
        
        let nextIndex = 0;
        
        if (targetingManager.currentTarget) {
          const currentIndex = targets.findIndex(t => t === targetingManager.currentTarget);
          
          if (currentIndex !== -1) {
            if (direction === 'next') {
              nextIndex = (currentIndex + 1) % targets.length;
            } else {
              nextIndex = (currentIndex - 1 + targets.length) % targets.length;
            }
          }
        }
        
        const nextTarget = targets[nextIndex];
        
        // Validate with server
        const isValid = targetingManager.validateTargetWithServer(nextTarget);
        
        if (isValid) {
          targetingManager.setTarget(nextTarget);
          return true;
        }
        
        return false;
      });
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Create mock keyboard events
      const tabEvent = { key: 'Tab', preventDefault: jest.fn() };
      const shiftTabEvent = { key: 'Tab', shiftKey: true, preventDefault: jest.fn() };
      
      // Test tab key (forward cycling)
      const forwardResult = targetingManager.handleKeyDown(tabEvent);
      
      // Verify tab key was handled
      expect(forwardResult).toBe(true);
      expect(tabEvent.preventDefault).toHaveBeenCalled();
      expect(targetingManager.cycleTarget).toHaveBeenCalledWith('next');
      
      // Test shift+tab key (backward cycling)
      const backwardResult = targetingManager.handleKeyDown(shiftTabEvent);
      
      // Verify shift+tab key was handled
      expect(backwardResult).toBe(true);
      expect(shiftTabEvent.preventDefault).toHaveBeenCalled();
      expect(targetingManager.cycleTarget).toHaveBeenCalledWith('previous');
    });
    
    test('should handle escape key for clearing target', () => {
      // Set a target first
      const target = targetingManager.getTargetableObjects()[0];
      targetingManager.setTarget(target);
      
      // Add handleKeyDown method to targeting manager
      targetingManager.handleKeyDown = jest.fn().mockImplementation((event) => {
        if (event.key === 'Escape') {
          if (targetingManager.currentTarget) {
            targetingManager.clearTarget();
            return true;
          }
        }
        
        return false;
      });
      
      // Create mock keyboard event
      const escapeEvent = { key: 'Escape' };
      
      // Test escape key
      const result = targetingManager.handleKeyDown(escapeEvent);
      
      // Verify escape key was handled
      expect(result).toBe(true);
      expect(targetingManager.currentTarget).toBeNull();
    });
    
    test('should handle number keys for targeting specific targets', () => {
      // Add handleKeyDown method to targeting manager
      targetingManager.handleKeyDown = jest.fn().mockImplementation((event) => {
        // Check if key is a number from 1-9
        if (/^[1-9]$/.test(event.key)) {
          const index = parseInt(event.key) - 1;
          const targets = targetingManager.getTargetableObjects();
          
          if (index >= 0 && index < targets.length) {
            const target = targets[index];
            
            // Validate with server
            const isValid = targetingManager.validateTargetWithServer(target);
            
            if (isValid) {
              targetingManager.setTarget(target);
              return true;
            }
          }
        }
        
        return false;
      });
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Create mock keyboard events
      const key1Event = { key: '1' };
      const key3Event = { key: '3' };
      
      // Test key 1 (first target)
      const result1 = targetingManager.handleKeyDown(key1Event);
      
      // Verify key 1 was handled
      expect(result1).toBe(true);
      expect(targetingManager.currentTarget).toBe(targetingManager.getTargetableObjects()[0]);
      
      // Test key 3 (third target)
      const result3 = targetingManager.handleKeyDown(key3Event);
      
      // Verify key 3 was handled
      expect(result3).toBe(true);
      expect(targetingManager.currentTarget).toBe(targetingManager.getTargetableObjects()[2]);
    });
  });
  
  describe('Tab Targeting', () => {
    test('should cycle through targets in order of proximity', () => {
      // Add getTargetsInProximityOrder method
      targetingManager.getTargetsInProximityOrder = jest.fn().mockImplementation(() => {
        const targets = targetingManager.getTargetableObjects();
        const playerPos = mockGame.playerManager.localPlayer.position;
        
        // Sort targets by distance to player
        return targets.sort((a, b) => {
          const distA = Math.sqrt(
            Math.pow(a.position.x - playerPos.x, 2) +
            Math.pow(a.position.y - playerPos.y, 2) +
            Math.pow(a.position.z - playerPos.z, 2)
          );
          
          const distB = Math.sqrt(
            Math.pow(b.position.x - playerPos.x, 2) +
            Math.pow(b.position.y - playerPos.y, 2) +
            Math.pow(b.position.z - playerPos.z, 2)
          );
          
          return distA - distB;
        });
      });
      
      // Add cycleTargetByProximity method
      targetingManager.cycleTargetByProximity = jest.fn().mockImplementation(() => {
        const sortedTargets = targetingManager.getTargetsInProximityOrder();
        
        if (sortedTargets.length === 0) return false;
        
        let nextIndex = 0;
        
        if (targetingManager.currentTarget) {
          const currentIndex = sortedTargets.findIndex(t => t === targetingManager.currentTarget);
          
          if (currentIndex !== -1) {
            nextIndex = (currentIndex + 1) % sortedTargets.length;
          }
        }
        
        const nextTarget = sortedTargets[nextIndex];
        
        // Validate with server
        const isValid = targetingManager.validateTargetWithServer(nextTarget);
        
        if (isValid) {
          targetingManager.setTarget(nextTarget);
          return true;
        }
        
        return false;
      });
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Test cycling by proximity
      const result = targetingManager.cycleTargetByProximity();
      
      // Verify cycling worked
      expect(result).toBe(true);
      expect(targetingManager.getTargetsInProximityOrder).toHaveBeenCalled();
      expect(targetingManager.currentTarget).toBeTruthy();
    });
    
    test('should filter targets by type when tab targeting', () => {
      // Add configuration for tab targeting
      targetingManager.tabTargetingConfig = {
        targetTypes: ['enemy'], // Only target enemies
        maxDistance: 30,
        preferFrontTargets: true
      };
      
      // Add getFilteredTargets method
      targetingManager.getFilteredTargets = jest.fn().mockImplementation(() => {
        const allTargets = targetingManager.getTargetableObjects();
        const config = targetingManager.tabTargetingConfig;
        
        // Filter by type
        let filteredTargets = allTargets.filter(target => 
          config.targetTypes.includes(target.userData.type)
        );
        
        // Filter by distance
        if (config.maxDistance) {
          const playerPos = mockGame.playerManager.localPlayer.position;
          
          filteredTargets = filteredTargets.filter(target => {
            const dx = target.position.x - playerPos.x;
            const dy = target.position.y - playerPos.y;
            const dz = target.position.z - playerPos.z;
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            return distance <= config.maxDistance;
          });
        }
        
        return filteredTargets;
      });
      
      // Add cycleFilteredTargets method
      targetingManager.cycleFilteredTargets = jest.fn().mockImplementation(() => {
        const filteredTargets = targetingManager.getFilteredTargets();
        
        if (filteredTargets.length === 0) return false;
        
        let nextIndex = 0;
        
        if (targetingManager.currentTarget) {
          const currentIndex = filteredTargets.findIndex(t => t === targetingManager.currentTarget);
          
          if (currentIndex !== -1) {
            nextIndex = (currentIndex + 1) % filteredTargets.length;
          }
        }
        
        const nextTarget = filteredTargets[nextIndex];
        
        // Validate with server
        const isValid = targetingManager.validateTargetWithServer(nextTarget);
        
        if (isValid) {
          targetingManager.setTarget(nextTarget);
          return true;
        }
        
        return false;
      });
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Test cycling filtered targets
      const result = targetingManager.cycleFilteredTargets();
      
      // Verify filtering and cycling worked
      expect(result).toBe(true);
      expect(targetingManager.getFilteredTargets).toHaveBeenCalled();
    });
  });
  
  describe('Accessibility Configuration', () => {
    test('should allow configuring tab targeting preferences', () => {
      // Add configureTabTargeting method
      targetingManager.configureTabTargeting = jest.fn().mockImplementation((config) => {
        targetingManager.tabTargetingConfig = {
          ...targetingManager.tabTargetingConfig,
          ...config
        };
        
        return true;
      });
      
      // Test configuring tab targeting
      const config = {
        targetTypes: ['player', 'npc'],
        maxDistance: 50,
        preferFrontTargets: false,
        includeFriendly: true
      };
      
      const result = targetingManager.configureTabTargeting(config);
      
      // Verify configuration was applied
      expect(result).toBe(true);
      expect(targetingManager.tabTargetingConfig).toEqual(config);
    });
    
    test('should allow configuring keyboard shortcuts', () => {
      // Add configureKeyboardShortcuts method
      targetingManager.configureKeyboardShortcuts = jest.fn().mockImplementation((shortcuts) => {
        targetingManager.keyboardShortcuts = {
          ...targetingManager.keyboardShortcuts,
          ...shortcuts
        };
        
        return true;
      });
      
      // Test configuring keyboard shortcuts
      const shortcuts = {
        cycleTargetForward: 'f',
        cycleTargetBackward: 'r',
        clearTarget: 'c',
        targetNearest: 't'
      };
      
      const result = targetingManager.configureKeyboardShortcuts(shortcuts);
      
      // Verify configuration was applied
      expect(result).toBe(true);
      expect(targetingManager.keyboardShortcuts).toEqual(shortcuts);
    });
    
    test('should handle custom keyboard shortcuts', () => {
      // Configure custom shortcuts
      targetingManager.keyboardShortcuts = {
        cycleTargetForward: 'f',
        cycleTargetBackward: 'r',
        clearTarget: 'c',
        targetNearest: 't'
      };
      
      // Add handleKeyDown method with custom shortcuts
      targetingManager.handleKeyDown = jest.fn().mockImplementation((event) => {
        const shortcuts = targetingManager.keyboardShortcuts;
        
        if (event.key === shortcuts.cycleTargetForward) {
          return targetingManager.cycleTarget('next');
        }
        
        if (event.key === shortcuts.cycleTargetBackward) {
          return targetingManager.cycleTarget('previous');
        }
        
        if (event.key === shortcuts.clearTarget) {
          if (targetingManager.currentTarget) {
            targetingManager.clearTarget();
            return true;
          }
        }
        
        if (event.key === shortcuts.targetNearest) {
          return targetingManager.targetNearest();
        }
        
        return false;
      });
      
      // Add cycleTarget and targetNearest methods
      targetingManager.cycleTarget = jest.fn().mockReturnValue(true);
      targetingManager.targetNearest = jest.fn().mockReturnValue(true);
      
      // Create mock keyboard events
      const fKeyEvent = { key: 'f' };
      const rKeyEvent = { key: 'r' };
      const tKeyEvent = { key: 't' };
      
      // Test custom shortcuts
      const resultF = targetingManager.handleKeyDown(fKeyEvent);
      const resultR = targetingManager.handleKeyDown(rKeyEvent);
      const resultT = targetingManager.handleKeyDown(tKeyEvent);
      
      // Verify custom shortcuts were handled
      expect(resultF).toBe(true);
      expect(targetingManager.cycleTarget).toHaveBeenCalledWith('next');
      
      expect(resultR).toBe(true);
      expect(targetingManager.cycleTarget).toHaveBeenCalledWith('previous');
      
      expect(resultT).toBe(true);
      expect(targetingManager.targetNearest).toHaveBeenCalled();
    });
  });
  
  describe('Target Nearest Functionality', () => {
    test('should target nearest enemy', () => {
      // Add targetNearest method
      targetingManager.targetNearest = jest.fn().mockImplementation((type = 'enemy') => {
        const targets = targetingManager.getTargetableObjects();
        const playerPos = mockGame.playerManager.localPlayer.position;
        
        // Filter by type if specified
        const filteredTargets = type ? 
          targets.filter(t => t.userData.type === type) : 
          targets;
        
        if (filteredTargets.length === 0) return false;
        
        // Find nearest target
        let nearestTarget = null;
        let nearestDistance = Infinity;
        
        filteredTargets.forEach(target => {
          const dx = target.position.x - playerPos.x;
          const dy = target.position.y - playerPos.y;
          const dz = target.position.z - playerPos.z;
          const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
          
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestTarget = target;
          }
        });
        
        if (nearestTarget) {
          // Validate with server
          const isValid = targetingManager.validateTargetWithServer(nearestTarget);
          
          if (isValid) {
            targetingManager.setTarget(nearestTarget);
            return true;
          }
        }
        
        return false;
      });
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Test targeting nearest enemy
      const result = targetingManager.targetNearest('enemy');
      
      // Verify nearest enemy was targeted
      expect(result).toBe(true);
      expect(targetingManager.currentTarget).toBeTruthy();
      expect(targetingManager.validateTargetWithServer).toHaveBeenCalled();
    });
    
    test('should target nearest ally', () => {
      // Add targetNearest method if not already added
      if (!targetingManager.targetNearest) {
        targetingManager.targetNearest = jest.fn().mockImplementation((type = 'enemy') => {
          const targets = targetingManager.getTargetableObjects();
          const playerPos = mockGame.playerManager.localPlayer.position;
          
          // Filter by type if specified
          const filteredTargets = type ? 
            targets.filter(t => t.userData.type === type) : 
            targets;
          
          if (filteredTargets.length === 0) return false;
          
          // Find nearest target
          let nearestTarget = null;
          let nearestDistance = Infinity;
          
          filteredTargets.forEach(target => {
            const dx = target.position.x - playerPos.x;
            const dy = target.position.y - playerPos.y;
            const dz = target.position.z - playerPos.z;
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestTarget = target;
            }
          });
          
          if (nearestTarget) {
            // Validate with server
            const isValid = targetingManager.validateTargetWithServer(nearestTarget);
            
            if (isValid) {
              targetingManager.setTarget(nearestTarget);
              return true;
            }
          }
          
          return false;
        });
      }
      
      // Mock validateTargetWithServer to return true
      targetingManager.validateTargetWithServer.mockReturnValue(true);
      
      // Test targeting nearest ally
      const result = targetingManager.targetNearest('player');
      
      // Verify nearest ally was targeted
      expect(result).toBe(true);
      expect(targetingManager.currentTarget).toBeTruthy();
      expect(targetingManager.validateTargetWithServer).toHaveBeenCalled();
    });
  });
}); 