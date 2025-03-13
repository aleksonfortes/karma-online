import * as THREE from 'three';

export class SkillsManager {
    constructor(game) {
        this.game = game;
        
        // Add skills system
        this.skills = {
            martial_arts: {
                id: 'martial_arts',
                name: 'Martial Arts',
                icon: '🥋',
                slot: 1,
                cooldown: 2000,
                lastUsed: 0,
                damage: 75,
                range: 3,
                description: 'Basic martial arts attack'
            }
        };
    }
    
    init() {
        console.log('Initializing Skills Manager');
        // Any initialization logic for skills
        return true;
    }
    
    useSkill(skillId) {
        if (!this.skills[skillId]) {
            console.warn(`Skill ${skillId} not found`);
            return false;
        }
        
        // Get the skill
        const skill = this.skills[skillId];
        const now = Date.now();
        
        // Check if on cooldown
        if (now - skill.lastUsed < skill.cooldown) {
            console.log(`Skill ${skillId} is on cooldown`);
            return false;
        }
        
        // Use the skill
        console.log(`Using skill: ${skill.name}`);
        skill.lastUsed = now;
        
        // Handle specific skill effects
        switch(skillId) {
            case 'martial_arts':
                console.log('Martial arts attack!');
                this.useMartialArts();
                break;
            default:
                console.warn(`No implementation for skill ${skillId}`);
        }
        
        // Update UI
        if (this.game.uiManager) {
            this.game.uiManager.updateSkillBar();
        }
        
        return true;
    }
    
    useMartialArts() {
        // Prevent skill use if player is dead
        if (!this.game.isAlive) {
            console.log('Cannot use skills while dead');
            return;
        }

        // Check if player has the skill
        if (!this.game.activeSkills || !this.game.activeSkills.has('martial_arts')) {
            console.log('Player does not have martial arts skill');
            return;
        }
        
        // Check if player is on light path
        if (this.game.playerStats && this.game.playerStats.path !== 'light') {
            console.log('Only light path players can use martial arts');
            return;
        }

        // Prevent Illuminated players from using martial arts
        if (this.game.playerStats && this.game.playerStats.currentKarma === 0) {
            console.log('Illuminated players cannot use direct damage skills');
            return;
        }

        const skill = this.skills.martial_arts;
        const now = Date.now();

        // Check cooldown
        if (now - skill.lastUsed < skill.cooldown) {
            console.log('Martial arts skill is on cooldown');
            return;
        }

        // Find nearby players
        if (!this.game.localPlayer) {
            console.log('Local player not found');
            return;
        }

        const playerPos = this.game.localPlayer.position;
        let targetFound = false;

        // Check each player for potential targets
        this.game.players.forEach((otherPlayer, playerId) => {
            if (playerId === this.game.socket?.id) return; // Skip self
            
            // Skip dead players
            if (!otherPlayer.userData?.stats?.life || 
                otherPlayer.userData.stats.life <= 0 || 
                otherPlayer.userData.isDead) {
                console.log('Skipping dead player:', playerId);
                return;
            }

            const dx = otherPlayer.position.x - playerPos.x;
            const dz = otherPlayer.position.z - playerPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance <= skill.range) {
                targetFound = true;
                console.log('Target found in range, emitting damage event');
                
                // Emit damage event to server
                this.game.socket.emit('skillDamage', {
                    targetId: playerId,
                    damage: skill.damage,
                    skillName: 'martial_arts'
                });
            }
        });

        // Always create the effect regardless of target found
        this.createMartialArtsEffect();

        if (targetFound) {
            skill.lastUsed = now;
            console.log('Martial arts skill used successfully');
        } else {
            console.log('No targets in range for martial arts');
        }
    }
    
    createMartialArtsEffect() {
        if (!this.game.localPlayer || !this.game.scene) return;
        
        // Create a visual effect for the martial arts attack - simpler version matching original
        const effectGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const effectMaterial = new THREE.MeshBasicMaterial({
            color: 0xffcc00,
            transparent: true,
            opacity: 0.7
        });
        
        const effect = new THREE.Mesh(effectGeometry, effectMaterial);
        
        // Position in front of player
        const playerPos = this.game.localPlayer.position.clone();
        const forwardVec = new THREE.Vector3(0, 0, -1).applyQuaternion(this.game.localPlayer.quaternion);
        effect.position.copy(playerPos);
        effect.position.y += 1; // At chest level
        effect.position.add(forwardVec.multiplyScalar(1));
        
        this.game.scene.add(effect);
        
        // Animate and remove
        let scale = 1;
        const animate = () => {
            scale -= 0.1;
            effect.scale.set(scale, scale, scale);
            effect.material.opacity = scale;
            
            if (scale <= 0) {
                this.game.scene.remove(effect);
                effectGeometry.dispose();
                effectMaterial.dispose();
                return;
            }
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    findTargetsInRange(range) {
        const targets = [];
        
        // In a real game, we would check for enemies in range
        // This is a simplified version
        
        return targets;
    }
    
    applyDamageEffect(target, damage) {
        // In a real game, this would apply damage to the target
        // This is just a placeholder
        const flashEffect = () => {
            console.log(`Applied ${damage} damage to target`);
        };
        
        flashEffect();
    }
    
    cleanup() {
        // Reset skill state
        for (const skillName in this.skills) {
            this.skills[skillName].lastUsed = 0;
        }
    }
    
    update() {
        // Update skill cooldowns
        const now = Date.now();
        
        // Update skill UI if needed
        if (this.game.uiManager && typeof this.game.uiManager.updateSkillBar === 'function') {
            this.game.uiManager.updateSkillBar();
        }
    }
    
    // Add method to add skills to the player's active skills
    addSkill(skillId) {
        if (!this.skills[skillId]) {
            console.warn(`Cannot add skill ${skillId}: skill not found`);
            return false;
        }
        
        // Initialize activeSkills if it doesn't exist
        this.game.activeSkills = this.game.activeSkills || new Set();
        
        // Add the skill to the player's active skills
        this.game.activeSkills.add(skillId);
        console.log(`Added skill ${skillId} to player's active skills`);
        
        // Update the skill bar
        if (this.game.uiManager && typeof this.game.uiManager.updateSkillBar === 'function') {
            this.game.uiManager.updateSkillBar();
        }
        
        return true;
    }
} 