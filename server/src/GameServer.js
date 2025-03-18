/**
 * GameServer.js - Main server entry point
 * 
 * Initializes and coordinates the game server components
 */
import GameManager from './modules/game/GameManager.js';
import NetworkManager from './modules/network/NetworkManager.js';

// Game server implementation
export class GameServer {
    constructor(httpServer) {
        console.log('GameServer: Initializing...');
        
        // Initialize the socket.io server first
        this.networkManager = new NetworkManager(httpServer);
        
        // Initialize the game manager with the io instance
        this.gameManager = new GameManager(this.networkManager.io);
        
        // Connect the network manager to the game manager
        this.networkManager.setGameManager(this.gameManager);
        
        console.log('GameServer: Initialization complete');
    }
}

export default GameServer;
