// Import protection measures
import './protection';

// Import the getServerUrl function from config.js
import { getServerUrl } from './config.js';

// Clear any game session data on load to prevent duplicates
function clearGameData() {
    console.log('Clearing game session data');
    localStorage.removeItem('gameSessionId');
    localStorage.removeItem('lastSession');
    sessionStorage.clear();
    
    // Add a timestamp to track when we cleared data
    localStorage.setItem('lastSessionCleared', Date.now().toString());
}

// Clear session data on load
clearGameData();

// Export clearGameData to window for debugging
window.clearGameData = function() {
    clearGameData();
    window.location.reload(true); // Force hard reload when manually called
};

// Provide a way to force full cleanup from console
window.forceFullCleanup = function() {
    clearGameData();
    console.log('Forcing full cleanup and reload');
    localStorage.clear(); // Clear all localStorage
    sessionStorage.clear();
    window.location.reload(true);
};

// Import the Game class
import { Game } from './Game.js';

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Create and initialize the game with server URL
        const serverUrl = getServerUrl();
            
        window.game = new Game(serverUrl);
    } catch (error) {
        console.error('Failed to initialize game:', error);
    }
});