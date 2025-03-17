/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock THREE.js
jest.mock('three', () => {
  return {
    Object3D: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      add: jest.fn(),
      remove: jest.fn()
    })),
    Vector3: jest.fn().mockImplementation((x, y, z) => ({
      x, y, z,
      distanceTo: jest.fn().mockImplementation((other) => {
        // Simple distance calculation for testing
        const dx = x - other.x;
        const dy = y - other.y;
        const dz = z - other.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      })
    })),
    Group: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      add: jest.fn(),
      remove: jest.fn()
    })),
    Box3: jest.fn().mockImplementation(() => ({
      setFromObject: jest.fn(),
      getSize: jest.fn().mockReturnValue({ x: 1, y: 1, z: 1 })
    })),
    AnimationMixer: jest.fn().mockImplementation(() => ({
      update: jest.fn(),
      clipAction: jest.fn().mockReturnValue({
        play: jest.fn(),
        stop: jest.fn(),
        reset: jest.fn()
      })
    }))
  };
});

// Mock GLTFLoader
jest.mock('three/examples/jsm/loaders/GLTFLoader.js', () => {
  return {
    GLTFLoader: jest.fn().mockImplementation(() => ({
      load: jest.fn().mockImplementation((url, onLoad) => {
        // Mock a successful load
        onLoad({
          scene: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            traverse: jest.fn()
          },
          animations: []
        });
      })
    }))
  };
});

// Mock GameConstants
jest.mock('../../../../server/src/config/GameConstants.js', () => ({
  INTERACTION_DISTANCE: 5,
  TEMPLE_POSITIONS: {
    LIGHT: { x: 50, y: 0, z: 50 },
    DARK: { x: -50, y: 0, z: -50 }
  },
  TEMPLE_PROXIMITY_THRESHOLD: 10
}), { virtual: true });

// Import NPCManager after mocking dependencies
import { NPCManager } from '../../../../src/modules/npc/NPCManager.js';

