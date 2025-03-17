/**
 * MockClient.js - A mock client for integration tests
 * 
 * This provides a client interface that matches the testClient.js interface
 * but works with TestableNetworkManager without requiring real connections.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Creates a mock client for testing with TestableNetworkManager
 * 
 * @param {TestableNetworkManager} networkManager - The network manager instance
 * @param {Object} options - Client configuration options
 * @returns {Object} Client instance and utility methods
 */
export function createMockClient(networkManager, options = {}) {
  const clientId = options.clientId || uuidv4().substring(0, 8);
  const username = options.username || `TestUser_${clientId}`;
  const position = options.position || { x: 0, y: 0, z: 0 };
  
  // Generate mock socket ID
  const socketId = `socket-${Math.random().toString(36).substring(2, 10)}`;
  
  // Store received events
  const receivedEvents = new Map();
  
  // Store event listeners
  const eventListeners = new Map();
  
  // Store event promises
  const eventPromises = new Map();
  
  // Create mock client
  const client = {
    // Client info
    clientId,
    username,
    socketId,
    connected: false,
    receivedEvents,
    
    // Connect to the server
    async connect() {
      if (this.connected) return;
      
      // Simulate connection
      const gameState = networkManager.simulateConnection(socketId, this, username);
      
      // Mock socket object for testing
      const mockSocket = {
        id: socketId,
        handshake: { query: { username } },
        on: jest.fn(),
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        disconnect: jest.fn(),
        to: jest.fn(),
        in: jest.fn(),
        broadcast: { emit: jest.fn() },
        connected: true
      };
      
      // Store the game state
      this.storeEvent('initialGameState', gameState);
      
      this.connected = true;
      return true;
    },
    
    // Get the socket ID
    getSocketId() {
      return socketId;
    },
    
    // Get mock socket
    getSocket() {
      return {
        id: socketId,
        emit: (event, data) => this.emit(event, data),
        on: (event, callback) => this.on(event, callback)
      };
    },
    
    // Send message to server
    emit(event, data) {
      if (!this.connected) {
        throw new Error('Cannot emit when not connected');
      }
      
      // Handle specific events
      switch (event) {
        case 'playerMove':
          networkManager.simulatePlayerMovement(socketId, data);
          break;
        case 'playerHealth':
          networkManager.simulateHealthUpdate(socketId, data);
          break;
        case 'playerAttack':
          networkManager.simulateDamage(socketId, data);
          break;
        default:
          console.log(`Unhandled event '${event}' with data:`, data);
      }
    },
    
    // Wait for an event with timeout
    waitForEvent(event, timeout = 1000) {
      return new Promise((resolve, reject) => {
        // If we already have the event, resolve immediately
        if (receivedEvents.has(event)) {
          const eventData = receivedEvents.get(event);
          receivedEvents.delete(event);
          return resolve(eventData);
        }
        
        // Set up event promise
        eventPromises.set(event, { resolve, reject });
        
        // Set timeout
        const timeoutId = setTimeout(() => {
          if (eventPromises.has(event)) {
            eventPromises.delete(event);
            reject(new Error(`Timeout waiting for event: ${event}`));
          }
        }, timeout);
        
        // If the event is emitted, the handler will resolve
      });
    },
    
    // Store an event
    storeEvent(event, data) {
      receivedEvents.set(event, data);
      
      // If someone is waiting for this event, resolve their promise
      if (eventPromises.has(event)) {
        const { resolve } = eventPromises.get(event);
        eventPromises.delete(event);
        resolve(data);
      }
    },
    
    // Add persistent event listener
    on(event, callback) {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, []);
      }
      
      eventListeners.get(event).push(callback);
    },
    
    // Remove event listener
    off(event, callback) {
      if (!eventListeners.has(event)) return;
      
      if (callback) {
        const listeners = eventListeners.get(event);
        const index = listeners.indexOf(callback);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      } else {
        eventListeners.delete(event);
      }
    },
    
    // Handle an event from the server
    handleEvent(event, data) {
      // Store the event
      this.storeEvent(event, data);
      
      // Call any registered listeners
      if (eventListeners.has(event)) {
        eventListeners.get(event).forEach(callback => {
          try {
            callback(data);
          } catch (err) {
            console.error(`Error in event listener for ${event}:`, err);
          }
        });
      }
    },
    
    // Disconnect from the server
    async disconnect() {
      if (!this.connected) return;
      
      // Simulate disconnection
      networkManager.simulateDisconnection(socketId);
      
      // Clear stored events and listeners
      receivedEvents.clear();
      eventListeners.clear();
      eventPromises.clear();
      
      this.connected = false;
    }
  };
  
  return client;
} 