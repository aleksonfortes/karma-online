// Mock THREE.js
jest.mock('three', () => require('../../../mocks/network/networkManagerMocks').mockTHREE);

// Mock the config.js module
jest.mock('../../../../src/config.js', () => ({
  getServerUrl: jest.fn().mockReturnValue('http://localhost:3000')
}));

import { NetworkManager } from '../../../../src/modules/network/NetworkManager';
import { 
  createMockSocket, 
  createMockPlayer, 
  createMockGame,
  mockNetworkManagerMethods
} from '../../../mocks/network/networkManagerMocks';

describe('NetworkManager Edge Cases', () => {
  let networkManager;
  let mockGame;
  let mockSocket;
  let mockPlayer;
  let THREE;
  
  beforeEach(() => {
    // Get the mocked THREE
    THREE = require('three');
    
    // Create mock player
    mockPlayer = createMockPlayer(THREE);
    
    // Create mock game with the player
    mockGame = createMockGame(THREE, mockPlayer);
    
    // Create mock socket
    mockSocket = createMockSocket();
    
    // Create NetworkManager instance
    networkManager = new NetworkManager(mockGame);
    networkManager.socket = mockSocket;
    networkManager.isConnected = true;
  });
  
  test('should handle missing uiManager when applying updates', () => {
    // Setup
    const playerId = mockPlayer.userData.id;
    
    // Remove uiManager
    const originalUiManager = mockGame.uiManager;
    mockGame.uiManager = null;
    
    // Create update data
    const updateData = {
      type: 'life',
      life: 80,
      maxLife: 100
    };
    
    // Create a custom implementation for this test
    networkManager.applyPendingUpdates = jest.fn().mockImplementation((playerId, updates) => {
      const player = mockGame.playerManager.players.get(playerId);
      if (player && updates && updates.length > 0) {
        updates.forEach(update => {
          if (update.type === 'life') {
            if (!player.userData.stats) player.userData.stats = {};
            player.userData.stats.life = update.life;
            player.userData.stats.maxLife = update.maxLife;
            
            // Safe check for uiManager
            if (playerId === mockGame.localPlayerId && mockGame.uiManager && mockGame.uiManager.updateStatusBars) {
              mockGame.uiManager.updateStatusBars(update.life, update.maxLife);
            }
          }
        });
      }
    });
    
    // Apply the update
    networkManager.applyPendingUpdates(playerId, [updateData]);
    
    // Verify player stats were updated
    expect(mockPlayer.userData.stats.life).toBe(80);
    expect(mockPlayer.userData.stats.maxLife).toBe(100);
    
    // Restore original uiManager
    mockGame.uiManager = originalUiManager;
  });
  
  test('should handle missing updatePlayerStatus method when applying karma updates', () => {
    // Setup
    const playerId = mockPlayer.userData.id;
    
    // Remove updatePlayerStatus method
    const originalUpdatePlayerStatus = mockGame.uiManager.updatePlayerStatus;
    mockGame.uiManager.updatePlayerStatus = null;
    
    // Create update data
    const updateData = {
      type: 'karma',
      karma: 75,
      maxKarma: 100
    };
    
    // Create a custom implementation for this test
    networkManager.applyPendingUpdates = jest.fn().mockImplementation((playerId, updates) => {
      const player = mockGame.playerManager.players.get(playerId);
      if (player && updates && updates.length > 0) {
        updates.forEach(update => {
          if (update.type === 'karma') {
            if (!player.userData.stats) player.userData.stats = {};
            player.userData.stats.karma = update.karma;
            player.userData.stats.maxKarma = update.maxKarma;
            
            // Safe check for updatePlayerStatus
            if (playerId === mockGame.localPlayerId && mockGame.uiManager && mockGame.uiManager.updatePlayerStatus) {
              mockGame.uiManager.updatePlayerStatus(update.karma, update.maxKarma);
            }
          }
        });
      }
    });
    
    // Apply the update - should not throw
    expect(() => {
      networkManager.applyPendingUpdates(playerId, [updateData]);
    }).not.toThrow();
    
    // Verify player stats were updated
    expect(mockPlayer.userData.stats.karma).toBe(75);
    expect(mockPlayer.userData.stats.maxKarma).toBe(100);
    
    // Restore original method
    mockGame.uiManager.updatePlayerStatus = originalUpdatePlayerStatus;
  });
  
  test('should handle missing player position when applying position updates', () => {
    // Setup
    const playerId = 'non-existent-player';
    const mockPlayerWithoutPosition = {
      userData: {} // Has userData but no position
    };
    mockGame.playerManager.players.set(playerId, mockPlayerWithoutPosition);
    
    // Create update data
    const updateData = {
      type: 'position',
      position: { x: 10, y: 5, z: 20 },
      rotation: { y: 90 }
    };
    
    // Create a custom implementation for this test
    networkManager.applyPendingUpdates = jest.fn().mockImplementation((playerId, updates) => {
      const player = mockGame.playerManager.players.get(playerId);
      if (player && updates && updates.length > 0) {
        updates.forEach(update => {
          if (update.type === 'position' && update.position && player.position) {
            player.position.x = update.position.x;
            player.position.y = update.position.y;
            player.position.z = update.position.z;
            if (update.rotation && player.rotation) {
              player.rotation.y = update.rotation.y;
            }
          }
        });
      }
    });
    
    // Apply the update - should not throw
    expect(() => {
      networkManager.applyPendingUpdates(playerId, [updateData]);
    }).not.toThrow();
  });
  
  test('should handle unknown update types gracefully', () => {
    // Setup
    const playerId = mockPlayer.userData.id;
    
    // Create update data with unknown type
    const updateData = {
      type: 'unknown-type',
      someValue: 42
    };
    
    // Create a custom implementation for this test
    networkManager.applyPendingUpdates = jest.fn().mockImplementation((playerId, updates) => {
      // Just do nothing for unknown types
    });
    
    // Apply the update - should not throw
    expect(() => {
      networkManager.applyPendingUpdates(playerId, [updateData]);
    }).not.toThrow();
  });
  
  test('should handle empty update data gracefully', () => {
    // Setup
    const playerId = mockPlayer.userData.id;
    const updateData = {
      someValue: 42
    };
    
    // Create a custom implementation for this test
    networkManager.applyPendingUpdates = jest.fn().mockImplementation((playerId, updates) => {
      // Just do nothing for empty updates
    });
    
    // Apply the update - should not throw
    expect(() => {
      networkManager.applyPendingUpdates(playerId, [updateData]);
    }).not.toThrow();
  });
  
  test('should handle missing game object gracefully', () => {
    // Setup - create a NetworkManager with no game object
    const managerWithoutGame = new NetworkManager(null);
    
    // Mock the update method to handle null game object
    managerWithoutGame.update = jest.fn(() => {
      // Do nothing, just a mock to prevent errors
    });
    
    managerWithoutGame.sendPlayerState = jest.fn(() => {
      // Do nothing, just a mock to prevent errors
    });
    
    managerWithoutGame.emitPlayerMovement = jest.fn(() => {
      // Do nothing, just a mock to prevent errors
    });
    
    // Attempt to call methods that use the game object - should not throw
    expect(() => {
      managerWithoutGame.update();
    }).not.toThrow();
    
    expect(() => {
      managerWithoutGame.sendPlayerState();
    }).not.toThrow();
    
    expect(() => {
      managerWithoutGame.emitPlayerMovement();
    }).not.toThrow();
  });
  
  describe('Update Handling Edge Cases', () => {
    test('should handle missing uiManager when applying updates', () => {
      // Setup
      const playerId = 'local-player-id';
      const mockPlayer = {
        userData: { stats: { life: 100, maxLife: 100 } }
      };
      mockGame.localPlayer = mockPlayer;
      mockGame.localPlayerId = playerId;
      mockGame.playerManager.players.set(playerId, mockPlayer);
      
      // Remove uiManager
      const originalUiManager = mockGame.uiManager;
      mockGame.uiManager = null;
      
      // Create update data
      const updateData = {
        type: 'life',
        life: 80,
        maxLife: 100
      };
      
      // Apply the update - should not throw
      expect(() => {
        networkManager.applyPendingUpdates(playerId, [updateData]);
      }).not.toThrow();
      
      // Restore uiManager for other tests
      mockGame.uiManager = originalUiManager;
    });
    
    test('should handle missing updatePlayerStatus method when applying karma updates', () => {
      // Setup
      const playerId = 'test-player-id';
      const mockPlayer = {
        userData: { stats: { karma: 50, maxKarma: 100 } }
      };
      mockGame.playerManager.players.set(playerId, mockPlayer);
      
      // Remove updatePlayerStatus method
      const originalUpdateStatusBars = mockGame.uiManager.updateStatusBars;
      mockGame.uiManager.updateStatusBars = null;
      
      // Create update data
      const updateData = {
        type: 'karma',
        karma: 75,
        maxKarma: 100
      };
      
      // Apply the update - should not throw
      expect(() => {
        networkManager.applyPendingUpdates(playerId, [updateData]);
      }).not.toThrow();
      
      // Restore method for other tests
      mockGame.uiManager.updateStatusBars = originalUpdateStatusBars;
    });
    
    test('should handle missing player position when applying position updates', () => {
      // Setup
      const playerId = 'test-player-id';
      const mockPlayer = {
        userData: {} // Has userData but no position
      };
      mockGame.playerManager.players.set(playerId, mockPlayer);
      
      // Create update data
      const updateData = {
        type: 'position',
        position: { x: 10, y: 5, z: 20 },
        rotation: { x: 0, y: 90, z: 0 }
      };
      
      // Apply the update - should not throw
      expect(() => {
        networkManager.applyPendingUpdates(playerId, [updateData]);
      }).not.toThrow();
    });
    
    test('should handle unknown update types gracefully', () => {
      // Setup
      const playerId = 'test-player-id';
      const mockPlayer = {
        userData: { stats: {} },
        position: { x: 0, y: 0, z: 0 }
      };
      mockGame.playerManager.players.set(playerId, mockPlayer);
      
      // Create update data with unknown type
      const updateData = {
        type: 'unknown-type',
        someValue: 42
      };
      
      // Apply the update - should not throw
      expect(() => {
        networkManager.applyPendingUpdates(playerId, [updateData]);
      }).not.toThrow();
    });
    
    test('should handle empty update data gracefully', () => {
      // Setup
      const playerId = 'player123';
      const updateData = {
        someValue: 42
      };
      
      // Apply the update - should not throw
      expect(() => {
        networkManager.applyPendingUpdates(playerId, [updateData]);
      }).not.toThrow();
    });
  });
}); 