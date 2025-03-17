/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MockNPCManager } from './mockNPCManager';
import { createNPCTestSetup } from './npcTestHelpers';

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
        // Create a mock GLTF object
        const mockGLTF = {
          scene: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            add: jest.fn(),
            remove: jest.fn(),
            traverse: jest.fn()
          },
          animations: []
        };
        
        // Call the onLoad callback with the mock GLTF
        onLoad(mockGLTF);
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
    // Reset mocks
    jest.clearAllMocks();
    
    // Create test setup
    const setup = createNPCTestSetup();
    mockGame = setup.mockGame;
    npcManager = setup.npcManager;
  });
  
  afterEach(() => {
    // Clean up
    jest.clearAllMocks();
    npcManager.cleanup();
  });
  
  test('should initialize correctly', () => {
    expect(npcManager.game).toBe(mockGame);
    expect(npcManager.initialized).toBe(true);
    expect(npcManager.npcs.size).toBe(0);
    expect(mockGame.networkManager.socket.on).toHaveBeenCalledWith('server_npcs', expect.any(Function));
  });
  
  test('should create and remove NPCs', () => {
    // Create an NPC
    const npcId = 'test-npc';
    const npcType = 'merchant';
    const position = { x: 10, y: 0, z: 10 };
    const rotation = { y: 1.5 };
    
    const npc = npcManager.createNPC(npcId, npcType, position, rotation);
    
    // Verify NPC was created correctly
    expect(npc).toBeDefined();
    expect(npc.id).toBe(npcId);
    expect(npc.type).toBe(npcType);
    expect(npc.position.x).toBe(position.x);
    expect(npc.position.y).toBe(position.y);
    expect(npc.position.z).toBe(position.z);
    expect(npc.rotation.y).toBe(rotation.y);
    expect(npc.userData.isNPC).toBe(true);
    expect(npc.userData.type).toBe(npcType);
    expect(npcManager.npcs.size).toBe(1);
    expect(npcManager.npcs.get(npcId)).toBe(npc);
    expect(mockGame.scene.add).toHaveBeenCalledWith(npc);
    
    // Remove the NPC
    npcManager.removeNPC(npcId);
    
    // Verify NPC was removed
    expect(npcManager.npcs.size).toBe(0);
    expect(npcManager.npcs.has(npcId)).toBe(false);
    expect(mockGame.scene.remove).toHaveBeenCalledWith(npc);
  });
  
  test('should process server NPCs', () => {
    // Create mock server NPC data
    const serverNPCs = [
      { id: 'npc-1', type: 'merchant', position: { x: 10, y: 0, z: 10 }, rotation: { y: 0 } },
      { id: 'npc-2', type: 'guard', position: { x: -10, y: 0, z: -10 }, rotation: { y: Math.PI } }
    ];
    
    // Process server NPCs
    npcManager.processServerNPCs(serverNPCs);
    
    // Verify NPCs were created
    expect(npcManager.npcs.size).toBe(2);
    expect(npcManager.npcs.has('npc-1')).toBe(true);
    expect(npcManager.npcs.has('npc-2')).toBe(true);
    
    // Verify NPC properties
    const npc1 = npcManager.npcs.get('npc-1');
    expect(npc1.type).toBe('merchant');
    expect(npc1.position.x).toBe(10);
    expect(npc1.position.z).toBe(10);
    
    const npc2 = npcManager.npcs.get('npc-2');
    expect(npc2.type).toBe('guard');
    expect(npc2.position.x).toBe(-10);
    expect(npc2.position.z).toBe(-10);
    expect(npc2.rotation.y).toBe(Math.PI);
  });
  
  test('should check for player-NPC interactions', () => {
    // Create NPCs at different distances from the player
    const closeNPC = npcManager.createNPC('close-npc', 'merchant', { x: 2, y: 0, z: 2 });
    const mediumNPC = npcManager.createNPC('medium-npc', 'guard', { x: 4, y: 0, z: 4 });
    const farNPC = npcManager.createNPC('far-npc', 'villager', { x: 10, y: 0, z: 10 });
    
    // Set player position
    mockGame.playerManager.localPlayer.position = { x: 0, y: 0, z: 0 };
    
    // Check interactions
    npcManager.checkInteractions();
    
    // Verify dialogue is shown for the closest NPC (within dialogue distance)
    expect(npcManager.isDialogueActive).toBe(true);
    expect(npcManager.activeNPC).toBe(closeNPC);
    expect(mockGame.uiManager.showDialogue).toHaveBeenCalledWith(
      closeNPC.type,
      expect.any(String)
    );
    expect(mockGame.uiManager.hideInteractionLabel).toHaveBeenCalledWith(closeNPC.id);
    
    // Move player away from all NPCs
    mockGame.playerManager.localPlayer.position = { x: 20, y: 0, z: 20 };
    
    // Reset dialogue state
    npcManager.isDialogueActive = false;
    npcManager.activeNPC = null;
    
    // Check interactions again
    npcManager.checkInteractions();
    
    // Verify no interactions are triggered
    expect(npcManager.isDialogueActive).toBe(false);
    expect(npcManager.activeNPC).toBeNull();
  });
  
  test('should show and hide dialogue', () => {
    // Create an NPC
    const npc = npcManager.createNPC('test-npc', 'merchant', { x: 0, y: 0, z: 0 });
    
    // Show dialogue
    npcManager.showDialogue(npc);
    
    // Verify dialogue is shown
    expect(npcManager.isDialogueActive).toBe(true);
    expect(npcManager.activeNPC).toBe(npc);
    expect(mockGame.uiManager.showDialogue).toHaveBeenCalledWith(
      npc.type,
      expect.any(String)
    );
    expect(mockGame.uiManager.hideInteractionLabel).toHaveBeenCalledWith(npc.id);
    
    // Hide dialogue
    npcManager.hideDialogue();
    
    // Verify dialogue is hidden
    expect(npcManager.isDialogueActive).toBe(false);
    expect(npcManager.activeNPC).toBeNull();
    expect(mockGame.uiManager.hideDialogue).toHaveBeenCalled();
  });
  
  test('should clean up properly', () => {
    // Create some NPCs
    npcManager.createNPC('npc-1', 'merchant', { x: 0, y: 0, z: 0 });
    npcManager.createNPC('npc-2', 'guard', { x: 10, y: 0, z: 10 });
    
    // Verify NPCs were created
    expect(npcManager.npcs.size).toBe(2);
    
    // Clean up
    npcManager.cleanup();
    
    // Verify NPCs were removed
    expect(npcManager.npcs.size).toBe(0);
    expect(mockGame.networkManager.socket.off).toHaveBeenCalledWith(
      'server_npcs',
      expect.any(Function)
    );
  });
}); 