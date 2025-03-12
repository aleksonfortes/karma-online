import './style.css';
import { Game } from './Game.js';
import { getServerUrl } from './config.js';

// Create a variable to track initialization attempts
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 2;

// Initialize the game
async function initGame() {
    if (initializationAttempts >= MAX_INIT_ATTEMPTS) {
        console.error('Failed to initialize the game after multiple attempts');
        showErrorMessage();
        return;
    }
    
    initializationAttempts++;
    console.log(`Initializing game (attempt ${initializationAttempts}/${MAX_INIT_ATTEMPTS})...`);
    
    try {
        // Create the game instance with development server URL
        const serverUrl = getServerUrl();
        
        window.game = new Game(serverUrl);
    } catch (error) {
        console.error('Error initializing game:', error);
        
        // Retry with a delay to prevent immediate loops
        setTimeout(() => {
            initGame();
        }, 5000);
    }
}

function showErrorMessage() {
    const errorElement = document.createElement('div');
    errorElement.style.position = 'fixed';
    errorElement.style.top = '50%';
    errorElement.style.left = '50%';
    errorElement.style.transform = 'translate(-50%, -50%)';
    errorElement.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    errorElement.style.color = '#fff';
    errorElement.style.padding = '20px';
    errorElement.style.borderRadius = '10px';
    errorElement.style.textAlign = 'center';
    errorElement.style.zIndex = '10000';
    errorElement.innerHTML = `
        <h2>Failed to Start Game</h2>
        <p>There was a problem connecting to the server. Please try:</p>
        <ul style="text-align: left; margin-top: 10px;">
            <li>Refreshing the page</li>
            <li>Checking if the server is running</li>
            <li>Checking your network connection</li>
        </ul>
        <button style="margin-top: 15px; padding: 10px; cursor: pointer;">Try Again</button>
    `;
    
    // Add a retry button
    const button = errorElement.querySelector('button');
    button.addEventListener('click', () => {
        errorElement.remove();
        initializationAttempts = 0;
        initGame();
    });
    
    document.body.appendChild(errorElement);
}

// Start the game when the DOM is loaded
document.addEventListener('DOMContentLoaded', initGame); 