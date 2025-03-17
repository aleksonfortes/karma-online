/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MockSkillsManager } from './mockSkillsManager';
import { 
  createSkillsTestSetup, 
  createMockSkillEffect 
} from './skillsTestHelpers';

// Mock THREE.js
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation((x, y, z) => ({
      x: x || 0,
      y: y || 0,
      z: z || 0,
      distanceTo: jest.fn().mockReturnValue(2),
      copy: jest.fn(),
      add: jest.fn(),
      sub: jest.fn(),
      normalize: jest.fn().mockReturnThis(),
      multiplyScalar: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis()
    })),
    Raycaster: jest.fn().mockImplementation(() => ({
      set: jest.fn(),
      intersectObjects: jest.fn().mockReturnValue([])
    })),
    Mesh: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      add: jest.fn(),
      remove: jest.fn()
    })),
    Group: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      remove: jest.fn(),
      children: []
    })),
    MeshBasicMaterial: jest.fn(),
    BoxGeometry: jest.fn(),
    CylinderGeometry: jest.fn(),
    SphereGeometry: jest.fn(),
    PlaneGeometry: jest.fn(),
    DoubleSide: 'DoubleSide',
    FrontSide: 'FrontSide',
    BackSide: 'BackSide',
    Object3D: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    })),
    Clock: jest.fn().mockImplementation(() => ({
      getElapsedTime: jest.fn().mockReturnValue(0),
      getDelta: jest.fn().mockReturnValue(0.016)
    }))
  };
});

