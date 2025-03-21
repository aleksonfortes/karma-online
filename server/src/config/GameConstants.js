/**
 * GameConstants.js - Centralized server-side configuration for all game constants
 * 
 * This file provides the single source of truth for all game constants,
 * ensuring consistency between client and server representations.
 */

const GameConstants = {
    PLAYER: {
        // Position and movement
        SPAWN_POSITION: { x: 0, y: 0, z: 0 }, // Set player at ground level to match NPCs
        DEFAULT_POSITION: { x: 0, y: 0, z: 0 }, // Alias for SPAWN_POSITION for client compatibility
        DEFAULT_ROTATION: { y: 0 },
        MOVE_SPEED: 10,
        ROTATE_SPEED: 3,
        COLLISION_RADIUS: 1.0,
        
        // Stats
        DEFAULT_LIFE: 100,
        DEFAULT_MAX_LIFE: 100,
        DEFAULT_MANA: 100,
        DEFAULT_MAX_MANA: 100,
        DEFAULT_KARMA: 50,
        DEFAULT_MAX_KARMA: 100,
        DEFAULT_PATH: null,
        
        // Model properties
        MODEL_SCALE: 4.5, // Matches the Light NPC scale
        MODEL_POSITION_Y_OFFSET: -1.5, // Adjusted from -1.65 to prevent sinking into the ground
    },
    
    // NPC model scaling - these values match the original implementation
    // and account for the drastically different model sizes
    NPC: {
        DARK: {
            SCALE: 0.4,
            INTERACTION_TEXT_OFFSET: 0.3,
            COLLISION_RADIUS: 1.2  // Increased from 0.8 to 1.2 for better collision detection
        },
        LIGHT: {
            SCALE: 4.5,
            INTERACTION_TEXT_OFFSET: 1.2,
            COLLISION_RADIUS: 2.5  // Increased from 2.0 to 2.5 for better collision detection
        }
    },
    
    // Temple NPC scaling (specific to Game.js)
    TEMPLE_NPC: {
        DARK: {
            SCALE: 2.5,
            POSITION: { x: 7, y: 3.5, z: -9 },
            ROTATION: -Math.PI / 4,
            TEXT_OFFSET: 1.1,
            TEXT_SCALE: { x: 0.5, y: 0.125, z: 1 }
        },
        LIGHT: {
            SCALE: 5.0,
            POSITION: { x: -7, y: 0.5, z: -9.5 },
            ROTATION: Math.PI / 4,
            TEXT_OFFSET: 1.04,
            TEXT_SCALE: { x: 0.3, y: 0.075, z: 0.8 }
        }
    },
    
    MOVEMENT: {
        RATE_LIMIT_MS: 100, // Minimum time between movement updates
        MAX_SPEED: 10 // Maximum units per second a player can move
    },
    
    // Monster configurations
    MONSTER: {
        BASIC: {
            SPAWN_POSITION: { x: 30, y: 0, z: 30 }, // Position further away from the temple area
            SCALE: 0.8,
            COLLISION_RADIUS: 1.0,
            MAX_HEALTH: 100,
            RESPAWN_TIME: 10000, // 10 seconds in milliseconds
            MOVEMENT_SPEED: 1.5, // Units per second
            AGGRO_RADIUS: 10,    // Detection radius in units
            MAX_FOLLOW_DISTANCE: 30, // Maximum distance monster can be from spawn point
            // Attack properties
            ATTACK_DAMAGE: 10,         // Base damage per attack
            ATTACK_RANGE: 2.0,         // Range at which monster can attack
            ATTACK_SPEED: 2000,        // Milliseconds between attacks
            ATTACK_ANIMATION_TIME: 500, // Milliseconds for attack animation
            EXPERIENCE_REWARD: 50      // Experience points rewarded when killed
        },
        TYPHON: {
            SPAWN_POSITION: { x: 0, y: 3, z: -80 }, // Raised y position to be above the grass
            SCALE: 3.0, // Increased scale by 3x
            COLLISION_RADIUS: 6.0, // Significantly increased collision radius to match the larger size
            MAX_HEALTH: 2000, // 20x more life than Cerberus
            RESPAWN_TIME: 30000, // 30 seconds respawn time
            MOVEMENT_SPEED: 1.5, // Same movement speed
            AGGRO_RADIUS: 15, // Increased aggro radius
            MAX_FOLLOW_DISTANCE: 40, // Can follow a bit further
            // Attack properties
            ATTACK_DAMAGE: 100, // 10x more damage than Cerberus
            ATTACK_RANGE: 6.0, // Significantly increased attack range to match the larger size
            ATTACK_SPEED: 2000, // Same attack speed
            ATTACK_ANIMATION_TIME: 500, // Same animation time
            EXPERIENCE_REWARD: 500, // 10x more experience
            HEALTH_REGEN: true, // Will regenerate health when out of combat
            HEALTH_REGEN_AMOUNT: 10, // Amount of health regained per second when out of combat
            HEALTH_REGEN_DELAY: 5000 // 5 seconds delay before health regeneration starts
        }
    },
    
    // Experience and leveling system
    EXPERIENCE: {
        BASE_EXPERIENCE: 100,  // Base experience needed for level 2
        SCALING_FACTOR: 1.5,   // How much more experience each level requires
        MAX_LEVEL: 50          // Maximum player level
    },
    
    // Level-up rewards scaling
    LEVEL_REWARDS: {
        LIFE_PER_LEVEL: 10,       // Health points gained per level
        MANA_PER_LEVEL: 5,        // Mana points gained per level
        DAMAGE_BONUS_PER_LEVEL: 0.02, // 2% increased damage per level
        DAMAGE_REDUCTION_PER_LEVEL: 0.01 // 1% reduced damage taken per level (max 30%)
    }
};

export default GameConstants;
