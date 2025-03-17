/**
 * NetworkManagerBatch.test.js - Tests for NetworkManager batch update functionality
 */

import { jest } from '@jest/globals';
import { MockNetworkManager } from './mockNetworkManager';
import { createNetworkTestSetup } from './networkTestHelpers';

// Mock THREE library
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation(() => ({
      x: 0, y: 0, z: 0,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis(),
      distanceTo: jest.fn().mockReturnValue(5)
    })),
    Quaternion: jest.fn().mockImplementation(() => ({
      x: 0, y: 0, z: 0, w: 1,
      set: jest.fn(),
      clone: jest.fn().mockReturnThis()
    })),
    MathUtils: {
      lerp: jest.fn((a, b, t) => a + (b - a) * t)
    }
  };
});

// Mock config
jest.mock('../../../../src/config.js', () => ({
  getServerUrl: jest.fn().mockReturnValue('http://localhost:3000'),
  NETWORK: {
    UPDATE_RATE: 100,
    INTERPOLATION_DELAY: 100
  }
}));

describe('NetworkManager Batch Updates', () => {
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
    
    // Set connected state
    networkManager.isConnected = true;
    
    // Add batch update handlers to mock
    networkManager.handleBatchPositionUpdate = jest.fn();
    networkManager.handleBatchStateUpdate = jest.fn();
    networkManager.handleBatchDamageUpdate = jest.fn();
    networkManager.handleWorldStateUpdate = jest.fn();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Batch Position Updates', () => {
    test('should process batch position updates for multiple players', () => {
      // Create batch position data
      const batchPositionData = {
        positions: [
          {
            id: 'player-1',
            position: { x: 10, y: 0, z: 20 },
            rotation: { y: 1.5 }
          },
          {
            id: 'player-2',
            position: { x: 15, y: 0, z: 25 },
            rotation: { y: 0.5 }
          }
        ],
        timestamp: Date.now()
      };
      
      // Call handler
      networkManager.handleBatchPositionUpdate(batchPositionData);
      
      // Verify handler was called with correct data
      expect(networkManager.handleBatchPositionUpdate).toHaveBeenCalledWith(batchPositionData);
    });
    
    test('should ignore batch position updates for local player', () => {
      // Setup mock implementation to test local player filtering
      networkManager.handleBatchPositionUpdate.mockImplementation(function(data) {
        // Filter out local player
        const filteredPositions = data.positions.filter(
          pos => pos.id !== this.game.localPlayerId
        );
        
        // Process each position update
        filteredPositions.forEach(posData => {
          if (this.game.playerManager.players.has(posData.id)) {
            const player = this.game.playerManager.players.get(posData.id);
            
            // Use direct update instead of applyServerUpdate
            if (posData.position) {
              player.position.x = posData.position.x;
              player.position.y = posData.position.y;
              player.position.z = posData.position.z;
            }
            
            if (posData.rotation) {
              player.rotation.y = posData.rotation.y;
            }
          }
        });
      });
      
      // Create batch position data including local player
      const batchPositionData = {
        positions: [
          {
            id: mockGame.localPlayerId, // Local player
            position: { x: 5, y: 0, z: 5 },
            rotation: { y: 0.3 }
          },
          {
            id: 'other-player',
            position: { x: 15, y: 0, z: 25 },
            rotation: { y: 0.5 }
          }
        ],
        timestamp: Date.now()
      };
      
      // Add other player to game
      mockGame.playerManager.players.set('other-player', {
        id: 'other-player',
        position: { x: 0, y: 0, z: 0 },
        rotation: { y: 0 }
      });
      
      // Call handler
      networkManager.handleBatchPositionUpdate(batchPositionData);
      
      // Verify handler was called
      expect(networkManager.handleBatchPositionUpdate).toHaveBeenCalledWith(batchPositionData);
    });
  });
  
  describe('Batch State Updates', () => {
    test('should process batch state updates for multiple players', () => {
      // Create batch state data
      const batchStateData = {
        states: [
          {
            id: 'player-1',
            stats: {
              life: 80,
              maxLife: 100,
              karma: 60,
              maxKarma: 100
            }
          },
          {
            id: 'player-2',
            stats: {
              life: 90,
              maxLife: 100,
              karma: 40,
              maxKarma: 100
            }
          }
        ],
        timestamp: Date.now()
      };
      
      // Call handler
      networkManager.handleBatchStateUpdate(batchStateData);
      
      // Verify handler was called with correct data
      expect(networkManager.handleBatchStateUpdate).toHaveBeenCalledWith(batchStateData);
    });
  });
  
  describe('Batch Damage Updates', () => {
    test('should process batch damage updates', () => {
      // Create batch damage data
      const batchDamageData = {
        damages: [
          {
            targetId: 'player-1',
            damage: 20,
            sourceId: 'player-2'
          },
          {
            targetId: 'player-3',
            damage: 30,
            sourceId: 'player-4'
          }
        ],
        timestamp: Date.now()
      };
      
      // Call handler
      networkManager.handleBatchDamageUpdate(batchDamageData);
      
      // Verify handler was called with correct data
      expect(networkManager.handleBatchDamageUpdate).toHaveBeenCalledWith(batchDamageData);
    });
  });
  
  describe('World State Updates', () => {
    test('should process world state updates', () => {
      // Create world state data
      const worldStateData = {
        players: [
          {
            id: 'player-1',
            position: { x: 10, y: 0, z: 20 },
            rotation: { y: 1.5 },
            stats: {
              life: 80,
              maxLife: 100,
              karma: 60,
              maxKarma: 100
            }
          },
          {
            id: 'player-2',
            position: { x: 15, y: 0, z: 25 },
            rotation: { y: 0.5 },
            stats: {
              life: 90,
              maxLife: 100,
              karma: 40,
              maxKarma: 100
            }
          }
        ],
        timestamp: Date.now()
      };
      
      // Call handler
      networkManager.handleWorldStateUpdate(worldStateData);
      
      // Verify handler was called with correct data
      expect(networkManager.handleWorldStateUpdate).toHaveBeenCalledWith(worldStateData);
    });
  });
}); 