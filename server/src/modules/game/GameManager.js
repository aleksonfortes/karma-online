/**
 * GameManager.js - Server-side game management
 * 
 * Handles game state, player updates, and game loop
 */
import * as THREE from 'three';
import PlayerManager from '../player/PlayerManager.js';
import NPCManager from '../npc/NPCManager.js';
import MonsterManager from '../monster/MonsterManager.js';
import GameConstants from '../../config/GameConstants.js';

export default class GameManager {
    constructor(io) {
        this.io = io;
        this.playerManager = new PlayerManager(this);
        this.npcManager = new NPCManager(this);
        this.monsterManager = new MonsterManager(this);
        this.gameState = {
            lastUpdate: Date.now()
        };
        
        // Start the game loop
        this.startGameLoop();
    }
    
    /**
     * Add a new player to the game
     * @param {string} socketId - The socket ID of the player
     * @returns {Object} The created player
     */
    addPlayer(socketId) {
        return this.playerManager.addPlayer(socketId);
    }
    
    /**
     * Remove a player from the game
     * @param {string} socketId - The socket ID of the player to remove
     * @returns {Object|null} The removed player or null if not found
     */
    removePlayer(socketId) {
        return this.playerManager.removePlayer(socketId);
    }
    
    /**
     * Get a player by socket ID
     * @param {string} socketId - The socket ID of the player
     * @returns {Object|undefined} The player object or undefined if not found
     */
    getPlayer(socketId) {
        return this.playerManager.getPlayer(socketId);
    }
    
    /**
     * Get all players
     * @returns {Array} Array of all player objects
     */
    getAllPlayers() {
        return this.playerManager.getAllPlayers();
    }
    
    /**
     * Get the number of players
     * @returns {number} The number of players
     */
    getPlayerCount() {
        return this.playerManager.getPlayerCount();
    }
    
    /**
     * Get all NPCs
     * @returns {Array} Array of all NPC objects
     */
    getAllNPCs() {
        return this.npcManager.getAllNPCs();
    }
    
    /**
     * Handle player interaction with NPC
     * @param {string} playerId - The player's socket ID
     * @param {string} npcId - The NPC ID
     * @returns {Object|null} NPC interaction data or null if not found
     */
    handleNPCInteraction(playerId, npcId) {
        return this.npcManager.handleNPCInteraction(playerId, npcId);
    }
    
    /**
     * Update a player's movement and state
     * @param {string} socketId - The socket ID of the player
     * @param {Object} data - The movement data
     * @returns {boolean} Whether the update was successful
     */
    updatePlayerMovement(socketId, data) {
        const player = this.playerManager.getPlayer(socketId);
        if (!player) return false;
        
        // Update player properties
        player.position = data.position;
        player.rotation = data.rotation;
        player.path = data.path;
        player.karma = data.karma;
        player.maxKarma = data.maxKarma;
        player.mana = data.mana;
        player.maxMana = data.maxMana;
        
        // Update effects based on karma
        this.playerManager.updatePlayerEffects(player);
        
        return true;
    }
    
    /**
     * Start the game update loop
     */
    startGameLoop() {
        // Update game state every 100ms (10 times per second)
        setInterval(() => this.update(), 100);
    }
    
    /**
     * Update game state
     */
    update() {
        const now = Date.now();
        const deltaTime = now - this.gameState.lastUpdate;
        this.gameState.lastUpdate = now;
        
        // Update NPCs to face nearby players
        this.npcManager.update(this.playerManager);
        
        // Update monsters
        this.monsterManager.update(this.playerManager);
        
        // Broadcast monster states to clients
        const monsterData = this.monsterManager.getAllMonsters();
        if (monsterData.length > 0) {
            this.io.emit('monster_data', monsterData);
        }
    }
    
    getGameState() {
        return {
            players: this.playerManager.getAllPlayers(),
            npcs: this.npcManager.getAllNPCs(),
            monsters: this.monsterManager.getAllMonsters()
        };
    }
    
    handleMonsterDeath(playerId, monsterId) {
        const monster = this.monsterManager.getMonsterById(monsterId);
        if (!monster) {
            console.warn(`Monster ${monsterId} not found for death handling`);
            return null;
        }
        
        // Award experience points to the player who killed the monster
        const player = this.playerManager.getPlayer(playerId);
        if (player) {
            const monsterConfig = GameConstants.MONSTER[monster.type || 'BASIC'];
            const expReward = monsterConfig.EXPERIENCE_REWARD;
            
            // Store the player's path before updating
            const playerPath = player.path || null;
            const playerSkills = player.skills || [];
            
            // Add experience to player
            player.experience = (player.experience || 0) + expReward;
            
            // Check if player leveled up
            const newLevel = this.calculatePlayerLevel(player.experience);
            const didLevelUp = newLevel > (player.level || 1);
            player.level = newLevel;
            
            // Ensure player path is maintained after level up
            if (playerPath) {
                player.path = playerPath;
            }
            
            // Ensure player skills are maintained
            player.skills = playerSkills;
            
            // Notify the player about experience gain and possible level up
            this.io.to(playerId).emit('experienceGain', {
                amount: expReward,
                totalExperience: player.experience,
                level: player.level,
                levelUp: didLevelUp,
                path: player.path
            });
            
            console.log(`Player ${playerId} gained ${expReward} exp for killing monster ${monsterId}. Total: ${player.experience}, Level: ${player.level}, Path: ${player.path || 'none'}`);
        }
        
        // Trigger monster death and respawn
        this.monsterManager.handleMonsterDeath(monsterId);
        
        // Notify all clients about the monster death
        this.io.emit('monster_update', {
            monsterId: monsterId,
            isAlive: false
        });
        
        return monster;
    }
    
    /**
     * Calculate player level based on experience points
     * @param {number} experience - The player's total experience
     * @returns {number} The player's level
     */
    calculatePlayerLevel(experience) {
        if (!experience) return 1;
        
        const baseExp = GameConstants.EXPERIENCE.BASE_EXPERIENCE;
        const scalingFactor = GameConstants.EXPERIENCE.SCALING_FACTOR;
        const maxLevel = GameConstants.EXPERIENCE.MAX_LEVEL;
        
        // Start at level 1
        let level = 1;
        
        // Track cumulative experience needed for each level
        let cumulativeExp = 0;
        
        while (level < maxLevel) {
            // Experience required for current level
            const expForThisLevel = baseExp * Math.pow(scalingFactor, level - 1);
            
            // Add to cumulative experience
            cumulativeExp += expForThisLevel;
            
            // If player's experience is less than cumulative experience needed, they're at the previous level
            if (experience < cumulativeExp) {
                return level;
            }
            
            // Otherwise, increment level and check the next one
            level++;
        }
        
        return maxLevel;
    }
    
    cleanup() {
        this.npcManager.cleanup();
        this.monsterManager.cleanup();
    }
}
