# Automated Testing Strategy for Karma Online

## Testing Layers

### 1. Unit Tests
- **Framework**: Jest
- **Purpose**: Test individual components and functions in isolation
- **Focus Areas**:
  - Module-specific logic (player, karma, skills, UI, network)
  - Utility functions
  - State management

### 2. Integration Tests
- **Framework**: Jest + JSDOM
- **Purpose**: Test interactions between modules
- **Focus Areas**:
  - Manager communications
  - Event propagation between modules
  - State synchronization

### 3. End-to-End Tests
- **Framework**: Playwright or Cypress
- **Purpose**: Test complete user flows and full game functionality
- **Focus Areas**:
  - Game initialization
  - Player movement and interaction
  - Combat scenarios
  - Network handling

### 4. Network Simulation Tests
- **Tools**: socket.io-mock, nock, or custom Socket.IO testing framework
- **Purpose**: Test reconnection, high latency, and packet loss scenarios
- **Focus Areas**:
  - Reconnection logic
  - Pending updates queue
  - Event handling under poor network conditions

## Implementation Strategy

### Unit Test Implementation

```javascript
// Example unit test for collision detection in EnvironmentManager
import { EnvironmentManager } from '../src/modules/environment/EnvironmentManager';

describe('EnvironmentManager - Temple Pillar Collision', () => {
  let environmentManager;
  
  beforeEach(() => {
    // Mock dependencies
    const mockGame = {
      getTerrainHeight: jest.fn().mockReturnValue(0)
    };
    environmentManager = new EnvironmentManager(mockGame);
  });
  
  test('Rectangle collision boundaries match pillar shape', () => {
    // Setup player position near pillar
    const playerPosition = { x: 100, y: 0, z: 100 };
    const pillarPosition = { x: 101, y: 0, z: 100 };
    
    // Mock pillar data
    environmentManager.pillars = [{
      position: pillarPosition,
      isTemple: true
    }];
    
    // Test collision
    const result = environmentManager.checkPillarCollision(playerPosition);
    
    // Assert collision detected
    expect(result.collision).toBe(true);
    // Assert push direction is correct (perpendicular to closest edge)
    expect(result.pushDirection.x).toBeLessThan(0);
  });
  
  test('No collision occurs when standing on grass', () => {
    // Setup player on grass (not on temple floor)
    const playerPosition = { x: 100, y: 0, z: 100 };
    const pillarPosition = { x: 101, y: 0, z: 100 };
    
    // Mock pillar and terrain data
    environmentManager.pillars = [{
      position: pillarPosition,
      isTemple: true
    }];
    
    // Mock isOnTempleFloor to return false
    environmentManager.isOnTempleFloor = jest.fn().mockReturnValue(false);
    
    // Test collision
    const result = environmentManager.checkPillarCollision(playerPosition);
    
    // Assert no collision when on grass
    expect(result.collision).toBe(false);
  });
});
```

### Integration Test Implementation

```javascript
// Example integration test between PlayerManager and EnvironmentManager
import { PlayerManager } from '../src/modules/player/PlayerManager';
import { EnvironmentManager } from '../src/modules/environment/EnvironmentManager';
import { Game } from '../src/Game';

describe('Player and Environment Integration', () => {
  let game, playerManager, environmentManager;
  
  beforeEach(() => {
    // Create minimal game instance with required modules
    game = new Game(/* mock params */);
    playerManager = game.playerManager;
    environmentManager = game.environmentManager;
    
    // Mock network to prevent actual connections
    game.networkManager.socket = {
      emit: jest.fn(),
      on: jest.fn()
    };
  });
  
  test('Player cannot move through temple pillars', () => {
    // Setup player
    const player = playerManager.createLocalPlayer(/* mock params */);
    const initialPosition = { ...player.position };
    
    // Setup pillar directly in front of player
    const pillarPosition = {
      x: initialPosition.x + 1,
      y: initialPosition.y,
      z: initialPosition.z
    };
    environmentManager.pillars = [{
      position: pillarPosition,
      isTemple: true
    }];
    
    // Player attempts to move forward
    playerManager.moveLocalPlayer({ x: 0, y: 0, z: 1 });
    game.update(); // Trigger game update cycle
    
    // Position should be adjusted due to collision
    expect(player.position).not.toEqual({
      x: initialPosition.x,
      y: initialPosition.y,
      z: initialPosition.z + 1
    });
  });
});
```

### End-to-End Test Implementation

