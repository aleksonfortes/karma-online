import * as THREE from 'three';

export class UIManager {
    constructor(game) {
        this.game = game;
        this.dialogueUI = null;
        this.activeDialogue = null;
        this.statusElements = {};
        this.skillElements = {};
        this.darknessOverlay = null;
        this.loadingScreen = null;
        this.notificationElement = null;
        this.errorScreen = null;
    }
    
    // Add init method
    init() {
        console.log('Initializing UI Manager');
        // This method is called during game initialization
        // We'll create our UI elements when requested, not immediately
    }
    
    createUI() {
        console.log('Creating UI elements');
        
        // Create UI container for XP ring
        const uiContainer = document.createElement('div');
        uiContainer.style.position = 'fixed';
        uiContainer.style.bottom = '20px';
        uiContainer.style.left = '20px';
        uiContainer.style.display = 'flex';
        uiContainer.style.alignItems = 'center';
        uiContainer.style.gap = '10px';
        uiContainer.style.zIndex = '1000';
        document.body.appendChild(uiContainer);

        // Create and add the skill bar container with Life and Mana rings
        const skillBarWrapper = document.createElement('div');
        skillBarWrapper.style.position = 'fixed';
        skillBarWrapper.style.bottom = '20px';
        skillBarWrapper.style.left = '50%';
        skillBarWrapper.style.transform = 'translateX(-50%)';
        skillBarWrapper.style.display = 'flex';
        skillBarWrapper.style.flexDirection = 'column';
        skillBarWrapper.style.alignItems = 'center';
        skillBarWrapper.style.gap = '2px'; // Reduced from 5px to make elements almost touching
        document.body.appendChild(skillBarWrapper);

        // Create Karma bar container
        const karmaContainer = document.createElement('div');
        karmaContainer.style.width = '300px'; // Match skills bar width
        
        // Create karma bar with white background and black fill
        const karmaBar = document.createElement('div');
        karmaBar.style.position = 'relative';
        karmaBar.style.width = '100%';
        karmaBar.style.height = '12px';
        karmaBar.style.marginBottom = '4px';
        karmaBar.style.borderRadius = '6px';
        karmaBar.style.overflow = 'hidden';
        
        // White background for karma bar
        const karmaBackground = document.createElement('div');
        karmaBackground.style.position = 'absolute';
        karmaBackground.style.top = '0';
        karmaBackground.style.left = '0';
        karmaBackground.style.width = '100%';
        karmaBackground.style.height = '100%';
        karmaBackground.style.background = '#ffffff';
        karmaBackground.style.borderRadius = '6px';
        karmaBar.appendChild(karmaBackground);
        
        // Black fill for karma (starts at 50%)
        const karmaFill = document.createElement('div');
        karmaFill.className = 'fill';
        karmaFill.style.position = 'absolute';
        karmaFill.style.top = '0';
        karmaFill.style.left = '0';
        karmaFill.style.width = '50%'; // Default 50%
        karmaFill.style.height = '100%';
        karmaFill.style.background = '#000000';
        karmaFill.style.borderRadius = '6px';
        karmaFill.style.transition = 'width 0.3s ease-out';
        karmaBar.appendChild(karmaFill);
        
        // Center line indicator for karma neutral position
        const karmaCenterLine = document.createElement('div');
        karmaCenterLine.style.position = 'absolute';
        karmaCenterLine.style.top = '0';
        karmaCenterLine.style.left = '50%';
        karmaCenterLine.style.width = '2px';
        karmaCenterLine.style.height = '100%';
        karmaCenterLine.style.background = 'rgba(255, 215, 0, 0.8)'; // Golden line
        karmaCenterLine.style.zIndex = '2';
        karmaBar.appendChild(karmaCenterLine);
        
        // Karma tooltip
        const karmaTooltip = document.createElement('div');
        karmaTooltip.className = 'tooltip';
        karmaTooltip.style.position = 'absolute';
        karmaTooltip.style.bottom = '120%';
        karmaTooltip.style.left = '50%';
        karmaTooltip.style.transform = 'translateX(-50%)';
        karmaTooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        karmaTooltip.style.color = '#ffffff';
        karmaTooltip.style.padding = '5px 10px';
        karmaTooltip.style.borderRadius = '4px';
        karmaTooltip.style.fontSize = '12px';
        karmaTooltip.style.whiteSpace = 'nowrap';
        karmaTooltip.style.display = 'none';
        karmaTooltip.style.zIndex = '10';
        karmaTooltip.textContent = 'Karma: Neutral (50/100)';
        karmaBar.appendChild(karmaTooltip);
        
        // Show tooltip on hover
        karmaBar.addEventListener('mouseenter', () => {
            karmaTooltip.style.display = 'block';
        });
        
        karmaBar.addEventListener('mouseleave', () => {
            karmaTooltip.style.display = 'none';
        });
        
        karmaContainer.appendChild(karmaBar);
        this.karmaBarFill = karmaFill;
        this.karmaTooltip = karmaTooltip;

        // Create container for Life ring, skills, and Mana ring
        const gameplayContainer = document.createElement('div');
        gameplayContainer.style.display = 'flex';
        gameplayContainer.style.alignItems = 'center';
        gameplayContainer.style.gap = '30px'; // Increased from 20px for better spacing with larger rings

        // Create Life ring
        const lifeRing = this.createStatRing('#ff3333', '#660000', 'Life');
        this.lifeRingFill = lifeRing.querySelector('.fill');
        this.lifeTooltip = lifeRing.querySelector('.tooltip');

        // Create Mana ring
        const manaRing = this.createStatRing('#3333ff', '#000066', 'Mana');
        this.manaRingFill = manaRing.querySelector('.fill');
        this.manaTooltip = manaRing.querySelector('.tooltip');

        // Create skill bar
        const skillBarContainer = this.createSkillBar();

        // Assemble the gameplay container
        gameplayContainer.appendChild(lifeRing);
        gameplayContainer.appendChild(skillBarContainer);
        gameplayContainer.appendChild(manaRing);

        // Add to skill bar wrapper
        skillBarWrapper.appendChild(karmaContainer);
        skillBarWrapper.appendChild(gameplayContainer);

        // Create XP ring and level indicator
        this.createLevelIndicator();
        
        // Create darkness overlay for karma system
        this.createDarknessOverlay();
        
        // Store references for UI elements
        this.statusElements.skillBarWrapper = skillBarWrapper;
        this.statusElements.uiContainer = uiContainer;
        this.statusElements.karmaContainer = karmaContainer;
    }
    
