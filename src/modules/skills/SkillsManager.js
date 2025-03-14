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
                range: 1.5,
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
        // Any initialization logic for skills
        return true;
    }
    
    useSkill(skillId) {
        if (!this.skills[skillId]) {
            console.warn(`Skill ${skillId} not found`);
            return false;
        }
        
        // Check if player has the skill
        if (!this.game.activeSkills.has(skillId)) {
            console.log(`Player does not have ${skillId} skill`);
            return false;
        }
        
        // Check if player is on the correct path
        const skill = this.skills[skillId];
        if (skill.path && skill.path !== this.game.karmaManager.chosenPath) {
            console.log(`Only ${skill.path} path players can use ${skillId}`);
            return false;
        }
        
        // Check cooldown
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
        // Prevent skill use if player is dead
        if (!this.game.isAlive) {
            console.log('Cannot use skills while dead');
            return;
        }

        // Check if skill is on cooldown
        if (this.skills.martial_arts.lastUsed > 0 && Date.now() - this.skills.martial_arts.lastUsed < this.skills.martial_arts.cooldown) {
            console.log('Martial Arts is on cooldown');
            return;
        }

        // Check if player has the skill - for light path players, we should always have this skill
        // This check is only needed for validation
        if (!this.game.activeSkills || !this.game.activeSkills.has('martial_arts')) {
            // If player is on light path but doesn't have the skill, add it
            if (this.game.karmaManager && this.game.karmaManager.chosenPath === 'light') {
                this.game.activeSkills.add('martial_arts');
            } else {
                console.log('Player does not have the Martial Arts skill');
                return;
            }
        }
        
        // Check if player is on light path - use karmaManager.chosenPath for consistency
        if (this.game.karmaManager.chosenPath !== 'light') {
            console.log('Only Light path players can use Martial Arts');
            return;
        }
        
        // Check if a target is selected
        if (!this.game.targetingManager || !this.game.targetingManager.currentTarget) {
            console.log('No target selected for Martial Arts');
            return;
        }
        
        // Check if the target is a player
        if (this.game.targetingManager.currentTarget.type !== 'player') {
            console.log('Martial Arts can only be used on players');
            return;
        }
        
        // Get the target player directly from the currentTarget object
        const targetId = this.game.targetingManager.currentTarget.id;
        const targetPlayer = this.game.targetingManager.currentTarget.object;
        
        if (!targetPlayer) {
            console.log('Target player object not found');
            return;
        }
        
        // Check if the target is in range
        const playerPos = this.game.localPlayer.position;
        const targetPos = targetPlayer.position;
        
        const dx = targetPos.x - playerPos.x;
        const dz = targetPos.z - playerPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance > this.skills.martial_arts.range) {
            console.log(`Target is too far away (${distance.toFixed(2)} units). Need to be within ${this.skills.martial_arts.range} units.`);
            return;
        }
        
        // Use the skill
        if (!this.useSkill('martial_arts')) {
            return;
        }
        
        // Apply damage to the target
        this.applyDamageEffect({
            player: targetPlayer,
            playerId: targetId,
            distance: distance
        }, this.skills.martial_arts.damage);
        
        // Create visual effect
        this.createMartialArtsEffect(targetPlayer);
    }
    
    useDarkStrike() {
        // Prevent skill use if player is dead
        if (!this.game.isAlive) {
            console.log('Cannot use skills while dead');
            return;
        }

        // Check if skill is on cooldown
        if (this.skills.dark_strike.lastUsed > 0 && Date.now() - this.skills.dark_strike.lastUsed < this.skills.dark_strike.cooldown) {
            return;
        }

        // Check if player has the skill - for dark path players, we should always have this skill
        if (!this.game.activeSkills || !this.game.activeSkills.has('dark_strike')) {
            // If player is on dark path but doesn't have the skill, add it
            if (this.game.karmaManager && this.game.karmaManager.chosenPath === 'dark') {
                this.game.activeSkills.add('dark_strike');
            } else {
                return;
            }
        }
        
        // Check if player is on dark path
        if (this.game.karmaManager.chosenPath !== 'dark') {
            return;
        }
        
        // Use the skill
        if (!this.useSkill('dark_strike')) {
            return;
        }
        
        // Find targets in range
        const targets = this.findTargetsInRange(this.skills.dark_strike.range);
        if (targets.length === 0) {
            console.log('No targets in range');
            return;
        }
        
        // Apply damage to targets
        targets.forEach(target => {
            this.applyDamageEffect(target, this.skills.dark_strike.damage);
        });
        
        // Create visual effect
        this.createDarkStrikeEffect();
    }
    
    createMartialArtsEffect(targetPlayer) {
        if (!this.game.localPlayer || !this.game.scene) return;
        
        // Create a visual effect for the martial arts attack - more dynamic close-range effect
        const effectGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const effectMaterial = new THREE.MeshBasicMaterial({
            color: 0xffcc00,
            transparent: true,
            opacity: 0.7
        });
        
        // Create multiple particles for a more dynamic effect
        const particleCount = 5;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            const particle = new THREE.Mesh(effectGeometry, effectMaterial.clone());
            
            // Position between player and target
            const playerPos = this.game.localPlayer.position.clone();
            const targetPos = targetPlayer ? targetPlayer.position.clone() : playerPos.clone().add(new THREE.Vector3(0, 0, -1.5));
            
            // Calculate position between player and target with some randomness
            const lerpFactor = 0.5 + (Math.random() * 0.3 - 0.15); // 0.35 to 0.65
            particle.position.lerpVectors(playerPos, targetPos, lerpFactor);
            
            // Add some height and randomness
            particle.position.y += 1 + Math.random() * 0.5; // Between 1 and 1.5 units high
            particle.position.x += Math.random() * 0.4 - 0.2; // Random x offset
            particle.position.z += Math.random() * 0.4 - 0.2; // Random z offset
            
            this.game.scene.add(particle);
            particles.push(particle);
        }
        
        // Animate and remove
        let scale = 1;
        const animate = () => {
            scale -= 0.05;
            
            for (const particle of particles) {
                particle.scale.set(scale, scale, scale);
                particle.material.opacity = scale;
                
                // Add some movement
                particle.position.y -= 0.02;
            }
            
            if (scale <= 0) {
                // Remove all particles
                for (const particle of particles) {
                    this.game.scene.remove(particle);
                }
                effectGeometry.dispose();
                
                // Dispose all materials
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
        
        // Create a visual effect for the dark strike attack
        const effectGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const effectMaterial = new THREE.MeshBasicMaterial({
            color: 0x800080, // Purple color for dark strike
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
        
        if (!this.game.localPlayer || !this.game.players) {
            return targets;
        }
        
        const playerPos = this.game.localPlayer.position;
        
        // Check all other players in the game
        this.game.players.forEach((otherPlayer, playerId) => {
            // Skip self
            if (playerId === this.game.socket?.id) return;
            
            // Skip dead players
            if (!otherPlayer.userData?.stats?.life || 
                otherPlayer.userData.stats.life <= 0 || 
                otherPlayer.userData.isDead) {
                return;
            }
            
            // Calculate distance to other player
            const dx = otherPlayer.position.x - playerPos.x;
            const dz = otherPlayer.position.z - playerPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Check if player is in range
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
        // Ensure we have a valid target
        if (!target || !target.playerId) {
            return;
        }
        
        // Send skill use event to server (not skillDamage)
        if (this.game.networkManager && this.game.networkManager.socket) {
            this.game.networkManager.socket.emit('useSkill', {
                targetId: target.playerId,
                damage: damage,
                skillName: 'martial_arts'
            });
        }
        
        // Create visual effect only if the target player exists
        if (target.player) {
            this.createDamageEffect(target.player, damage);
        }
    }
    
    createDamageEffect(targetPlayer, damage) {
        if (!targetPlayer || !this.game.scene) return;
        
        // Flash the target player
        if (targetPlayer.material) {
            const originalColor = targetPlayer.material.color.clone();
            targetPlayer.material.color.set(0xff0000);
            
            setTimeout(() => {
                targetPlayer.material.color.copy(originalColor);
            }, 200);
        }
        
        // Create damage number with unique ID
        const damageId = `damage-${Date.now()}-${Math.random()}`;
        const damageText = document.createElement('div');
        damageText.id = damageId;
        damageText.textContent = damage;
        damageText.style.position = 'fixed';
        damageText.style.color = '#ffffff';
        damageText.style.fontSize = '20px';
        damageText.style.fontWeight = 'bold';
        damageText.style.textShadow = '2px 2px 2px rgba(0,0,0,0.5)';
        damageText.style.pointerEvents = 'none';
        damageText.style.zIndex = '1000';
        document.body.appendChild(damageText);
        
        // Get screen position for damage number
        const targetPosition = targetPlayer.position.clone();
        targetPosition.y += 2; // Above the player's head
        
        // Convert 3D position to screen coordinates
        const vector = targetPosition.clone();
        
        // Safely project the vector
        try {
            if (this.game.camera) {
                vector.project(this.game.camera);
            } else if (this.game.cameraManager && this.game.cameraManager.getCamera()) {
                vector.project(this.game.cameraManager.getCamera());
            } else {
                // If no camera is available, don't show the damage number
                const element = document.getElementById(damageId);
                if (element) {
                    document.body.removeChild(element);
                }
                return;
            }
            
            const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;
            
            damageText.style.left = `${x}px`;
            damageText.style.top = `${y}px`;
            
            // Animate damage number
            let startTime = Date.now();
            let duration = 1000; // 1 second
            
            const animateDamage = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                damageText.style.opacity = 1 - progress;
                damageText.style.transform = `translateY(${-50 * progress}px)`;
                
                if (progress < 1) {
                    requestAnimationFrame(animateDamage);
                } else {
                    const element = document.getElementById(damageId);
                    if (element) {
                        document.body.removeChild(element);
                    }
                }
            };
            
            animateDamage();
        } catch (error) {
            console.error('Error displaying damage effect:', error);
            // Clean up if there was an error
            const element = document.getElementById(damageId);
            if (element) {
                document.body.removeChild(element);
            }
        }
    }
    
    cleanup() {
        // Reset skill state
        for (const skillName in this.skills) {
            this.skills[skillName].lastUsed = 0;
        }
    }
    
    update() {
        // Update skill cooldowns and UI
        if (this.game.uiManager) {
            this.game.uiManager.updateSkillBar();
        }
    }
    
    // Get active skills for UI
    getActiveSkills() {
        if (!this.game.activeSkills) {
            return [];
        }
        
        return Array.from(this.game.activeSkills);
    }
    
    // Get skill by slot
    getSkillBySlot(slot) {
        return Object.values(this.skills).find(skill => skill.slot === slot);
    }
    
    // Use skill by slot
    useSkillBySlot(slot) {
        const skill = this.getSkillBySlot(slot);
        if (!skill) {
            return false;
        }
        
        if (skill.id === 'martial_arts') {
            this.useMartialArts();
            return true;
        } else if (skill.id === 'dark_strike') {
            this.useDarkStrike();
            return true;
        }
        
        return false;
    }
    
    // Add method to add skills to the player's active skills
    addSkill(skillId) {
        if (!this.skills[skillId]) {
            console.warn(`Skill ${skillId} not found`);
            return false;
        }
        
        // Check if skill is already added
        if (this.game.activeSkills.has(skillId)) {
            return true; 
        }
        
        // Add skill only if player is on the correct path or if the skill has no path requirement
        const skill = this.skills[skillId];
        if (skill.path && this.game.karmaManager.chosenPath !== skill.path) {
            console.log(`Only ${skill.path} path players can learn ${skillId}`);
            return false;
        }
        
        // Add the skill to active skills
        this.game.activeSkills.add(skillId);
        
        // Update UI
        if (this.game.uiManager) {
            this.game.uiManager.updateSkillBar();
            
            // Show notification
            const skillName = skill.name || skillId;
            this.game.uiManager.showNotification(`You have learned ${skillName}!`, '#00cc00');
        }
        
        return true;
    }
    
    // Add method to clear all active skills (used during reconnection)
    clearSkills() {
        console.log('Clearing all active skills');
        this.game.activeSkills.clear();
        
        // Reset cooldowns
        for (const skillId in this.skills) {
            this.skills[skillId].lastUsed = 0;
        }
        
        // Update UI
        if (this.game.uiManager) {
            this.game.uiManager.updateSkillBar();
        }
    }
} 