```javascript
// Example Playwright E2E test for player movement and collision
const { test, expect } = require('@playwright/test');

test('Player can move but collides with environment objects', async ({ page }) => {
  // Launch game
  await page.goto('http://localhost:3000');
  
  // Wait for game to load
  await page.waitForSelector('#game-container canvas');
  
  // Mock server responses for testing
  await page.evaluate(() => {
    window.mockServerConnection = true;
  });
  
  // Press movement keys to navigate
  await page.keyboard.down('W');
  await page.waitForTimeout(1000);
  await page.keyboard.up('W');
  
  // Check if player position changed
  const position1 = await page.evaluate(() => {
    return window.game.playerManager.localPlayer.position;
  });
  
  // Now try to move into a pillar
  // First set up player right next to pillar
  await page.evaluate(() => {
    const player = window.game.playerManager.localPlayer;
    const pillar = window.game.environmentManager.pillars[0];
    player.position.x = pillar.position.x - 2;
    player.position.z = pillar.position.z;
  });
  
  // Try to move into pillar
  await page.keyboard.down('D');
  await page.waitForTimeout(1000);
  await page.keyboard.up('D');
  
  // Verify player was stopped by collision
  const position2 = await page.evaluate(() => {
    return window.game.playerManager.localPlayer.position;
  });
  
  // Player should not be at the pillar's position
  expect(position2.x).toBeLessThan(
    await page.evaluate(() => window.game.environmentManager.pillars[0].position.x - 1)
  );
});
```

### Network Simulation Test Implementation

