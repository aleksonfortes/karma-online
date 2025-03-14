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
                description: 'Basic martial arts attack',
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
            return;
        }

        // Check if player has the skill - for light path players, we should always have this skill
        // This check is only needed for validation
        if (!this.game.activeSkills || !this.game.activeSkills.has('martial_arts')) {
            // If player is on light path but doesn't have the skill, add it
            if (this.game.karmaManager && this.game.karmaManager.chosenPath === 'light') {
                this.game.activeSkills.add('martial_arts');
            } else {
                return;
            }
        }
        
        // Check if player is on light path - use karmaManager.chosenPath for consistency
        // This is the key fix - we need to check the path in the karmaManager, not playerStats
        if (this.game.karmaManager.chosenPath !== 'light') {
            return;
        }
        
        // Use the skill
        if (!this.useSkill('martial_arts')) {
            return;
        }
        
        // Find targets in range
        const targets = this.findTargetsInRange(this.skills.martial_arts.range);
        if (targets.length === 0) {
            console.log('No targets in range');
            return;
        }
        
        // Apply damage to targets
        targets.forEach(target => {
            this.applyDamageEffect(target, this.skills.martial_arts.damage);
        });
        
        // Create visual effect
        this.createMartialArtsEffect();
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
        if (skill) {
            this.useSkill(skill.id);
        }
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