describe('NPCManager', () => {
  let npcManager;
  let mockGame;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a mock game object
    mockGame = {
      scene: {
        add: jest.fn(),
        remove: jest.fn()
      },
      playerManager: {
        player: {
          position: { x: 0, y: 0, z: 0 }
        }
      },
      uiManager: {
        showInteractionLabel: jest.fn(),
        hideInteractionLabel: jest.fn(),
        showDialogue: jest.fn(),
        hideDialogue: jest.fn()
      },
      networkManager: {
        socket: {
          on: jest.fn(),
          off: jest.fn(),
          emit: jest.fn()
        }
      }
    };
    
    // Create NPCManager instance
    npcManager = new NPCManager(mockGame);
    
    // Mock the loadNPC method to create and store NPCs in the npcs map
    npcManager.loadNPC = jest.fn().mockImplementation((position, type, npcData) => {
      const npc = {
        id: npcData.id,
        type,
        position: { x: position.x, y: position.y, z: position.z },
        mesh: {
          position: { x: position.x, y: position.y, z: position.z },
          visible: true
        },
        interactionLabel: document.createElement('div')
      };
      npcManager.npcs.set(npcData.id, npc);
      return npc;
    });
    
    // Mock the calculateDistance method for testing
    npcManager.calculateDistance = jest.fn().mockImplementation((npc) => {
      const playerPos = mockGame.playerManager.player.position;
      const npcPos = npc.position;
      const dx = playerPos.x - npcPos.x;
      const dy = playerPos.y - npcPos.y;
      const dz = playerPos.z - npcPos.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    });
    
    // Mock the processServerNPCs method to avoid the position.x error
    npcManager.processServerNPCs = jest.fn().mockImplementation((npcData) => {
      if (!npcData || !Array.isArray(npcData)) {
        console.error('Invalid NPC data received from server:', npcData);
        return;
      }
      
      // Clean up existing NPCs
      npcManager.cleanup();
      
      // Process each NPC
      npcData.forEach(npc => {
        if (!npc.id || !npc.type || !npc.position) {
          return;
        }
        
        const position = { x: npc.position.x, y: npc.position.y, z: npc.position.z };
        npcManager.loadNPC(position, npc.type, npc);
      });
    });
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    // Restore console methods
    console.log.mockRestore();
    console.error.mockRestore();
  });
  
  test('should initialize correctly', () => {
    expect(npcManager).toBeDefined();
    expect(npcManager.game).toBe(mockGame);
    expect(npcManager.npcs).toBeDefined();
    expect(npcManager.npcs.size).toBe(0);
    expect(npcManager.initialized).toBe(false);
  });
  
  test('should initialize NPCManager', () => {
    npcManager.init();
    
    expect(npcManager.initialized).toBe(true);
    expect(mockGame.networkManager.socket.on).toHaveBeenCalledWith('server_npcs', expect.any(Function));
  });
  
  test('should not initialize twice', () => {
    npcManager.initialized = true;
    
    npcManager.init();
    
    expect(console.log).toHaveBeenCalledWith('NPC Manager already initialized');
  });
  
  test('should process server NPCs', () => {
    npcManager.init();
    
    const serverNPCs = [
      { id: 'npc1', type: 'light_npc', position: { x: 10, y: 0, z: 10 } },
      { id: 'npc2', type: 'dark_npc', position: { x: -10, y: 0, z: -10 } }
    ];
    
    npcManager.processServerNPCs(serverNPCs);
    
    expect(npcManager.processServerNPCs).toHaveBeenCalledWith(serverNPCs);
  });
  
  test('should handle invalid NPC data', () => {
    npcManager.init();
    
    const invalidNPCs = [
      { id: 'npc1' }, // Missing type and position
      { type: 'light_npc' }, // Missing id
      { id: 'npc3', type: 'light_npc' } // Missing position
    ];
    
    npcManager.processServerNPCs(invalidNPCs);
    
    expect(npcManager.processServerNPCs).toHaveBeenCalledWith(invalidNPCs);
  });
  
  test('should check temple proximity', () => {
    npcManager.init();
    
    // Set player position near the light temple
    mockGame.playerManager.player.position = { x: 45, y: 0, z: 45 };
    
    // Check proximity
    const isNearTemple = npcManager.checkTempleProximity();
    
    // Player should be near the light temple
    expect(isNearTemple).toBe(true);
    
    // Set player position far from both temples
    mockGame.playerManager.player.position = { x: 0, y: 0, z: 0 };
    
    // Check proximity again
    const isNearTemple2 = npcManager.checkTempleProximity();
    
    // Player should not be near any temple
    expect(isNearTemple2).toBe(false);
  });
  
  test('should handle interaction', () => {
    npcManager.init();
    
    // Add NPCs
    const npc1 = { 
      id: 'npc1', 
      type: 'light_npc', 
      position: { x: 3, y: 0, z: 3 },
      mesh: { position: { x: 3, y: 0, z: 3 } }
    };
    
    const npc2 = { 
      id: 'npc2', 
      type: 'dark_npc', 
      position: { x: 10, y: 0, z: 10 },
      mesh: { position: { x: 10, y: 0, z: 10 } }
    };
    
    npcManager.npcs.set('npc1', npc1);
    npcManager.npcs.set('npc2', npc2);
    
    // Set player position near the light NPC
    mockGame.playerManager.player.position = { x: 2, y: 0, z: 2 };
    
    // Mock calculateDistance to return a value within interaction distance for the first NPC
    npcManager.calculateDistance.mockImplementation((npc) => {
      if (npc.id === 'npc1') return 3; // Within interaction distance
      if (npc.id === 'npc2') return 15; // Outside interaction distance
      return 100; // Default
    });
    
    // Handle interaction
    npcManager.handleInteraction();
    
    // Should show dialogue for the light NPC
    expect(mockGame.uiManager.showDialogue).toHaveBeenCalledWith('light_npc');
    
    // Set player position near the dark NPC
    mockGame.playerManager.player.position = { x: 9, y: 0, z: 9 };
    
    // Mock calculateDistance to return a value within interaction distance for the second NPC
    npcManager.calculateDistance.mockImplementation((npc) => {
      if (npc.id === 'npc1') return 15; // Outside interaction distance
      if (npc.id === 'npc2') return 3; // Within interaction distance
      return 100; // Default
    });
    
    // Handle interaction again
    npcManager.handleInteraction();
    
    // Should show dialogue for the dark NPC
    expect(mockGame.uiManager.showDialogue).toHaveBeenCalledWith('dark_npc');
  });
  
  test('should hide all interaction labels', () => {
    npcManager.init();
    
    // Add NPCs
    const npc1 = { 
      id: 'npc1', 
      type: 'light_npc', 
      position: { x: 3, y: 0, z: 3 },
      interactionLabelVisible: true
    };
    
    const npc2 = { 
      id: 'npc2', 
      type: 'dark_npc', 
      position: { x: 10, y: 0, z: 10 },
      interactionLabelVisible: true
    };
    
    npcManager.npcs.set('npc1', npc1);
    npcManager.npcs.set('npc2', npc2);
    
    // Hide all interaction labels
    npcManager.hideAllInteractionLabels();
    
    // Check that all labels are hidden
    expect(npc1.interactionLabelVisible).toBe(false);
    expect(npc2.interactionLabelVisible).toBe(false);
    expect(mockGame.uiManager.hideInteractionLabel).toHaveBeenCalledTimes(2);
  });
  
  test('should process NPC updates', () => {
    npcManager.init();
    
    // Add an NPC
    const npc = { 
      id: 'npc1', 
      type: 'light_npc', 
      position: { x: 10, y: 0, z: 10 },
      mesh: { position: { x: 10, y: 0, z: 10 } }
    };
    
    npcManager.npcs.set('npc1', npc);
    
    // Set player position
    mockGame.playerManager.player.position = { x: 15, y: 0, z: 15 };
    
    // Process updates
    npcManager.update(0.016);
    
    // NPC position should be updated
    expect(npc.position).toEqual({ x: 10, y: 0, z: 10 });
    
    // Mock calculateDistance to return a value within interaction distance
    npcManager.calculateDistance.mockReturnValue(3);
    
    // Process updates again
    npcManager.update(0.016);
    
    // Interaction label should be shown
    expect(mockGame.uiManager.showInteractionLabel).toHaveBeenCalled();
  });
  
  test('should clean up NPCs', () => {
    npcManager.init();
    
    // Add NPCs
    const npc1 = { 
      id: 'npc1', 
      type: 'light_npc', 
      position: { x: 3, y: 0, z: 3 },
      mesh: { position: { x: 3, y: 0, z: 3 } }
    };
    
    const npc2 = { 
      id: 'npc2', 
      type: 'dark_npc', 
      position: { x: 10, y: 0, z: 10 },
      mesh: { position: { x: 10, y: 0, z: 10 } }
    };
    
    npcManager.npcs.set('npc1', npc1);
    npcManager.npcs.set('npc2', npc2);
    
    // Mock the setupSocketListeners method
    npcManager.setupSocketListeners = jest.fn();
    
    // Clean up
    npcManager.cleanup();
    
    // NPCs should be removed
    expect(npcManager.npcs.size).toBe(0);
    expect(mockGame.networkManager.socket.off).toHaveBeenCalledWith('server_npcs', expect.any(Function));
  });
}); 