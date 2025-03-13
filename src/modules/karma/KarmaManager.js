import * as THREE from 'three';

export class KarmaManager {
    constructor(game) {
        this.game = game;
        this.karmaEffects = new Map();
        this.karmaThreshold = 70; // Threshold for significant karma effects
        this.lastKarmaUpdateTime = Date.now();
        this.karmaUpdateInterval = 60000; // 1 minute in ms
        this.lastKarmaRecoveryTime = Date.now();
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
        if (this.game.checkTempleProximity()) {
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
            if (this.game.checkTempleProximity && this.game.checkTempleProximity()) {
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
        console.log(`KarmaManager: Requesting path selection: ${path}`);
        
        // Delegate to Game's choosePath method which handles server communication
        if (this.game && typeof this.game.choosePath === 'function') {
            this.game.choosePath(path);
        } else {
            console.error('KarmaManager: Cannot choose path, Game.choosePath not available');
        }
    }
} 