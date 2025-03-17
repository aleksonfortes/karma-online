/**
 * Test Server Utility
 * 
 * Provides utilities for creating and managing test server instances
 * for integration testing.
 */

import { Server } from 'socket.io';
import http from 'http';
import express from 'express';
import { AddressInfo } from 'net';

/**
 * Creates a test server with Socket.IO configured
 * 
 * @param {Object} options - Server configuration options
 * @param {Function} [options.onConnection] - Callback for handling new connections
 * @param {Object} [options.socketOptions] - Socket.IO server options
 * @returns {Object} Server instance and utility methods
 */
export function createTestServer(options = {}) {
  const app = express();
  const httpServer = http.createServer(app);
  
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    ...options.socketOptions
  });

  if (options.onConnection) {
    io.on('connection', options.onConnection);
  }

  // Default event handlers
  io.on('connection', (socket) => {
    // Track connected sockets for cleanup
    socket.on('error', (error) => {
      console.error('Socket error in test server:', error);
    });
  });

  // Start the server on a random available port
  const serverInstance = httpServer.listen(0);
  
  return {
    /**
     * Get the URL of the test server
     * @returns {string} The server URL
     */
    getUrl() {
      const address = serverInstance.address();
      const port = address.port;
      return `http://localhost:${port}`;
    },
    
    /**
     * Get the Socket.IO server instance
     * @returns {Server} Socket.IO server
     */
    getIo() {
      return io;
    },
    
    /**
     * Get the HTTP server instance
     * @returns {http.Server} HTTP server
     */
    getHttpServer() {
      return httpServer;
    },
    
    /**
     * Get the Express app instance
     * @returns {express.Application} Express app
     */
    getApp() {
      return app;
    },
    
    /**
     * Close the server and all connections
     * @returns {Promise<void>} Promise that resolves when server is closed
     */
    async close() {
      return new Promise((resolve) => {
        io.close();
        serverInstance.close(() => {
          resolve();
        });
      });
    }
  };
} 