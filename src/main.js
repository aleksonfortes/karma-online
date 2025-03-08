import './style.css';
import GameClient from './GameClient';

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const game = new GameClient();
    window.game = game; // For debugging in development only
}); 