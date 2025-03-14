import * as THREE from 'three';

export class KarmaManager {
    constructor(game) {
        this.game = game;
        this.karmaEffects = new Map();
        this.karmaThreshold = 70; // Threshold for significant karma effects
        this.lastKarmaUpdateTime = Date.now();
        this.karmaUpdateInterval = 60000; // 1 minute in ms
        this.lastKarmaRecoveryTime = Date.now();
        this.chosenPath = null;
    }
    
    init() {
        console.log('Initializing Karma Manager');
        
        // Initialize karma at neutral (50%)
        if (this.game.playerStats) {
            this.game.playerStats.currentKarma = 50;
            this.game.playerStats.maxKarma = 100;
            this.game.playerStats.path = null;
        }
        
        return true;
    }
    
    update() {
        // Handle karma recovery timer in the temple
        if (this.game.environmentManager && this.game.environmentManager.checkTempleProximity()) {
            const currentTime = Date.now();
            const timeSinceLastRecovery = currentTime - this.lastKarmaRecoveryTime;
            
            if (timeSinceLastRecovery >= 60000 && this.game.playerStats.currentKarma > 0) {
                this.game.adjustKarma(-1);
                this.lastKarmaRecoveryTime = currentTime;
            }
        } else {
            this.lastKarmaRecoveryTime = Date.now();
        }
        
        // Check for karma decay while in temple
        const currentTime = Date.now();
        const timeSinceLastUpdate = currentTime - this.lastKarmaUpdateTime;
        
        if (timeSinceLastUpdate >= this.karmaUpdateInterval) {
            // If in temple proximity, slowly reduce karma (move toward light/0)
            if (this.game.environmentManager && this.game.environmentManager.checkTempleProximity()) {
                this.adjustKarma(-1);
            }
            
            this.lastKarmaUpdateTime = currentTime;
        }
        
        // Update visual effects based on karma
        this.updateKarmaEffects();
    }
    
    adjustKarma(amount) {
        this.game.adjustKarma(amount);
    }
    
    onKarmaThresholdCrossed() {
        // Show visual effects when crossing important thresholds
        
        // Update darkness overlay if UI manager exists
        if (this.game.uiManager && typeof this.game.uiManager.updateDarknessOverlay === 'function') {
            this.game.uiManager.updateDarknessOverlay(this.game.playerStats.currentKarma / 100);
        }
        
        // Show notification about path change
        let message = '';
        if (this.game.playerStats.path === 'light') {
            message = 'You feel the light within you growing stronger.';
        } else if (this.game.playerStats.path === 'dark') {
            message = 'You feel darkness taking hold of your soul.';
        } else {
            message = 'Your karma is in balance.';
        }
        
        if (this.game.uiManager && typeof this.game.uiManager.showNotification === 'function') {
            this.game.uiManager.showNotification(message);
        } else {
            console.log(`Karma notification: ${message}`);
        }
    }
    
    updateKarmaEffects() {
        // Update visual effects based on karma level
        const karma = this.game.playerStats.currentKarma;
        const maxKarma = this.game.playerStats.maxKarma;
        
        // Update karma path based on current level
        if (karma < maxKarma * 0.3) {
            this.game.playerStats.path = "dark";
        } else if (karma > maxKarma * 0.7) {
            this.game.playerStats.path = "light";
        } else {
            this.game.playerStats.path = null;
        }
        
        // Update UI elements if they exist
        if (this.game.uiManager) {
            this.game.uiManager.updateKarmaDisplay(karma, maxKarma);
        }
        
        // Check for crossing thresholds
        if ((karma < this.karmaThreshold && this.game.playerStats.currentKarma >= this.karmaThreshold) ||
            (karma >= this.karmaThreshold && this.game.playerStats.currentKarma < this.karmaThreshold)) {
            this.onKarmaThresholdCrossed();
        }
    }
    
