/**
 * NetworkManagerPlayerInteractions.test.js - Tests for player interactions in NetworkManager
 * 
 * This file tests the player interactions, game state updates, and player-specific
 * network functionality of the NetworkManager class.
 */

import { jest } from '@jest/globals';
import { MockNetworkManager } from './mockNetworkManager';
import { createNetworkTestSetup } from './networkTestHelpers';

// Mock THREE library
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation(() => ({
      x: 0,
      y: 0,
      z: 0,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis(),
      distanceTo: jest.fn().mockReturnValue(5)
    })),
    Quaternion: jest.fn().mockImplementation(() => ({
      x: 0,
      y: 0,
      z: 0,
      w: 1,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis()
    })),
    MathUtils: {
      radToDeg: jest.fn(rad => rad * (180 / Math.PI)),
      degToRad: jest.fn(deg => deg * (Math.PI / 180))
    }
  };
});

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connected: true,
    id: 'mock-socket-id'
  }));
});

// Mock config
jest.mock('../../../../src/config.js', () => ({
  getServerUrl: jest.fn().mockReturnValue('http://localhost:3000'),
  SERVER_URL: 'http://localhost:3000',
  NETWORK: {
    UPDATE_RATE: 100,
    INTERPOLATION_DELAY: 100
  }
}));

