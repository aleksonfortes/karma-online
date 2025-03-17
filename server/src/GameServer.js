/**
 * GameServer.js - Main server entry point
 * 
 * Initializes and coordinates the game server components
 */
import PlayerManager from './modules/player/PlayerManager.js';
import GameManager from './modules/game/GameManager.js';
import NetworkManager from './modules/network/NetworkManager.js';

// Game server implementation
export class GameServer {
    constructor(httpServer) {
        console.log('GameServer: Initializing...');
        
        // Initialize the core managers in the correct order
        this.playerManager = new PlayerManager();
        this.gameManager = new GameManager(this.playerManager);
        this.networkManager = new NetworkManager(httpServer, this.gameManager, this.playerManager);
        
        console.log('GameServer: Initialization complete');
    }
}

export default GameServer;
