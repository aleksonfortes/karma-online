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
        this.darknessOverlay = null;
        
        // Add debug tracking variables to reduce console spam
        this.lastLoggedKarma = null;
        this.lastLoggedPulseIntensity = null;
    }
    
    init() {
        console.log('Initializing Karma Manager');
        
        // Initialize karma at neutral (50%)
        if (this.game.playerStats) {
            this.game.playerStats.currentKarma = 50;
            this.game.playerStats.maxKarma = 100;
            this.game.playerStats.path = null;
        }
        
        // Create darkness overlay for karma effects
        this.createDarknessOverlay();
        
        return true;
    }
    
    update() {
        // Handle karma recovery timer in the temple
        if (this.game.environmentManager && this.game.environmentManager.checkTempleProximity()) {
            const currentTime = Date.now();
            const timeSinceLastRecovery = currentTime - this.lastKarmaRecoveryTime;
            
            if (timeSinceLastRecovery >= 60000 && this.game.playerStats.currentKarma > 0) {
                this.adjustKarma(-1);
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
        const previousKarma = this.game.playerStats.currentKarma;
        this.game.playerStats.currentKarma = Math.max(0, Math.min(
            this.game.playerStats.maxKarma, 
            this.game.playerStats.currentKarma + amount
        ));
        
        console.log(`Local karma changed from ${previousKarma} to ${this.game.playerStats.currentKarma}`);
        
        // Update local display immediately if UI manager exists
        if (this.game.uiManager && typeof this.game.uiManager.updateStatusBars === 'function') {
            this.game.uiManager.updateStatusBars();
        }
        
        // Send karma update to server immediately
        if (this.game.networkManager && this.game.networkManager.socket?.connected) {
            const updateData = {
                id: this.game.networkManager.socket.id,
                karma: this.game.playerStats.currentKarma,
                maxKarma: this.game.playerStats.maxKarma,
                life: this.game.playerStats.currentLife,
                maxLife: this.game.playerStats.maxLife,
                mana: this.game.playerStats.currentMana,
                maxMana: this.game.playerStats.maxMana
            };
            
            // Emit dedicated karma update event
            this.game.networkManager.socket.emit('karmaUpdate', updateData);
            
            // Also update position and full state
            this.game.networkManager.sendPlayerState();
        }
        
        // Always update karma path and effects
        this.updateKarmaPath();
        this.updateKarmaEffects();
        
        return this.game.playerStats.currentKarma - previousKarma;
    }
    
    onKarmaThresholdCrossed() {
        // Show visual effects when crossing important thresholds
        
        // Update darkness overlay
        this.updateKarmaEffects();
        
        // Show notification about path change
        let message = '';
        if (this.game.playerStats.path === 'light') {
            message = 'Your karma debt has been reduced, leading you toward the light.';
        } else if (this.game.playerStats.path === 'dark') {
            message = 'Your karma debt has increased, pulling you toward darkness.';
        } else {
            message = 'Your karma is in balance.';
        }
        
        if (this.game.uiManager && typeof this.game.uiManager.showNotification === 'function') {
            this.game.uiManager.showNotification(message);
        } else {
            console.log(`Karma notification: ${message}`);
        }
    }
    
    updateKarmaPath() {
        // Update karma path based on current level
        const karma = this.game.playerStats.currentKarma;
        const maxKarma = this.game.playerStats.maxKarma;
        const previousPath = this.game.playerStats.path;
        
        if (karma > maxKarma * 0.7) {
            this.game.playerStats.path = "dark";
        } else if (karma < maxKarma * 0.3) {
            this.game.playerStats.path = "light";
        } else {
            this.game.playerStats.path = null;
        }
        
        // If path changed, trigger effects
        if (previousPath !== this.game.playerStats.path) {
            this.onKarmaThresholdCrossed();
        }
    }
    
    updateKarmaEffects() {
        // Update visual effects based on karma level
        const karma = this.game.playerStats.currentKarma;
        const maxKarma = this.game.playerStats.maxKarma;
        const karmaPercent = karma / maxKarma;
        
        // Update UI elements if they exist
        if (this.game.uiManager) {
            this.game.uiManager.updateKarmaDisplay(karma, maxKarma);
        }
        
        // Skip visual effects if no local player
        if (!this.game.localPlayer || !this.game.scene) return;
        
        // Calculate darkness multiplier based on karma zones with reduced maximum darkness
        let darknessMultiplier;
        if (karma === 50) {
            darknessMultiplier = 0.5;
        } else if (karma > 50) {
            // Scale the darkness to reach previous karma 80 levels at maximum
            const maxKarmaDarkness = 0.5 + ((80 - 50) / 50) * 0.5; // Previous darkness at karma 80
            darknessMultiplier = 0.5 + ((karma - 50) / 50) * (maxKarmaDarkness - 0.5);
        } else {
            darknessMultiplier = 0.5 - ((50 - karma) / 50) * 0.3;
        }

        // Update fog density based on karma zones
        const minFogDistance = 10;
        const maxFogDistance = 400;
        const fogNear = maxFogDistance - (darknessMultiplier * (maxFogDistance - minFogDistance));
        const fogFar = fogNear + (200 - (darknessMultiplier * 180));
        
        if (this.game.scene.fog) {
            this.game.scene.fog.near = fogNear;
            this.game.scene.fog.far = fogFar;
            const fogColor = new THREE.Color(0x004488);
            fogColor.multiplyScalar(1 - (darknessMultiplier * 0.9));
            this.game.scene.fog.color = fogColor;
            this.game.renderer.setClearColor(fogColor);
        }
        
        this.updateDarknessOverlay(karma, darknessMultiplier);
        
        // Update light intensity based on karma zones with reduced maximum darkness
        this.updateLightIntensity(darknessMultiplier);
        
        // Apply path-specific visual effects
        if (this.game.playerStats.path === 'light') {
            this.applyLightEffects((karma - 50) / 50);
            this.removeDarkEffects();
        } else if (this.game.playerStats.path === 'dark') {
            this.applyDarkEffects((50 - karma) / 50);
            this.removeLightEffects();
        } else {
            this.removeLightEffects();
            this.removeDarkEffects();
        }
    }
    
    updateDarknessOverlay(karma, darknessMultiplier) {
        if (!this.darknessOverlay) {
            console.warn('Darkness overlay not found, creating it now');
            this.createDarknessOverlay();
            if (!this.darknessOverlay) return;
        }
        
        // Get camera from camera manager
        const camera = this.game.cameraManager?.getCamera();
        if (!camera) {
            console.warn('Camera not available for darkness overlay');
            return;
        }
        
        // No darkness at all if karma is 0
        if (karma <= 0) {
            this.darknessOverlay.style.display = 'none';
            return;
        }
        
        // Get center of screen if no local player
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        
        // If we have a player, try to center the overlay on them
        if (this.game.localPlayer) {
            // Convert player's 3D position to screen coordinates
            const vector = this.game.localPlayer.position.clone();
            vector.project(camera);
    
            // Convert to screen coordinates
            x = (vector.x * 0.5 + 0.5) * window.innerWidth;
            y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
        }

        // Calculate visible area size based on karma with truly gradual scaling
        // Higher karma = more debt = smaller visible area (more darkness)
        let visibleRadius;
        
        // Linear scaling from large (100vmin) at 0 karma to small (10vmin) at 100 karma
        visibleRadius = Math.max(10, 100 - (karma * 0.9));
        
        // Calculate darkness intensity - truly gradual from 0 to almost 1
        // 0 karma = 0 darkness, 100 karma = 0.95 darkness
        const darkness = Math.min(0.95, karma / 100 * 0.95);
        
        // Only log when karma value changes
        if (this.lastLoggedKarma !== karma) {
            console.log(`Updating darkness overlay: karma=${karma}, darkness=${darkness.toFixed(2)}, radius=${visibleRadius.toFixed(0)}vmin`);
            this.lastLoggedKarma = karma;
        }
        
        // Ensure overlay is visible
        this.darknessOverlay.style.display = 'block';
        
        // Create radial gradient centered on player
        // Adjust the gradient stops for a more natural transition
        this.darknessOverlay.style.background = `
            radial-gradient(
                circle ${visibleRadius}vmin at ${x}px ${y}px,
                rgba(0,0,0,0) 0%,
                rgba(0,0,0,${darkness * 0.3}) 40%,
                rgba(0,0,0,${darkness * 0.7}) 70%,
                rgba(0,0,0,${darkness}) 100%
            )
        `;

        // Add pulsing effect for high karma
        if (karma > 70) {
            const pulseIntensity = (karma - 70) / 30 * 0.8;
            this.darknessOverlay.style.animation = `karmaPulse ${2 - pulseIntensity}s infinite`;
            
            // Only log when pulse intensity changes
            if (this.lastLoggedPulseIntensity === null || Math.abs(this.lastLoggedPulseIntensity - pulseIntensity) > 0.05) {
                console.log(`Applied karma pulse animation with intensity ${pulseIntensity.toFixed(2)}`);
                this.lastLoggedPulseIntensity = pulseIntensity;
            }
        } else {
            this.darknessOverlay.style.animation = 'none';
            this.lastLoggedPulseIntensity = null;
        }
    }
    
    updateLightIntensity(darknessMultiplier) {
        if (!this.game.scene) return;
        
        // Update light intensity based on karma zones with reduced maximum darkness
        const minLightIntensity = 0.2; // Increased from 0.1
        const maxLightIntensity = 0.8;
        const lightIntensity = maxLightIntensity - (darknessMultiplier * (maxLightIntensity - minLightIntensity));
        
        this.game.scene.traverse((object) => {
            if (object instanceof THREE.AmbientLight) {
                object.intensity = lightIntensity;
            }
            if (object instanceof THREE.DirectionalLight) {
                object.intensity = Math.max(0.4, 1.2 - (darknessMultiplier * 0.8)); // Reduced darkness impact
            }
            if (object instanceof THREE.HemisphereLight) {
                object.intensity = Math.max(0.3, 0.6 - (darknessMultiplier * 0.3)); // Reduced darkness impact
            }
        });
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
    
    removeLightEffects() {
        const lightAura = this.karmaEffects.get('lightAura');
        if (lightAura) {
            if (lightAura.parent) {
                lightAura.parent.remove(lightAura);
            }
            this.karmaEffects.delete('lightAura');
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
    
    removeDarkEffects() {
        const darkAura = this.karmaEffects.get('darkAura');
        if (darkAura) {
            if (darkAura.parent) {
                darkAura.parent.remove(darkAura);
            }
            this.karmaEffects.delete('darkAura');
        }
    }
    
    createDarknessOverlay() {
        // Remove existing overlay if it exists to prevent duplicates
        if (this.darknessOverlay && this.darknessOverlay.parentElement) {
            this.darknessOverlay.parentElement.removeChild(this.darknessOverlay);
        }
        
        // Create a full-screen overlay for darkness and vignette effects
        const overlay = document.createElement('div');
        overlay.id = 'karma-darkness-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0)'; // Start transparent
        overlay.style.pointerEvents = 'none'; // Allow clicking through
        overlay.style.zIndex = '1000'; // Ensure it's above other elements but below UI
        overlay.style.mixBlendMode = 'multiply'; // Better blending with the game
        
        // Add CSS to make the overlay more realistic with vignette effect
        overlay.style.background = `
            radial-gradient(
                circle 40vmin at 50% 50%,
                rgba(0,0,0,0) 0%,
                rgba(0,0,0,0.4) 50%,
                rgba(0,0,0,0.8) 100%
            )
        `;
        
        console.log('Creating karma darkness overlay');
        
        // Ensure the overlay is added to the document body
        document.body.appendChild(overlay);
        this.darknessOverlay = overlay;
        
        // Immediately update the overlay with current karma
        if (this.game.playerStats && typeof this.game.playerStats.currentKarma === 'number') {
            this.updateDarknessOverlay(this.game.playerStats.currentKarma, 1);
        }
        
        // Create CSS keyframes for karma pulsing effect
        if (!document.getElementById('karmaPulseStyle')) {
            const style = document.createElement('style');
            style.id = 'karmaPulseStyle';
            style.textContent = `
                @keyframes karmaPulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.6; }
                    100% { opacity: 1; }
                }
            `;
            document.head.appendChild(style);
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
        
        // Remove darkness overlay
        if (this.darknessOverlay && this.darknessOverlay.parentElement) {
            this.darknessOverlay.parentElement.removeChild(this.darknessOverlay);
        }
        
        // Remove any added styles
        const pulseStyle = document.getElementById('karmaPulseStyle');
        if (pulseStyle) {
            pulseStyle.remove();
        }
    }
    
    // Method to handle path selection
    choosePath(path) {
        if (this.chosenPath) return;
        
        if (path !== 'light' && path !== 'dark') {
            console.error('Invalid path choice:', path);
            return false;
        }
        
        this.chosenPath = path;
        
        // Update player stats
        if (this.game.playerStats) {
            this.game.playerStats.path = path;
        }
        
        // Add path-specific skills
        if (this.game.skillsManager) {
            // Clear existing skills first
            this.game.activeSkills.clear();
            
            if (path === 'light') {
                // Add light path skills
                this.game.skillsManager.addSkill('martial_arts');
                
                // Validate that the skill was added
                if (!this.game.activeSkills.has('martial_arts')) {
                    console.error('Failed to add martial_arts skill');
                    this.game.activeSkills.add('martial_arts');
                }
            } else if (path === 'dark') {
                // Add dark path skills
                this.game.skillsManager.addSkill('dark_strike');
                
                // Validate that the skill was added
                if (!this.game.activeSkills.has('dark_strike')) {
                    console.error('Failed to add dark_strike skill');
                    this.game.activeSkills.add('dark_strike');
                }
            }
            
            // Update UI
            if (this.game.uiManager) {
                this.game.uiManager.updateSkillBar();
            }
        }
        
        // Send path choice to server
        if (this.game.networkManager) {
            this.game.networkManager.sendPathChoice(path);
        }
        
        console.log(`Path chosen: ${path}`);
        return true;
    }
    
    // Handle server confirmation of path selection
    setChosenPath(path) {
        if (path !== 'light' && path !== 'dark') {
            console.error('Invalid path choice:', path);
            return false;
        }
        
        this.chosenPath = path;
        
        // Update player stats
        if (this.game.playerStats) {
            this.game.playerStats.path = path;
        }
        
        // Add path-specific skills
        if (this.game.skillsManager) {
            // Clear existing skills first
            this.game.activeSkills.clear();
            
            if (path === 'light') {
                // Add light path skills
                this.game.skillsManager.addSkill('martial_arts');
                
                // Validate that the skill was added
                if (!this.game.activeSkills.has('martial_arts')) {
                    console.error('Failed to add martial_arts skill');
                    this.game.activeSkills.add('martial_arts');
                }
            } else if (path === 'dark') {
                // Add dark path skills
                this.game.skillsManager.addSkill('dark_strike');
                
                // Validate that the skill was added
                if (!this.game.activeSkills.has('dark_strike')) {
                    console.error('Failed to add dark_strike skill');
                    this.game.activeSkills.add('dark_strike');
                }
            }
            
            // Update UI
            if (this.game.uiManager) {
                this.game.uiManager.updateSkillBar();
            }
        }
        
        // Send path choice to server
        if (this.game.networkManager) {
            this.game.networkManager.sendPathChoice(path);
        }
        
        console.log(`Path chosen: ${path}`);
        return true;
    }
}