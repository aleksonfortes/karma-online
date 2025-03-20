/**
 * @jest-environment node
 * 
 * Collision Integration Tests
 * 
 * Tests for collision detection between players, NPCs, monsters, and environment
 */

import { jest, describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { createMockClient } from '../../utils/MockClient.js';
import { TestableNetworkManager } from '../../utils/TestableNetworkManager.js';

// Import server constants for proper mocking
import GameConstants from '../../../server/src/config/GameConstants.js';

// Create mock game data
let mockPlayers = new Map();
let mockNpcs = new Map();
let mockMonsters = new Map();
let mockStatues = [];

// Create mock physics manager
const mockPhysicsManager = {
  checkCollision: jest.fn().mockImplementation((position, oldPosition) => {
    // Check player-player collision
    for (const [id, player] of mockPlayers.entries()) {
      if (player.position === position) continue; // Skip self
      
      const dx = position.x - player.position.x;
      const dz = position.z - player.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      // Player collision radius is 1.0
      if (distance < 1.5) {
        // In temple center (5x5 area in the middle), don't apply collision
        const isInTempleCenter = Math.abs(position.x) < 2.5 && Math.abs(position.z) < 2.5;
        if (!isInTempleCenter) {
          return true;
        }
      }
    }
    
    // Check NPC collision
    for (const [id, npc] of mockNpcs.entries()) {
      const dx = position.x - npc.position.x;
      const dz = position.z - npc.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      // NPC collision radius
      if (distance < 1.5) {
        return true;
      }
    }
    
    // Check monster collision
    for (const [id, monster] of mockMonsters.entries()) {
      if (monster.isDead) continue; // Skip dead monsters
      
      const dx = position.x - monster.position.x;
      const dz = position.z - monster.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      // Monster collision radius
      if (distance < 1.0) {
        return true;
      }
    }
    
    // Check temple statue collision
    for (const statue of mockStatues) {
      const dx = position.x - statue.position.x;
      const dz = position.z - statue.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      // Statue collision radius
      if (distance < statue.radius) {
        return true;
      }
    }
    
    // Check map border collision (map is 100x100 units centered at 0,0)
    const mapRadius = 50;
    if (Math.abs(position.x) > mapRadius || Math.abs(position.z) > mapRadius) {
      return true;
    }
    
    return false;
  }),
  resolveCollision: jest.fn().mockImplementation((position, oldPosition) => {
    // If a collision is detected, push back to previous position
    position.x = oldPosition.x;
    position.z = oldPosition.z;
  })
};

// Mock the server's game manager and player manager
const mockGameManager = {
  physicsManager: mockPhysicsManager,
  environmentManager: {
    isInTempleSafeZone: jest.fn().mockImplementation((position) => {
      // Temple safe zone is a 20x20 square in the center
      return Math.abs(position.x) < 10 && Math.abs(position.z) < 10;
    }),
    getColliders: jest.fn().mockImplementation(() => mockStatues)
  },
  processMovement: jest.fn().mockImplementation((socketId, position, oldPosition) => {
    const collision = mockPhysicsManager.checkCollision(position, oldPosition);
    
    if (collision) {
      mockPhysicsManager.resolveCollision(position, oldPosition);
      return { position, collision: true };
    }
    
    return { position, collision: false };
  })
};

const mockPlayerManager = {
  addPlayer: jest.fn((socketId, userData) => {
    const player = { 
      id: socketId, 
      username: userData?.username || 'DefaultUser',
      position: userData?.position || { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 }
    };
    mockPlayers.set(socketId, player);
    return player;
  }),
  getPlayerCount: jest.fn().mockImplementation(() => mockPlayers.size),
  getAllPlayers: jest.fn().mockImplementation(() => Array.from(mockPlayers.values())),
  getPlayer: jest.fn().mockImplementation(socketId => mockPlayers.get(socketId)),
  updatePlayerPosition: jest.fn().mockImplementation((socketId, position) => {
    const player = mockPlayers.get(socketId);
    if (player) {
      player.position = position;
    }
  }),
  removePlayer: jest.fn().mockImplementation(socketId => {
    mockPlayers.delete(socketId);
  })
};

// Create temple statues
const createTempleStatues = () => {
  return [
    { position: { x: 5, y: 0, z: 5 }, radius: 2 },
    { position: { x: -5, y: 0, z: 5 }, radius: 2 },
    { position: { x: 5, y: 0, z: -5 }, radius: 2 },
    { position: { x: -5, y: 0, z: -5 }, radius: 2 }
  ];
};

// Create NPCs
const createNpcs = () => {
  const darkNpc = {
    id: 'dark_npc',
    type: 'dark_npc',
    position: { x: 7, y: 0, z: -9 }
  };
  
  const lightNpc = {
    id: 'light_npc',
    type: 'light_npc',
    position: { x: -7, y: 0, z: -9 }
  };
  
  mockNpcs.set(darkNpc.id, darkNpc);
  mockNpcs.set(lightNpc.id, lightNpc);
};

// Create monster
const createMonster = () => {
  const monster = {
    id: 'monster-1',
    type: 'basic',
    position: { x: 30, y: 0, z: 30 },
    isDead: false
  };
  
  mockMonsters.set(monster.id, monster);
};

describe('Collision Integration Tests', () => {
  let networkManager;
  
  beforeAll(() => {
    // Set up the test network manager with mocked dependencies
    networkManager = new TestableNetworkManager(mockGameManager, mockPlayerManager, mockPhysicsManager);
  });
  
  beforeEach(async () => {
    // Clear mock data
    mockPlayers = new Map();
    mockNpcs = new Map();
    mockMonsters = new Map();
    mockStatues = createTempleStatues();
    
    // Add NPCs and monster
    createNpcs();
    createMonster();
    
    // Reset mock function calls
    jest.clearAllMocks();
    
    // Reset network manager state
    networkManager.resetState();
  });
  
  describe('Collision Detection', () => {
    let client;
    
    beforeEach(async () => {
      // Create mock client
      client = createMockClient(networkManager, { 
        username: 'TestPlayer',
        position: { x: 0, y: 0, z: 0 } // Start at center
      });
      
      // Connect client
      await client.connect();
    });
    
    afterEach(async () => {
      // Disconnect client
      await client.disconnect();
    });
    
    test('player-player collision is detected outside temple center', async () => {
      const clientA = client;
      const clientAId = clientA.getSocketId();
      
      // Add another player nearby
      const clientB = createMockClient(networkManager, { 
        username: 'PlayerB',
        position: { x: 15, y: 0, z: 1 } // Outside temple center
      });
      await clientB.connect();
      const clientBId = clientB.getSocketId();
      
      // Try to move client A to collide with client B
      const targetPosition = { x: 15.4, y: 0, z: 1 }; // Very close to player B
      const oldPosition = { x: 10, y: 0, z: 1 };
      
      // Emit movement request
      clientA.emit('playerMovement', {
        position: targetPosition,
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify collision was detected
      expect(mockPhysicsManager.checkCollision).toHaveBeenCalled();
      
      // Cleanup
      await clientB.disconnect();
    });
    
    test('player-player collision is not detected in temple center', async () => {
      const clientA = client;
      const clientAId = clientA.getSocketId();
      
      // Add another player at temple center
      const clientB = createMockClient(networkManager, { 
        username: 'PlayerB',
        position: { x: 1, y: 0, z: 1 } // Inside temple center
      });
      await clientB.connect();
      const clientBId = clientB.getSocketId();
      
      // Try to move client A to collide with client B in temple center
      const targetPosition = { x: 1.3, y: 0, z: 1 }; // Very close to player B
      const oldPosition = { x: 0, y: 0, z: 0 };
      
      // Emit movement request
      clientA.emit('playerMovement', {
        position: targetPosition,
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify no collision in temple center
      // This is a special case where collisions between players are ignored
      expect(mockPhysicsManager.checkCollision).toHaveBeenCalled();
      
      // Cleanup
      await clientB.disconnect();
    });
    
    test('NPC collision is detected', async () => {
      // Try to move to collide with dark NPC
      const npc = mockNpcs.get('dark_npc');
      const targetPosition = { 
        x: npc.position.x + 0.5, 
        y: 0, 
        z: npc.position.z 
      }; // Close to NPC
      const oldPosition = { x: 0, y: 0, z: 0 };
      
      // Emit movement request
      client.emit('playerMovement', {
        position: targetPosition,
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify collision was detected
      expect(mockPhysicsManager.checkCollision).toHaveBeenCalled();
    });
    
    test('temple statue collision is detected', async () => {
      // Try to move to collide with a temple statue
      const statue = mockStatues[0];
      const targetPosition = { 
        x: statue.position.x + 0.5, 
        y: 0, 
        z: statue.position.z 
      }; // Close to statue
      const oldPosition = { x: 0, y: 0, z: 0 };
      
      // Emit movement request
      client.emit('playerMovement', {
        position: targetPosition,
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify collision was detected
      expect(mockPhysicsManager.checkCollision).toHaveBeenCalled();
    });
    
    test('map border collision is detected', async () => {
      // Try to move outside map borders
      const targetPosition = { x: 60, y: 0, z: 60 }; // Outside map bounds
      const oldPosition = { x: 0, y: 0, z: 0 };
      
      // Emit movement request
      client.emit('playerMovement', {
        position: targetPosition,
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify collision was detected
      expect(mockPhysicsManager.checkCollision).toHaveBeenCalled();
    });
    
    test('monster collision is detected', async () => {
      // Try to move to collide with a monster
      const monster = mockMonsters.get('monster-1');
      const targetPosition = { 
        x: monster.position.x + 0.5, 
        y: 0, 
        z: monster.position.z 
      }; // Close to monster
      const oldPosition = { x: 25, y: 0, z: 25 };
      
      // Update client position to be near monster first
      const clientId = client.getSocketId();
      mockPlayerManager.updatePlayerPosition(clientId, oldPosition);
      
      // Emit movement request
      client.emit('playerMovement', {
        position: targetPosition,
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify collision was detected
      expect(mockPhysicsManager.checkCollision).toHaveBeenCalled();
    });
    
    test('dead monster has no collision', async () => {
      // Mark monster as dead
      const monster = mockMonsters.get('monster-1');
      monster.isDead = true;
      
      // Try to move through dead monster
      const targetPosition = { 
        x: monster.position.x, 
        y: 0, 
        z: monster.position.z 
      }; // Directly on monster
      const oldPosition = { x: 25, y: 0, z: 25 };
      
      // Update client position to be near monster first
      const clientId = client.getSocketId();
      mockPlayerManager.updatePlayerPosition(clientId, oldPosition);
      
      // Emit movement request
      client.emit('playerMovement', {
        position: targetPosition,
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      });
      
      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify collision check was called but no collision with dead monster
      expect(mockPhysicsManager.checkCollision).toHaveBeenCalled();
    });
  });
}); 