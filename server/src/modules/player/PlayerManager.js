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
            displayName: `Player-${socketId.substring(0, 5)}`,
            experience: 0,
            level: 1,
            killCount: 0,
            deathCount: 0
        };
    }

    /**
     * Add a player to the manager
     * @param {string} socketId - The socket ID of the player
     * @param {string} [playerName] - Optional custom player name
     * @returns {Object} The created player
     */
    addPlayer(socketId, playerName) {
        const player = this.createPlayer(socketId);
        
        // Set a custom display name if provided, otherwise use default
        if (playerName && typeof playerName === 'string') {
            // Sanitize name and limit length
            const sanitizedName = playerName.trim().slice(0, 20);
            if (sanitizedName.length > 0) {
                player.displayName = sanitizedName;
                console.log(`Player ${socketId} set custom name: ${sanitizedName}`);
            }
        }
        
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
     * @returns {Object|null} The player or null if not found
     */
    getPlayer(socketId) {
        return this.players.get(socketId) || null;
    }

    /**
     * Reset a player to default state
     * @param {string} socketId - The socket ID of the player to reset
     * @returns {Object|null} The reset player or null if not found
     */
    resetPlayer(socketId) {
        const player = this.getPlayer(socketId);
        if (!player) return null;
        
        // Create a new default player
        const defaultPlayer = this.createPlayer(socketId);
        
        // Preserve ID, display name, and path
        defaultPlayer.displayName = player.displayName;
        defaultPlayer.path = player.path; // Preserve the player's chosen path
        
        // Replace the existing player with the reset player
        this.players.set(socketId, defaultPlayer);
        
        console.log(`Player ${socketId} has been reset to default state (preserving path: ${defaultPlayer.path})`);
        return defaultPlayer;
    }

    /**
     * Get all players
     * @returns {Object} Object containing all players
     */
    getAllPlayers() {
        const players = {};
        this.players.forEach((player, id) => {
            players[id] = player;
        });
        return players;
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

    /**
     * Handle player death
     * @param {string} socketId - ID of the player who died
     * @param {string} killerId - ID of the entity that killed the player (can be null)
     */
    handlePlayerDeath(socketId, killerId = null) {
        const player = this.getPlayer(socketId);
        if (!player) return;
        
        // Mark player as dead
        player.isDead = true;
        player.life = 0;
        
        // Also mark as invulnerable while dead to prevent further damage
        player.isInvulnerable = true;
        
        // Track death count
        if (!player.deathCount) {
            player.deathCount = 0;
        }
        player.deathCount++;
        
        // Track kill for the killer if it's a player
        if (killerId) {
            const killer = this.getPlayer(killerId);
            if (killer) {
                if (!killer.killCount) {
                    killer.killCount = 0;
                }
                killer.killCount++;
                console.log(`Player ${killerId} got a kill. Total kills: ${killer.killCount}`);
            }
        }
        
        console.log(`Player ${socketId} died${killerId ? ` killed by ${killerId}` : ''} (Death #${player.deathCount})`);
        
        // Schedule respawn
        setTimeout(() => {
            this.respawnPlayer(socketId);
        }, 5000); // 5 seconds respawn delay
    }
    
    /**
     * Respawn a player
     * @param {string} socketId - The socket ID of the player to respawn
     */
    respawnPlayer(socketId) {
        const player = this.getPlayer(socketId);
        if (!player) return;
        
        // Store current mana before resetting
        const currentMana = player.mana;
        const currentMaxMana = player.maxMana;
        
        // Reset player stats
        player.isDead = false;
        player.life = player.maxLife || GameConstants.PLAYER.DEFAULT_MAX_LIFE;
        
        // Explicitly preserve mana values
        player.mana = currentMana;
        player.maxMana = currentMaxMana;
        
        // Apply invulnerability for a few seconds after respawn to prevent spawn camping
        player.isInvulnerable = true;
        
        // Reset player position to temple spawn point with exact coordinates
        player.position = { 
            x: GameConstants.PLAYER.SPAWN_POSITION.x,
            y: GameConstants.PLAYER.SPAWN_POSITION.y,
            z: GameConstants.PLAYER.SPAWN_POSITION.z
        };
        
        console.log(`Player ${socketId} respawned in temple at position:`, player.position);
        console.log(`Preserving player path during respawn: ${player.path}`);
        console.log(`Preserving player mana during respawn: ${player.mana}/${player.maxMana}`);
        
        // Remove temporary invulnerability after 3 seconds
        setTimeout(() => {
            const updatedPlayer = this.getPlayer(socketId);
            if (updatedPlayer) {
                updatedPlayer.isInvulnerable = false;
                console.log(`Player ${socketId} is no longer invulnerable after respawn`);
            }
        }, 3000);
    }

    /**
     * Get player kill/death statistics
     * @param {string} socketId - The socket ID of the player
     * @returns {Object} Object containing kills and deaths
     */
    getPlayerKDRatio(socketId) {
        const player = this.getPlayer(socketId);
        if (!player) return { kills: 0, deaths: 0 };
        
        const kills = player.killCount || 0;
        const deaths = player.deathCount || 0;
        
        // Return kills and deaths as separate values
        return {
            kills,
            deaths,
            ratio: deaths > 0 ? kills / deaths : kills // Calculate ratio only if needed
        };
    }
}

export default PlayerManager;