    // Helper method to create status bars with modern styling
    createModernStatusBar(label, backgroundColor, fillColor) {
        const container = document.createElement('div');
        container.style.position = 'relative';
        container.style.width = '100%';
        container.style.height = '12px';
        container.style.marginBottom = '4px';
        container.style.borderRadius = '6px';
        container.style.overflow = 'hidden';
        
        // Bar background (white for karma, darker for others)
        const background = document.createElement('div');
        background.style.position = 'absolute';
        background.style.top = '0';
        background.style.left = '0';
        background.style.width = '100%';
        background.style.height = '100%';
        background.style.background = backgroundColor;
        background.style.borderRadius = '6px';
        container.appendChild(background);
        
        // Bar fill that shows from left to right
        const fill = document.createElement('div');
        fill.className = 'fill';
        fill.style.position = 'absolute';
        fill.style.top = '0';
        fill.style.left = '0';
        fill.style.width = '50%'; // Default 50%
        fill.style.height = '100%';
        fill.style.background = fillColor;
        fill.style.borderRadius = '6px';
        fill.style.transition = 'width 0.3s ease-out';
        container.appendChild(fill);
        
        // Text label
        const text = document.createElement('span');
        text.className = 'text';
        text.style.position = 'absolute';
        text.style.top = '50%';
        text.style.left = '10px';
        text.style.transform = 'translateY(-50%)';
        text.style.color = '#ffffff';
        text.style.fontSize = '10px';
        text.style.fontWeight = 'bold';
        text.style.textShadow = '1px 1px 1px #000000';
        text.style.zIndex = '5';
        text.textContent = label;
        container.appendChild(text);
        
        // Tooltip (hidden by default)
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.bottom = '120%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        tooltip.style.color = '#ffffff';
        tooltip.style.padding = '5px 10px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '12px';
        tooltip.style.whiteSpace = 'nowrap';
        tooltip.style.display = 'none';
        tooltip.style.zIndex = '10';
        container.appendChild(tooltip);
        
        // Show tooltip on hover
        container.addEventListener('mouseenter', () => {
            tooltip.style.display = 'block';
        });
        
        container.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
        
        return container;
    }
    
    // Create a stat ring (life, mana) with modern styling
    createStatRing(primaryColor, secondaryColor, statType) {
        const container = document.createElement('div');
        container.style.width = '80px';
        container.style.height = '80px';
        container.style.position = 'relative';
        container.style.borderRadius = '50%';
        container.style.background = 'rgba(0, 0, 0, 0.7)';
        container.style.border = '2px solid #333333';
        container.style.boxShadow = `0 0 15px ${primaryColor}55`;
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        
        // Create fill container - used for masking
        const fillContainer = document.createElement('div');
        fillContainer.style.position = 'absolute';
        fillContainer.style.top = '0';
        fillContainer.style.left = '0';
        fillContainer.style.width = '100%';
        fillContainer.style.height = '100%';
        fillContainer.style.borderRadius = '50%';
        fillContainer.style.overflow = 'hidden';
        container.appendChild(fillContainer);
        
        // Create fill element - this will be clipped
        const fill = document.createElement('div');
        fill.className = 'fill';
        fill.style.position = 'absolute';
        fill.style.top = '0';
        fill.style.left = '0';
        fill.style.width = '100%';
        fill.style.height = '100%';
        fill.style.background = `radial-gradient(circle, ${primaryColor}, ${secondaryColor})`;
        fill.style.clipPath = 'circle(50% at center)';
        fill.style.clipPath = 'inset(0 0 0 0)'; // Start at 100%
        fill.style.transition = 'clip-path 0.3s ease-out';
        fillContainer.appendChild(fill);
        
        // Inner dark background
        const innerCircle = document.createElement('div');
        innerCircle.style.position = 'absolute';
        innerCircle.style.top = '5%';
        innerCircle.style.left = '5%';
        innerCircle.style.width = '90%';
        innerCircle.style.height = '90%';
        innerCircle.style.borderRadius = '50%';
        innerCircle.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        innerCircle.style.zIndex = '2';
        innerCircle.style.display = 'flex';
        innerCircle.style.alignItems = 'center';
        innerCircle.style.justifyContent = 'center';
        container.appendChild(innerCircle);
        
        // Stat value
        const value = document.createElement('div');
        value.className = 'value';
        value.style.color = '#ffffff';
        value.style.fontSize = '18px';
        value.style.fontWeight = 'bold';
        value.style.textShadow = '0 0 3px #000000';
        value.textContent = '100';
        value.style.zIndex = '3';
        innerCircle.appendChild(value);
        
        // Tooltip for status
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.bottom = '120%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        tooltip.style.color = '#ffffff';
        tooltip.style.padding = '5px 10px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '12px';
        tooltip.style.whiteSpace = 'nowrap';
        tooltip.style.display = 'none';
        tooltip.style.zIndex = '10';
        tooltip.textContent = `${statType}: 100/100`;
        container.appendChild(tooltip);
        
        // Show tooltip on hover
        container.addEventListener('mouseenter', () => {
            tooltip.style.display = 'block';
        });
        
        container.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
        
        return container;
    }
    
