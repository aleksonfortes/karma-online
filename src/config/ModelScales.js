/**
 * ModelScales.js - Centralized configuration for all 3D model scales in the game
 * 
 * This file provides a single source of truth for all model scaling in the game,
 * ensuring consistency between client and server representations.
 */

const ModelScales = {
    // Player model scaling
    PLAYER: {
        DEFAULT: 4.5, // Base scale for player models (matches the Light NPC scale)
        ORIGINAL_SCALE: 5.0, // The scale used in the original monolithic version
    },
    
    // NPC model scaling - these values match the original implementation
    // and account for the drastically different model sizes
    NPC: {
        DARK: {
            SCALE: 0.4,
            INTERACTION_TEXT_OFFSET: 0.3,
            COLLISION_RADIUS: 0.8
        },
        LIGHT: {
            SCALE: 4.5,
            INTERACTION_TEXT_OFFSET: 1.2,
            COLLISION_RADIUS: 2.0
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
    }
};

export default ModelScales;