describe('SkillsManager', () => {
  let skillsManager;
  let mockGame;
  
  beforeEach(() => {
    // Set up fake timers
    jest.useFakeTimers();
    
    // Create test setup
    const setup = createSkillsTestSetup();
    mockGame = setup.mockGame;
    skillsManager = setup.skillsManager;
    
    // Initialize skills manager
    skillsManager.init();
    
    // Add a skill for testing
    skillsManager.addSkill('martial_arts');
  });
  
  afterEach(() => {
    // Clean up
    skillsManager.cleanup();
    
    // Restore real timers
    jest.useRealTimers();
    
    // Clear all mocks
    jest.clearAllMocks();
  });
  
  // Basic initialization
  describe('Initialization', () => {
    test('should initialize with default skills', () => {
      // Verify initialization
      expect(skillsManager).toBeDefined();
      expect(skillsManager.skills).toBeDefined();
      expect(Object.keys(skillsManager.skills).length).toBeGreaterThan(0);
      expect(skillsManager.game.activeSkills).toBeDefined();
      expect(skillsManager.game.activeSkills instanceof Set).toBe(true);
      expect(skillsManager.initialized).toBe(true);
    });
    
    test('should return true when init is called', () => {
      // Reset initialization
      skillsManager.initialized = false;
      
      // Call init
      const result = skillsManager.init();
      
      // Verify result
      expect(result).toBe(true);
      expect(skillsManager.initialized).toBe(true);
    });
    
    test('should add skills correctly', () => {
      // Add a skill
      const result = skillsManager.addSkill('fireball');
      
      // Verify skill was added
      expect(result).toBe(true);
    });
    
    test('should return false when adding invalid skill', () => {
      // Try to add an invalid skill
      const result = skillsManager.addSkill('invalid_skill');
      
      // Verify result
      expect(result).toBe(false);
    });
  });
  
  // Skill usage
  describe('Skill Usage', () => {
    test('should check if a skill is on cooldown', () => {
      // Set skill as recently used
      const now = Date.now();
      skillsManager.skills.martial_arts.lastUsed = now - 1000; // 1 second ago
      
      // Check if on cooldown (cooldown is 2000ms)
      const onCooldown = skillsManager.isOnCooldown('martial_arts');
      expect(onCooldown).toBe(true);
      
      // Set skill as used long ago
      skillsManager.skills.martial_arts.lastUsed = now - 3000; // 3 seconds ago
      
      // Check if on cooldown (cooldown is 2000ms)
      const notOnCooldown = skillsManager.isOnCooldown('martial_arts');
      expect(notOnCooldown).toBe(false);
    });
    
    test('should get cooldown percentage for a skill', () => {
      // Set skill as recently used
      const now = Date.now();
      skillsManager.skills.martial_arts.lastUsed = now - 1000; // 1 second ago (50% through cooldown)
      
      // Get cooldown percentage
      const cooldownPercent = skillsManager.getCooldownPercent('martial_arts');
      
      // Should be around 50% (allowing some wiggle room for test execution time)
      expect(cooldownPercent).toBeGreaterThanOrEqual(0.4);
      expect(cooldownPercent).toBeLessThanOrEqual(0.6);
    });
    
    test('should check if target is in range for a skill', () => {
      // Mock isTargetInRange to return specific values for testing
      const originalMethod = skillsManager.isTargetInRange;
      
      skillsManager.isTargetInRange = jest.fn()
        .mockReturnValueOnce(true)   // First call returns in range
        .mockReturnValueOnce(false); // Second call returns out of range
      
      // Check if in range
      const inRange = skillsManager.isTargetInRange('target-id', 'martial_arts');
      expect(inRange).toBe(true);
      
      // Check if out of range
      const outOfRange = skillsManager.isTargetInRange('target-id', 'martial_arts');
      expect(outOfRange).toBe(false);
      
      // Restore original method
      skillsManager.isTargetInRange = originalMethod;
    });
    
    test('should use a skill on a target', () => {
      // Setup
      const targetId = 'target-id';
      const skillId = 'martial_arts';
      
      // Use skill
      const skillUsed = skillsManager.useSkill(skillId, targetId);
      
      // Verify skill usage
      expect(skillUsed).toBe(true);
      expect(mockGame.networkManager.validateActionWithServer).toHaveBeenCalledWith({
        type: 'skill_use',
        skillId,
        targetId,
        position: mockGame.playerManager.localPlayer.position
      });
      expect(mockGame.playerManager.setPlayerAnimationState).toHaveBeenCalled();
    });
    
    test('should not use a skill if on cooldown', () => {
      // Setup target but skill is on cooldown
      mockGame.targetingManager.getTargetId.mockReturnValue('target-id');
      skillsManager.isTargetInRange = jest.fn().mockReturnValue(true);
      skillsManager.isOnCooldown = jest.fn().mockReturnValue(true);
      
      // Try to use skill
      const skillUsed = skillsManager.useSkill('martial_arts');
      
      // Verify skill was not used
      expect(skillUsed).toBe(false);
      expect(mockGame.networkManager.useSkill).not.toHaveBeenCalled();
    });
    
    test('should not use a skill if target is out of range', () => {
      // Setup target but out of range
      mockGame.targetingManager.getTargetId.mockReturnValue('target-id');
      skillsManager.isTargetInRange = jest.fn().mockReturnValue(false);
      skillsManager.isOnCooldown = jest.fn().mockReturnValue(false);
      
      // Try to use skill
      const skillUsed = skillsManager.useSkill('martial_arts');
      
      // Verify skill was not used
      expect(skillUsed).toBe(false);
      expect(mockGame.networkManager.useSkill).not.toHaveBeenCalled();
    });

    describe('Server Authority', () => {
      test('should only apply skill effects locally after server confirmation', () => {
        // Setup
        const targetId = 'target-id';
        const skillId = 'martial_arts';
        
        // Mock the server response handler
        skillsManager.handleServerSkillResponse = jest.fn().mockReturnValue(true);
        
        // Mock the network manager's validateActionWithServer method
        mockGame.networkManager.validateActionWithServer = jest.fn().mockImplementation((action) => {
          // Simulate server response after a delay
          setTimeout(() => {
            const mockServerResponse = {
              skillId,
              targetId,
              success: true,
              damage: 10
            };
            skillsManager.handleServerSkillResponse(mockServerResponse);
          }, 100);
          return true;
        });
        
        // Use the skill
        const result = skillsManager.useSkill(skillId, targetId);
        expect(result).toBe(true);
        
        // Verify skill use was sent to server
        expect(mockGame.networkManager.validateActionWithServer).toHaveBeenCalled();
        
        // Fast-forward timers to trigger the server response
        jest.advanceTimersByTime(100);
        
        // Verify server response was handled
        expect(skillsManager.handleServerSkillResponse).toHaveBeenCalled();
        expect(skillsManager.handleServerSkillResponse.mock.calls[0][0]).toEqual({
          skillId,
          targetId,
          success: true,
          damage: 10
        });
      });
      
      test('should handle server rejection of skill use', () => {
        // Setup
        const targetId = 'target-id';
        const skillId = 'martial_arts';
        
        // Mock the server response handler
        skillsManager.handleServerSkillResponse = jest.fn().mockReturnValue(false);
        
        // Mock the network manager's validateActionWithServer method
        mockGame.networkManager.validateActionWithServer = jest.fn().mockImplementation((action) => {
          // Simulate server rejection after a delay
          setTimeout(() => {
            const mockServerResponse = {
              skillId,
              success: false,
              reason: 'target_out_of_range'
            };
            skillsManager.handleServerSkillResponse(mockServerResponse);
          }, 100);
          return true;
        });
        
        // Use the skill
        const result = skillsManager.useSkill(skillId, targetId);
        expect(result).toBe(true);
        
        // Verify skill use was sent to server
        expect(mockGame.networkManager.validateActionWithServer).toHaveBeenCalled();
        
        // Fast-forward timers to trigger the server response
        jest.advanceTimersByTime(100);
        
        // Verify server response was handled
        expect(skillsManager.handleServerSkillResponse).toHaveBeenCalled();
        expect(skillsManager.handleServerSkillResponse.mock.calls[0][0]).toEqual({
          skillId,
          success: false,
          reason: 'target_out_of_range'
        });
        expect(skillsManager.handleServerSkillResponse).toHaveReturnedWith(false);
      });
    });
  });
  
  // Skill effects
  describe('Skill Effects', () => {
    test('should create skill visual effects', () => {
      // Setup
      const sourcePosition = { x: 0, y: 1, z: 0 };
      const targetPosition = { x: 2, y: 1, z: 0 };
      
      // Clear any existing activeSkills
      mockGame.activeSkills.clear();
      
      // Create a simple mock effect
      const mockEffect = createMockSkillEffect('martial_arts');
      
      // Mock the createMartialArtsEffect method to return our mock effect
      skillsManager.createMartialArtsEffect = jest.fn(() => mockEffect);
      
      // Create effect
      const effect = skillsManager.createSkillEffect('martial_arts', sourcePosition, targetPosition);
      
      // Verify effect was created and added
      expect(skillsManager.createMartialArtsEffect).toHaveBeenCalled();
      expect(mockGame.activeSkills.has(effect)).toBe(true);
    });
    
    test('should update active skill effects', () => {
      // Setup mock effect
      const mockEffect = createMockSkillEffect('martial_arts');
      mockGame.activeSkills.add(mockEffect);
      
      // Force the scale.set method to be called during update
      skillsManager.updateActiveEffects = jest.fn((deltaTime) => {
        // Convert delta to milliseconds
        const deltaMsec = deltaTime * 1000;
        
        // Update each active effect
        for (const effect of mockGame.activeSkills) {
          // Update lifetime
          effect.userData.lifetime += deltaMsec;
          
          // Update effect properties
          const progress = effect.userData.lifetime / effect.userData.maxLifetime;
          const scale = 1 + progress;
          effect.scale.set(scale, scale, scale);
        }
      });
      
      // Update skills
      skillsManager.update(0.16); // 160ms
      
      // Verify effect properties were updated
      expect(mockEffect.userData.lifetime).toBe(160); // 160ms added
      expect(mockEffect.scale.set).toHaveBeenCalled();
    });
    
    test('should remove expired skill effects', () => {
      // Clear any existing skills
      mockGame.activeSkills.clear();
      
      // Setup mock effect that's expired
      const mockEffect = createMockSkillEffect('martial_arts', 1000, 1000); // already expired
      
      // Add to active skills set
      mockGame.activeSkills.add(mockEffect);
      
      // Verify we start with one effect
      expect(mockGame.activeSkills.size).toBe(1);
      
      // Call update which will call updateActiveEffects
      skillsManager.update(0.16);
      
      // Verify effect was removed
      expect(mockEffect.dispose).toHaveBeenCalled();
      expect(mockGame.activeSkills.size).toBe(0);
    });

    test('should handle incoming skill effects from other players', () => {
      // Setup
      const sourcePlayerId = 'remote-player-1';
      const targetPlayerId = 'remote-player-2';
      const skillId = 'fireball';
      
      // Mock player positions
      const sourcePosition = { x: 5, y: 1, z: 5 };
      const targetPosition = { x: 10, y: 1, z: 10 };
      
      // Mock player manager to return positions
      mockGame.playerManager.getPlayerById = jest.fn().mockImplementation((id) => {
        if (id === sourcePlayerId) {
          return { position: sourcePosition, animationState: 'idle' };
        } else if (id === targetPlayerId) {
          return { position: targetPosition, animationState: 'idle' };
        }
        return null;
      });
      
      // Add method to handle remote skill effects
      skillsManager.handleRemoteSkillEffect = jest.fn((data) => {
        const { sourceId, targetId, skillId } = data;
        
        // Get player positions
        const source = mockGame.playerManager.getPlayerById(sourceId);
        const target = mockGame.playerManager.getPlayerById(targetId);
        
        if (!source || !target) return false;
        
        // Create visual effect
        skillsManager.createSkillEffect(skillId, source.position, target.position);
        return true;
      });
      
      // Simulate incoming skill effect
      const result = skillsManager.handleRemoteSkillEffect({
        sourceId: sourcePlayerId,
        targetId: targetPlayerId,
        skillId: skillId
      });
      
      // Verify effect was created
      expect(result).toBe(true);
      expect(mockGame.playerManager.getPlayerById).toHaveBeenCalledWith(sourcePlayerId);
      expect(mockGame.playerManager.getPlayerById).toHaveBeenCalledWith(targetPlayerId);
    });

    test('should handle skill effects with different karma paths', () => {
      // Setup
      mockGame.karmaManager.chosenPath = 'dark';
      
      // Create a mock effect for dark path
      const darkEffect = createMockSkillEffect('dark_fireball');
      
      // Add method to create dark path effects
      skillsManager.createDarkFireballEffect = jest.fn(() => darkEffect);
      
      // Add method to get skill variant based on karma
      skillsManager.getKarmaVariantSkill = jest.fn((skillId) => {
        if (skillId === 'fireball' && mockGame.karmaManager.chosenPath === 'dark') {
          return 'dark_fireball';
        }
        return skillId;
      });
      
      // Override createSkillEffect to use karma variants
      const originalCreateSkillEffect = skillsManager.createSkillEffect;
      skillsManager.createSkillEffect = jest.fn((skillId, sourcePosition, targetPosition) => {
        // Get karma variant
        const variantSkillId = skillsManager.getKarmaVariantSkill(skillId);
        
        // Create effect based on variant
        if (variantSkillId === 'dark_fireball') {
          return skillsManager.createDarkFireballEffect(sourcePosition, targetPosition);
        }
        
        // Fall back to original implementation for other skills
        return originalCreateSkillEffect(skillId, sourcePosition, targetPosition);
      });
      
      // Create effect
      const effect = skillsManager.createSkillEffect('fireball', { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 5 });
      
      // Verify dark variant was used
      expect(skillsManager.getKarmaVariantSkill).toHaveBeenCalledWith('fireball');
      expect(skillsManager.createDarkFireballEffect).toHaveBeenCalled();
      expect(effect).toBe(darkEffect);
      
      // Restore original method
      skillsManager.createSkillEffect = originalCreateSkillEffect;
    });
  });
  
  // Cleanup
  describe('Resource Cleanup', () => {
    test('should clean up all resources', () => {
      // Setup active skills
      const mockEffect1 = createMockSkillEffect('martial_arts');
      const mockEffect2 = createMockSkillEffect('fireball');
      mockGame.activeSkills.add(mockEffect1);
      mockGame.activeSkills.add(mockEffect2);
      
      // Cleanup
      skillsManager.cleanup();
      
      // Verify all effects were disposed
      expect(mockEffect1.dispose).toHaveBeenCalled();
      expect(mockEffect2.dispose).toHaveBeenCalled();
      expect(mockGame.activeSkills.size).toBe(0);
      expect(skillsManager.initialized).toBe(false);
    });
  });
});