    createLevelIndicator() {
        // Create circular icon with XP ring
        const iconContainer = document.createElement('div');
        iconContainer.style.width = '96px';
        iconContainer.style.height = '96px';
        iconContainer.style.position = 'fixed';
        iconContainer.style.bottom = '20px';
        iconContainer.style.left = '20px';
        iconContainer.style.borderRadius = '50%';
        iconContainer.style.background = 'rgba(0, 0, 0, 0.6)';
        iconContainer.style.border = '2px solid rgba(147, 255, 223, 0.15)';
        iconContainer.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
        iconContainer.style.zIndex = '1000';
        document.body.appendChild(iconContainer);

        // Create ring fill with golden gradient - more like original game
        const ringFill = document.createElement('div');
        ringFill.style.position = 'absolute';
        ringFill.style.width = '100%';
        ringFill.style.height = '100%';
        ringFill.style.borderRadius = '50%';
        ringFill.style.background = 'radial-gradient(circle, #FFD700, #b8860b)';
        ringFill.style.opacity = '0.8';
        ringFill.style.clipPath = 'circle(50% at center)';
        
        // Start with a small percentage filled
        const startPercent = 0;
        ringFill.style.clipPath = `inset(${100 - startPercent}% 0 0 0)`;
        ringFill.style.transition = 'clip-path 0.3s ease-out';
        
        iconContainer.appendChild(ringFill);
        this.xpRingFill = ringFill;

        // Create level text
        const levelText = document.createElement('div');
        levelText.textContent = this.game.playerStats.level || '1';
        levelText.style.position = 'absolute';
        levelText.style.top = '50%';
        levelText.style.left = '50%';
        levelText.style.transform = 'translate(-50%, -50%)';
        levelText.style.color = '#FFD700';  // Golden color
        levelText.style.fontSize = '38px'; 
        levelText.style.fontWeight = 'bold';
        levelText.style.textShadow = '0 0 10px rgba(255, 215, 0, 0.7)';  // Golden glow
        levelText.style.letterSpacing = '0.5px';
        levelText.style.userSelect = 'none';
        levelText.style.zIndex = '10';
        iconContainer.appendChild(levelText);
        this.levelText = levelText;

        // Add pulsing animation for the level text
        const style = document.createElement('style');
        style.textContent = `
            @keyframes levelPulse {
                0% { text-shadow: 0 0 10px rgba(255, 215, 0, 0.5); }
                50% { text-shadow: 0 0 15px rgba(255, 215, 0, 0.8); }
                100% { text-shadow: 0 0 10px rgba(255, 215, 0, 0.5); }
            }
        `;
        document.head.appendChild(style);
        levelText.style.animation = 'levelPulse 2s ease-in-out infinite';

        // Add XP tooltip
        const xpTooltip = document.createElement('div');
        xpTooltip.style.position = 'absolute';
        xpTooltip.style.bottom = '120%';
        xpTooltip.style.left = '50%';
        xpTooltip.style.transform = 'translateX(-50%)';
        xpTooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        xpTooltip.style.color = '#ffffff';
        xpTooltip.style.padding = '5px 10px';
        xpTooltip.style.borderRadius = '4px';
        xpTooltip.style.fontSize = '12px';
        xpTooltip.style.fontWeight = '500';
        xpTooltip.style.whiteSpace = 'nowrap';
        xpTooltip.style.display = 'none';
        xpTooltip.style.zIndex = '1001';
        xpTooltip.textContent = 'Level 1: 0/100 XP';
        document.body.appendChild(xpTooltip);
        this.xpTooltip = xpTooltip;

        // Show tooltip on hover
        iconContainer.addEventListener('mouseenter', () => {
            this.xpTooltip.style.display = 'block';
        });
        
        iconContainer.addEventListener('mouseleave', () => {
            this.xpTooltip.style.display = 'none';
        });
        
        // Store for reference
        this.statusElements.iconContainer = iconContainer;
    }
    