    applyLightEffects(intensity) {
        // Blue/white glow effect for light path
        if (!this.karmaEffects.has('lightAura')) {
            const lightGeometry = new THREE.SphereGeometry(2, 32, 32);
            const lightMaterial = new THREE.MeshBasicMaterial({
                color: 0x3366FF,
                transparent: true,
                opacity: 0
            });
            
            const lightAura = new THREE.Mesh(lightGeometry, lightMaterial);
            
            if (this.game.localPlayer) {
                this.game.localPlayer.add(lightAura);
                this.karmaEffects.set('lightAura', lightAura);
            }
        }
        
        // Update existing effect
        const lightAura = this.karmaEffects.get('lightAura');
        if (lightAura) {
            lightAura.material.opacity = 0.3 * intensity;
        }
    }
    
    applyDarkEffects(intensity) {
        // Red/black glow effect for dark path
        if (!this.karmaEffects.has('darkAura')) {
            const darkGeometry = new THREE.SphereGeometry(2, 32, 32);
            const darkMaterial = new THREE.MeshBasicMaterial({
                color: 0x990000,
                transparent: true,
                opacity: 0
            });
            
            const darkAura = new THREE.Mesh(darkGeometry, darkMaterial);
            
            if (this.game.localPlayer) {
                this.game.localPlayer.add(darkAura);
                this.karmaEffects.set('darkAura', darkAura);
            }
        }
        
        // Update existing effect
        const darkAura = this.karmaEffects.get('darkAura');
        if (darkAura) {
            darkAura.material.opacity = 0.3 * intensity;
        }
    }
    
    cleanup() {
        // Remove all karma effects
        this.karmaEffects.forEach((effect) => {
            if (effect.parent) {
                effect.parent.remove(effect);
            }
        });
        
        this.karmaEffects.clear();
    }
    
    // Method to handle path selection
    choosePath(path) {
        if (this.chosenPath) return;
        
        this.chosenPath = path;
        
        // Add path-specific skills
        if (path === 'light') {
            this.game.skillsManager.addSkill('martial_arts');
        } else if (path === 'dark') {
            this.game.skillsManager.addSkill('dark_strike');
        }
        
        // Update UI
        if (this.game.uiManager) {
            this.game.uiManager.updateSkillBar();
        }
        
        // Notify server
        this.game.networkManager.sendPathChoice(path);
    }
    
    // Handle server confirmation of path selection
    setChosenPath(path) {
        // Set the path
        this.chosenPath = path;
        
        // Update player stats
        if (this.game.playerStats) {
            this.game.playerStats.path = path;
        }
        
        // Add path-specific skills
        if (path === 'light') {
            // Add martial arts skill for light path
            if (this.game.skillsManager) {
                const skillAdded = this.game.skillsManager.addSkill('martial_arts');
                
                // Double-check that the skill was added successfully
                if (!this.game.activeSkills.has('martial_arts')) {
                    console.warn('Failed to add martial_arts skill, adding it directly');
                    this.game.activeSkills.add('martial_arts');
                }
            }
        } else if (path === 'dark') {
            // Add dark strike skill for dark path
            if (this.game.skillsManager) {
                const skillAdded = this.game.skillsManager.addSkill('dark_strike');
                
                // Double-check that the skill was added successfully
                if (!this.game.activeSkills.has('dark_strike')) {
                    console.warn('Failed to add dark_strike skill, adding it directly');
                    this.game.activeSkills.add('dark_strike');
                }
            }
        }
        
        // Update UI
        if (this.game.uiManager) {
            this.game.uiManager.updateSkillBar();
            
            // Show confirmation message
            if (path === 'light') {
                this.game.uiManager.showNotification('You have chosen the Light Path. You have learned Martial Arts skill!', '#ffcc00');
            } else if (path === 'dark') {
                this.game.uiManager.showNotification('You have chosen the Dark Path. Your power grows with darkness.', '#6600cc');
            }
        }
    }
}