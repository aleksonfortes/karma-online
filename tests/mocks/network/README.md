# Network Manager Shared Mocks

This directory contains shared mock implementations for testing the NetworkManager module. These mocks are designed to be reused across multiple test files to ensure consistency and reduce duplication.

## Available Mocks

### `networkManagerMocks.js`

This file contains the following mock implementations:

- `mockTHREE`: A mock implementation of the THREE.js library
- `createMockSocket`: A function to create a mock socket.io client
- `createMockPlayer`: A function to create a mock player object
- `createMockGame`: A function to create a mock game object with player manager, UI manager, and environment manager
- `mockNetworkManagerMethods`: A function to mock common NetworkManager methods
- `createBatchStatsUpdateHandler`: A function to create a handler for batch stats updates
- `createEventHandlers`: A function to create handlers for common network events

## Usage

### Basic Usage

```javascript
const { 
  mockTHREE, 
  createMockSocket, 
  createMockPlayer, 
  createMockGame, 
  mockNetworkManagerMethods,
  createEventHandlers
} = require('../../../mocks/network/networkManagerMocks');

// Mock THREE.js
jest.mock('three', () => ({
  // Direct implementation to avoid Jest hoisting issues
  Vector3: jest.fn().mockImplementation((x = 0, y = 0, z = 0) => ({
    x, y, z,
    set: jest.fn().mockImplementation(function(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }),
    clone: jest.fn().mockReturnThis(),
    distanceTo: jest.fn().mockReturnValue(5)
  })),
  // ... other THREE.js mocks
}));

// Setup function to create a network manager with mocks
const setupNetworkManager = () => {
  // Create mock player and game
  const THREE = require('three');
  const mockPlayer = createMockPlayer(THREE);
  const mockGame = createMockGame(THREE, mockPlayer);
  
  // Create a mock NetworkManager
  const networkManager = {
    game: mockGame,
    socket: createMockSocket(),
    lastPositionUpdate: { x: 10, y: 0, z: 20 },
    pendingUpdates: new Map()
  };
  
  // Mock network manager methods
  mockNetworkManagerMethods(networkManager, mockGame);
  
  return { networkManager, mockGame, mockSocket: networkManager.socket, mockPlayer };
};
```

### Using Event Handlers

```javascript
// Get event handlers
const handlers = createEventHandlers();

// Assign handlers to network manager
networkManager.handlePlayerLeft = handlers.playerLeft;
networkManager.handleLifeUpdate = handlers.lifeUpdate;
networkManager.handlePositionCorrection = handlers.positionCorrection;
networkManager.handleBatchPositionUpdate = handlers.batchPositionUpdate;
networkManager.handleBatchStateUpdate = handlers.batchStateUpdate;
networkManager.handleBatchDamageUpdate = handlers.batchDamageUpdate;
networkManager.handleWorldStateUpdate = handlers.worldStateUpdate;
networkManager.handlePlayerSpawn = handlers.playerSpawn;
```

## Best Practices

1. **Consistent Mocking**: Use these shared mocks across all NetworkManager tests to ensure consistency.
2. **Extend When Needed**: If you need additional mock functionality, extend the existing mocks rather than creating new ones.
3. **Test Isolation**: Each test should create its own instances of mocks to ensure test isolation.
4. **Mock Only What's Necessary**: Only mock the parts of dependencies that are actually used by the code under test.
5. **Server Authority**: When testing server authority principles, use the appropriate handlers that prioritize server data over client data.

## Server Authority Principles

The mocks in this directory are designed to support testing server authority principles in multiplayer games:

1. **Position Correction**: Server positions always take precedence over client positions
2. **State Management**: Server-provided player states are authoritative
3. **Batch Updates**: Server can send batch updates for multiple players at once
4. **World State Synchronization**: Server controls the overall world state and environment
5. **Damage Calculation**: Server determines damage amounts and effects

These principles are implemented in the various event handlers provided by `createEventHandlers()`. 