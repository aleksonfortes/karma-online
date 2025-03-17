/**
 * Common test utilities and helpers for SkillsManager tests
 */

import { MockSkillsManager } from './mockSkillsManager';

/**
 * Creates a standard mock game object for skills tests
 * @returns {Object} The mock game object
 */
export const createMockGame = () => {
  // Create mock scene
  const mockScene = {
    add: jest.fn(),
    remove: jest.fn(),
    children: []
  };
  
  // Create mock player manager
  const mockPlayerManager = {
    localPlayer: {
      position: { x: 0, y: 0, z: 0 },
      animationState: 'idle'
    },
    getPlayerById: jest.fn().mockReturnValue({
      position: { x: 2, y: 0, z: 0 },
      animationState: 'idle'
    }),
    setPlayerAnimationState: jest.fn()
  };
  
  // Create mock targeting manager
  const mockTargetingManager = {
    currentTarget: null,
    getTargetId: jest.fn().mockReturnValue('target-id')
  };
  
  // Create mock network manager
  const mockNetworkManager = {
    useSkill: jest.fn(),
    validateActionWithServer: jest.fn().mockImplementation((action) => {
      // Simulate server response after a delay
      setTimeout(() => {
        if (action.type === 'skill_use') {
          const mockServerResponse = {
            skillId: action.skillId,
            targetId: action.targetId,
            success: true,
            damage: 10
          };
          // This will be mocked in the test
          if (mockGame && mockGame.skillsManager && mockGame.skillsManager.handleServerSkillResponse) {
            mockGame.skillsManager.handleServerSkillResponse(mockServerResponse);
          }
        }
      }, 100);
      return true;
    })
  };
  
  // Create mock karma manager
  const mockKarmaManager = {
    chosenPath: 'light'
  };
  
  return {
    scene: mockScene,
    playerManager: mockPlayerManager,
    targetingManager: mockTargetingManager,
    networkManager: mockNetworkManager,
    karmaManager: mockKarmaManager,
    activeSkills: new Set()
  };
};

/**
 * Creates a standard setup for SkillsManager tests
 * @returns {Object} The test setup with mockGame, skillsManager, etc.
 */
export const createSkillsTestSetup = () => {
  // Create mock game
  const mockGame = createMockGame();
  
  // Create SkillsManager instance
  const skillsManager = new MockSkillsManager(mockGame);
  
  return { mockGame, skillsManager };
};

/**
 * Creates a mock skill effect
 * @param {string} type - The type of effect
 * @param {number} lifetime - The current lifetime of the effect
 * @param {number} maxLifetime - The maximum lifetime of the effect
 * @returns {Object} The mock effect
 */
export const createMockSkillEffect = (type = 'martial_arts', lifetime = 0, maxLifetime = 1000) => {
  return {
    userData: { 
      lifetime, 
      maxLifetime,
      type
    },
    position: { 
      copy: jest.fn(),
      set: jest.fn()
    },
    scale: { set: jest.fn() },
    material: { 
      opacity: 1,
      needsUpdate: false
    },
    dispose: jest.fn(),
    update: jest.fn()
  };
}; 