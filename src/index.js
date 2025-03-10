// Import protection measures
import './protection.js';
import { Game } from './modules/core/Game.js';

// Wrap the entire game in an IIFE to prevent global scope access
(() => {
    // Determine the server URL based on the environment
    const SERVER_URL = window.location.hostname === 'localhost' && window.location.port === '5173'
        ? 'http://localhost:3000'  // Development
        : window.location.origin;  // Production

    console.log('Connecting to server URL:', SERVER_URL);

    function clearGameData() {
        localStorage.removeItem('gameSessionId');
        // Clear any other game-related data
        sessionStorage.clear();
        // Force a hard reload to clear cache
        window.location.reload(true);
    }

    // Export clearGameData to window for debugging
    window.clearGameData = clearGameData;

    // Developer tools notification
    console.log('Developer tools available:');
    console.log('- window.clearGameData() - Clears game data and reloads');

    // Start the game when the page loads
    window.addEventListener('load', () => {
        const game = new Game(SERVER_URL);
        // Store game instance for debugging purposes
        window.game = game;
    });
})();