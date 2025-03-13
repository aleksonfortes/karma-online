/**
 * Server-side NPCManager.js
 * 
 * Manages NPC state, positions, and interactions on the server
 * Ensures consistent NPC behavior across all clients
 */
import GameConstants from '../../config/GameConstants.js';

export class NPCManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.npcs = new Map();
        
        // Initialize NPCs with their positions and types
        this.initializeNPCs();
    }
    
    initializeNPCs() {
        // Create Dark NPC
        const darkNPC = {
            id: 'dark_npc',
            type: 'dark_npc',
            position: { x: 5, y: 1, z: -5 },
            rotation: { y: 0 },
            scale: GameConstants.NPC.DARK.SCALE,
            collisionRadius: GameConstants.NPC.DARK.COLLISION_RADIUS,
            interactionTextOffset: GameConstants.NPC.DARK.INTERACTION_TEXT_OFFSET
        };
        
        // Create Light NPC
        const lightNPC = {
            id: 'light_npc',
            type: 'light_npc',
            position: { x: -5, y: 1, z: -5 },
            rotation: { y: 0 },
            scale: GameConstants.NPC.LIGHT.SCALE,
            collisionRadius: GameConstants.NPC.LIGHT.COLLISION_RADIUS,
            interactionTextOffset: GameConstants.NPC.LIGHT.INTERACTION_TEXT_OFFSET
        };
        
        // Add NPCs to the map
        this.npcs.set('dark_npc', darkNPC);
        this.npcs.set('light_npc', lightNPC);
        
        console.log('Server NPCs initialized:', this.npcs.size);
    }
    
    /**
     * Get all NPCs for initial client state
     */
    getAllNPCs() {
        return Array.from(this.npcs.values());
    }
    
    /**
     * Handle player interaction with NPC
     */
    handleNPCInteraction(playerId, npcId) {
        const npc = this.npcs.get(npcId);
        if (!npc) {
            console.warn(`NPC ${npcId} not found for interaction`);
            return null;
        }
        
        // Return the NPC data for the client to handle dialogue
        return {
            npcId: npc.id,
            type: npc.type
        };
    }
    
    /**
     * Check if a player is in proximity to an NPC
     */
    checkNPCProximity(playerPosition, npcId) {
        const npc = this.npcs.get(npcId);
        if (!npc) return false;
        
        const dx = playerPosition.x - npc.position.x;
        const dz = playerPosition.z - npc.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        return distance < npc.collisionRadius;
    }
    
    /**
     * Update NPC rotations to face nearby players
     */
    update(playerManager) {
        // Get all players
        const players = playerManager.getAllPlayers();
        
        // Update NPCs to face nearest players
        this.npcs.forEach(npc => {
            let closestPlayer = null;
            let closestDistance = Infinity;
            
            // Find closest player
            players.forEach(player => {
                const dx = player.position.x - npc.position.x;
                const dz = player.position.z - npc.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                if (distance < 10 && distance < closestDistance) {
                    closestPlayer = player;
                    closestDistance = distance;
                }
            });
            
            // Update NPC rotation to face closest player
            if (closestPlayer) {
                const angle = Math.atan2(
                    npc.position.x - closestPlayer.position.x,
                    npc.position.z - closestPlayer.position.z
                );
                npc.rotation.y = angle;
            }
        });
    }
}

export default NPCManager;
