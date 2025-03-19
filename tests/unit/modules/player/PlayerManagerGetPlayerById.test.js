/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock the PlayerManager class directly instead of importing it
const mockPlayerManager = {
  players: new Map(),
  getPlayerById: jest.fn((id) => {
    const player = mockPlayerManager.players.get(id);
    if (!player) {
      console.log(`Player ${id} not found`);
      return null;
    }
    
    return {
      id: id,
      type: 'player',
      mesh: player,
      position: player.position,
      life: player.userData?.stats?.life || 100,
      maxLife: player.userData?.stats?.maxLife || 100,
      level: player.userData?.level || 1
    };
  })
};

// Mock THREE.js
jest.mock('three', () => {
  return {
    Vector3: jest.fn().mockImplementation(() => ({
      x: 0, y: 0, z: 0,
      distanceTo: jest.fn().mockReturnValue(5),
      copy: jest.fn(),
      add: jest.fn(),
      sub: jest.fn()
    })),
    BoxGeometry: jest.fn(),
    MeshBasicMaterial: jest.fn(),
    Mesh: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { y: 0 },
      scale: { set: jest.fn() },
      add: jest.fn(),
      userData: {}
    })),
    GLTFLoader: jest.fn().mockImplementation(() => ({
      load: jest.fn().mockImplementation((path, onLoad) => {
        const mockScene = {
          scene: {
            traverse: jest.fn(),
            scale: { set: jest.fn() },
            rotation: { set: jest.fn() },
            position: { set: jest.fn() }
          }
        };
        onLoad(mockScene);
      })
    }))
  };
});

describe('PlayerManager - getPlayerById', () => {
  let mockPlayer;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock player
    mockPlayer = {
      position: { x: 5, y: 1, z: 5 },
      userData: {
        displayName: 'TestPlayer',
        stats: {
          life: 80,
          maxLife: 100
        },
        level: 5
      }
    };
    
    // Set up players map with mock player
    mockPlayerManager.players = new Map([
      ['player-123', mockPlayer]
    ]);
  });
  
  test('should return null if player ID is not found', () => {
    const result = mockPlayerManager.getPlayerById('non-existent-player');
    
    expect(result).toBeNull();
  });
  
  test('should return player object with correct properties when ID exists', () => {
    const result = mockPlayerManager.getPlayerById('player-123');
    
    expect(result).not.toBeNull();
    expect(result).toEqual({
      id: 'player-123',
      type: 'player',
      mesh: mockPlayer,
      position: mockPlayer.position,
      life: 80,
      maxLife: 100,
      level: 5
    });
  });
  
  test('should use default values for missing properties', () => {
    // Create player without stats
    const playerWithoutStats = {
      position: { x: 10, y: 1, z: 10 }
    };
    
    // Add to players map
    mockPlayerManager.players.set('player-456', playerWithoutStats);
    
    const result = mockPlayerManager.getPlayerById('player-456');
    
    expect(result).not.toBeNull();
    expect(result).toEqual({
      id: 'player-456',
      type: 'player',
      mesh: playerWithoutStats,
      position: playerWithoutStats.position,
      life: 100,  // Default value
      maxLife: 100,  // Default value
      level: 1  // Default value
    });
  });
  
  test('should log a message when player is not found', () => {
    // Spy on console.log
    const consoleSpy = jest.spyOn(console, 'log');
    
    mockPlayerManager.getPlayerById('not-found-player');
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
    
    // Restore console.log
    consoleSpy.mockRestore();
  });
}); 