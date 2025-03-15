import * as THREE from 'three';

export class SkillsManager {
    constructor(game) {
        this.game = game;
        
        // Initialize skills system without default skills
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
                description: 'Close-range martial arts attack. Requires target and proximity.',
                path: 'light'
            },
            dark_strike: {
                id: 'dark_strike',
                name: 'Dark Strike',
                icon: '⚔️',
                slot: 1,
                cooldown: 2000,
                lastUsed: 0,
                damage: 75,
                range: 3,
                description: 'Basic dark path attack',
                path: 'dark'
            }
        };
        
        // Initialize active skills
        this.game.activeSkills = new Set();
    }
    
    init() {
        console.log('Initializing Skills Manager');
        return true;
    }
    
    /**
     * Update method called each frame by the game loop
     * @param {number} delta - Time elapsed since the last frame in seconds
     */
    update(delta) {
        // This method is intentionally left minimal
        // It's called every frame by the game loop
        // Add any per-frame skill updates here if needed in the future
    }
    
    useSkill(skillId) {
        if (!this.skills[skillId]) {
            console.warn(`Skill ${skillId} not found`);
            return false;
        }
        
        if (!this.game.activeSkills.has(skillId)) {
            console.log(`Player does not have ${skillId} skill`);
            return false;
        }
        
        const skill = this.skills[skillId];
        if (skill.path && skill.path !== this.game.karmaManager.chosenPath) {
            console.log(`Only ${skill.path} path players can use ${skillId}`);
            return false;
        }
        
        const now = Date.now();
        if (now - skill.lastUsed < skill.cooldown) {
            console.log(`Skill ${skillId} is on cooldown`);
            return false;
        }
        
        skill.lastUsed = now;
        console.log(`Using skill ${skillId}`);
        return true;
    }
    
    useMartialArts() {
        if (!this.game.isAlive) {
            console.log('Cannot use skills while dead');
            return;
        }

        if (!this.useSkill('martial_arts')) {
            return;
        }
        
        if (!this.game.targetingManager || !this.game.targetingManager.currentTarget) {
            console.log('No target selected for Martial Arts');
            return;
        }
        
        if (this.game.targetingManager.currentTarget.type !== 'player') {
            console.log('Martial Arts can only be used on players');
            return;
        }
        
        const targetId = this.game.targetingManager.currentTarget.id;
        const targetPlayer = this.game.targetingManager.currentTarget.object;
        
        if (!targetPlayer) {
            console.log('Target player object not found');
            return;
        }
        
        const playerPos = this.game.localPlayer.position;
        const targetPos = targetPlayer.position;
        
        const dx = targetPos.x - playerPos.x;
        const dz = targetPos.z - playerPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance > this.skills.martial_arts.range) {
            console.log(`Target is too far away (${distance.toFixed(2)} units). Need to be within ${this.skills.martial_arts.range} units.`);
            return;
        }
        
        this.applyDamageEffect({
            player: targetPlayer,
            playerId: targetId,
            distance: distance
        }, this.skills.martial_arts.damage);
        
        this.createMartialArtsEffect(targetPlayer);
    }
    
    useDarkStrike() {
        if (!this.game.isAlive) {
            console.log('Cannot use skills while dead');
            return;
        }

        if (!this.useSkill('dark_strike')) {
            return;
        }
        
        const targets = this.findTargetsInRange(this.skills.dark_strike.range);
        if (targets.length === 0) {
            console.log('No targets in range');
            return;
        }
        
        targets.forEach(target => {
            this.applyDamageEffect(target, this.skills.dark_strike.damage);
        });
        
        this.createDarkStrikeEffect();
    }
    
    createMartialArtsEffect(targetPlayer) {
        if (!this.game.localPlayer || !this.game.scene) return;
        
        const effectGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const effectMaterial = new THREE.MeshBasicMaterial({
            color: 0xffcc00,
            transparent: true,
            opacity: 0.7
        });
        
        const particleCount = 5;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            const particle = new THREE.Mesh(effectGeometry, effectMaterial.clone());
            
            const playerPos = this.game.localPlayer.position.clone();
            const targetPos = targetPlayer ? targetPlayer.position.clone() : playerPos.clone().add(new THREE.Vector3(0, 0, -1.5));
            
            const lerpFactor = 0.5 + (Math.random() * 0.3 - 0.15); 
            particle.position.lerpVectors(playerPos, targetPos, lerpFactor);
            
            particle.position.y += 1 + Math.random() * 0.5; 
            particle.position.x += Math.random() * 0.4 - 0.2; 
            particle.position.z += Math.random() * 0.4 - 0.2; 
            
            this.game.scene.add(particle);
            particles.push(particle);
        }
        
        let scale = 1;
        const animate = () => {
            scale -= 0.05;
            
            for (const particle of particles) {
                particle.scale.set(scale, scale, scale);
                particle.material.opacity = scale;
                
                particle.position.y -= 0.02;
            }
            
            if (scale <= 0) {
                for (const particle of particles) {
                    this.game.scene.remove(particle);
                }
                effectGeometry.dispose();
                
                for (const particle of particles) {
                    particle.material.dispose();
                }
                return;
            }
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    createDarkStrikeEffect() {
        if (!this.game.localPlayer || !this.game.scene) return;
        
        const effectGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const effectMaterial = new THREE.MeshBasicMaterial({
            color: 0x800080, 
            transparent: true,
            opacity: 0.7
        });
        
        const effect = new THREE.Mesh(effectGeometry, effectMaterial);
        
        const playerPos = this.game.localPlayer.position.clone();
        const forwardVec = new THREE.Vector3(0, 0, -1).applyQuaternion(this.game.localPlayer.quaternion);
        effect.position.copy(playerPos);
        effect.position.y += 1; 
        effect.position.add(forwardVec.multiplyScalar(1));
        
        this.game.scene.add(effect);
        
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
        
        if (!this.game.localPlayer || !this.game.playerManager?.players) {
            return targets;
        }
        
        const playerPos = this.game.localPlayer.position;
        
        this.game.playerManager.players.forEach((otherPlayer, playerId) => {
            if (playerId === this.game.networkManager?.socket?.id) return;
            
            if (!otherPlayer.userData?.stats?.life || 
                otherPlayer.userData.stats.life <= 0 || 
                otherPlayer.userData.isDead) {
                return;
            }
            
            const dx = otherPlayer.position.x - playerPos.x;
            const dz = otherPlayer.position.z - playerPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance <= range) {
                targets.push({
                    player: otherPlayer,
                    playerId: playerId,
                    distance: distance
                });
            }
        });
        
        return targets;
    }
    
    applyDamageEffect(target, damage) {
        if (!target || !target.playerId) {
            return;
        }
        
        if (this.game.networkManager && this.game.networkManager.socket) {
            this.game.networkManager.socket.emit('useSkill', {
                targetId: target.playerId,
                damage: damage,
                skillName: 'martial_arts'
            });
        }
        
        if (target.player) {
            this.createDamageEffect(target.player, damage);
        }
    }
    
    createDamageEffect(targetPlayer, damage, isCritical = false) {
        if (!targetPlayer || !this.game.scene) return;
        
        // Visual feedback on the target (flash red)
        if (targetPlayer.material) {
            const originalColor = targetPlayer.material.color.clone();
            targetPlayer.material.color.set(0xff0000);
            
            setTimeout(() => {
                targetPlayer.material.color.copy(originalColor);
            }, 200);
        }
        
        // Create floating damage text
        const damageId = `damage-${Date.now()}-${Math.random()}`;
        const damageText = document.createElement('div');
        damageText.id = damageId;
        damageText.textContent = damage;
        damageText.style.position = 'fixed';
        damageText.style.color = isCritical ? '#ff9900' : '#ffffff';
        damageText.style.fontSize = isCritical ? '24px' : '20px';
        damageText.style.fontWeight = 'bold';
        damageText.style.textShadow = '2px 2px 2px rgba(0,0,0,0.5)';
        damageText.style.pointerEvents = 'none';
        damageText.style.zIndex = '1000';
        document.body.appendChild(damageText);
        
        this.updateDamageTextPosition(damageText, targetPlayer);
        
        let opacity = 1;
        let y = parseFloat(damageText.style.top);
        
        const animate = () => {
            opacity -= 0.02;
            y -= 1;
            
            damageText.style.opacity = opacity;
            damageText.style.top = y + 'px';
            
            if (opacity <= 0) {
                const element = document.getElementById(damageId);
                if (element) {
                    document.body.removeChild(element);
                }
                return;
            }
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    updateDamageTextPosition(damageText, targetPlayer) {
        if (!targetPlayer || !this.game.camera) return;
        
        const position = targetPlayer.position.clone();
        position.y += 2; 
        
        const vector = position.project(this.game.camera);
        
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;
        
        damageText.style.left = x + 'px';
        damageText.style.top = y + 'px';
    }
    
    getActiveSkills() {
        const activeSkills = [];
        
        if (this.game.activeSkills) {
            this.game.activeSkills.forEach(skillId => {
                if (this.skills[skillId]) {
                    activeSkills.push(skillId);
                }
            });
        }
        
        return activeSkills;
    }
    
    getSkillBySlot(slot) {
        for (const skillId in this.skills) {
            if (this.skills[skillId].slot === slot && this.game.activeSkills.has(skillId)) {
                return this.skills[skillId];
            }
        }
        return null;
    }
    
    useSkillBySlot(slot) {
        const skill = this.getSkillBySlot(slot);
        if (!skill) return false;
        
        if (skill.id === 'martial_arts') {
            this.useMartialArts();
            return true;
        } else if (skill.id === 'dark_strike') {
            this.useDarkStrike();
            return true;
        }
        
        return false;
    }
    
    addSkill(skillId) {
        if (!this.skills[skillId]) {
            console.warn(`Cannot add unknown skill: ${skillId}`);
            return false;
        }
        
        this.game.activeSkills.add(skillId);
        console.log(`Added skill: ${skillId}`);
        return true;
    }
    
    clearSkills() {
        this.game.activeSkills.clear();
        console.log('Cleared all active skills');
    }
}