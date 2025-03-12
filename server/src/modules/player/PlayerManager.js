/**
 * PlayerManager.js - Server-side player management
 * 
 * Handles player creation, updates, and state management
 */
import GameConstants from '../../config/GameConstants.js';

export class PlayerManager {
    constructor() {
        this.players = new Map();
    }

    /**
     * Create a new player with default values
     * @param {string} socketId - The socket ID of the player
     * @returns {Object} The created player object
     */
    createPlayer(socketId) {
        return {
            id: socketId,
            position: { ...GameConstants.PLAYER.SPAWN_POSITION },
            rotation: { ...GameConstants.PLAYER.DEFAULT_ROTATION },
            life: GameConstants.PLAYER.DEFAULT_LIFE,
            maxLife: GameConstants.PLAYER.DEFAULT_MAX_LIFE,
            mana: GameConstants.PLAYER.DEFAULT_MANA,
            maxMana: GameConstants.PLAYER.DEFAULT_MAX_MANA,
            karma: GameConstants.PLAYER.DEFAULT_KARMA,
            maxKarma: GameConstants.PLAYER.DEFAULT_MAX_KARMA,
            path: GameConstants.PLAYER.DEFAULT_PATH,
            effects: [],
            modelScale: GameConstants.PLAYER.MODEL_SCALE,
            displayName: `Player-${socketId.substring(0, 5)}`
        };
    }

    /**
     * Add a player to the manager
     * @param {string} socketId - The socket ID of the player
     * @returns {Object} The created player
     */
    addPlayer(socketId) {
        const player = this.createPlayer(socketId);
        this.players.set(socketId, player);
        return player;
    }

    /**
     * Remove a player from the manager
     * @param {string} socketId - The socket ID of the player to remove
     * @returns {Object|null} The removed player or null if not found
     */
    removePlayer(socketId) {
        const player = this.players.get(socketId);
        if (player) {
            this.players.delete(socketId);
        }
        return player;
    }

    /**
     * Get a player by socket ID
     * @param {string} socketId - The socket ID of the player
     * @returns {Object|undefined} The player object or undefined if not found
     */
    getPlayer(socketId) {
        return this.players.get(socketId);
    }

    /**
     * Get all players
     * @returns {Array} Array of all player objects
     */
    getAllPlayers() {
        return Array.from(this.players.values());
    }

    /**
     * Get the number of players
     * @returns {number} The number of players
     */
    getPlayerCount() {
        return this.players.size;
    }

    /**
     * Update player effects based on karma level
     * @param {Object} player - The player to update
     */
    updatePlayerEffects(player) {
        // Reset effects
        player.effects = [];
        
        // Add effects based on karma level
        if (player.karma < 30) {
            player.effects.push('dark_aura');
        } else if (player.karma > 70) {
            player.effects.push('light_aura');
        }
        
        // Additional effects based on path
        if (player.path === 'dark') {
            player.effects.push('dark_path');
        } else if (player.path === 'light') {
            player.effects.push('light_path');
        }
    }
}

export default PlayerManager;
