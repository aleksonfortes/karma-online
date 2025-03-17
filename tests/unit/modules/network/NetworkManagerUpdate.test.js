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
  createMockGame 
} from '../../../mocks/network/networkManagerMocks';

describe('NetworkManager Update Tests', () => {
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
  
  test('should emit playerMovement when update interval has elapsed', () => {
    // Set last update time to simulate elapsed interval
    networkManager.lastStateUpdate = Date.now() - 150; // 150ms ago
    
    // Call update method
    networkManager.update();
    
    // Should emit player movement since interval has elapsed
    expect(mockSocket.emit).toHaveBeenCalledWith('playerMovement', expect.any(Object));
  });
  
  test('should not emit playerMovement when update interval has not elapsed', () => {
    // Set last update time to recent time (not enough time elapsed)
    networkManager.lastStateUpdate = Date.now() - 50; // 50ms ago
    
    // Call update method
    networkManager.update();
    
    // Should not emit player movement since interval has not elapsed
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
}); 