    createSkillBar() {
        // Create skill bar container that matches original style
        const skillBarContainer = document.createElement('div');
        skillBarContainer.style.display = 'flex';
        skillBarContainer.style.gap = '10px';
        skillBarContainer.style.padding = '5px 10px';
        skillBarContainer.style.background = 'rgba(0, 0, 0, 0.6)';
        skillBarContainer.style.borderRadius = '8px';
        skillBarContainer.style.border = '1px solid #444';
        
        // Initialize skill slots
        const keybinds = ['SPACE', 'Q', 'E', 'R', 'F'];
        this.skillElements = {};
        
        for (let i = 1; i <= 5; i++) {
            // Create skill container (button + keybind)
            const skillContainer = document.createElement('div');
            skillContainer.style.position = 'relative';
            skillContainer.style.display = 'flex';
            skillContainer.style.flexDirection = 'column';
            skillContainer.style.alignItems = 'center';
            
            // Create the skill button
            const skillButton = document.createElement('div');
            skillButton.style.width = '45px';
            skillButton.style.height = '45px';
            skillButton.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            skillButton.style.border = '1px solid #666';
            skillButton.style.borderRadius = '5px';
            skillButton.style.display = 'flex';
            skillButton.style.justifyContent = 'center';
            skillButton.style.alignItems = 'center';
            skillButton.style.color = '#ccc';
            skillButton.style.fontSize = '22px';
            skillButton.style.overflow = 'hidden';
            skillButton.style.position = 'relative';
            skillButton.dataset.empty = 'true';
            
            // Add keybind label under the button
            const keyLabel = document.createElement('div');
            keyLabel.style.marginTop = '4px';
            keyLabel.style.color = '#999';
            keyLabel.style.fontSize = '10px';
            keyLabel.style.fontWeight = 'bold';
            keyLabel.style.textShadow = '1px 1px 1px rgba(0,0,0,0.5)';
            keyLabel.textContent = keybinds[i-1];
            
            // Add tooltip for the skill
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.style.position = 'absolute';
            tooltip.style.top = '-40px';
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translateX(-50%)';
            tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
            tooltip.style.color = '#ffffff';
            tooltip.style.padding = '5px 8px';
            tooltip.style.borderRadius = '4px';
            tooltip.style.fontSize = '12px';
            tooltip.style.whiteSpace = 'nowrap';
            tooltip.style.display = 'none';
            tooltip.style.zIndex = '1500';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
            
            // Store elements for later updates
            this.skillElements[i] = {
                container: skillContainer,
                button: skillButton,
                label: keyLabel,
                tooltip: tooltip,
                cooldownOverlay: null, // Will be added when needed
                isOnCooldown: false
            };
            
            // Show tooltip on hover
            skillButton.addEventListener('mouseenter', () => {
                if (skillButton.dataset.empty !== 'true') {
                    tooltip.style.display = 'block';
                }
            });
            
            skillButton.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });
            