describe('NetworkManager Player Interactions', () => {
  let networkManager;
  let mockGame;
  let mockSocket;
  
  beforeEach(() => {
    // Create test setup
    const setup = createNetworkTestSetup();
    mockGame = setup.mockGame;
    
    // Create NetworkManager instance
    networkManager = new MockNetworkManager(mockGame);
    
    // Initialize
    networkManager.init();
    
    // Get the socket
    mockSocket = networkManager.socket;

    // Mock console methods
    global.console.log = jest.fn();
    global.console.error = jest.fn();
    global.console.warn = jest.fn();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Player Join/Leave Events', () => {
    test('should handle player joined event', () => {
      // Setup
      const playerData = {
        id: 'player-123',
        position: { x: 10, y: 0, z: 10 },
        rotation: { y: 1.5 },
        name: 'TestPlayer',
        character: 'warrior'
      };
      mockGame.playerManager.createPlayer = jest.fn();
      
      // Call handler
      networkManager.handlePlayerJoined(playerData);
      
      // Verify player was created
      expect(mockGame.playerManager.createPlayer).toHaveBeenCalledWith(
        playerData.id,
        playerData.position,
        playerData.rotation,
        false
      );
    });
    
    test('should handle player left event', () => {
      // Setup
      const playerId = 'player-123';
      mockGame.playerManager.removePlayer = jest.fn();
      
      // Call handler
      networkManager.handlePlayerLeft({ id: playerId });
      
      // Verify player was removed
      expect(mockGame.playerManager.removePlayer).toHaveBeenCalledWith(playerId);
    });
    
    test('should handle player list', () => {
      // Setup
      const playerList = [
        { id: 'player-1', position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } },
        { id: 'player-2', position: { x: 5, y: 0, z: 5 }, rotation: { y: 1 } }
      ];
      mockGame.playerManager.createPlayer = jest.fn();
      
      // Call handler
      networkManager.handlePlayerList(playerList);
      
      // Verify players were created
      expect(mockGame.playerManager.createPlayer).toHaveBeenCalledTimes(2);
      expect(mockGame.playerManager.createPlayer).toHaveBeenCalledWith(
        playerList[0].id,
        playerList[0].position,
        playerList[0].rotation,
        false
      );
      expect(mockGame.playerManager.createPlayer).toHaveBeenCalledWith(
        playerList[1].id,
        playerList[1].position,
        playerList[1].rotation,
        false
      );
    });
  });
  
  describe('Player State Updates', () => {
    test('should handle player update', () => {
      // Setup
      const updateData = {
        id: 'player-123',
        position: { x: 15, y: 0, z: 15 },
        rotation: { y: 2.0 }
      };
      mockGame.playerManager.applyServerUpdate = jest.fn();
      
      // Call handler
      networkManager.handlePlayerUpdate(updateData);
      
      // Verify update was applied
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledWith(
        updateData.id,
        updateData
      );
    });
    
    test('should handle batch position update', () => {
      // Setup
      const batchData = {
        timestamp: Date.now(),
        updates: [
          { id: 'player-1', position: { x: 1, y: 0, z: 1 }, rotation: { y: 0.5 } },
          { id: 'player-2', position: { x: 2, y: 0, z: 2 }, rotation: { y: 1.0 } }
        ]
      };
      mockGame.playerManager.applyServerUpdate = jest.fn();
      
      // Call handler
      networkManager.handleBatchPositionUpdate(batchData);
      
      // Verify updates were applied
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledTimes(2);
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledWith(
        batchData.updates[0].id,
        batchData.updates[0]
      );
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledWith(
        batchData.updates[1].id,
        batchData.updates[1]
      );
    });
    
    test('should handle batch state update', () => {
      // Setup
      const batchData = {
        timestamp: Date.now(),
        updates: [
          { id: 'player-1', state: 'idle', animation: 'idle' },
          { id: 'player-2', state: 'running', animation: 'run' }
        ]
      };
      mockGame.playerManager.applyServerUpdate = jest.fn();
      
      // Call handler
      networkManager.handleBatchStateUpdate(batchData);
      
      // Verify updates were applied
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledTimes(2);
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledWith(
        batchData.updates[0].id,
        batchData.updates[0]
      );
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledWith(
        batchData.updates[1].id,
        batchData.updates[1]
      );
    });
  });
  
  describe('Player Actions', () => {
    test('should send player action', () => {
      // Setup
      networkManager.isConnected = true;
      const action = {
        type: 'attack',
        targetId: 'enemy-1',
        skillId: 'fireball'
      };
      
      // Call method
      networkManager.sendPlayerAction(action);
      
      // Verify action was sent
      expect(mockSocket.emit).toHaveBeenCalledWith('playerAction', action);
    });
    
    test('should not send player action when disconnected', () => {
      // Setup
      networkManager.isConnected = false;
      const action = {
        type: 'attack',
        targetId: 'enemy-1',
        skillId: 'fireball'
      };
      
      // Call method
      networkManager.sendPlayerAction(action);
      
      // Verify action was not sent
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
    
    test('should handle server action rejection', () => {
      // Setup
      mockGame.uiManager.showMessage = jest.fn();
      const rejectionData = {
        action: 'attack',
        reason: 'Skill on cooldown'
      };
      
      // Call handler
      networkManager.handleActionRejection(rejectionData);
      
      // Verify message was shown
      expect(mockGame.uiManager.showMessage).toHaveBeenCalledWith(
        expect.stringContaining(rejectionData.reason),
        expect.any(Object)
      );
    });
  });
  
  describe('Damage and Combat', () => {
    test('should handle batch damage update', () => {
      // Setup
      const batchData = {
        timestamp: Date.now(),
        updates: [
          { id: 'player-1', damage: 10, attackerId: 'enemy-1', type: 'physical' },
          { id: 'player-2', damage: 20, attackerId: 'enemy-2', type: 'magical' }
        ]
      };
      mockGame.playerManager.applyServerUpdate = jest.fn();
      
      // Call handler
      networkManager.handleBatchDamageUpdate(batchData);
      
      // Verify updates were applied
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledTimes(2);
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledWith(
        batchData.updates[0].id,
        batchData.updates[0]
      );
      expect(mockGame.playerManager.applyServerUpdate).toHaveBeenCalledWith(
        batchData.updates[1].id,
        batchData.updates[1]
      );
    });
    
    test('should send damage event', () => {
      // Setup
      networkManager.isConnected = true;
      const damageData = {
        targetId: 'enemy-1',
        damage: 15,
        type: 'physical'
      };
      
      // Call method
      networkManager.sendDamageEvent(damageData);
      
      // Verify damage event was sent
      expect(mockSocket.emit).toHaveBeenCalledWith('damageEvent', damageData);
    });
  });
  
  describe('World State Updates', () => {
    test('should handle world state update', () => {
      // Setup
      const worldState = {
        time: 'day',
        weather: 'rain',
        events: ['invasion']
      };
      mockGame.environmentManager.updateWorldState = jest.fn();
      
      // Call handler
      networkManager.handleWorldStateUpdate(worldState);
      
      // Verify world state was updated
      expect(mockGame.environmentManager.updateWorldState).toHaveBeenCalledWith(worldState);
    });
    
    test('should handle NPC update', () => {
      // Setup
      const npcData = {
        id: 'npc-1',
        position: { x: 5, y: 0, z: 5 },
        rotation: { y: 0.5 },
        state: 'idle'
      };
      mockGame.npcManager.updateNPC = jest.fn();
      
      // Call handler
      networkManager.handleNPCUpdate(npcData);
      
      // Verify NPC was updated
      expect(mockGame.npcManager.updateNPC).toHaveBeenCalledWith(npcData);
    });
    
    test('should handle NPC list', () => {
      // Setup
      const npcList = [
        { id: 'npc-1', type: 'vendor', position: { x: 0, y: 0, z: 0 } },
        { id: 'npc-2', type: 'guard', position: { x: 10, y: 0, z: 10 } }
      ];
      mockGame.npcManager.processServerNPCs = jest.fn();
      
      // Call handler
      networkManager.handleNPCList(npcList);
      
      // Verify NPCs were processed
      expect(mockGame.npcManager.processServerNPCs).toHaveBeenCalledWith(npcList);
    });
  });
}); 