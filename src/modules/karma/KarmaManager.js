import * as THREE from 'three';

export class KarmaManager {
    constructor(game) {
        this.game = game;
        this.karmaRecoveryInterval = 10000; // 10 seconds
        this.lastKarmaRecoveryTime = Date.now();
        this.karmaRecoveryAmount = 1;
        this.darknessOverlay = null;
        this.darknessIntensity = 0;
        this.targetDarknessIntensity = 0;
        this.templeProximityThreshold = 20;
        this.karmaEffects = {
            vignette: null,
            particles: []
        };
    }
    
    init() {
        console.log('Initializing Karma Manager');
        // Create darkness overlay for visual effects
        this.createDarknessOverlay();
        return true;
    }
    
    createDarknessOverlay() {
        // Create darkness overlay for karma system
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'radial-gradient(circle, transparent 30%, rgba(0, 0, 0, 0) 70%)';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '1000';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.5s ease, background 0.5s ease';
        document.body.appendChild(overlay);
        
        this.darknessOverlay = overlay;
    }
    
    update() {
        this.updateKarmaRecovery();
        this.updateDarknessEffect();
        this.updateKarmaEffects();
    }
    
    updateKarmaRecovery() {
        const now = Date.now();
        
        // Check if it's time to recover karma
        if (now - this.lastKarmaRecoveryTime >= this.karmaRecoveryInterval) {
            // Only recover if not at max/min based on path
            if (this.game.playerStats.path === 'light' && this.game.playerStats.currentKarma < this.game.playerStats.maxKarma) {
                this.adjustKarma(this.karmaRecoveryAmount);
            } else if (this.game.playerStats.path === 'dark' && this.game.playerStats.currentKarma > 0) {
                this.adjustKarma(-this.karmaRecoveryAmount);
            }
            
            this.lastKarmaRecoveryTime = now;
        }
        
        // Check for temple proximity for faster karma recovery
        if (this.checkTempleProximity()) {
            // Temple proximity speeds up karma recovery/reduction
            if (now - this.lastKarmaRecoveryTime >= this.karmaRecoveryInterval / 2) {
                if (this.game.playerStats.path === 'light' && this.game.playerStats.currentKarma < this.game.playerStats.maxKarma) {
                    this.adjustKarma(this.karmaRecoveryAmount * 2);
                } else if (this.game.playerStats.path === 'dark' && this.game.playerStats.currentKarma > 0) {
                    this.adjustKarma(-this.karmaRecoveryAmount * 2);
                }
                
                this.lastKarmaRecoveryTime = now;
            }
        }
    }
    
    checkTempleProximity() {
        if (!this.game.localPlayer || !this.game.temple) return false;
        
        const playerPos = this.game.localPlayer.position;
        const templePos = this.game.temple.position;
        
        const dx = playerPos.x - templePos.x;
        const dz = playerPos.z - templePos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        return distance <= this.templeProximityThreshold;
    }
    
    adjustKarma(amount) {
        const stats = this.game.playerStats;
        
        // Update karma value
        stats.currentKarma = Math.max(0, Math.min(stats.maxKarma, stats.currentKarma + amount));
        
        // Update UI
        if (this.game.uiManager) {
            this.game.uiManager.updateKarmaBar(stats.currentKarma, stats.maxKarma);
        }
        
        // Check for path change or special states
        this.checkKarmaThresholds();
        
        // Update darkness effect based on karma
        this.updateDarknessIntensity();
        
        // Emit karma update to server
        if (this.game.socket && this.game.socket.connected) {
            this.game.socket.emit('updateKarma', {
                karma: stats.currentKarma,
                path: stats.path
            });
        }
    }
    