            // Assemble skill UI elements
            skillContainer.appendChild(skillButton);
            skillContainer.appendChild(tooltip);
            skillContainer.appendChild(keyLabel);
            skillBarContainer.appendChild(skillContainer);
        }
        
        return skillBarContainer;
    }
    
    updateStatusBars(playerStats) {
        if (!playerStats) return;
        
        // Update health/life ring
        if (this.lifeRingFill && this.lifeTooltip) {
            const healthPercent = (playerStats.currentLife / playerStats.maxLife) * 100;
            // Update linear style fill from bottom to top (more like original)
            this.lifeRingFill.style.clipPath = `inset(${100 - healthPercent}% 0 0 0)`;
            
            const lifeValue = this.lifeRingFill.parentElement.parentElement.querySelector('.value');
            if (lifeValue) {
                lifeValue.textContent = Math.round(playerStats.currentLife);
            }
            
            this.lifeTooltip.textContent = `Life: ${Math.round(playerStats.currentLife)}/${playerStats.maxLife}`;
        }
        
        // Update mana ring
        if (this.manaRingFill && this.manaTooltip) {
            const manaPercent = (playerStats.currentMana / playerStats.maxMana) * 100;
            // Update linear style fill from bottom to top (more like original)
            this.manaRingFill.style.clipPath = `inset(${100 - manaPercent}% 0 0 0)`;
            
            const manaValue = this.manaRingFill.parentElement.parentElement.querySelector('.value');
            if (manaValue) {
                manaValue.textContent = Math.round(playerStats.currentMana);
            }
            
            this.manaTooltip.textContent = `Mana: ${Math.round(playerStats.currentMana)}/${playerStats.maxMana}`;
        }
        
        // Update karma bar
        if (this.karmaBarFill && this.karmaTooltip) {
            const karmaPercent = (playerStats.currentKarma / playerStats.maxKarma) * 100;
            this.karmaBarFill.style.width = `${karmaPercent}%`;
            
            // Update karma tooltip with path information
            let karmaPath = 'Neutral';
            if (karmaPercent < 30) {
                karmaPath = 'Light';
                this.updateDarknessOverlay(0.3, 'rgba(0, 50, 255, 0.15)');
            } else if (karmaPercent > 70) {
                karmaPath = 'Dark';
                this.updateDarknessOverlay(0.3, 'rgba(100, 0, 0, 0.15)');
            } else {
                this.updateDarknessOverlay(0, 'transparent');
            }
            
            this.karmaTooltip.textContent = `Karma: ${karmaPath} (${Math.round(playerStats.currentKarma)}/${playerStats.maxKarma})`;
        }
        
        // Update XP fill
        if (playerStats.level && this.levelText) {
            this.levelText.textContent = playerStats.level;
        }
        
        if (playerStats.experience !== undefined && 
            playerStats.experienceToNextLevel !== undefined && 
            this.xpRingFill && this.xpTooltip) {
            
            const xpPercent = (playerStats.experience / playerStats.experienceToNextLevel) * 100;
            // Update linear fill from bottom to top - matching original style
            this.xpRingFill.style.clipPath = `inset(${100 - xpPercent}% 0 0 0)`;
            
            this.xpTooltip.textContent = `Level ${playerStats.level}: ${playerStats.experience}/${playerStats.experienceToNextLevel} XP`;
        }
    }
    
    updateDarknessOverlay(opacity = 0, color = 'rgba(0, 0, 0, 0.2)') {
        if (!this.darknessOverlay) return;
        
        if (opacity > 0) {
            this.darknessOverlay.style.backgroundColor = color;
            this.darknessOverlay.style.opacity = opacity.toString();
            this.darknessOverlay.style.display = 'block';
        } else {
            this.darknessOverlay.style.opacity = '0';
            setTimeout(() => {
                this.darknessOverlay.style.display = 'none';
            }, 300);
        }
    }
    
    updateSkillBar() {
        console.log('Updating skill bar with:', {
            playerPath: this.game.playerStats?.path,
            activeSkills: Array.from(this.game.activeSkills || []),
            hasSkills: !!this.game.skills
        });
        
        if (!this.game.skills || !this.skillElements) {
            console.warn('Cannot update skill bar: skills or skillElements not found');
            return;
        }
        
        // Get active skills from the game
        const activeSkills = this.game.activeSkills || new Set();
        
        // Update skill buttons based on player's path and available skills
        for (let i = 1; i <= 5; i++) {
            const slotElement = this.skillElements[i];
            if (!slotElement || !slotElement.button) continue;
            
            // Reset slot
            slotElement.button.innerHTML = '';
            slotElement.button.dataset.empty = 'true';
            slotElement.tooltip.textContent = '';
            
            // Bind martial arts to slot 1 if player is on light path and has the skill
            if (i === 1 && 
                this.game.skills.martial_arts && 
                this.game.playerStats && 
                this.game.playerStats.path === 'light' && 
                activeSkills.has('martial_arts')) {
                
                console.log('Adding martial arts skill to skill bar');
                const skill = this.game.skills.martial_arts;
                
                // Create skill icon
                const icon = document.createElement('div');
                icon.textContent = '👊';
                icon.style.fontSize = '24px';
                slotElement.button.appendChild(icon);
                slotElement.button.dataset.empty = 'false';
                slotElement.button.dataset.skill = 'martial_arts';
                
                // Update tooltip
                slotElement.tooltip.textContent = `${skill.name} (${skill.damage} dmg)`;
                
                // Check cooldown
                const now = Date.now();
                const cooldownRemaining = skill.lastUsed + skill.cooldown - now;
                
                // Show cooldown overlay if on cooldown
                if (cooldownRemaining > 0) {
                    const cooldownOverlay = document.createElement('div');
                    cooldownOverlay.style.position = 'absolute';
                    cooldownOverlay.style.top = '0';
                    cooldownOverlay.style.left = '0';
                    cooldownOverlay.style.width = '100%';
                    cooldownOverlay.style.height = '100%';
                    cooldownOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                    cooldownOverlay.style.display = 'flex';
                    cooldownOverlay.style.justifyContent = 'center';
                    cooldownOverlay.style.alignItems = 'center';
                    cooldownOverlay.style.color = 'white';
                    cooldownOverlay.style.fontSize = '16px';
                    cooldownOverlay.style.fontWeight = 'bold';
                    cooldownOverlay.textContent = Math.ceil(cooldownRemaining / 1000);
                    
                    slotElement.button.appendChild(cooldownOverlay);
                }
            }
        }
        
        console.log('Skill bar updated');
    }
    
    createDarknessOverlay() {
        // Create overlay for karma effects
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        overlay.style.pointerEvents = 'none'; // Allow clicking through
        overlay.style.zIndex = '500'; // Below UI elements but above game
        overlay.style.opacity = '0'; // Initially transparent
        overlay.style.transition = 'opacity 0.5s ease';
        overlay.style.display = 'none';
        
        document.body.appendChild(overlay);
        this.darknessOverlay = overlay;
    }
    
    createDeathOverlay(onRespawn) {
        // Create a fullscreen darkened overlay
        const deathOverlay = document.createElement('div');
        deathOverlay.style.position = 'fixed';
        deathOverlay.style.top = '0';
        deathOverlay.style.left = '0';
        deathOverlay.style.width = '100%';
        deathOverlay.style.height = '100%';
        deathOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        deathOverlay.style.zIndex = '2000';
        deathOverlay.style.display = 'flex';
        deathOverlay.style.flexDirection = 'column';
        deathOverlay.style.justifyContent = 'center';
        deathOverlay.style.alignItems = 'center';
        deathOverlay.style.opacity = '0';
        deathOverlay.style.transition = 'opacity 1s ease';
        
        // Death message
        const deathMessage = document.createElement('div');
        deathMessage.textContent = 'YOU DIED';
        deathMessage.style.color = '#ff0000';
        deathMessage.style.textShadow = '0 0 10px #ff0000';
        deathMessage.style.fontFamily = 'Arial, sans-serif';
        deathMessage.style.fontSize = '72px';
        deathMessage.style.fontWeight = 'bold';
        deathMessage.style.marginBottom = '50px';
        
        // Respawn button
        const respawnButton = document.createElement('button');
        respawnButton.textContent = 'RESPAWN';
        respawnButton.style.padding = '15px 30px';
        respawnButton.style.backgroundColor = '#333333';
        respawnButton.style.color = '#ffffff';
        respawnButton.style.border = '2px solid #666666';
        respawnButton.style.borderRadius = '5px';
        respawnButton.style.fontFamily = 'Arial, sans-serif';
        respawnButton.style.fontSize = '24px';
        respawnButton.style.cursor = 'pointer';
        respawnButton.style.transition = 'all 0.2s ease';
        
        respawnButton.addEventListener('mouseover', () => {
            respawnButton.style.backgroundColor = '#555555';
        });
        
        respawnButton.addEventListener('mouseout', () => {
            respawnButton.style.backgroundColor = '#333333';
        });
        
        respawnButton.addEventListener('click', () => {
            deathOverlay.style.opacity = '0';
            setTimeout(() => {
                deathOverlay.remove();
                if (onRespawn) onRespawn();
            }, 1000);
        });
        
        deathOverlay.appendChild(deathMessage);
        deathOverlay.appendChild(respawnButton);
        document.body.appendChild(deathOverlay);
        
        // Fade in
        setTimeout(() => {
            deathOverlay.style.opacity = '1';
        }, 100);
    }
    
    showDialogue(npcType) {
        console.log(`Showing dialogue for ${npcType}`);
        
        // Check if a dialogue is already open
        if (this.dialogueUI) {
            this.hideDialogue();
        }
        
        // Create dialogue container
        const dialogueContainer = document.createElement('div');
        dialogueContainer.style.position = 'fixed';
        dialogueContainer.style.top = '50px';
        dialogueContainer.style.left = '50%';
        dialogueContainer.style.transform = 'translateX(-50%)';
        dialogueContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
        dialogueContainer.style.padding = '25px';
        dialogueContainer.style.borderRadius = '15px';
        dialogueContainer.style.color = 'white';
        dialogueContainer.style.maxWidth = '800px';
        dialogueContainer.style.width = '90%';
        dialogueContainer.style.zIndex = '1000';
        
        // Create title element
        const titleElement = document.createElement('h2');
        titleElement.style.margin = '0 0 20px 0';
        titleElement.style.fontSize = '24px';
        
        // Create content element
        const contentElement = document.createElement('div');
        contentElement.style.margin = '0 0 20px 0';
        contentElement.style.fontSize = '18px';
        contentElement.style.lineHeight = '1.6';
        
        // Create buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.flexDirection = 'column';
        buttonsContainer.style.gap = '10px';
        
        // Set dialogue content based on NPC type
        if (npcType === 'light_npc') {
            dialogueContainer.style.border = '2px solid #ffcc00';
            dialogueContainer.style.boxShadow = '0 0 30px rgba(255, 204, 0, 0.4)';
            titleElement.style.color = '#ffcc00';
            titleElement.style.textShadow = '0 0 10px rgba(255, 204, 0, 0.5)';
            
            titleElement.textContent = 'Light Path Master';
            contentElement.textContent = 'Welcome, seeker. The Light Path offers wisdom and harmony. Would you like to learn more?';
            
            const infoButton = this.createDialogueButton('Tell me about the Light Path', () => {
                contentElement.textContent = 'The Light Path is one of harmony and healing. Those who follow it gain abilities to heal and protect. Your karma increases when you help others.';
                
                // Clear buttons and add new ones
                buttonsContainer.innerHTML = '';
                buttonsContainer.appendChild(this.createDialogueButton('I wish to follow the Light Path', () => {
                    // Call the choosePath method on the game object
                    if (this.game.choosePath) {
                        console.log('Choosing light path through Game.choosePath');
                        this.game.choosePath('light');
                    } else if (this.game.karmaManager && typeof this.game.karmaManager.choosePath === 'function') {
                        console.log('Choosing light path through KarmaManager.choosePath');
                        this.game.karmaManager.choosePath('light');
                    } else {
                        console.log('No choosePath method found, implementing directly');
                        // Fallback implementation in case neither method is available
                        // Set the player's path
                        if (this.game.playerStats) {
                            this.game.playerStats.path = 'light';
                        }
                        
                        // Add the martial arts skill
                        this.game.activeSkills = this.game.activeSkills || new Set();
                        this.game.activeSkills.add('martial_arts');
                        
                        // Update the skill bar directly
                        this.updateSkillBar();
                        
                        // Show confirmation message
                        this.showNotification('You have learned Martial Arts skill! Press Space to use it.', '#ffcc00');
                    }
                    this.hideDialogue();
                }));
                buttonsContainer.appendChild(this.createDialogueButton('I need time to decide', () => this.hideDialogue()));
            });
            
            const closeButton = this.createDialogueButton('Maybe later', () => this.hideDialogue());
            
            buttonsContainer.appendChild(infoButton);
            buttonsContainer.appendChild(closeButton);
        }
        else if (npcType === 'dark_npc') {
            dialogueContainer.style.border = '2px solid #6600cc';
            dialogueContainer.style.boxShadow = '0 0 30px rgba(102, 0, 204, 0.4)';
            titleElement.style.color = '#6600cc';
            titleElement.style.textShadow = '0 0 10px rgba(102, 0, 204, 0.5)';
            
            titleElement.textContent = 'Dark Path Master';
            contentElement.textContent = 'Power awaits those with the courage to seize it. The Dark Path offers strength beyond measure.';
            
            const infoButton = this.createDialogueButton('Tell me about the Dark Path', () => {
                contentElement.textContent = 'The Dark Path grants great power through sacrifice. Follow this path to gain destructive abilities and dominance over others. Your karma decreases as you embrace darkness.';
                
                // Clear buttons and add new ones
                buttonsContainer.innerHTML = '';
                buttonsContainer.appendChild(this.createDialogueButton('I choose the Dark Path', () => {
                    // Call the choosePath method on the game object
                    if (this.game.choosePath) {
                        console.log('Choosing dark path through Game.choosePath');
                        this.game.choosePath('dark');
                    } else if (this.game.karmaManager && typeof this.game.karmaManager.choosePath === 'function') {
                        console.log('Choosing dark path through KarmaManager.choosePath');
                        this.game.karmaManager.choosePath('dark');
                    } else {
                        console.log('No choosePath method found, implementing directly');
                        // Fallback implementation
                        if (this.game.playerStats) {
                            this.game.playerStats.path = 'dark';
                        }
                        this.updateSkillBar();
                    }
                    this.hideDialogue();
                }));
                buttonsContainer.appendChild(this.createDialogueButton('I need time to decide', () => this.hideDialogue()));
            });
            
            const closeButton = this.createDialogueButton('Maybe later', () => this.hideDialogue());
            
            buttonsContainer.appendChild(infoButton);
            buttonsContainer.appendChild(closeButton);
        } 
        else {
            titleElement.textContent = 'NPC';
            contentElement.textContent = 'Hello, traveler.';
            
            const closeButton = this.createDialogueButton('Goodbye', () => this.hideDialogue());
            buttonsContainer.appendChild(closeButton);
        }
        
        // Add elements to container
        dialogueContainer.appendChild(titleElement);
        dialogueContainer.appendChild(contentElement);
        dialogueContainer.appendChild(buttonsContainer);
        
        // Add close X button
        const closeX = document.createElement('div');
        closeX.textContent = '✕';
        closeX.style.position = 'absolute';
        closeX.style.top = '10px';
        closeX.style.right = '10px';
        closeX.style.cursor = 'pointer';
        closeX.style.fontSize = '18px';
        closeX.style.color = '#999';
        closeX.addEventListener('click', () => this.hideDialogue());
        dialogueContainer.appendChild(closeX);
        
        // Add to body
        document.body.appendChild(dialogueContainer);
        
        // Store reference
        this.dialogueUI = dialogueContainer;
    }
    
    createDialogueButton(text, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.backgroundColor = '#333';
        button.style.color = 'white';
        button.style.border = '1px solid #666';
        button.style.padding = '10px';
        button.style.borderRadius = '3px';
        button.style.cursor = 'pointer';
        button.style.fontSize = '16px';
        button.style.width = '100%';
        
        // Hover effect
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = '#555';
        });
        
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = '#333';
        });
        
        // Click handler
        button.addEventListener('click', onClick);
        
        return button;
    }
    
    hideDialogue() {
        if (this.dialogueUI) {
            this.dialogueUI.remove();
            this.dialogueUI = null;
        }
    }
    
    cleanup() {
        // Remove all UI elements
        this.hideDialogue();
        
        if (this.darknessOverlay) {
            this.darknessOverlay.remove();
            this.darknessOverlay = null;
        }
        
        // Remove status elements
        for (const key in this.statusElements) {
            if (this.statusElements[key].container) {
                this.statusElements[key].container.remove();
            }
        }
        this.statusElements = {};
        
        // Remove skill elements
        for (const key in this.skillElements) {
            if (this.skillElements[key].container) {
                this.skillElements[key].container.remove();
            }
        }
        this.skillElements = {};
        
        // Remove any other UI elements
        const uiElements = document.querySelectorAll('div[style*="position: fixed"]');
        uiElements.forEach(element => element.remove());
    }
    
    // Methods for loading screen and error handling
    showLoadingScreen(message = 'Loading...') {
        // Create or update loading screen
        if (!this.loadingScreen) {
            this.loadingScreen = document.createElement('div');
            this.loadingScreen.className = 'loading-screen';
            document.body.appendChild(this.loadingScreen);
        }
        
        // Create or update loading container with spinner and message
        if (!this.loadingContainer) {
            this.loadingContainer = document.createElement('div');
            this.loadingContainer.className = 'loading-container';
            this.loadingScreen.appendChild(this.loadingContainer);
            
            // Add spinner
            const spinner = document.createElement('div');
            spinner.className = 'spinner';
            this.loadingContainer.appendChild(spinner);
            
            // Add message element
            this.loadingMessage = document.createElement('div');
            this.loadingMessage.className = 'loading-message';
            this.loadingContainer.appendChild(this.loadingMessage);
            
            // Add fallback message for long loading times
            this.fallbackMessage = document.createElement('div');
            this.fallbackMessage.className = 'fallback-message';
            this.fallbackMessage.textContent = 'Taking longer than expected? The game will start in offline mode shortly.';
            this.fallbackMessage.style.display = 'none';
            this.loadingContainer.appendChild(this.fallbackMessage);
            
            // Show fallback message if loading takes too long
            this.fallbackTimer = setTimeout(() => {
                if (this.fallbackMessage) {
                    this.fallbackMessage.style.display = 'block';
                }
            }, 5000); // Show after 5 seconds
        }
        
        // Update loading message
        if (this.loadingMessage) {
            this.loadingMessage.textContent = message;
        }
        
        // Make sure loading screen is visible
        this.loadingScreen.style.display = 'flex';
    }
    
    hideLoadingScreen() {
        // Clear fallback timer if it exists
        if (this.fallbackTimer) {
            clearTimeout(this.fallbackTimer);
            this.fallbackTimer = null;
        }
        
        if (this.loadingScreen) {
            this.loadingScreen.style.display = 'none';
        }
    }
    
    showErrorScreen(message) {
        // Create error screen if it doesn't exist
        if (!this.errorScreen) {
            this.errorScreen = document.createElement('div');
            this.errorScreen.style.position = 'fixed';
            this.errorScreen.style.top = '0';
            this.errorScreen.style.left = '0';
            this.errorScreen.style.width = '100%';
            this.errorScreen.style.height = '100%';
            this.errorScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            this.errorScreen.style.display = 'flex';
            this.errorScreen.style.flexDirection = 'column';
            this.errorScreen.style.alignItems = 'center';
            this.errorScreen.style.justifyContent = 'center';
            this.errorScreen.style.color = '#ffffff';
            this.errorScreen.style.fontFamily = 'Arial, sans-serif';
            this.errorScreen.style.zIndex = '9999';
            
            // Error icon (X)
            const icon = document.createElement('div');
            icon.style.width = '80px';
            icon.style.height = '80px';
            icon.style.backgroundColor = '#ff0000';
            icon.style.borderRadius = '50%';
            icon.style.display = 'flex';
            icon.style.alignItems = 'center';
            icon.style.justifyContent = 'center';
            icon.style.marginBottom = '30px';
            
            // X inside circle
            const x = document.createElement('div');
            x.textContent = '✕';
            x.style.color = 'white';
            x.style.fontSize = '50px';
            icon.appendChild(x);
            
            // Error heading
            const heading = document.createElement('div');
            heading.textContent = 'Error';
            heading.style.fontSize = '32px';
            heading.style.fontWeight = 'bold';
            heading.style.marginBottom = '20px';
            heading.style.color = '#ff0000';
            
            // Error message
            const text = document.createElement('div');
            text.style.fontSize = '18px';
            text.style.maxWidth = '600px';
            text.style.textAlign = 'center';
            text.style.marginBottom = '30px';
            
            // Retry button
            const button = document.createElement('button');
            button.textContent = 'Retry';
            button.style.padding = '10px 30px';
            button.style.fontSize = '18px';
            button.style.backgroundColor = '#ff0000';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '5px';
            button.style.cursor = 'pointer';
            button.addEventListener('click', () => {
                window.location.reload();
            });
            
            this.errorScreen.appendChild(icon);
            this.errorScreen.appendChild(heading);
            this.errorScreen.appendChild(text);
            this.errorScreen.appendChild(button);
            document.body.appendChild(this.errorScreen);
        }
        
        // Update the error message
        this.errorScreen.children[2].textContent = message;
        this.errorScreen.style.display = 'flex';
    }
    
    showNotification(message, color = 'white', duration = 5000) {
        // Create notification element if it doesn't exist
        if (!this.notificationElement) {
            this.notificationElement = document.createElement('div');
            this.notificationElement.style.position = 'fixed';
            this.notificationElement.style.top = '20px';
            this.notificationElement.style.left = '50%';
            this.notificationElement.style.transform = 'translateX(-50%)';
            this.notificationElement.style.padding = '10px 20px';
            this.notificationElement.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            this.notificationElement.style.borderRadius = '5px';
            this.notificationElement.style.color = 'white';
            this.notificationElement.style.fontFamily = 'Arial, sans-serif';
            this.notificationElement.style.fontSize = '16px';
            this.notificationElement.style.zIndex = '2000';
            this.notificationElement.style.textAlign = 'center';
            this.notificationElement.style.opacity = '0';
            this.notificationElement.style.transition = 'opacity 0.3s ease';
            document.body.appendChild(this.notificationElement);
        }
        
        // Clear any existing timeout
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }
        
        // Set color based on parameter
        switch (color) {
            case 'red':
                this.notificationElement.style.color = '#ff6666';
                break;
            case 'green':
                this.notificationElement.style.color = '#66ff66';
                break;
            case 'blue':
                this.notificationElement.style.color = '#6666ff';
                break;
            case 'yellow':
                this.notificationElement.style.color = '#ffff66';
                break;
            default:
                this.notificationElement.style.color = 'white';
        }
        
        // Update the message and show
        this.notificationElement.textContent = message;
        this.notificationElement.style.opacity = '1';
        
        // Hide after duration
        this.notificationTimeout = setTimeout(() => {
            this.notificationElement.style.opacity = '0';
        }, duration);
    }
    
    // Method to update status bars position above player
    updateStatusBarsPosition() {
        if (!this.statusBars || !this.game.playerManager || !this.game.playerManager.player) {
            return;
        }
        
        // Get player's screen position
        const player = this.game.playerManager.player;
        
        // Project player position to screen coordinates
        const vector = new THREE.Vector3();
        vector.setFromMatrixPosition(player.matrixWorld);
        vector.project(this.game.camera);
        
        // Convert to screen coordinates
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (vector.y * -0.5 + 0.5) * window.innerHeight - 40; // Offset above player
        
        // Update status bars position
        this.statusBars.style.left = `${x}px`;
        this.statusBars.style.top = `${y}px`;
    }
    
    update() {
        // Update any animated UI elements here
    }

    updateKarmaDisplay(currentKarma, maxKarma) {
        if (!this.karmaBarFill || !this.karmaTooltip) return;
        
        // Update karma bar fill
        const percentage = (currentKarma / maxKarma) * 100;
        this.karmaBarFill.style.width = `${percentage}%`;
        
        // Update tooltip text with karma status
        let karmaStatus = 'Neutral';
        if (currentKarma < maxKarma * 0.3) {
            karmaStatus = 'Dark';
            this.karmaBarFill.style.background = '#660000'; // Dark red for dark path
        } else if (currentKarma > maxKarma * 0.7) {
            karmaStatus = 'Light';
            this.karmaBarFill.style.background = '#ffffff'; // White for light path
        } else {
            this.karmaBarFill.style.background = '#000000'; // Black for neutral
        }
        
        this.karmaTooltip.textContent = `Karma: ${karmaStatus} (${currentKarma}/${maxKarma})`;
    }
} 