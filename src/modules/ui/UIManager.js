import * as THREE from 'three';
import GameConstants from '../../../server/src/config/GameConstants.js';

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
        this.targetDisplay = null;
        this.deathScreen = null;
        
        // Set up resize handler
        window.addEventListener('resize', this.handleResize.bind(this));
    }
    
    // Add init method
    init() {
        // This method is called during game initialization
        // We'll create our UI elements when requested, not immediately
        return Promise.resolve(); // Return promise for async compatibility
    }
    
    createUI() {
        console.log('Creating UI elements');
        
        // Create main UI container
        const uiContainer = document.createElement('div');
        uiContainer.style.position = 'fixed';
        uiContainer.style.bottom = '20px';
        uiContainer.style.left = '50%';
        uiContainer.style.transform = 'translateX(-50%)';
        uiContainer.style.display = 'flex';
        uiContainer.style.flexDirection = 'column';
        uiContainer.style.alignItems = 'center';
        uiContainer.style.gap = '10px';
        uiContainer.style.zIndex = '1000';
        document.body.appendChild(uiContainer);

        // Create Karma bar container
        const karmaContainer = document.createElement('div');
        karmaContainer.style.width = '300px'; // Match skills bar width
        
        // Create karma bar with black background and white fill for right side
        const karmaBar = document.createElement('div');
        karmaBar.style.position = 'relative';
        karmaBar.style.width = '100%';
        karmaBar.style.height = '12px';
        karmaBar.style.marginBottom = '4px';
        karmaBar.style.borderRadius = '6px';
        karmaBar.style.overflow = 'hidden';
        karmaBar.style.cursor = 'pointer'; // Add cursor to indicate it's interactive
        karmaBar.style.zIndex = '1000'; // Add z-index for proper stacking
        
        // Black background for karma bar
        const karmaBackground = document.createElement('div');
        karmaBackground.style.position = 'absolute';
        karmaBackground.style.top = '0';
        karmaBackground.style.left = '0';
        karmaBackground.style.width = '100%';
        karmaBackground.style.height = '100%';
        karmaBackground.style.background = '#000000';
        karmaBackground.style.borderRadius = '6px';
        karmaBar.appendChild(karmaBackground);
        
        // White fill for karma (shows on right side based on karma)
        const karmaFill = document.createElement('div');
        karmaFill.className = 'fill';
        karmaFill.style.position = 'absolute';
        karmaFill.style.top = '0';
        karmaFill.style.right = '0'; // Right aligned instead of left
        karmaFill.style.width = '50%'; // Default 50%
        karmaFill.style.height = '100%';
        karmaFill.style.background = '#ffffff';
        karmaFill.style.borderRadius = '6px';
        karmaFill.style.transition = 'width 0.3s ease-out';
        karmaBar.appendChild(karmaFill);
        
        // Create karma tooltip (as a separate element)
        const karmaTooltip = document.createElement('div');
        karmaTooltip.className = 'tooltip';
        karmaTooltip.style.position = 'absolute';
        karmaTooltip.style.bottom = '25px'; // Position above karma bar
        karmaTooltip.style.left = '50%';
        karmaTooltip.style.transform = 'translateX(-50%)';
        karmaTooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        karmaTooltip.style.color = '#ffffff';
        karmaTooltip.style.padding = '5px 10px';
        karmaTooltip.style.borderRadius = '4px';
        karmaTooltip.style.fontSize = '12px';
        karmaTooltip.style.whiteSpace = 'nowrap';
        karmaTooltip.style.display = 'none';
        karmaTooltip.style.zIndex = '1500'; // Very high z-index
        karmaTooltip.textContent = 'Karma: (50/100)';
        
        // Add tooltip to the document body instead
        document.body.appendChild(karmaTooltip);
        
        // Store reference to tooltip and fill
        this.karmaBarFill = karmaFill;
        this.karmaTooltip = karmaTooltip;
        
        // Direct event listeners for karma bar
        karmaBar.addEventListener('mouseenter', () => {
            const rect = karmaBar.getBoundingClientRect();
            karmaTooltip.style.left = `${rect.left + rect.width / 2}px`;
            karmaTooltip.style.bottom = `${window.innerHeight - rect.top + 5}px`;
            karmaTooltip.style.display = 'block';
        });
        
        karmaBar.addEventListener('mouseleave', () => {
            karmaTooltip.style.display = 'none';
        });
        
        karmaContainer.appendChild(karmaBar);
        
        // Create container for Life ring, skills, and Mana ring
        const gameplayContainer = document.createElement('div');
        gameplayContainer.style.display = 'flex';
        gameplayContainer.style.alignItems = 'center';
        gameplayContainer.style.justifyContent = 'center';
        gameplayContainer.style.gap = '30px'; // Increased from 20px for better spacing with larger rings

        // Create Life ring
        const lifeRing = this.createStatRing('#ff6666', '#990000', 'Life');
        
        // Store the life ring elements for later access
        this.lifeRingFill = lifeRing.querySelector('.fill');
        this.lifeTooltip = lifeRing.querySelector('.tooltip');
        
        // Create Mana ring
        const manaRing = this.createStatRing('#6699ff', '#000099', 'Mana');
        
        // Store the mana ring elements for later access
        this.manaRingFill = manaRing.querySelector('.fill');
        this.manaTooltip = manaRing.querySelector('.tooltip');

        // Create skill bar
        const skillBar = this.createSkillBar();

        // Assemble the gameplay container
        gameplayContainer.appendChild(lifeRing);
        gameplayContainer.appendChild(skillBar);
        gameplayContainer.appendChild(manaRing);
        
        // Add to skill bar wrapper
        uiContainer.appendChild(karmaContainer);
        uiContainer.appendChild(gameplayContainer);

        // Create XP ring and level indicator
        this.createLevelIndicator();
        
        // Create darkness overlay for karma system
        this.createDarknessOverlay();
        
        // Store references for UI elements
        this.statusElements = {
            skillBarContainer: skillBar,
            uiContainer: uiContainer,
            karmaContainer: karmaContainer
        };
        
        // Create target display
        this.createTargetDisplay();
        
        // Show initial values
        this.updateStatusBars(this.game.playerStats);
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
            skillButton.className = 'skill-slot'; // Add skill-slot class for selector
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
            skillButton.dataset.slotNumber = i; // Add slot number for easier debugging
            
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
    
    /**
     * Create a modern looking status bar
     * @param {string} label - Text label for the bar
     * @param {string} backgroundColor - Background color of the bar
     * @param {string} fillColor - Fill color for the bar
     * @returns {HTMLElement} - The created status bar
     */
    createModernStatusBar(label, backgroundColor, fillColor) {
        // Create container for status bar with text
        const barContainer = document.createElement('div');
        barContainer.style.width = '300px';
        barContainer.style.marginBottom = '5px';
        barContainer.style.display = 'flex';
        barContainer.style.flexDirection = 'column';
        
        // Create label
        const barLabel = document.createElement('div');
        barLabel.style.display = 'flex';
        barLabel.style.justifyContent = 'space-between';
        barLabel.style.marginBottom = '3px';
        barLabel.style.fontFamily = "'Arial', sans-serif";
        barLabel.style.fontSize = '12px';
        barLabel.style.color = '#ffffff';
        barLabel.style.textShadow = '1px 1px 1px rgba(0, 0, 0, 0.8)';
        
        // Left side label text
        const labelText = document.createElement('span');
        labelText.textContent = label;
        barLabel.appendChild(labelText);
        
        // Right side status text (current/max)
        const statusText = document.createElement('span');
        statusText.className = 'status-text';
        statusText.textContent = '100/100';
        barLabel.appendChild(statusText);
        
        // Create the actual bar
        const bar = document.createElement('div');
        bar.style.height = '10px';
        bar.style.backgroundColor = backgroundColor;
        bar.style.borderRadius = '5px';
        bar.style.overflow = 'hidden';
        bar.style.position = 'relative';
        
        // Create the fill for the bar
        const barFill = document.createElement('div');
        barFill.className = 'bar-fill';
        barFill.style.height = '100%';
        barFill.style.width = '100%';
        barFill.style.backgroundColor = fillColor;
        barFill.style.borderRadius = '5px';
        barFill.style.position = 'absolute';
        barFill.style.top = '0';
        barFill.style.left = '0';
        barFill.style.transition = 'width 0.3s ease-out';
        
        // Assemble the bar
        bar.appendChild(barFill);
        
        // Assemble the container
        barContainer.appendChild(barLabel);
        barContainer.appendChild(bar);
        
        return barContainer;
    }
    
    // Create a stat ring (life, mana) with modern styling
    createStatRing(primaryColor, secondaryColor, statType) {
        const container = document.createElement('div');
        container.style.width = '100px';
        container.style.height = '100px';
        container.style.position = 'relative';
        container.style.borderRadius = '50%';
        container.style.background = 'rgba(0, 0, 0, 0.6)';
        
        // Use a subtle border similar to the XP ring
        const borderColor = statType === 'Life' ? 'rgba(255, 0, 0, 0.15)' : 'rgba(0, 102, 255, 0.15)';
        container.style.border = `2px solid ${borderColor}`;
        container.style.boxShadow = `0 0 20px rgba(0, 0, 0, 0.5)`;
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
        
        // Use a radial gradient similar to the XP ring
        if (statType === 'Life') {
            fill.style.background = 'radial-gradient(circle, #ff6666, #990000)';
        } else {
            fill.style.background = 'radial-gradient(circle, #6699ff, #000099)';
        }
        
        fill.style.opacity = '0.8'; // Match XP ring opacity
        fill.style.borderRadius = '50%';
        
        // Start fully filled for life, but empty for mana if depleted
        if (statType === 'Life') {
            fill.style.clipPath = 'inset(0 0 0 0)';
            fill.style.transition = 'clip-path 0.3s ease-out';
        } else if (statType === 'Mana') {
            const currentMana = this.game?.playerStats?.currentMana;
            
            // We need to know if we're actually at 0 mana - log for debugging
            console.log(`Initializing mana ring with currentMana: ${currentMana}`);
            
            if (currentMana === 0) {
                // Start empty if mana is 0
                fill.style.clipPath = 'inset(100% 0 0 0)';
                fill.style.transition = 'none';
                console.log('Mana ring initialized at empty (0 mana)');
            } else {
                // Start full or partially full based on current mana
                const manaPercent = currentMana !== undefined ? (currentMana / 100) * 100 : 100;
                const emptyPercent = 100 - manaPercent;
                
                fill.style.clipPath = `inset(${emptyPercent}% 0 0 0)`;
                fill.style.transition = 'clip-path 0.3s ease-out';
                console.log(`Mana ring initialized at ${manaPercent}%`);
            }
        } else {
            // Default initialization for other ring types
            fill.style.clipPath = 'inset(0 0 0 0)';
            fill.style.transition = 'clip-path 0.3s ease-out';
        }
        
        fillContainer.appendChild(fill);
        
        // Stat value - place directly in container instead of inner circle
        const value = document.createElement('div');
        value.className = 'value';
        value.style.color = '#ffffff';  // Set to white for better visibility
        value.style.fontSize = '24px';
        value.style.fontWeight = 'bold';
        value.style.position = 'relative';
        value.style.zIndex = '3';
        
        // Set initial value based on stat type and current stats
        if (statType === 'Mana' && this.game?.playerStats?.currentMana !== undefined) {
            // If we have a mana value, use it
            value.textContent = Math.floor(this.game.playerStats.currentMana);
        } else {
            // Otherwise use default
            value.textContent = '100';
        }
        
        container.appendChild(value);
        
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
        tooltip.style.zIndex = '1010';
        
        // Set tooltip text based on current stats if available
        if (statType === 'Mana' && this.game?.playerStats?.currentMana !== undefined) {
            const maxMana = this.game.playerStats.maxMana || 100;
            tooltip.textContent = `Mana: ${Math.floor(this.game.playerStats.currentMana)}/${maxMana}`;
        } else {
            tooltip.textContent = `${statType}: 100/100`;
        }
        
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
    
    updateStatusBars(playerStats) {
        if (!playerStats) return;
        
        // Extract player stats with default values
        const currentLife = playerStats.currentLife || 100;
        const maxLife = playerStats.maxLife || 100;
        // Make sure we handle the case when currentMana is exactly 0
        const currentMana = playerStats.currentMana !== undefined ? playerStats.currentMana : 100;
        const maxMana = playerStats.maxMana || 100;
        const currentKarma = playerStats.currentKarma || 50;
        const maxKarma = playerStats.maxKarma || 100;
        const experience = playerStats.experience || 0;
        const experienceToNextLevel = playerStats.experienceToNextLevel || 100;
        const level = playerStats.level || 1;
        
        // Debug log for mana updates - helps identify when changes happen
        console.log(`UIManager: Updating status bars - Mana: ${Math.floor(currentMana)}/${maxMana} (actual value: ${playerStats.currentMana})`);
        
        // Update life ring
        if (this.lifeRingFill) {
            // Calculate life percentage
            const lifePercentage = Math.max(0, Math.min(100, (currentLife / maxLife) * 100));
            const emptyPercentage = 100 - lifePercentage;
            
            // Make sure transitions are enabled for health changes
            if (!this.lifeRingFill.style.transition) {
                this.lifeRingFill.style.transition = 'clip-path 0.3s ease-out'; 
            }
            
            // Apply the clip-path from top down (inset from top)
            this.lifeRingFill.style.clipPath = `inset(${emptyPercentage}% 0 0 0)`;
            
            // Also update the text value
            const lifeValue = this.lifeRingFill.parentNode.parentNode.querySelector('.value');
            if (lifeValue) {
                lifeValue.textContent = Math.floor(currentLife);
            }
            
            if (this.lifeTooltip) {
                this.lifeTooltip.textContent = `Life: ${Math.floor(currentLife)}/${maxLife}`;
            }
        }
        
        // Update mana ring
        if (this.manaRingFill) {
            // Determine if mana is depleted (0)
            const isManaEmpty = currentMana === 0;
            
            let manaPercentage, emptyPercentage;
            
            if (isManaEmpty) {
                // Force completely empty for zero mana
                manaPercentage = 0;
                emptyPercentage = 100;
                
                // Disable transition and force immediate update for zero mana
                this.manaRingFill.style.transition = 'none';
                
                // Force the clip path to completely hide the fill
                this.manaRingFill.style.clipPath = 'inset(100% 0 0 0)';
            } else {
                // Normal calculation for non-zero mana
                manaPercentage = Math.max(0, Math.min(100, (currentMana / maxMana) * 100));
                emptyPercentage = 100 - manaPercentage;
                
                // Re-enable transitions for normal mana changes
                if (this.manaRingFill.style.transition === 'none') {
                    this.manaRingFill.style.transition = 'clip-path 0.3s ease-out';
                }
                
                // Apply the clip-path from top down (inset from top)
                this.manaRingFill.style.clipPath = `inset(${emptyPercentage}% 0 0 0)`;
            }
            
            // Force a reflow to make sure the change takes effect immediately
            void this.manaRingFill.offsetWidth;
            
            // Update the text value (enforce zero for empty mana)
            const manaValue = this.manaRingFill.parentNode.parentNode.querySelector('.value');
            if (manaValue) {
                manaValue.textContent = isManaEmpty ? '0' : Math.floor(currentMana);
            }
            
            if (this.manaTooltip) {
                this.manaTooltip.textContent = `Mana: ${isManaEmpty ? '0' : Math.floor(currentMana)}/${maxMana}`;
            }
        }
        
        // Update karma bar fill - ensure it fills properly from 0-100
        // For right-aligned fill, higher karma means smaller white portion
        const percentage = (1 - (currentKarma / maxKarma)) * 100;
        if (this.karmaBarFill) {
            this.karmaBarFill.style.width = `${percentage}%`;
        }
        
        // Update karma tooltip
        if (this.karmaTooltip) {
            this.karmaTooltip.textContent = `Karma: ${Math.floor(currentKarma)}/${maxKarma}`;
        }
        
        // Update XP ring if the method exists
        if (typeof this.updateXPRing === 'function') {
            this.updateXPRing(experience, experienceToNextLevel, level);
        }
    }
    
    /**
     * Update the skill bar with the player's active skills
     */
    updateSkillBar() {
        if (!this.game.skillsManager || !this.statusElements?.skillBarContainer) {
            return;
        }
        
        try {
            // Clear existing skill elements
            const slots = this.statusElements.skillBarContainer.querySelectorAll('.skill-slot');
            slots.forEach(slot => slot.innerHTML = '');
            
            // Get active skills
            const activeSkills = this.game.skillsManager.getActiveSkills();
            
            // Create new skill elements
            activeSkills.forEach(skillId => {
                const skill = this.game.skillsManager.skills[skillId];
                if (!skill) {
                    return;
                }
                
                // Ensure skill has a slot (default to 1)
                const slotNumber = skill.slot || 1;
                
                // Find the slot for this skill
                const allSlots = this.statusElements.skillBarContainer.querySelectorAll('.skill-slot');
                const slotIndex = slotNumber - 1; // Convert to 0-based index
                
                // Only proceed if the slot index is valid
                if (slotIndex >= 0 && slotIndex < allSlots.length) {
                    allSlots[slotIndex].innerHTML = ''; // Clear the slot
                    this.addSkillToElement(allSlots[slotIndex], skill);
                }
            });
        } catch (error) {
            console.error('Error updating skill bar:', error);
        }
    }
    
    /**
     * Add a skill to a UI slot element
     * @param {HTMLElement} slotElement - The slot element to add the skill to
     * @param {Object} skill - The skill data
     */
    addSkillToElement(slotElement, skill) {
        if (!slotElement || !skill) {
            console.warn('Invalid slot element or skill data');
            return;
        }
        
        // Create skill button
        const skillElement = document.createElement('div');
        skillElement.className = 'skill';
        skillElement.style.display = 'flex';
        skillElement.style.alignItems = 'center';
        skillElement.style.justifyContent = 'center';
        skillElement.style.width = '100%';
        skillElement.style.height = '100%';
        skillElement.style.fontSize = '24px';
        skillElement.textContent = skill.icon || skill.name.charAt(0);
        
        // Add tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'skill-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.bottom = '100%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        tooltip.style.color = 'white';
        tooltip.style.padding = '5px 10px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.whiteSpace = 'nowrap';
        tooltip.style.display = 'none';
        tooltip.style.zIndex = '1000';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
        tooltip.textContent = `${skill.name}: ${skill.description || ''}`;
        
        // Show tooltip on hover
        skillElement.addEventListener('mouseenter', () => {
            tooltip.style.display = 'block';
        });
        
        skillElement.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
        
        // Add elements to slot
        slotElement.appendChild(skillElement);
        slotElement.appendChild(tooltip);
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
    
    createLevelIndicator() {
        // Create circular icon with XP ring
        const iconContainer = document.createElement('div');
        iconContainer.style.width = '100px'; // Updated from 96px to match other rings
        iconContainer.style.height = '100px'; // Updated from 96px to match other rings
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
        levelText.style.fontSize = '24px'; // Changed from 38px to match other rings
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
        xpTooltip.style.zIndex = '1101'; // Increased z-index for visibility
        xpTooltip.textContent = 'Level 1: 0/100 XP';
        iconContainer.appendChild(xpTooltip); // Attach to container instead of body
        this.xpTooltip = xpTooltip;

        // Show tooltip on hover with more direct reference
        iconContainer.onmouseenter = () => {
            this.xpTooltip.style.display = 'block';
        };
        
        iconContainer.onmouseleave = () => {
            this.xpTooltip.style.display = 'none';
        };
        
        // Store for reference
        this.statusElements.iconContainer = iconContainer;
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
            
            // Don't show choice dialogue if player already has a path
            if (this.game.playerStats && this.game.playerStats.path) {
                contentElement.textContent = `You have already chosen the path of ${this.game.playerStats.path}. This choice is permanent in this life.`;
                
                // Only show a close button
                const closeButton = this.createDialogueButton('Close', () => this.hideDialogue());
                buttonsContainer.appendChild(closeButton);
            } else {
                contentElement.textContent = 'Welcome, seeker. The Light Path offers balance and harmony.';
                
                const infoButton = this.createDialogueButton('Tell me about the Light Path', () => {
                    contentElement.textContent = 'The Light Path grants inner strength and healing abilities. Follow this path to gain defensive and supportive powers. Your karma increases as you embrace the light.';
                    
                    // Clear buttons and add new ones
                    buttonsContainer.innerHTML = '';
                    buttonsContainer.appendChild(this.createDialogueButton('I choose the Light Path', () => {
                        // Only call the Game.choosePath method to avoid duplicate path selection
                        if (this.game.choosePath) {
                            console.log('Choosing light path through Game.choosePath');
                            this.game.choosePath('light');
                        } else {
                            console.log('No choosePath method found, implementing directly');
                            // Fallback implementation
                            if (this.game.playerStats) {
                                this.game.playerStats.path = 'light';
                            }
                            
                            // Add martial arts skill
                            this.game.activeSkills = this.game.activeSkills || new Set();
                            this.game.activeSkills.add('martial_arts');
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
        }
        else if (npcType === 'dark_npc') {
            dialogueContainer.style.border = '2px solid #6600cc';
            dialogueContainer.style.boxShadow = '0 0 30px rgba(102, 0, 204, 0.4)';
            titleElement.style.color = '#6600cc';
            titleElement.style.textShadow = '0 0 10px rgba(102, 0, 204, 0.5)';
            
            titleElement.textContent = 'Dark Path Master';
            
            // Don't show choice dialogue if player already has a path
            if (this.game.playerStats && this.game.playerStats.path) {
                contentElement.textContent = `You have already chosen the path of ${this.game.playerStats.path}. This choice is permanent in this life.`;
                
                // Only show a close button
                const closeButton = this.createDialogueButton('Close', () => this.hideDialogue());
                buttonsContainer.appendChild(closeButton);
            } else {
                contentElement.textContent = 'Power awaits those with the courage to seize it. The Dark Path offers strength beyond measure.';
                
                const infoButton = this.createDialogueButton('Tell me about the Dark Path', () => {
                    contentElement.textContent = 'The Dark Path grants great power through sacrifice. Follow this path to gain destructive abilities and dominance over others. Your karma decreases as you embrace darkness.';
                    
                    // Clear buttons and add new ones
                    buttonsContainer.innerHTML = '';
                    buttonsContainer.appendChild(this.createDialogueButton('I choose the Dark Path', () => {
                        // Only call the Game.choosePath method to avoid duplicate path selection
                        if (this.game.choosePath) {
                            console.log('Choosing dark path through Game.choosePath');
                            this.game.choosePath('dark');
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
        // Remove any existing error screens
        if (this.errorScreen) {
            document.body.removeChild(this.errorScreen);
            this.errorScreen = null;
        }
        
        // Create the error container
        const errorScreen = document.createElement('div');
        errorScreen.style.position = 'fixed';
        errorScreen.style.top = '0';
        errorScreen.style.left = '0';
        errorScreen.style.width = '100%';
        errorScreen.style.height = '100%';
        errorScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        errorScreen.style.color = 'white';
        errorScreen.style.display = 'flex';
        errorScreen.style.flexDirection = 'column';
        errorScreen.style.justifyContent = 'center';
        errorScreen.style.alignItems = 'center';
        errorScreen.style.zIndex = '10000'; // Higher than anything else
        
        // Add error message
        const errorMessage = document.createElement('div');
        errorMessage.style.fontSize = '24px';
        errorMessage.style.maxWidth = '80%';
        errorMessage.style.textAlign = 'center';
        errorMessage.style.marginBottom = '20px';
        errorMessage.textContent = message || 'An error occurred';
        errorScreen.appendChild(errorMessage);
        
        // Add error details container
        const errorDetails = document.createElement('div');
        errorDetails.style.fontSize = '16px';
        errorDetails.style.maxWidth = '80%';
        errorDetails.style.textAlign = 'center';
        errorDetails.style.marginBottom = '20px';
        errorDetails.style.padding = '15px';
        errorDetails.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
        errorDetails.style.borderRadius = '5px';
        errorDetails.innerHTML = 'Potential solutions:<br>' +
            '1. Check if the server is running<br>' +
            '2. Check your internet connection<br>' +
            '3. Clear your browser cache<br>' +
            '4. Try again in a few minutes';
        errorScreen.appendChild(errorDetails);
        
        // Add retry button
        const retryButton = document.createElement('button');
        retryButton.textContent = 'Retry';
        retryButton.style.padding = '10px 20px';
        retryButton.style.fontSize = '18px';
        retryButton.style.backgroundColor = '#4CAF50';
        retryButton.style.color = 'white';
        retryButton.style.border = 'none';
        retryButton.style.borderRadius = '5px';
        retryButton.style.cursor = 'pointer';
        retryButton.onclick = () => {
            window.location.reload();
        };
        errorScreen.appendChild(retryButton);
        
        document.body.appendChild(errorScreen);
        this.errorScreen = errorScreen;
        
        // Log the error to console
        console.error('Game error:', message);
    }
    
    showNotification(message, color = 'white', duration = 5000) {
        // Create notification element if it doesn't exist
        if (!this.notificationElement) {
            this.notificationElement = document.createElement('div');
            this.notificationElement.style.position = 'fixed';
            // Position will be updated in updateNotificationPosition method
            this.notificationElement.style.top = '60px'; // Initial position, will be updated
            this.notificationElement.style.left = '50%';
            this.notificationElement.style.transform = 'translateX(-50%)';
            this.notificationElement.style.padding = '10px 20px';
            this.notificationElement.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            this.notificationElement.style.color = 'white';
            this.notificationElement.style.fontFamily = 'Arial, sans-serif';
            this.notificationElement.style.fontSize = '16px';
            this.notificationElement.style.zIndex = '1500'; // Above target display but below other UI
            this.notificationElement.style.textAlign = 'center';
            this.notificationElement.style.opacity = '0';
            this.notificationElement.style.transition = 'opacity 0.3s ease';
            this.notificationElement.style.borderRadius = '3px';
            this.notificationElement.style.border = '1px solid #444';
            this.notificationElement.style.maxWidth = '80%';
            this.notificationElement.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
            this.notificationElement.style.whiteSpace = 'nowrap';
            this.notificationElement.style.pointerEvents = 'none'; // Prevent blocking mouse clicks
            document.body.appendChild(this.notificationElement);
            
            // Create a queue for notifications
            this.notificationQueue = [];
            this.processingNotification = false;
            this.currentNotificationMessage = null;
        }
        
        // Update notification position relative to target display
        this.updateNotificationPosition();
        
        // Ensure message ends with a period
        if (message && 
            !message.endsWith('.') && 
            !message.endsWith('!') && 
            !message.endsWith('?')) {
            message += '.';
        }
        
        // Check if this message is already in the queue or currently displaying
        if (this.currentNotificationMessage === message || 
            this.notificationQueue.some(item => item.message === message)) {
            return; // Skip duplicate message
        }
        
        // Add notification to queue
        this.notificationQueue.push({
            message,
            color,
            duration
        });
        
        // Process queue if not already processing
        if (!this.processingNotification) {
            this.processNotificationQueue();
        }
    }
    
    // Process notification queue
    processNotificationQueue() {
        if (this.notificationQueue.length === 0) {
            this.processingNotification = false;
            return;
        }
        
        this.processingNotification = true;
        
        // Get the next notification
        const notification = this.notificationQueue.shift();
        
        // Ensure message ends with a period
        if (notification.message && 
            !notification.message.endsWith('.') && 
            !notification.message.endsWith('!') && 
            !notification.message.endsWith('?')) {
            notification.message += '.';
        }
        
        // Clear any existing timeout
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }
        
        // Set color based on parameter (standardize to black and white theme)
        switch (notification.color) {
            case 'red':
            case '#ff0000':
            case '#ff3333':
            case '#ff6666':
            case '#ff9900':
                this.notificationElement.style.color = 'white';
                this.notificationElement.style.borderColor = '#800000';
                break;
            case 'green':
            case '#00ff00':
            case '#66ff66':
                this.notificationElement.style.color = 'white';
                this.notificationElement.style.borderColor = '#008000';
                break;
            case 'blue':
            case '#6666ff':
                this.notificationElement.style.color = 'white';
                this.notificationElement.style.borderColor = '#000080';
                break;
            case 'yellow':
            case '#ffff66':
            case '#ffcc00':
            case 'yellow':
                this.notificationElement.style.color = 'white';
                this.notificationElement.style.borderColor = '#808000';
                break;
            default:
                this.notificationElement.style.color = 'white';
                this.notificationElement.style.borderColor = '#444';
        }
        
        // Update the notification position
        this.updateNotificationPosition();
        
        // Update the message and show
        this.notificationElement.textContent = notification.message;
        this.notificationElement.style.opacity = '1';
        
        // Store the current message to check for duplicates
        this.currentNotificationMessage = notification.message;
        
        // Hide after duration and process next notification
        this.notificationTimeout = setTimeout(() => {
            this.notificationElement.style.opacity = '0';
            
            // Process next notification after fade out
            setTimeout(() => {
                this.currentNotificationMessage = null;
                this.processNotificationQueue();
            }, 300);
        }, notification.duration);
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
        vector.project(this.game.cameraManager.camera);
        
        // Convert to screen coordinates
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (vector.y * -0.5 + 0.5) * window.innerHeight - 40; // Offset above player
        
        // Update status bars position
        this.statusBars.style.left = `${x}px`;
        this.statusBars.style.top = `${y}px`;
    }
    
    update(delta) {
        // Update notification position if it's visible
        if (this.notificationElement && 
            this.notificationElement.style.opacity !== '0' && 
            this.targetDisplay && 
            this.targetDisplay.container && 
            this.targetDisplay.container.style.display !== 'none') {
            
            this.updateNotificationPosition();
        }
        
        // Update any other animated UI elements here
    }

    updateKarmaDisplay(currentKarma, maxKarma) {
        if (!this.karmaBarFill || !this.karmaTooltip) return;
        
        // Update karma bar fill - ensure it fills properly from 0-100
        // For right-aligned fill, higher karma means smaller white portion
        const percentage = (1 - (currentKarma / maxKarma)) * 100;
        this.karmaBarFill.style.width = `${percentage}%`;
        
        // Keep karma color always white (right side)
        this.karmaBarFill.style.background = '#ffffff';
        
        // Update tooltip text with karma status
        // In our game: Higher karma = Darker path, Lower karma = Lighter path
        let karmaStatus = 'Neutral';
        
        // Determine status based on karma value
        if (currentKarma <= 20) {
            karmaStatus = 'Very Light';
        } else if (currentKarma <= 40) {
            karmaStatus = 'Light';
        } else if (currentKarma <= 60) {
            karmaStatus = 'Neutral';
        } else if (currentKarma <= 80) {
            karmaStatus = 'Dark';
        } else {
            karmaStatus = 'Very Dark';
        }
        
        // Update tooltip text
        this.karmaTooltip.textContent = `Karma: ${karmaStatus} (${currentKarma}/${maxKarma})`;
    }
    
    /**
     * Create the target display element
     */
    createTargetDisplay() {
        if (this.targetDisplay) return;
        
        // Create target display container
        const targetDisplay = document.createElement('div');
        targetDisplay.style.position = 'fixed';
        targetDisplay.style.top = '10px';
        targetDisplay.style.left = '50%';
        targetDisplay.style.transform = 'translateX(-50%)';
        targetDisplay.style.width = '300px';
        targetDisplay.style.padding = '5px';
        targetDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        targetDisplay.style.border = '1px solid #444';
        targetDisplay.style.borderRadius = '3px';
        targetDisplay.style.color = '#ffffff';
        targetDisplay.style.fontFamily = '"Segoe UI", Arial, sans-serif';
        targetDisplay.style.zIndex = '1000';
        targetDisplay.style.display = 'none';
        targetDisplay.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
        
        // Target header with name and level
        const targetHeader = document.createElement('div');
        targetHeader.style.display = 'flex';
        targetHeader.style.justifyContent = 'space-between';
        targetHeader.style.alignItems = 'center';
        targetHeader.style.marginBottom = '3px';
        targetDisplay.appendChild(targetHeader);
        
        // Target name
        const targetName = document.createElement('div');
        targetName.style.fontSize = '16px';
        targetName.style.fontWeight = 'bold';
        targetName.style.color = '#FFCC00'; // Gold color for name
        targetName.style.textShadow = '1px 1px 2px black';
        targetName.textContent = 'Target';
        targetHeader.appendChild(targetName);
        
        // Target level
        const targetLevel = document.createElement('div');
        targetLevel.style.fontSize = '14px';
        targetLevel.style.fontWeight = 'bold';
        targetLevel.style.padding = '2px 5px';
        targetLevel.style.backgroundColor = '#333';
        targetLevel.style.borderRadius = '3px';
        targetLevel.style.color = '#FFF';
        targetLevel.textContent = 'Lv. 1';
        targetHeader.appendChild(targetLevel);
        
        // Target health bar container with label
        const healthContainer = document.createElement('div');
        healthContainer.style.marginBottom = '3px';
        targetDisplay.appendChild(healthContainer);
        
        // Health label and percentage
        const healthLabelContainer = document.createElement('div');
        healthLabelContainer.style.display = 'flex';
        healthLabelContainer.style.justifyContent = 'space-between';
        healthLabelContainer.style.marginBottom = '2px';
        healthContainer.appendChild(healthLabelContainer);
        
        const healthLabel = document.createElement('div');
        healthLabel.style.fontSize = '12px';
        healthLabel.style.color = '#AAA';
        healthLabel.textContent = 'HP';
        healthLabelContainer.appendChild(healthLabel);
        
        const healthPercentage = document.createElement('div');
        healthPercentage.style.fontSize = '12px';
        healthPercentage.style.color = '#AAA';
        healthPercentage.textContent = '100%';
        healthLabelContainer.appendChild(healthPercentage);
        
        // Target health bar container
        const healthBarContainer = document.createElement('div');
        healthBarContainer.style.width = '100%';
        healthBarContainer.style.height = '8px';
        healthBarContainer.style.backgroundColor = '#333333';
        healthBarContainer.style.borderRadius = '4px';
        healthBarContainer.style.overflow = 'hidden';
        healthBarContainer.style.border = '1px solid #555';
        healthContainer.appendChild(healthBarContainer);
        
        // Target health bar
        const healthBar = document.createElement('div');
        healthBar.style.width = '100%';
        healthBar.style.height = '100%';
        healthBar.style.backgroundColor = '#ff0000';
        healthBar.style.transition = 'width 0.3s';
        // Create gradient effect for health bar
        healthBar.style.background = 'linear-gradient(to bottom, #ff3019 0%,#cf0404 100%)';
        healthBarContainer.appendChild(healthBar);
        
        // Target type indicator with icon
        const targetTypeContainer = document.createElement('div');
        targetTypeContainer.style.display = 'flex';
        targetTypeContainer.style.alignItems = 'center';
        targetTypeContainer.style.marginTop = '3px';
        targetDisplay.appendChild(targetTypeContainer);
        
        // Icon for target type
        const targetTypeIcon = document.createElement('div');
        targetTypeIcon.style.width = '16px';
        targetTypeIcon.style.height = '16px';
        targetTypeIcon.style.marginRight = '5px';
        targetTypeIcon.style.backgroundSize = 'contain';
        targetTypeIcon.style.backgroundRepeat = 'no-repeat';
        targetTypeContainer.appendChild(targetTypeIcon);
        
        // Target type text
        const targetType = document.createElement('div');
        targetType.style.fontSize = '12px';
        targetType.style.color = '#aaaaaa';
        targetType.textContent = 'Unknown';
        targetTypeContainer.appendChild(targetType);
        
        // Store references to elements
        this.targetDisplay = {
            container: targetDisplay,
            name: targetName,
            level: targetLevel,
            healthBar: healthBar,
            healthPercentage: healthPercentage,
            type: targetType,
            typeIcon: targetTypeIcon
        };
        
        // Add to document
        document.body.appendChild(targetDisplay);
    }
    
    /**
     * Update the target display with new information
     * @param {string} name - The name of the target
     * @param {number} health - The current health of the target
     * @param {number} maxHealth - The maximum health of the target
     * @param {string} type - The type of target ('player' or 'monster')
     * @param {number} level - The level of the target (optional)
     */
    updateTargetDisplay(name, health, maxHealth, type, level = 1) {
        // Create the target display if it doesn't exist
        if (!this.targetDisplay) {
            this.createTargetDisplay();
        }
        
        // Update target information
        this.targetDisplay.name.textContent = name;
        this.targetDisplay.level.textContent = `Lv. ${level}`;
        
        // Calculate health percentage
        const healthPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100));
        this.targetDisplay.healthBar.style.width = `${healthPercent}%`;
        this.targetDisplay.healthPercentage.textContent = `${Math.round(healthPercent)}%`;
        
        // Update color based on health percentage
        if (healthPercent > 60) {
            this.targetDisplay.healthBar.style.background = 'linear-gradient(to bottom, #00cc00 0%, #009900 100%)'; // Green gradient
        } else if (healthPercent > 30) {
            this.targetDisplay.healthBar.style.background = 'linear-gradient(to bottom, #ffcc00 0%, #cc9900 100%)'; // Yellow gradient
        } else {
            this.targetDisplay.healthBar.style.background = 'linear-gradient(to bottom, #ff3019 0%, #cf0404 100%)'; // Red gradient
        }
        
        // Update type with icon
        this.targetDisplay.type.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        
        // Set icon based on type
        if (type === 'player') {
            this.targetDisplay.typeIcon.style.backgroundImage = 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%233366ff\'><circle cx=\'12\' cy=\'7\' r=\'5\'/><path d=\'M17 14h-10c-3.31 0-6 2.69-6 6v1h22v-1c0-3.31-2.69-6-6-6z\'/></svg>")';
            this.targetDisplay.name.style.color = '#3366FF'; // Blue for players
        } else if (type === 'monster') {
            this.targetDisplay.typeIcon.style.backgroundImage = 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23ff3300\'><path d=\'M12 2c-5.33 4-8 6.67-8 10 0 4.42 3.58 8 8 8s8-3.58 8-8c0-3.33-2.67-6-8-10zm0 18c-3.31 0-6-2.69-6-6 0-1 0-2 1-3 1 1 2 2 2 2 .83.73 2 1.17 3 1 .17 1.08 1 2 2 2 1.11 0 2-.92 2-2 0 0 1.09-1.82 3-2 0 1 0 2 0 3 0 3.31-2.69 6-6 6z\'/></svg>")';
            this.targetDisplay.name.style.color = '#FF3300'; // Red for monsters
        }
        
        // Show the target display
        this.targetDisplay.container.style.display = 'block';
        
        // Update notification position when target display is updated
        this.updateNotificationPosition();
    }
    
    /**
     * Clear the target display when no target is selected
     */
    clearTargetDisplay() {
        // Add debug info
        console.log('Clearing target display');
        
        if (this.targetDisplay) {
            this.targetDisplay.container.style.display = 'none';
        }
        
        // Update notification position when target display is cleared
        this.updateNotificationPosition();
    }

    /**
     * Show death screen when player dies
     */
    showDeathScreen() {
        console.log('Showing death screen');
        
        // Create death screen if it doesn't exist
        if (!this.deathScreen) {
            // Create death screen container
            const deathScreen = document.createElement('div');
            deathScreen.style.position = 'fixed';
            deathScreen.style.top = '0';
            deathScreen.style.left = '0';
            deathScreen.style.width = '100%';
            deathScreen.style.height = '100%';
            deathScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            deathScreen.style.display = 'flex';
            deathScreen.style.flexDirection = 'column';
            deathScreen.style.justifyContent = 'center';
            deathScreen.style.alignItems = 'center';
            deathScreen.style.zIndex = '2000';
            deathScreen.style.transition = 'opacity 0.5s ease-in-out';
            deathScreen.style.opacity = '0';
            
            // Death message
            const deathMessage = document.createElement('div');
            deathMessage.style.color = '#ff3019';
            deathMessage.style.fontSize = '36px';
            deathMessage.style.fontWeight = 'bold';
            deathMessage.style.textShadow = '0 0 10px #ff3019';
            deathMessage.style.marginBottom = '20px';
            deathMessage.textContent = 'YOU DIED';
            deathScreen.appendChild(deathMessage);
            
            // Countdown timer
            const countdownTimer = document.createElement('div');
            countdownTimer.style.color = '#ffffff';
            countdownTimer.style.fontSize = '18px';
            countdownTimer.style.marginBottom = '20px';
            countdownTimer.textContent = 'Respawning in 10 seconds...';
            deathScreen.appendChild(countdownTimer);
            
            // Store references
            this.deathScreen = {
                container: deathScreen,
                message: deathMessage,
                timer: countdownTimer
            };
            
            // Add to document
            document.body.appendChild(deathScreen);
        }
        
        // Show the death screen with fade-in effect
        this.deathScreen.container.style.display = 'flex';
        setTimeout(() => {
            this.deathScreen.container.style.opacity = '1';
        }, 10);
        
        // Start the countdown timer
        let secondsLeft = 10;
        this.deathScreen.timer.textContent = `Respawning in ${secondsLeft} seconds...`;
        
        // Clear any existing countdown
        if (this.respawnCountdown) {
            clearInterval(this.respawnCountdown);
        }
        
        // Set up the countdown
        this.respawnCountdown = setInterval(() => {
            secondsLeft--;
            
            // Update the countdown text
            this.deathScreen.timer.textContent = `Respawning in ${secondsLeft} seconds...`;
            
            if (secondsLeft <= 0) {
                // Clear the interval
                clearInterval(this.respawnCountdown);
                this.respawnCountdown = null;
                
                // Trigger respawn
                console.log('Countdown reached zero, triggering respawn');
                if (this.game && this.game.playerManager) {
                    this.game.playerManager.respawnPlayer(this.game.localPlayer);
                } else {
                    console.error('Cannot respawn: playerManager not found');
                }
            }
        }, 1000);
    }
    
    /**
     * Hide death screen when player respawns
     */
    hideDeathScreen() {
        console.log('Hiding death screen');
        
        if (this.deathScreen) {
            // Clear any existing countdown
            if (this.respawnCountdown) {
                clearInterval(this.respawnCountdown);
                this.respawnCountdown = null;
            }
            
            // Fade out
            this.deathScreen.container.style.opacity = '0';
            
            // Hide after animation completes
            setTimeout(() => {
                this.deathScreen.container.style.display = 'none';
            }, 500);
            
            // Clear any damage effects/indicators that might still be visible
            this.clearDamageEffects();
        }
    }
    
    /**
     * Clear any damage effects or indicators from the scene
     */
    clearDamageEffects() {
        // Remove any damage effect elements from the DOM
        const damageElements = document.querySelectorAll('.damage-effect, .damage-indicator');
        damageElements.forEach(element => {
            element.remove();
        });
        
        // Also clear any red flash overlay
        if (this.damageOverlay) {
            this.damageOverlay.style.opacity = '0';
            setTimeout(() => {
                this.damageOverlay.style.display = 'none';
            }, 300);
        }
        
        // Note: This method only clears visual effects, not actual health data
        // The server remains the authority for player health values
    }

    /**
     * Creates a red flash effect overlay to indicate player damage
     */
    flashDamageEffect() {
        // Create damage overlay if it doesn't exist
        if (!this.damageOverlay) {
            this.damageOverlay = document.createElement('div');
            this.damageOverlay.style.position = 'fixed';
            this.damageOverlay.style.top = '0';
            this.damageOverlay.style.left = '0';
            this.damageOverlay.style.width = '100%';
            this.damageOverlay.style.height = '100%';
            this.damageOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            this.damageOverlay.style.zIndex = '1500';
            this.damageOverlay.style.pointerEvents = 'none'; // Allow click-through
            this.damageOverlay.style.transition = 'opacity 0.3s ease-out';
            this.damageOverlay.style.opacity = '0';
            document.body.appendChild(this.damageOverlay);
        }
        
        // Make sure it's visible
        this.damageOverlay.style.display = 'block';
        
        // Flash effect
        this.damageOverlay.style.opacity = '0.5';
        
        // Fade out after short delay
        setTimeout(() => {
            if (this.damageOverlay) {
                this.damageOverlay.style.opacity = '0';
            }
        }, 200);
    }

    /**
     * Update the XP ring with the player's experience
     * @param {number} experience - Current experience points
     * @param {number} experienceToNextLevel - Experience needed for next level
     * @param {number} level - Current player level
     */
    updateXPRing(experience, experienceToNextLevel, level) {
        if (this.xpRingFill && this.xpTooltip) {
            const baseExp = 100; // Same as GameConstants.EXPERIENCE.BASE_EXPERIENCE
            const scalingFactor = 1.5; // Same as GameConstants.EXPERIENCE.SCALING_FACTOR
            
            // Calculate total experience needed for previous level
            let expToPreviousLevel = 0;
            for (let i = 1; i < level; i++) {
                expToPreviousLevel += baseExp * Math.pow(scalingFactor, i - 1);
            }
            
            // Calculate experience needed for current level
            const expForCurrentLevel = baseExp * Math.pow(scalingFactor, level - 1);
            
            // Calculate progress within the current level
            const currentLevelProgress = experience - expToPreviousLevel;
            
            // Calculate the percentage filled
            const xpPercent = Math.min(100, (currentLevelProgress / expForCurrentLevel) * 100);
            
            // Use clip-path instead of strokeDashoffset for consistent rendering with other rings
            const emptyPercentage = 100 - xpPercent;
            this.xpRingFill.style.clipPath = `inset(${emptyPercentage}% 0 0 0)`;
            
            if (this.xpTooltip) {
                this.xpTooltip.textContent = `Level ${level}: ${Math.floor(currentLevelProgress)}/${Math.floor(expForCurrentLevel)} XP`;
            }
        }
        
        // Update level text if available
        if (this.levelText) {
            this.levelText.textContent = level;
        }
    }

    /**
     * Show a message to the user
     * @param {string} message - The message to display
     * @param {number} [duration=3000] - How long to show the message in milliseconds
     */
    showMessage(message, duration = 3000, color = 'white') {
        // Use the notification system for consistency
        this.showNotification(message, color, duration);
    }

    /**
     * Create a tooltip for the karma bar
     * @param {HTMLElement} karmaBar - The karma bar element
     */
    createKarmaTooltip(karmaBar) {
        // Create karma tooltip
        const karmaTooltip = document.createElement('div');
        karmaTooltip.className = 'tooltip';
        karmaTooltip.style.position = 'absolute';
        karmaTooltip.style.bottom = '25px';
        karmaTooltip.style.left = '50%';
        karmaTooltip.style.transform = 'translateX(-50%)';
        karmaTooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        karmaTooltip.style.color = '#ffffff';
        karmaTooltip.style.padding = '5px 10px';
        karmaTooltip.style.borderRadius = '4px';
        karmaTooltip.style.fontSize = '12px';
        karmaTooltip.style.whiteSpace = 'nowrap';
        karmaTooltip.style.display = 'none';
        karmaTooltip.style.zIndex = '1500';
        karmaTooltip.textContent = 'Karma: Neutral (50/100)';
        
        // Add to document body
        document.body.appendChild(karmaTooltip);
        
        // Store reference
        this.karmaTooltip = karmaTooltip;
        
        // Add hover event listeners
        karmaBar.addEventListener('mouseenter', () => {
            const rect = karmaBar.getBoundingClientRect();
            karmaTooltip.style.left = `${rect.left + rect.width / 2}px`;
            karmaTooltip.style.bottom = `${window.innerHeight - rect.top + 5}px`;
            karmaTooltip.style.display = 'block';
        });
        
        karmaBar.addEventListener('mouseleave', () => {
            karmaTooltip.style.display = 'none';
        });
    }

    /**
     * Shows a notification for experience gained
     * @param {number} amount - Amount of experience gained
     * @param {boolean} levelUp - Whether a level up also occurred
     * @param {number} newLevel - The new level if leveled up
     */
    showExperienceGain(amount, levelUp = false, newLevel = null) {
        // Experience gain notification with animation
        const xpNotification = document.createElement('div');
        xpNotification.textContent = `+${amount} XP`;
        xpNotification.style.position = 'fixed';
        xpNotification.style.bottom = '130px'; // Position above XP ring
        xpNotification.style.left = '70px'; // Aligned with XP ring
        xpNotification.style.color = '#FFD700'; // Golden color
        xpNotification.style.fontWeight = 'bold';
        xpNotification.style.fontSize = '20px';
        xpNotification.style.textShadow = '0 0 5px rgba(255, 215, 0, 0.7)';
        xpNotification.style.zIndex = '1200';
        xpNotification.style.opacity = '0';
        xpNotification.style.transform = 'translateY(0)';
        xpNotification.style.transition = 'opacity 0.3s ease-in, transform 1s ease-out';
        document.body.appendChild(xpNotification);
        
        // Fade in and float up
        setTimeout(() => {
            xpNotification.style.opacity = '1';
            xpNotification.style.transform = 'translateY(-30px)';
        }, 50);
        
        // Fade out and remove
        setTimeout(() => {
            xpNotification.style.opacity = '0';
            setTimeout(() => xpNotification.remove(), 500);
        }, 2000);
        
        // If level up occurred, show a level up notification
        if (levelUp && newLevel) {
            // Main level up notification
            this.showNotification(`Level up! You are now level ${newLevel}`, 'yellow', 3000);
            
            // Add stat improvement notifications
            setTimeout(() => {
                this.showNotification(`+${GameConstants.LEVEL_REWARDS.LIFE_PER_LEVEL} Max Life`, '#77ff77', 2500);
            }, 1000);
            
            setTimeout(() => {
                this.showNotification(`+${GameConstants.LEVEL_REWARDS.MANA_PER_LEVEL} Max Mana`, '#7777ff', 2500);
            }, 1500);
            
            setTimeout(() => {
                const damageBonus = Math.round(GameConstants.LEVEL_REWARDS.DAMAGE_BONUS_PER_LEVEL * 100);
                this.showNotification(`+${damageBonus}% Damage`, '#ff7777', 2500);
            }, 2000);
            
            setTimeout(() => {
                const reduction = Math.round(GameConstants.LEVEL_REWARDS.DAMAGE_REDUCTION_PER_LEVEL * 100);
                this.showNotification(`+${reduction}% Damage Reduction`, '#aaddff', 2500);
            }, 2500);
            
            // Play level up sound if available
            if (this.game.soundManager && this.game.soundManager.playSound) {
                this.game.soundManager.playSound('level_up');
            }
        }
    }

    /**
     * Update the loading screen message
     * @param {string} message - The new message to display
     */
    updateLoadingScreen(message) {
        if (this.loadingScreen && this.loadingScreen.messageElement) {
            this.loadingScreen.messageElement.textContent = message;
        } else {
            // If the loading screen doesn't exist yet, create it
            this.showLoadingScreen(message);
        }
    }
    
    /**
     * Show a notification that the game is running in offline mode
     */
    showOfflineNotification() {
        this.showNotification(
            'Unable to connect to server. Running in offline mode with limited functionality.',
            '#ff9900',
            10000
        );
        
        // Also create a persistent offline indicator
        const offlineIndicator = document.createElement('div');
        offlineIndicator.className = 'offline-indicator';
        offlineIndicator.style.position = 'fixed';
        offlineIndicator.style.top = '10px';
        offlineIndicator.style.right = '10px';
        offlineIndicator.style.backgroundColor = '#ff9900';
        offlineIndicator.style.color = 'white';
        offlineIndicator.style.padding = '5px 10px';
        offlineIndicator.style.borderRadius = '4px';
        offlineIndicator.style.fontSize = '12px';
        offlineIndicator.style.fontWeight = 'bold';
        offlineIndicator.style.zIndex = '9999';
        offlineIndicator.textContent = 'OFFLINE MODE';
        document.body.appendChild(offlineIndicator);
        
        // Pulse the indicator to draw attention
        let opacity = 1;
        const pulse = () => {
            opacity = opacity === 1 ? 0.5 : 1;
            offlineIndicator.style.opacity = opacity;
            setTimeout(pulse, 1000);
        };
        pulse();
    }

    /**
     * Clear all pending and currently displayed notifications
     */
    clearAllNotifications() {
        // Clear queue
        this.notificationQueue = [];
        
        // Clear currently displaying notification
        if (this.notificationElement) {
            // Clear any existing timeout
            if (this.notificationTimeout) {
                clearTimeout(this.notificationTimeout);
                this.notificationTimeout = null;
            }
            
            // Hide current notification
            this.notificationElement.style.opacity = '0';
            this.currentNotificationMessage = null;
            this.processingNotification = false;
        }
    }
    
    /**
     * Update notification position to be 50px (5cm) below the target bar
     */
    updateNotificationPosition() {
        if (!this.notificationElement) return;
        
        const TARGET_OFFSET = 50; // 50px = 5cm at standard DPI
        
        if (this.targetDisplay && this.targetDisplay.container) {
            // Get the target display position and dimensions
            const targetRect = this.targetDisplay.container.getBoundingClientRect();
            // Position notification 50px below the bottom of target display
            const topPosition = targetRect.bottom + TARGET_OFFSET;
            this.notificationElement.style.top = `${topPosition}px`;
        } else {
            // If target display doesn't exist, use a default position
            this.notificationElement.style.top = '60px';
        }
    }

    /**
     * Handle window resize events to update UI elements
     */
    handleResize() {
        // Update notification position
        this.updateNotificationPosition();
        
        // Update any other UI elements that need repositioning
        // ...
    }
} 