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
    }
};

export default GameConstants;