    checkKarmaThresholds() {
        const stats = this.game.playerStats;
        const previousPath = stats.path;
        
        // Check for path changes
        if (stats.currentKarma >= 75 && stats.path !== 'light') {
            stats.path = 'light';
            this.showPathChangeNotification('light');
        } else if (stats.currentKarma <= 25 && stats.path !== 'dark') {
            stats.path = 'dark';
            this.showPathChangeNotification('dark');
        } else if (stats.currentKarma > 25 && stats.currentKarma < 75 && stats.path !== null) {
            stats.path = null;
            this.showPathChangeNotification('neutral');
        }
        
        // Check for illumination (karma = 0)
        if (stats.currentKarma === 0 && stats.path === 'dark') {
            this.showIlluminationEffect();
        }
        
        // Check for enlightenment (karma = 100)
        if (stats.currentKarma === 100 && stats.path === 'light') {
            this.showEnlightenmentEffect();
        }
        
        // If path changed, update available skills
        if (previousPath !== stats.path) {
            this.updateAvailableSkills();
        }
    }
    
    updateAvailableSkills() {
        // Clear current skills
        this.game.activeSkills.clear();
        
        // Add skills based on path
        if (this.game.playerStats.path === 'light') {
            this.game.activeSkills.add('martial_arts');
        } else if (this.game.playerStats.path === 'dark') {
            // Dark path skills would be added here
        }
        
        // Update UI
        if (this.game.uiManager) {
            this.game.uiManager.updateSkillBar();
        }
    }
    
    updateDarknessIntensity() {
        const karma = this.game.playerStats.currentKarma;
        
        // Calculate darkness based on karma (more darkness for lower karma)
        if (karma <= 25) {
            // Dark path: increasing darkness as karma decreases
            this.targetDarknessIntensity = 0.5 + ((25 - karma) / 25) * 0.5;
        } else if (karma >= 75) {
            // Light path: slight glow effect
            this.targetDarknessIntensity = 0;
        } else {
            // Neutral: minimal darkness
            this.targetDarknessIntensity = 0.2;
        }
    }
    
    updateDarknessEffect() {
        // Smoothly transition to target darkness
        this.darknessIntensity += (this.targetDarknessIntensity - this.darknessIntensity) * 0.05;
        
        if (this.darknessOverlay) {
            // Update the darkness overlay
            if (this.game.playerStats.path === 'dark') {
                // Dark path: purple-black vignette
                this.darknessOverlay.style.background = `radial-gradient(circle, rgba(0, 0, 0, 0) 30%, rgba(40, 0, 60, ${this.darknessIntensity}) 100%)`;
                this.darknessOverlay.style.opacity = '1';
            } else if (this.game.playerStats.path === 'light') {
                // Light path: golden glow
                this.darknessOverlay.style.background = `radial-gradient(circle, rgba(255, 215, 0, 0.2) 30%, rgba(255, 215, 0, 0) 70%)`;
                this.darknessOverlay.style.opacity = '1';
            } else {
                // Neutral: minimal effect
                this.darknessOverlay.style.background = `radial-gradient(circle, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, ${this.darknessIntensity}) 100%)`;
                this.darknessOverlay.style.opacity = this.darknessIntensity > 0.1 ? '1' : '0';
            }
        }
    }
    
    updateKarmaEffects() {
        // Update any particle effects or other visual elements based on karma
        const karma = this.game.playerStats.currentKarma;
        
        // Add particles for extreme karma values
        if (karma <= 10 || karma >= 90) {
            this.addKarmaParticles();
        }
        
        // Update existing particles
        this.updateParticles();
    }
    
    addKarmaParticles() {
        if (!this.game.scene || !this.game.localPlayer) return;
        
        // Only add particles occasionally
        if (Math.random() > 0.1) return;
        
        const karma = this.game.playerStats.currentKarma;
        const isLight = karma >= 90;
        
        // Create particle geometry
        const geometry = new THREE.SphereGeometry(0.1, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: isLight ? 0xffdd00 : 0x6600cc,
            transparent: true,
            opacity: 0.7
        });
        
        const particle = new THREE.Mesh(geometry, material);
        
        // Position around player
        const playerPos = this.game.localPlayer.position.clone();
        const angle = Math.random() * Math.PI * 2;
        const radius = 1 + Math.random() * 2;
        
        particle.position.x = playerPos.x + Math.cos(angle) * radius;
        particle.position.y = playerPos.y + 1 + Math.random() * 2;
        particle.position.z = playerPos.z + Math.sin(angle) * radius;
        