```javascript
// Example network test for reconnection logic
import { NetworkManager } from '../src/modules/network/NetworkManager';
import { createMockSocket } from '../test/mocks/socket-io-mock';

describe('NetworkManager - Reconnection Handling', () => {
  let networkManager;
  let mockSocket;
  
  beforeEach(() => {
    // Create mock socket with ability to simulate disconnection
    mockSocket = createMockSocket();
    
    // Create NetworkManager with dependencies
    const mockGame = {
      playerManager: {
        players: new Map(),
        createRemotePlayer: jest.fn(),
        getPlayerById: jest.fn()
      }
    };
    networkManager = new NetworkManager(mockGame);
    networkManager.socket = mockSocket;
  });
  
  test('pendingUpdates stores updates for players not yet created', async () => {
    // Setup player that doesn't exist yet
    const nonExistentPlayerId = 'player-123';
    mockGame.playerManager.getPlayerById.mockReturnValue(null);
    
    // Receive life update for non-existent player
    mockSocket.emit('lifeUpdate', {
      id: nonExistentPlayerId,
      health: 50
    });
    
    // Verify update was stored in pendingUpdates
    expect(networkManager.pendingUpdates.has(nonExistentPlayerId)).toBe(true);
    expect(networkManager.pendingUpdates.get(nonExistentPlayerId)).toContainEqual({
      type: 'lifeUpdate',
      data: { health: 50 }
    });
    
    // Now simulate player creation
    const mockPlayer = { id: nonExistentPlayerId, health: 100 };
    mockGame.playerManager.getPlayerById.mockReturnValue(mockPlayer);
    
    // Apply pending updates
    networkManager.applyPendingUpdates(nonExistentPlayerId);
    
    // Verify player was updated
    expect(mockPlayer.health).toBe(50);
    // Verify pending updates were cleared
    expect(networkManager.pendingUpdates.has(nonExistentPlayerId)).toBe(false);
  });
  
  test('Game recovers after reconnection', async () => {
    // Setup
    const playerId = 'player-123';
    const mockPlayer = { id: playerId, position: { x: 0, y: 0, z: 0 } };
    mockGame.playerManager.players.set(playerId, mockPlayer);
    
    // Simulate disconnect
    mockSocket.emit('disconnect');
    
    // Verify manager is in disconnected state
    expect(networkManager.isConnected).toBe(false);
    
    // Simulate connection recovery
    mockSocket.emit('connect');
    
    // Verify manager recovered
    expect(networkManager.isConnected).toBe(true);
    
    // Verify reconnection logic executed
    expect(mockSocket.emit).toHaveBeenCalledWith('requestWorldState');
  });
});

## Testing Manager Components

### PlayerManager Tests

The PlayerManager is a critical component responsible for player lifecycle management including:
- Player creation and initialization
- Health bar management
- Player animation and movement updates
- Death and respawn handling 
- Path-based appearance updates

Key test areas for the PlayerManager include:

```javascript
describe('PlayerManager', () => {
  // Initialization tests
  describe('Initialization', () => {
    it('should initialize with default values', () => {
      // Verify default properties are set correctly
    });
    
    it('should load character model during initialization', async () => {
      // Verify model loading occurs during init
    });
  });
  
  // Health Bar Management tests
  describe('Health Bar Management', () => {
    it('should create a health bar for a player', () => {
      // Test health bar creation
    });
    
    it('should update a player health bar when health changes', () => {
      // Test health updates reflect in UI
    });
    
    it('should handle player death when health reaches zero', () => {
      // Test death state transitions
    });
  });
  
  // Player creation and update tests
  describe('Player Creation', () => {
    it('should create a player with the specified ID and position', async () => {
      // Test player mesh creation
    });
    
    it('should create a local player', async () => {
      // Test local player setup
    });
  });
  
  // Player state management tests
  describe('Player Death and Respawn', () => {
    it('should handle player death', () => {
      // Test death handling
    });
    
    it('should respawn a player', () => {
      // Test respawn functionality
    });
  });
});
```

### EnvironmentManager Tests

The EnvironmentManager handles environmental elements like:
- Temple structure and pillars
- Collision detection for environmental objects
- Scene decoration and statues

Key test areas include temple creation, collision detection, and resource cleanup.

### TerrainManager Tests

The TerrainManager manages the terrain including:
- Terrain generation and boundary detection
- Ocean creation and wave animation
- Height mapping and terrain collision

Tests should focus on boundary checks, terrain interactions, and resource management.

## Testing Network Communication

The NetworkManager is particularly important to test because it handles all client-server communication:

```javascript
describe('NetworkManager', () => {
  // Connection tests
  describe('Connection Management', () => {
    it('should establish socket connection on initialization', () => {
      // Test connection setup
    });
    
    it('should handle reconnection scenarios', () => {
      // Test reconnection logic works
    });
  });
  
  // Event handling tests
  describe('Event Handling', () => {
    it('should process player movement events from server', () => {
      // Test proper movement update handling
    });
    
    it('should handle life updates and apply them correctly', () => {
      // Test health updates from server
    });
    
    it('should queue updates for players not yet created', () => {
      // Test pending updates queue functionality
    });
  });
});
```

## Mocking Strategies

### Mocking THREE.js

For testing components that depend on THREE.js, we use a comprehensive mock:

```javascript
// Example THREE.js mock setup
jest.mock('three', () => {
  return {
    // Core classes
    Group: jest.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { y: 0 },
      add: jest.fn(),
      remove: jest.fn(),
      children: [],
      traverse: jest.fn()
    })),
    
    // Additional THREE.js components as needed
    CanvasTexture: jest.fn(),
    SpriteMaterial: jest.fn(),
    Sprite: jest.fn()
  };
});
```

### Mocking Socket.IO

Socket.IO is mocked to test network scenarios:

```javascript
jest.mock('socket.io-client', () => {
  return {
    io: jest.fn().mockImplementation(() => ({
      id: 'mock-socket-id',
      connected: true,
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      // Additional socket properties and methods
    }))
  };
});
```

## Test Configuration for ES Modules

Since Karma Online uses ES modules (`"type": "module"` in package.json), the Jest configuration must be properly set up:

```javascript
// jest.config.js
export default {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  moduleNameMapper: {
    '^socket.io-client$': '<rootDir>/tests/mocks/socket.io-client.mock.js',
    '^three$': '<rootDir>/tests/mocks/three.mock.js'
  },
  extensionsToTreatAsEsm: ['.js'],
  moduleFileExtensions: ['js'],
  transformIgnorePatterns: [],
  collectCoverage: true,
  // Additional configuration...
};
```

And the Babel configuration must use ES module syntax:

```javascript
// babel.config.js
export default {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }]
  ]
};
```

## Setting Up Continuous Integration

To fully automate our testing, we'll implement CI/CD using GitHub Actions:

```yaml
# .github/workflows/test.yml
name: Test Karma Online

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '16'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run unit tests
      run: npm run test:unit
      
    - name: Run integration tests
      run: npm run test:integration
    
    - name: Start game server
      run: npm run start:server &
      
    - name: Setup Playwright
      uses: microsoft/playwright-github-action@v1
      
    - name: Run E2E tests
      run: npm run test:e2e
