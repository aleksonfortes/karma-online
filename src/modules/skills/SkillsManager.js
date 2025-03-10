import * as THREE from 'three';

export class SkillsManager {
    constructor(game) {
        this.game = game;
        
        // Add skills system with exact same properties as original
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
        // Add martial arts to active skills if on light path
        if (this.game.playerStats && this.game.playerStats.path === 'light') {
            this.game.activeSkills.add('martial_arts');
        }
        return true;
    }
    
    useSkill(skillId) {
        if (!this.skills[skillId]) {
            console.warn(`Skill ${skillId} not found`);
            return false;
        }
        
        // Prevent skill use if player is dead
        if (!this.game.isAlive) {
            console.log('Cannot use skills while dead');
            return false;
        }

        // Check if player has the skill
        if (!this.game.activeSkills || !this.game.activeSkills.has(skillId)) {
            console.log(`Player does not have ${skillId} skill`);
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
        
        // Handle specific skill effects
        switch(skillId) {
            case 'martial_arts':
                this.useMartialArts();
                break;
            default:
                console.warn(`No implementation for skill ${skillId}`);
                return false;
        }
        
        // Set last used time
        skill.lastUsed = now;
        
        // Update UI
        if (this.game.uiManager) {
            this.game.uiManager.updateSkillBar();
        }
        
        return true;
    }
    
    useMartialArts() {
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
                
                // Calculate damage based on karma - more damage with higher karma
                const baseDamage = skill.damage;
                const karmaMultiplier = this.game.playerStats.currentKarma / 50; // 1.0 at 50 karma, 2.0 at 100 karma
                const finalDamage = Math.floor(baseDamage * karmaMultiplier);
                
                // Emit damage event to server
                this.game.socket.emit('skillDamage', {
                    targetId: playerId,
                    damage: finalDamage,
                    skillName: 'martial_arts'
                });
            }
        });

        // Always create the effect regardless of target found
        this.createMartialArtsEffect();

        if (targetFound) {
            skill.lastUsed = now;
            console.log('Martial arts skill used successfully');
            
            // Reduce karma slightly when using offensive skills
            if (this.game.playerStats) {
                // Karma cost increases as karma gets higher
                const karmaCost = Math.max(1, Math.floor(this.game.playerStats.currentKarma / 25));
                this.game.karmaManager.adjustKarma(-karmaCost);
            }
        } else {
            console.log('No targets in range for martial arts');
        }
    }
    
    createMartialArtsEffect() {
        if (!this.game.localPlayer || !this.game.scene) return;
        
        // Create a visual effect for the martial arts attack - match original exactly
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
        
        // Add sound effect if available
        if (this.game.audioManager && typeof this.game.audioManager.playSound === 'function') {
            this.game.audioManager.playSound('martial_arts');
        }
    }
    
    // Handle receiving damage from other players
    receiveDamage(data) {
        if (!this.game.localPlayer || !this.game.isAlive) return;
        
        console.log('Received damage:', data);
        
        // Apply damage to player
        if (this.game.playerStats) {
            const previousLife = this.game.playerStats.currentLife;
            this.game.playerStats.currentLife = Math.max(0, this.game.playerStats.currentLife - data.damage);
            
            // Update UI
            if (this.game.uiManager) {
                this.game.uiManager.updateLifeBar(this.game.playerStats.currentLife, this.game.playerStats.maxLife);
            }
            
            // Create damage effect
            this.createDamageEffect(data.damage);
            
            // Check for death
            if (previousLife > 0 && this.game.playerStats.currentLife <= 0) {
                this.game.handlePlayerDeath();
            }
        }
    }
    
    createDamageEffect(damage) {
        if (!this.game.localPlayer || !this.game.scene) return;
        
        // Create floating damage text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 64;
        
        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        context.font = 'bold 32px Arial';
        context.fillStyle = '#ff0000';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(`-${damage}`, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(this.game.localPlayer.position);
        sprite.position.y += 2;
        sprite.scale.set(2, 1, 1);
        
        this.game.scene.add(sprite);
        
        // Animate and remove
        let time = 0;
        const animate = () => {
            time += 0.05;
            sprite.position.y += 0.05;
            sprite.material.opacity = 1 - time;
            
            if (time >= 1) {
                this.game.scene.remove(sprite);
                texture.dispose();
                material.dispose();
                return;
            }
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    // Handle cooldown display and UI updates
    getCooldownPercent(skillId) {
        if (!this.skills[skillId]) return 0;
        
        const skill = this.skills[skillId];
        const now = Date.now();
        const elapsed = now - skill.lastUsed;
        
        if (elapsed >= skill.cooldown) return 0;
        
        return 1 - (elapsed / skill.cooldown);
    }
    
    isSkillAvailable(skillId) {
        if (!this.skills[skillId]) return false;
        if (!this.game.activeSkills || !this.game.activeSkills.has(skillId)) return false;
        
        const skill = this.skills[skillId];
        const now = Date.now();
        
        return now - skill.lastUsed >= skill.cooldown;
    }
}