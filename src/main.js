import './style.css';
import { Game } from './modules/core/Game.js';

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    window.game = game; // For debugging in development only
}); 