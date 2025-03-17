/**
 * Test Client Utility
 * 
 * Provides utilities for creating and managing test client instances
 * for integration testing.
 */

import { io as ioClient } from 'socket.io-client';

/**
 * Creates a test client with Socket.IO configured
 * 
 * @param {string} serverUrl - URL of the test server
 * @param {Object} options - Client configuration options
 * @param {Object} [options.socketOptions] - Socket.IO client options
 * @returns {Object} Client instance and utility methods
 */
export function createTestClient(serverUrl, options = {}) {
  const socket = ioClient(serverUrl, {
    autoConnect: false,
    reconnection: false,
    timeout: 10000,
    ...options.socketOptions
  });

  // Keep track of listeners for cleanup
  const listeners = new Map();

  return {
    /**
     * Connect to the server
     * @returns {Promise<void>} Promise that resolves when connected
     */
    async connect() {
      return new Promise((resolve, reject) => {
        socket.connect();
        
        const connectTimeout = setTimeout(() => {
          socket.off('connect', onConnect);
          socket.off('connect_error', onConnectError);
          reject(new Error('Connection timeout'));
        }, 20000);
        
        const onConnect = () => {
          clearTimeout(connectTimeout);
          socket.off('connect_error', onConnectError);
          resolve();
        };
        
        const onConnectError = (error) => {
          clearTimeout(connectTimeout);
          socket.off('connect', onConnect);
          reject(error);
        };
        
        socket.once('connect', onConnect);
        socket.once('connect_error', onConnectError);
      });
    },
    
    /**
     * Get the socket.io client instance
     * @returns {Socket} Socket.IO client
     */
    getSocket() {
      return socket;
    },
    
    /**
     * Send a message to the server
     * @param {string} event - Event name
     * @param {*} data - Event data
     * @returns {Promise<void>} Promise that resolves when message is sent
     */
    async emit(event, data) {
      return new Promise((resolve) => {
        socket.emit(event, data, resolve);
      });
    },
    
    /**
     * Listen for an event once and return the data
     * @param {string} event - Event name
     * @param {number} [timeout=30000] - Timeout in milliseconds (increased to 30000)
     * @returns {Promise<*>} Promise that resolves with the event data
     */
    async waitForEvent(event, timeout = 30000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.off(event, handler);
          reject(new Error(`Timeout waiting for event: ${event}`));
        }, timeout);
        
        const handler = (data) => {
          clearTimeout(timer);
          resolve(data);
        };
        
        socket.once(event, handler);
      });
    },
    
    /**
     * Add a persistent event listener
     * @param {string} event - Event name
     * @param {Function} callback - Event handler
     */
    on(event, callback) {
      const handlers = listeners.get(event) || [];
      handlers.push(callback);
      listeners.set(event, handlers);
      socket.on(event, callback);
    },
    
    /**
     * Close the client connection
     * @returns {Promise<void>} Promise that resolves when connection is closed
     */
    async disconnect() {
      return new Promise((resolve, reject) => {
        try {
          // Clear all listeners
          listeners.forEach((handlers, event) => {
            handlers.forEach(handler => {
              socket.off(event, handler);
            });
          });
          listeners.clear();
          
          if (socket.connected) {
            socket.disconnect();
          }
          
          // Add a small delay to ensure the connection is properly closed
          setTimeout(() => {
            if (socket.connected) {
              // Try one more time if still connected
              try {
                socket.disconnect();
              } catch (err) {
                console.warn('Error during second disconnect attempt:', err);
              }
            }
            resolve();
          }, 500);
        } catch (error) {
          console.error('Error during disconnect:', error);
          // Resolve anyway to prevent test hanging
          resolve();
        }
      });
    }
  };
} 