        // Add velocity for animation
        particle.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.05,
                0.05 + Math.random() * 0.05,
                (Math.random() - 0.5) * 0.05
            ),
            life: 100 + Math.random() * 100
        };
        
        this.game.scene.add(particle);
        this.karmaEffects.particles.push(particle);
    }
    
    updateParticles() {
        // Update and remove particles as needed
        for (let i = this.karmaEffects.particles.length - 1; i >= 0; i--) {
            const particle = this.karmaEffects.particles[i];
            
            // Update position
            particle.position.add(particle.userData.velocity);
            
            // Update life and opacity
            particle.userData.life -= 1;
            particle.material.opacity = particle.userData.life / 200;
            
            // Remove if expired
            if (particle.userData.life <= 0) {
                this.game.scene.remove(particle);
                particle.geometry.dispose();
                particle.material.dispose();
                this.karmaEffects.particles.splice(i, 1);
            }
        }
    }
    
    showPathChangeNotification(path) {
        if (!this.game.uiManager) return;
        
        let message = '';
        let color = '';
        
        switch (path) {
            case 'light':
                message = 'You have chosen the path of Light';
                color = '#ffcc00';
                break;
            case 'dark':
                message = 'You have chosen the path of Darkness';
                color = '#6600cc';
                break;
            case 'neutral':
                message = 'You have returned to the path of Balance';
                color = '#ffffff';
                break;
        }
        
        this.game.uiManager.showNotification(message, color);
        
        // Create visual effect for path change
        this.createPathChangeEffect(path);
    }
    
    createPathChangeEffect(path) {
        if (!this.game.scene || !this.game.localPlayer) return;
        
        // Create a ring of particles around the player
        const numParticles = 20;
        const radius = 2;
        
        for (let i = 0; i < numParticles; i++) {
            const angle = (i / numParticles) * Math.PI * 2;
            
            // Create particle
            const geometry = new THREE.SphereGeometry(0.2, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color: path === 'light' ? 0xffdd00 : path === 'dark' ? 0x6600cc : 0xffffff,
                transparent: true,
                opacity: 0.7
            });
            
            const particle = new THREE.Mesh(geometry, material);
            
            // Position in a ring around player
            const playerPos = this.game.localPlayer.position;
            particle.position.x = playerPos.x + Math.cos(angle) * radius;
            particle.position.y = playerPos.y + 0.5;
            particle.position.z = playerPos.z + Math.sin(angle) * radius;
            
            // Add velocity for animation
            particle.userData = {
                velocity: new THREE.Vector3(0, 0.1, 0),
                life: 100
            };
            
            this.game.scene.add(particle);
            this.karmaEffects.particles.push(particle);
        }
    }
    
    showIlluminationEffect() {
        if (!this.game.uiManager) return;
        
        this.game.uiManager.showNotification('You have reached Illumination', '#6600cc');
        
        // Create special effect for illumination
        this.createSpecialKarmaEffect('illumination');
    }
    
    showEnlightenmentEffect() {
        if (!this.game.uiManager) return;
        
        this.game.uiManager.showNotification('You have reached Enlightenment', '#ffcc00');
        
        // Create special effect for enlightenment
        this.createSpecialKarmaEffect('enlightenment');
    }
    
    createSpecialKarmaEffect(type) {
        if (!this.game.scene || !this.game.localPlayer) return;
        
        const isIllumination = type === 'illumination';
        const color = isIllumination ? 0x6600cc : 0xffdd00;
        
        // Create a wave effect
        const geometry = new THREE.RingGeometry(0.1, 0.5, 32);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        });
        
        const wave = new THREE.Mesh(geometry, material);
        wave.rotation.x = -Math.PI / 2;
        
        // Position at player's feet
        const playerPos = this.game.localPlayer.position;
        wave.position.copy(playerPos);
        wave.position.y += 0.1;
        
        // Add to scene
        this.game.scene.add(wave);
        
        // Animate the wave
        let scale = 1;
        const maxScale = 10;
        
        const animate = () => {
            scale += 0.2;
            wave.scale.set(scale, scale, 1);
            wave.material.opacity = 1 - (scale / maxScale);
            
            if (scale >= maxScale) {
                this.game.scene.remove(wave);
                geometry.dispose();
                material.dispose();
                return;
            }
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }
}