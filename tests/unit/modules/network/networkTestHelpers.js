/**
 * Common test utilities and handlers for NetworkManager tests
 */

/**
 * Creates a standard initialPositionHandler for testing
 * @param {Object} mockGame - The mock game object
 * @returns {Function} The handler function
 */
export const createInitialPositionHandler = (mockGame) => {
  return (positionData) => {
    // Check if we're using localPlayer or playerManager.localPlayer
    const localPlayer = mockGame.playerManager?.localPlayer || mockGame.localPlayer;
    
    if (!localPlayer) {
      return;
    }
    
    // Handle different position data formats
    if (positionData.position) {
      // Format: { position: { x, y, z }, rotation: { y } }
      localPlayer.position.x = positionData.position.x;
      localPlayer.position.y = positionData.position.y;
      localPlayer.position.z = positionData.position.z;
      
      if (positionData.rotation) {
        localPlayer.rotation.y = positionData.rotation.y;
      }
    } else {
      // Format: { x, y, z, rotation }
      if (localPlayer.position.set) {
        localPlayer.position.set(
          positionData.x,
          positionData.y,
          positionData.z
        );
      } else {
        localPlayer.position.x = positionData.x;
        localPlayer.position.y = positionData.y;
        localPlayer.position.z = positionData.z;
      }
      
      if (positionData.rotation !== undefined) {
        localPlayer.rotation.y = positionData.rotation;
      }
    }
  };
};

/**
 * Creates a standard connectHandler for testing
 * @param {Object} networkManager - The network manager instance
 * @param {Object} mockSocket - The mock socket object
 * @returns {Function} The handler function
 */
export const createConnectHandler = (networkManager, mockSocket) => {
  return (event, callback) => {
    // Handle both direct call and event-based call
    if (typeof event === 'string' && typeof callback === 'function') {
      if (event === 'connect') {
        callback();
      }
    } else {
      networkManager.isConnected = true;
      
      // If we were previously disconnected, this is a reconnection
      if (networkManager.wasDisconnected) {
        networkManager.handleReconnection();
      } else {
        // Only request state update if not reconnecting
        mockSocket.emit('requestStateUpdate');
      }
    }
  };
};

/**
 * Creates a standard positionCorrectionHandler for testing
 * @param {Object} networkManager - The network manager instance
 * @param {Object} mockGame - The mock game object
 * @param {Object} mockSocket - The mock socket object
 * @returns {Function} The handler function
 */
export const createPositionCorrectionHandler = (networkManager, mockGame, mockSocket) => {
  return (correctionData) => {
    // Check if we're using localPlayer or playerManager.localPlayer
    const localPlayer = mockGame.playerManager?.localPlayer || mockGame.localPlayer;
    
    if (!localPlayer) {
      return;
    }
    
    const serverPos = correctionData.position;
    const playerPos = localPlayer.position;
    
    // Calculate distance between server and client positions
    const dx = serverPos.x - playerPos.x;
    const dy = serverPos.y - playerPos.y;
    const dz = serverPos.z - playerPos.z;
    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
    
    // Store the server position for future reference
    if (networkManager.lastServerPositions) {
      networkManager.lastServerPositions.set(mockSocket.id, {
        position: { ...serverPos },
        time: Date.now()
      });
    }
    
    // Some implementations also apply the correction directly
    if (networkManager.applyCorrection) {
      localPlayer.position.x = serverPos.x;
      localPlayer.position.y = serverPos.y;
      localPlayer.position.z = serverPos.z;
    }
    
    return distance;
  };
};

/**
 * Creates a standard setup for NetworkManager tests
 * @returns {Object} The test setup with mockGame, mockSocket, etc.
 */
export const createNetworkTestSetup = () => {
  // Create mock socket
  const mockSocket = {
    id: 'socket-123',
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn()
  };
  
  // Create mock game
  const mockGame = {
    localPlayer: {
      id: 'local-player-id',
      position: { x: 0, y: 0, z: 0 },
      rotation: { y: 0 },
      userData: { stats: {} }
    },
    localPlayerId: 'local-player-id',
    playerManager: {
      players: new Map(),
      localPlayer: null,
      createPlayer: jest.fn().mockImplementation((id, position, rotation, isLocal) => {
        const player = {
          id,
          position: { ...position },
          rotation: { ...rotation },
          isLocal
        };
        mockGame.playerManager.players.set(id, player);
        return player;
      }),
      createLocalPlayer: jest.fn().mockImplementation((data = {}) => {
        const player = {
          id: data.id || mockGame.localPlayerId,
          position: data.position || { x: 0, y: 0, z: 0 },
          rotation: data.rotation || { y: 0 },
          isLocal: true
        };
        mockGame.playerManager.players.set(player.id, player);
        mockGame.playerManager.localPlayer = player;
        return player;
      }),
      removePlayer: jest.fn(),
      applyServerUpdate: jest.fn()
    },
    uiManager: {
      updateStatusBars: jest.fn(),
      showMessage: jest.fn()
    },
    environmentManager: {
      updateWorldState: jest.fn()
    },
    npcManager: {
      updateNPC: jest.fn(),
      processServerNPCs: jest.fn()
    }
  };
  
  // Set up playerManager.players
  mockGame.playerManager.players.set(mockGame.localPlayerId, mockGame.localPlayer);
  mockGame.playerManager.localPlayer = mockGame.localPlayer;
  
  return { mockGame, mockSocket };
}; 