```

## Test Coverage Monitoring

We'll add test coverage reporting to ensure we're testing all parts of the codebase:

```javascript
// jest.config.js
module.exports = {
  // ... other config
  collectCoverage: true,
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/assets/**',
    '!**/node_modules/**'
  ],
  // Threshold enforcement
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/modules/network/': {
      branches: 80,
      statements: 80
    },
    './src/modules/player/': {
      branches: 80,
      statements: 80
    }
  }
};
```

## Testing Specific Corner Cases

### Testing High Latency/Packet Loss

We'll create a proxy server to simulate network conditions:

```javascript
// test/network/latency-proxy.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Add latency to all requests
app.use((req, res, next) => {
  // Simulate 200ms latency
  setTimeout(next, 200);
});

// Simulate packet loss (drop 10% of requests)
app.use((req, res, next) => {
  if (Math.random() < 0.1) {
    return res.status(500).end();
  }
  next();
});

// Proxy to real game server
app.use('/', createProxyMiddleware({ 
  target: 'http://localhost:3000',
  ws: true
}));

app.listen(3001);
```

### Testing Multi-player Scenarios

For testing scenarios with multiple players, we'll use multiple browser instances:

```javascript
// tests/e2e/multiplayer.spec.js
const { test, expect } = require('@playwright/test');

test('Multiple players can interact and collide', async () => {
  // Launch two browser contexts
  const browser = await playwright.chromium.launch();
  
  const playerContext1 = await browser.newContext();
  const playerPage1 = await playerContext1.newPage();
  
  const playerContext2 = await browser.newContext();
  const playerPage2 = await playerContext2.newPage();
  
  // Connect both to the game
  await playerPage1.goto('http://localhost:3000');
  await playerPage2.goto('http://localhost:3000');
  
  // Wait for both to load
  await playerPage1.waitForSelector('#game-container canvas');
  await playerPage2.waitForSelector('#game-container canvas');
  
  // Get player IDs for testing
  const player1Id = await playerPage1.evaluate(() => window.game.playerManager.localPlayer.id);
  const player2Id = await playerPage2.evaluate(() => window.game.playerManager.localPlayer.id);
  
  // Move player 2 to player 1's position
  await playerPage2.evaluate((player1Id) => {
    // Get player 1's position from server
    const player1 = window.game.playerManager.players.get(player1Id);
    if (player1) {
      // Move player 2 to the same position
      window.game.playerManager.localPlayer.position = {
        x: player1.position.x + 0.5,
        y: player1.position.y,
        z: player1.position.z
      };
    }
  }, player1Id);
  
  // Move player 1 toward player 2
  await playerPage1.keyboard.down('W');
  await playerPage1.waitForTimeout(1000);
  await playerPage1.keyboard.up('W');
  
  // Check if collision occurred by comparing positions
  const player1Position = await playerPage1.evaluate(() => 
    window.game.playerManager.localPlayer.position
  );
  
  const player2Position = await playerPage2.evaluate(() => 
    window.game.playerManager.localPlayer.position
  );
  
  // Players should remain at different positions due to collision
  expect(Math.abs(player1Position.x - player2Position.x) + 
         Math.abs(player1Position.z - player2Position.z)).toBeGreaterThan(1.0);
  
  await browser.close();
});

## Next Steps for Implementation

1. **Set up the testing framework**:
   ```bash
   npm install --save-dev jest @testing-library/jest-dom playwright
   ```

2. **Create test directory structure**:
   ```
   /tests
     /unit            # Unit tests
     /integration     # Integration tests
     /e2e             # End-to-end tests
     /network         # Network simulation tests
     /mocks           # Mock objects and data
   ```

3. **Update package.json with test scripts**:
   ```json
   "scripts": {
     "test": "jest",
     "test:unit": "jest tests/unit",
     "test:integration": "jest tests/integration",
     "test:e2e": "playwright test",
     "test:network": "jest tests/network",
     "test:coverage": "jest --coverage"
   }
   ```

4. **Start implementing tests in order of priority**:
   - Core functionality unit tests first
   - Integration tests between critical modules
   - E2E tests for main game flows
   - Network simulation tests for edge cases

## Running Tests

To run the tests, use the following commands:

```bash
# Run all tests
npm test

# Run specific manager tests
npm run test:player
npm run test:environment
npm run test:terrain
npm run test:network

# Run with coverage
npm run test:coverage
```

## Continuous Integration

Our CI pipeline automatically runs tests on each commit and pull request, providing:
- Test results with detailed error reporting
- Code coverage statistics
- Performance metrics

This ensures all changes maintain our quality standards before merging.
