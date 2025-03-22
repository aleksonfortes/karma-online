/**
 * NetworkManager.js - Server-side network management
 * 
 * Handles socket connections, message validation, and rate limiting
 */
import { Server } from 'socket.io';
import GameConstants from '../../config/GameConstants.js';

export class NetworkManager {
    constructor(httpServer) {
        if (!httpServer) {
            throw new Error('HTTP server is required for NetworkManager');
        }

        this.io = new Server(httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });

        this.gameManager = null;
        this.playerManager = null;
        this.lastUpdateTime = new Map(); // For rate limiting movement
        this.skillAttempts = new Map(); // For rate limiting skill usage
        this.securityLogs = [];
        this.sockets = new Map();
        this._lastLogs = {};
        
        // No initialization here - will be done in setGameManager
    }
    
    /**
     * Set the game manager reference and initialize socket handlers
     */
    setGameManager(gameManager) {
        this.gameManager = gameManager;
        this.playerManager = this.gameManager.playerManager;
        
        this.setupSocketHandlers();
        this.initialize();
    }
    
    /**
     * Set up socket event handlers
     */
    setupSocketHandlers() {
        console.log('NetworkManager: Setting up socket handlers');
        
        this.io.on('connection', (socket) => {
            // Create new player through the player manager
            const player = this.playerManager.addPlayer(socket.id);
            
            // Log player connection with total count
            console.log(`Player connected: ${socket.id} (Total Players: ${this.playerManager.getPlayerCount()})`);
            
            // Store the socket
            this.sockets.set(socket.id, { statsInterval: null });
            
            // Send current game state to new player including NPCs
            socket.emit('initGameState', {
                players: this.playerManager.getAllPlayers(),
                npcs: this.gameManager.getAllNPCs(),
                serverTime: Date.now()
            });
            
            // Broadcast new player to others
            this.io.emit('newPlayer', player);

            // Handle dev mode actions
            socket.on('dev_action', (data) => {
                // SECURITY NOTE:
                // Development mode actions are only processed if the server is running in development mode
                // This provides a server-side authority check that cannot be bypassed by client-side modifications
                // Even if a user modifies the client code to emit dev_action events, they will be rejected here
                // The purposefully vague error message prevents users from knowing these commands exist
                
                // Only process dev actions if server is in development mode
                if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
                    // Potentially manipulated client detected - log more detailed info
                    const clientInfo = {
                        ip: socket.handshake.address,
                        userAgent: socket.handshake.headers['user-agent'] || 'unknown',
                        action: data?.action || 'unknown',
                        timestamp: new Date().toISOString()
                    };
                    
                    console.warn(`[SECURITY] Potential client manipulation detected: dev action attempted in production mode`);
                    console.warn(`[SECURITY] Player ID: ${socket.id}, IP: ${clientInfo.ip}, Action: ${clientInfo.action}`);
                    
                    // Add to security logs for potential analysis
                    this.securityLogs.push({
                        type: 'dev_action_blocked',
                        severity: 'medium',
                        playerId: socket.id,
                        clientInfo,
                        data
                    });
                    
                    // Send error message to client
                    socket.emit('errorMessage', {
                        type: 'dev_action',
                        message: 'This action is not available'
                    });
                    
                    return;
                }
                
                console.log(`Processing dev action in ${process.env.NODE_ENV} mode: ${data.action} for player ${socket.id}`);
                
                if (!data || !data.action) {
                    return;
                }
                
                // Get the player
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    console.warn(`Player not found for dev_action from ${socket.id}`);
                    return;
                }
                
                console.log(`Processing dev action for ${socket.id}: ${data.action}`);
                
                // Process different dev actions
                switch (data.action) {
                    case 'gain_xp':
                        // Initialize experience if needed
                        if (player.experience === undefined) {
                            player.experience = 0;
                        }
                        if (player.level === undefined) {
                            player.level = 1;
                        }
                        
                        // Add XP
                        const xpAmount = data.amount || 50;
                        player.experience += xpAmount;
                        
                        // Check for level up
                        const expToNextLevel = 100 * Math.pow(1.5, player.level - 1);
                        if (player.experience >= expToNextLevel) {
                            player.level += 1;
                            player.experience = 0;
                            
                            // Increase max life and mana for level up
                            player.maxLife = 100 + (player.level - 1) * 10;
                            player.maxMana = 100 + (player.level - 1) * 10;
                            
                            // Heal to full on level up
                            player.life = player.maxLife;
                            player.mana = player.maxMana;
                            
                            // Send level up notification
                            socket.emit('levelUp', {
                                level: player.level,
                                maxLife: player.maxLife,
                                maxMana: player.maxMana
                            });
                        }
                        
                        // Send XP update to client
                        socket.emit('experienceUpdate', {
                            experience: player.experience,
                            level: player.level,
                            nextLevelXP: expToNextLevel
                        });
                        
                        // Also broadcast updated stats to all clients
                        this.io.emit('statsUpdate', {
                            players: [{
                                id: player.id,
                                experience: player.experience,
                                level: player.level,
                                life: player.life,
                                maxLife: player.maxLife,
                                mana: player.mana,
                                maxMana: player.maxMana,
                                updateId: `${player.id}-${Date.now()}`
                            }],
                            timestamp: Date.now(),
                            source: 'dev_action'
                        });
                        break;
                        
                    case 'gain_karma':
                        // Initialize karma if needed
                        if (player.karma === undefined) {
                            player.karma = 50;
                        }
                        if (player.maxKarma === undefined) {
                            player.maxKarma = 100;
                        }
                        
                        // Add karma
                        const karmaGainAmount = data.amount || 10;
                        player.karma = Math.min(player.maxKarma, player.karma + karmaGainAmount);
                        
                        // Update player effects based on new karma value
                        this.playerManager.updatePlayerEffects(player);
                        
                        // Broadcast the karma update to all clients
                        this.io.emit('karmaUpdate', {
                            id: socket.id,
                            karma: player.karma,
                            maxKarma: player.maxKarma,
                            path: player.path,
                            timestamp: Date.now()
                        });
                        break;
                        
                    case 'lose_karma':
                        // Initialize karma if needed
                        if (player.karma === undefined) {
                            player.karma = 50;
                        }
                        if (player.maxKarma === undefined) {
                            player.maxKarma = 100;
                        }
                        
                        // Reduce karma
                        const karmaLossAmount = data.amount || 10;
                        player.karma = Math.max(0, player.karma - karmaLossAmount);
                        
                        // Update player effects based on new karma value
                        this.playerManager.updatePlayerEffects(player);
                        
                        // Broadcast the karma update to all clients
                        this.io.emit('karmaUpdate', {
                            id: socket.id,
                            karma: player.karma,
                            maxKarma: player.maxKarma,
                            path: player.path,
                            timestamp: Date.now()
                        });
                        break;
                        
                    default:
                        console.warn(`Unknown dev action: ${data.action}`);
                }
            });

            // Handle player movement with rate limiting and validation
            socket.on('playerMovement', (data) => {
                if (!this.validateSession(socket.id)) {
                    return;
                }
                if (!this.rateLimitMovement(socket.id)) {
                    return;
                }
                
                // Validate movement data
                if (!this.validateMovementData(data)) {
                    this.logSecurityEvent(`Invalid movement data from player ${socket.id}`);
                    return;
                }
                
                // Create a clean copy with only the fields we need
                const sanitizedData = {
                    position: {
                        x: Number(data.position.x),
                        y: Number(data.position.y),
                        z: Number(data.position.z)
                    },
                    rotation: {
                        y: Number(data.rotation.y || 0)
                    },
                    path: data.path || null,
                    karma: Number(data.karma || 50),
                    maxKarma: Number(data.maxKarma || 100),
                    mana: Number(data.mana || 100),
                    maxMana: Number(data.maxMana || 100)
                };
                
                // Update player through game manager
                const success = this.gameManager.updatePlayerMovement(socket.id, sanitizedData);
                if (success) {
                    // Get updated player
                    const player = this.playerManager.getPlayer(socket.id);
                    
                    // Broadcast movement to other players
                    this.io.emit('playerMoved', {
                        id: socket.id,
                        position: sanitizedData.position,
                        rotation: sanitizedData.rotation,
                        path: sanitizedData.path,
                        karma: sanitizedData.karma,
                        maxKarma: sanitizedData.maxKarma,
                        life: player.life,
                        maxLife: player.maxLife,
                        mana: sanitizedData.mana,
                        maxMana: sanitizedData.maxMana
                    });
                    
                    this.lastUpdateTime.set(socket.id, Date.now());
                }
            });
            
            // Handle NPC interaction requests
            socket.on('npcInteraction', (data) => {
                if (!this.validateSession(socket.id)) {
                    return;
                }
                
                // Validate NPC ID
                if (!data || !data.npcId) {
                    this.logSecurityEvent(`Invalid NPC interaction data from player ${socket.id}`);
                    return;
                }
                
                // Process interaction through game manager
                const interactionResult = this.gameManager.handleNPCInteraction(socket.id, data.npcId);
                if (interactionResult) {
                    // Send interaction result back to the requesting player
                    socket.emit('npcInteractionResult', interactionResult);
                }
            });
            
            // Handle path selection
            socket.on('choosePath', (data) => {
                console.log(`Player ${socket.id} is choosing path: ${data?.path}`);
                
                // Validate path data
                if (!data || !data.path || (data.path !== 'light' && data.path !== 'dark')) {
                    this.logSecurityEvent(`Invalid path selection data from player ${socket.id}`);
                    socket.emit('pathSelectionResult', {
                        success: false,
                        message: 'Invalid path selection'
                    });
                    return;
                }
                
                // Get the player
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    socket.emit('pathSelectionResult', {
                        success: false,
                        message: 'Player not found'
                    });
                    return;
                }
                
                // Check if player has already chosen a path
                if (player.path) {
                    // Player already has a path, reject the request
                    socket.emit('pathSelectionResult', {
                        success: false,
                        message: `You have already chosen the path of ${player.path}. This choice is permanent in this life.`
                    });
                    return;
                }
                
                // Set the player's path
                player.path = data.path;
                
                // Grant skills based on path
                const skills = [];
                if (data.path === 'light') {
                    skills.push('martial_arts');
                } else if (data.path === 'dark') {
                    skills.push('dark_ball');
                }
                
                // Send success response
                socket.emit('pathSelectionResult', {
                    success: true,
                    path: data.path,
                    skills: skills
                });
            });

            // Handle learning skills
            socket.on('learnSkill', (data) => {
                console.log(`Player ${socket.id} is trying to learn skill: ${data?.skillId}`);
                
                // Validate skill data
                if (!data || !data.skillId) {
                    this.logSecurityEvent(`Invalid skill learning data from player ${socket.id}`);
                    socket.emit('skillLearningResult', {
                        success: false,
                        message: 'Invalid skill data'
                    });
                    return;
                }
                
                // Process the skill learning request
                const result = this.gameManager.processSkillLearning(socket.id, data.skillId);
                
                // Send the result to the player
                socket.emit('skillLearningResult', result);
                
                // If successful, update other players
                if (result.success) {
                    // Update player state for real-time sync
                    const player = this.playerManager.getPlayer(socket.id);
                    if (player) {
                        // Broadcast updated player state to other players
                        this.io.emit('playerUpdate', {
                            id: socket.id,
                            skills: player.skills
                        });
                    }
                }
            });

            // Handle skill use
            socket.on('useSkill', (data) => {
                if (!data || !data.targetId || !data.skillName) {
                    console.warn(`Invalid skill data from ${socket.id}: ${JSON.stringify(data)}`);
                    
                    // Return an error response to client
                    socket.emit('skillResponse', {
                        skillName: data?.skillName || 'unknown',
                        success: false,
                        errorType: 'invalid_data',
                        message: 'Invalid skill data'
                    });
                    return;
                }
                
                // Special debug logging for Life Drain
                if (data.skillName === 'life_drain') {
                    console.log(`[LIFE DRAIN DEBUG] Received life_drain request from ${socket.id} to target ${data.targetId}`);
                }
                
                // Apply rate limiting
                if (!this.rateLimitSkillUsage(socket.id, 'pvp')) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Using skills too rapidly, please slow down'
                    });
                    
                    // Also send skill response
                    socket.emit('skillResponse', {
                        skillName: data.skillName,
                        success: false,
                        errorType: 'rate_limit',
                        message: 'Using skills too rapidly'
                    });
                    return;
                }
                
                // Get the players
                const attackingPlayer = this.playerManager.getPlayer(socket.id);
                const targetPlayer = this.playerManager.getPlayer(data.targetId);
                
                if (!attackingPlayer || !targetPlayer) {
                    console.warn(`Player or target not found: ${socket.id} -> ${data.targetId}`);
                    return;
                }

                // Don't break invisibility if using the embrace_void skill itself
                if (data.skillName !== 'embrace_void') {
                    // Check if player is invisible - using an attack skill breaks invisibility
                    this.breakInvisibilityIfActive(attackingPlayer, socket);
                }

                // Initialize skill cooldowns if not existing
                if (!attackingPlayer.skillCooldowns) {
                    attackingPlayer.skillCooldowns = new Map();
                }
                
                // Check server-side cooldown
                const now = Date.now();
                const lastUsedTime = attackingPlayer.skillCooldowns.get(data.skillName) || 0;
                const skillCooldown = this.getSkillCooldown(data.skillName);
                
                if (lastUsedTime > 0 && now - lastUsedTime < skillCooldown) {
                    console.log(`Player ${socket.id} tried to use ${data.skillName} before cooldown finished`);
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Skill is on cooldown'
                    });
                    return;
                }
                
                // Check if player has enough mana
                let manaCost = 0; // Default mana cost (0)
                if (data.skillName === 'dark_ball') {
                    manaCost = 25;
                } else if (data.skillName === 'martial_arts') {
                    manaCost = 0; // No mana cost for martial arts
                } else if (data.skillName === 'flow_of_life') {
                    // Flow of Life is always self-targeted
                    if (socket.id !== data.targetId) {
                        // If target isn't self, automatically adjust to self-target
                        data.targetId = socket.id;
                        console.log(`Flow of Life redirected to self-target for player ${socket.id}`);
                    }
                    
                    // Apply mana cost
                    manaCost = 30; // Mana cost for flow_of_life
                    
                    // Apply healing amount
                    const healingAmount = 20; // Base healing amount
                    
                    // Apply healing directly to the caster
                    attackingPlayer.life = Math.min(attackingPlayer.maxLife, attackingPlayer.life + healingAmount);
                    
                    // Emit healing notification
                    socket.emit('notification', {
                        message: `You have healed yourself for ${healingAmount} health.`,
                        type: 'success'
                    });
                    
                    // Log the healing
                    console.log(`Player ${socket.id} used Flow of Life to heal for ${healingAmount}. Health: ${attackingPlayer.life}/${attackingPlayer.maxLife}`);
                    
                    // Emit healing effect for the player
                    this.io.emit('damageEffect', {
                        sourceId: socket.id,
                        targetId: socket.id,
                        damage: -healingAmount, // Negative damage indicates healing
                        skillName: data.skillName,
                        isHealing: true
                    });
                    
                    // Emit life update to all players
                    this.io.emit('lifeUpdate', {
                        id: socket.id,
                        life: attackingPlayer.life,
                        maxLife: attackingPlayer.maxLife || 100,
                        timestamp: Date.now(),
                        final: true,
                        isHealing: true
                    });
                    
                    // Skip normal damage/healing processing
                    return;
                } else if (data.skillName === 'life_drain') {
                    manaCost = 30; // Mana cost for life_drain
                } else if (data.skillName === 'one_with_universe') {
                    // One with Universe consumes all mana
                    manaCost = attackingPlayer.mana; // Will consume all available mana
                    
                    // Check if player's mana is at maximum before allowing use
                    if (attackingPlayer.mana < attackingPlayer.maxMana) {
                        console.log(`Player ${socket.id} tried to use One with Universe without full mana (${attackingPlayer.mana}/${attackingPlayer.maxMana})`);
                        socket.emit('errorMessage', {
                            type: 'combat',
                            message: 'One with Universe requires maximum mana to use'
                        });
                        return;
                    }
                } else if (data.skillName === 'embrace_void') {
                    manaCost = 35; // Mana cost for embrace_void
                }
                
                // Initialize mana if not set
                if (attackingPlayer.mana === undefined) {
                    attackingPlayer.mana = 100;
                }
                if (attackingPlayer.maxMana === undefined) {
                    attackingPlayer.maxMana = 100;
                }
                
                // Check if player has enough mana (only for skills with mana cost > 0)
                if (manaCost > 0 && attackingPlayer.mana < manaCost) {
                    console.log(`Player ${socket.id} tried to use ${data.skillName} without enough mana (${attackingPlayer.mana}/${manaCost})`);
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Not enough mana to use this skill'
                    });
                    return;
                }
                
                // Consume mana if the skill costs mana
                if (manaCost > 0) {
                    attackingPlayer.mana -= manaCost;
                    
                    // Emit mana update to the player
                    socket.emit('manaUpdate', {
                        id: socket.id,
                        mana: attackingPlayer.mana,
                        maxMana: attackingPlayer.maxMana
                    });
                }
                
                // Apply special effects for One with the Universe skill - grant immunity
                if (data.skillName === 'one_with_universe') {
                    // Ensure mana cost is properly deducted
                    attackingPlayer.mana = 0; // Consume all mana
                    
                    // Emit updated mana to player
                    socket.emit('manaUpdate', {
                        id: socket.id,
                        mana: 0,
                        maxMana: attackingPlayer.maxMana
                    });
                    
                    // Grant immunity for 5 seconds
                    attackingPlayer.isImmune = true;
                    attackingPlayer.immuneUntil = Date.now() + 5000; // 5 seconds of immunity
                    
                    console.log(`Player ${socket.id} activated One with Universe - immune until ${new Date(attackingPlayer.immuneUntil).toISOString()}`);
                    
                    // Send notification to the player
                    socket.emit('notification', {
                        message: 'You are immune to all damage for 5 seconds!',
                        type: 'success'
                    });
                    
                    // Schedule immunity removal after duration
                    setTimeout(() => {
                        if (attackingPlayer) {
                            attackingPlayer.isImmune = false;
                            console.log(`Player ${socket.id} immunity expired`);
                            
                            // Notify player that immunity has ended
                            socket.emit('notification', {
                                message: 'Your immunity has ended',
                                type: 'info'
                            });
                        }
                    }, 5000);
                }
                
                // Apply special effects for Embrace Void skill - grant invisibility
                if (data.skillName === 'embrace_void') {
                    // Duration from client data or default to 20 seconds (increased from 8 seconds)
                    const duration = data.duration || 20000;
                    
                    // Set invisibility flag
                    attackingPlayer.visible = false;
                    attackingPlayer.invisibleUntil = Date.now() + duration;
                    
                    console.log(`Player ${socket.id} activated Embrace Void - invisible until ${new Date(attackingPlayer.invisibleUntil).toISOString()}`);
                    
                    // Broadcast player visibility change to all clients
                    this.io.emit('player_visibility_change', {
                        playerId: socket.id,
                        visible: false,
                        duration: duration
                    });
                    
                    // Send notification to the player
                    socket.emit('notification', {
                        message: `You are invisible for ${duration/1000} seconds or until you attack!`,
                        type: 'success'
                    });
                    
                    // Store timeout ID so we can cancel it if invisibility breaks early
                    attackingPlayer.invisibilityTimeoutId = setTimeout(() => {
                        if (attackingPlayer) {
                            attackingPlayer.visible = true;
                            delete attackingPlayer.invisibilityTimeoutId;
                            console.log(`Player ${socket.id} invisibility expired`);
                            
                            // Broadcast visibility change to all clients
                            this.io.emit('player_visibility_change', {
                                playerId: socket.id,
                                visible: true
                            });
                            
                            // Notify player that invisibility has ended
                            socket.emit('notification', {
                                message: 'Your invisibility has ended',
                                type: 'info'
                            });
                        }
                    }, duration);
                }
                
                // Update skill cooldown
                attackingPlayer.skillCooldowns.set(data.skillName, now);
                
                // Check if player is dead
                if (attackingPlayer.isDead) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Cannot use skills while dead'
                    });
                    return;
                }
                
                // Check if target is dead
                if (targetPlayer.isDead) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Cannot attack a dead player'
                    });
                    return;
                }
                
                // Check if player or target is in temple area
                const isPlayerInTemple = this.isPositionInTemple(attackingPlayer.position);
                const isTargetInTemple = this.isPositionInTemple(targetPlayer.position);
                
                // Prevent attacks in temple safe zone
                if (isTargetInTemple) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Cannot attack players that are close to the temple safe zone'
                    });
                    return;
                }
                
                // Prevent attacks from outside temple to inside temple
                if (!isPlayerInTemple && isTargetInTemple) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Temple safe zone blocks your attack'
                    });
                    return;
                }
                
                // Check if target is in range
                const distance = this.calculateDistance(attackingPlayer.position, targetPlayer.position, 'player');
                let skillRange = 1.5; // Default range
                
                if (data.skillName === 'martial_arts') {
                    skillRange = 3;
                } else if (data.skillName === 'dark_ball') {
                    skillRange = 6; // Updated from 3 to 6 (2x martial arts range)
                } else if (data.skillName === 'life_drain') {
                    skillRange = 4.5; // Increased to match client-side range of 3
                }
                
                // Add a tolerance buffer to account for client-server differences
                const rangeTolerance = skillRange * 0.25; // 25% tolerance
                
                if (distance > skillRange + rangeTolerance) {
                    console.log(`Player ${socket.id} tried to attack ${data.targetId} with ${data.skillName} but is out of range (${distance.toFixed(2)} > ${skillRange})`);
                    // Send error message to client about range
                    console.log(`Sending out of range error to client: ${socket.id}`);
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Target is out of range'
                    });
                    console.log('Error message sent, returning from useSkill handler');
                    return; // Important: return here to prevent attack processing
                }
                
                // Ensure target has life values initialized
                if (targetPlayer.life === undefined) {
                    targetPlayer.life = 100;
                }
                if (targetPlayer.maxLife === undefined) {
                    targetPlayer.maxLife = 100;
                }
                
                // Ensure attacker has life values initialized
                if (attackingPlayer.life === undefined) {
                    attackingPlayer.life = 100;
                }
                if (attackingPlayer.maxLife === undefined) {
                    attackingPlayer.maxLife = 100;
                }
                
                // Special case: If using embrace_void on self, skip damage calculation entirely
                if (data.skillName === 'embrace_void' && socket.id === data.targetId) {
                    // No damage or additional processing needed for embrace_void
                    // The invisibility effect is already applied above
                    return;
                }
                
                // Calculate and apply damage
                const previousLife = targetPlayer.life;
                
                // Check if this is a healing skill (negative damage value or isHealing flag)
                const isHealingSkill = data.damage < 0 || data.isHealing;
                
                // Variable declaration moved to before first use
                let damageDealt;
                
                // Check if target is immune to damage (One with the Universe)
                if (!isHealingSkill && targetPlayer.isImmune) {
                    console.log(`Target player ${data.targetId} is immune to damage from ${socket.id} using ${data.skillName}`);
                    
                    // Set damage to 0 but still process the effect visually with no actual damage
                    damageDealt = 0;
                    
                    // Send notification to the attacker
                    socket.emit('notification', {
                        message: 'Target is immune to damage!',
                        type: 'warning'
                    });
                    
                    // Still create visual effect but no health change
                    this.io.emit('damageEffect', {
                        sourceId: socket.id,
                        targetId: data.targetId,
                        damage: 0,
                        skillName: data.skillName,
                        isHealing: false,
                        isCritical: false,
                        wasBlocked: true // Indicate this was a blocked attack
                    });
                    
                    // Skip normal damage processing but return success to the client
                    socket.emit('skillDamage', {
                        sourceId: socket.id,
                        targetId: data.targetId,
                        damage: 0,
                        skillName: data.skillName,
                        isHealing: false,
                        wasBlocked: true
                    });
                    
                    return;
                }
                
                // Server calculates damage or healing instead of trusting client-sent value
                if (isHealingSkill) {
                    // For healing, we treat it differently - healing targets the player
                    let healingAmount = 0;
                    
                    if (data.skillName === 'flow_of_life') {
                        healingAmount = 20; // Base healing amount
                        
                        // Apply healing (positive to increase life)
                        targetPlayer.life = Math.min(targetPlayer.maxLife, targetPlayer.life + healingAmount);
                        damageDealt = -healingAmount; // Negative value to indicate healing
                        
                        console.log(`Player ${socket.id} healed ${data.targetId} for ${healingAmount} using ${data.skillName}. Target health: ${targetPlayer.life}/${targetPlayer.maxLife}`);
                    } else if (data.skillName === 'life_drain') {
                        // Life Drain is special - it's marked as a healing skill but actually damages the target and heals the caster
                        healingAmount = 15; // Base healing amount for Life Drain
                        
                        // Only process if draining someone else, not self
                        if (socket.id !== data.targetId) {
                            console.log(`[LIFE DRAIN] Processing life drain from ${socket.id} to ${data.targetId}`);
                            
                            // Calculate damage to target
                            let drainDamage = this.calculateSkillDamage('life_drain', attackingPlayer, targetPlayer);
                            console.log(`[LIFE DRAIN] Calculated damage: ${drainDamage}`);
                            
                            // Apply damage to target
                            targetPlayer.life = Math.max(0, targetPlayer.life - drainDamage);
                            
                            // Heal the caster
                            attackingPlayer.life = Math.min(attackingPlayer.maxLife, attackingPlayer.life + healingAmount);
                            
                            // Log both effects
                            console.log(`[LIFE DRAIN] Player ${socket.id} drained ${drainDamage} health from ${data.targetId} using life_drain. Target health: ${targetPlayer.life}/${targetPlayer.maxLife}`);
                            console.log(`[LIFE DRAIN] Player ${socket.id} healed for ${healingAmount} using life_drain. Player health: ${attackingPlayer.life}/${attackingPlayer.maxLife}`);
                            
                            // Emit healing to the player (attacker) - Send a more authoritative update with 'final' flag
                            this.io.emit('lifeUpdate', {
                                id: socket.id,
                                life: attackingPlayer.life,
                                maxLife: attackingPlayer.maxLife || 100,
                                timestamp: Date.now(),
                                final: true,
                                isHealing: true,
                                isPersistent: true // Add flag to ensure client preserves this value
                            });
                            
                            // Also send a healing notification directly to the player
                            socket.emit('skillDamage', {
                                sourceId: socket.id,
                                targetId: socket.id, // Self-target for healing part
                                damage: -healingAmount, // Negative indicates healing
                                skillName: 'life_drain',
                                isHealing: true,
                                isDrain: true
                            });
                            
                            // Set damageDealt to the positive damage value (for notifications to target)
                            damageDealt = drainDamage;
                            
                            // Special case: emit drain effect to all clients
                            this.io.emit('damageEffect', {
                                sourceId: socket.id,
                                targetId: data.targetId,
                                damage: drainDamage,
                                skillName: data.skillName,
                                isHealing: false,
                                isDrain: true
                            });
                            
                            // Life drain was successful - now emit updates for all clients about target's health
                            this.io.emit('lifeUpdate', {
                                id: data.targetId,
                                life: targetPlayer.life,
                                maxLife: targetPlayer.maxLife || 100,
                                timestamp: Date.now(),
                                final: true,
                                isHealing: false
                            });
                            
                            // Send confirmation to the requesting client
                            socket.emit('skillResponse', {
                                skillName: 'life_drain',
                                success: true,
                                targetId: data.targetId,
                                damage: drainDamage,
                                healing: healingAmount,
                                timestamp: Date.now()
                            });
                            
                            // Log confirmation for debugging
                            console.log(`[LIFE DRAIN] Sent skill confirmation to ${socket.id} for life_drain against player ${data.targetId}`);
                            
                            // Also notify the target of the damage
                            this.io.to(data.targetId).emit('skillDamage', {
                                sourceId: socket.id,
                                targetId: data.targetId,
                                damage: drainDamage,
                                skillName: data.skillName,
                                isHealing: false,
                                isDrain: true
                            });
                            
                            console.log(`[LIFE DRAIN] Completed life drain processing for ${socket.id}`);
                            return; // End processing for this skill
                        } else {
                            // If targeting self, just apply healing
                            targetPlayer.life = Math.min(targetPlayer.maxLife, targetPlayer.life + healingAmount);
                            damageDealt = -healingAmount; // Negative value to indicate healing
                            console.log(`Player ${socket.id} healed self for ${healingAmount} using ${data.skillName}. Health: ${targetPlayer.life}/${targetPlayer.maxLife}`);
                        }
                    }
                } else {
                    // Regular damage calculation
                    damageDealt = this.calculateSkillDamage(data.skillName, attackingPlayer, targetPlayer);
                    targetPlayer.life = Math.max(0, targetPlayer.life - damageDealt);
                    
                    console.log(`Player ${socket.id} dealt ${damageDealt} damage to ${data.targetId} using ${data.skillName}. Target health: ${targetPlayer.life}/${targetPlayer.maxLife}`);
                }
                
                // Check if target died (only relevant for damage, not healing)
                if (!isHealingSkill && targetPlayer.life <= 0) {
                    targetPlayer.isDead = true;
                    console.log(`Player ${data.targetId} was killed by ${socket.id}`);
                    
                    // Emit death event to target
                    this.io.to(data.targetId).emit('playerDied', {
                        killerId: socket.id
                    });
                    
                    // Broadcast playerKilled event to all clients
                    this.io.emit('playerKilled', {
                        id: data.targetId,
                        killerId: socket.id
                    });
                    
                    // Handle player death on server
                    this.playerManager.handlePlayerDeath(data.targetId, socket.id);
                }
                
                // Notify target of damage or healing
                this.io.to(data.targetId).emit('skillDamage', {
                    sourceId: socket.id,
                    targetId: data.targetId,
                    damage: damageDealt,
                    skillName: data.skillName,
                    isHealing: isHealingSkill
                });
                
                // Store the last health update time for this player to prevent rapid oscillations
                if (!targetPlayer.lastHealthUpdateTime) {
                    targetPlayer.lastHealthUpdateTime = {};
                }
                targetPlayer.lastHealthUpdateTime[data.targetId] = Date.now();
                
                // Broadcast health update to ALL players immediately
                this.io.emit('lifeUpdate', {
                    id: data.targetId,
                    life: targetPlayer.life,
                    maxLife: targetPlayer.maxLife || 100,
                    timestamp: Date.now(), // Add timestamp for client-side validation
                    final: true, // Mark this as a final update that shouldn't be overridden
                    isHealing: isHealingSkill
                });
                
                // Broadcast damage effect to all players
                this.io.emit('damageEffect', {
                    sourceId: socket.id,
                    targetId: data.targetId,
                    damage: damageDealt,
                    skillName: data.skillName,
                    isHealing: isHealingSkill,
                    isCritical: false
                });

                // Get player data
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    console.log('No player found for socket id:', socket.id);
                    return;
                }

                // Check if player is invisible - attacking breaks invisibility
                this.breakInvisibilityIfActive(player, socket);

                // Make sure to send a response for the Life Drain skill specifically
                if (data.skillName === 'life_drain') {
                    socket.emit('skillResponse', {
                        skillName: 'life_drain',
                        success: true,
                        targetId: data.targetId
                    });
                    console.log(`[LIFE DRAIN DEBUG] Sent success response to client for life_drain skill`);
                }
            });
            
            // Handle player death notification
            socket.on('playerDeath', (data) => {
                console.log(`Player ${socket.id} reported their own death`);
                this.playerManager.handlePlayerDeath(socket.id);
            });
            
            // Handle player respawn request
            socket.on('respawn', () => {
                console.log(`Player ${socket.id} requested respawn`);
                
                // Get the player
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    console.warn(`Player ${socket.id} not found for respawn`);
                    return;
                }
                
                // Reset player stats
                player.life = 100;
                player.maxLife = 100;
                player.isDead = false;
                
                // Choose a random spawn point
                const spawnPoints = this.playerManager.getSpawnPoints();
                const randomSpawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
                
                if (randomSpawn) {
                    player.position = { ...randomSpawn };
                }
                
                // Notify all clients about the respawn
                this.io.emit('playerRespawned', {
                    id: socket.id,
                    position: player.position,
                    life: player.life,
                    maxLife: player.maxLife,
                    isDead: player.isDead,
                    visible: true
                });
                
                // Also send a life update to ensure health bars are updated
                this.io.emit('lifeUpdate', {
                    id: socket.id,
                    life: player.life,
                    maxLife: player.maxLife,
                    timestamp: Date.now(),
                    final: true
                });
                
                console.log(`Player ${socket.id} respawned at position:`, player.position);
            });

            // Handle karma updates from clients
            socket.on('karmaUpdate', (data) => {
                console.log(`Received karma update from player ${socket.id}:`, data);
                
                // Validate data
                if (!data || typeof data.karma !== 'number' || typeof data.maxKarma !== 'number') {
                    console.warn(`Invalid karma data received from player ${socket.id}`);
                    return;
                }
                
                // Get the player
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    console.warn(`Player ${socket.id} not found for karma update`);
                    return;
                }
                
                // Update player's karma values with server authority
                const previousKarma = player.karma;
                player.karma = Math.max(0, Math.min(player.maxKarma, data.karma));
                player.maxKarma = data.maxKarma;
                
                // Don't update path based on karma - only preserve existing path
                // Path is only changed through explicit choosePath event
                
                // Log karma changes without modifying path
                const pathStatus = player.path || 'neutral';
                console.log(`Updated karma for player ${socket.id}: ${previousKarma} -> ${player.karma} (${pathStatus} path)`);
                
                // Update player effects based on new karma value
                this.playerManager.updatePlayerEffects(player);
                
                // Broadcast the karma update to all clients
                this.io.emit('karmaUpdate', {
                    id: socket.id,
                    karma: player.karma,
                    maxKarma: player.maxKarma,
                    path: player.path, // Send the preserved path, not an auto-calculated one
                    timestamp: Date.now()
                });
            });

            // Handle player reset request (for reconnections)
            socket.on('requestPlayerReset', () => {
                console.log(`Player ${socket.id} requested a reset (reconnection)`);
                
                // Use the PlayerManager's resetPlayer method to properly reset the player
                const resetPlayer = this.playerManager.resetPlayer(socket.id);
                
                if (resetPlayer) {
                    console.log(`Player ${socket.id} has been reset due to reconnection`);
                    
                    // Confirm reset to the client
                    socket.emit('playerResetConfirmed');
                    
                    // Broadcast updated player state to all clients
                    this.broadcastPlayerList();
                } else {
                    console.error(`Failed to reset player ${socket.id} - player not found`);
                }
            });

            // Handle request for life update
            socket.on('requestLifeUpdate', (data) => {
                if (!data || !data.playerId) {
                    return;
                }
                
                const player = this.playerManager.getPlayer(data.playerId);
                if (!player) {
                    return;
                }
                
                // Broadcast the player's current health to all clients
                this.io.emit('lifeUpdate', {
                    id: data.playerId,
                    life: player.life,
                    maxLife: player.maxLife || 100
                });
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                const player = this.playerManager.removePlayer(socket.id);
                if (player) {
                    this.lastUpdateTime.delete(socket.id);
                    this.io.emit('playerLeft', socket.id);
                    console.log(`Player left: ${player.displayName} (Total Players: ${this.playerManager.getPlayerCount()})`);
                    
                    // Clear any intervals associated with this socket
                    if (this.sockets.has(socket.id)) {
                        const intervals = this.sockets.get(socket.id);
                        if (intervals.statsInterval) {
                            clearInterval(intervals.statsInterval);
                        }
                        this.sockets.delete(socket.id);
                    }
                }
            });
            
            // Handle request for player state update
            socket.on('requestStateUpdate', () => {
                console.log(`Player ${socket.id} requested state update`);
                
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    console.warn(`Player ${socket.id} not found for state update request`);
                    return;
                }
                
                // Send the complete player state including path and skills
                socket.emit('playerState', {
                    stats: {
                        life: player.life,
                        maxLife: player.maxLife || 100,
                        mana: player.mana || 100,
                        maxMana: player.maxMana || 100,
                        karma: player.karma || 50,
                        maxKarma: player.maxKarma || 100,
                        experience: player.experience || 0,
                        level: player.level || 1,
                        path: player.path || null
                    },
                    path: player.path || null,
                    skills: player.skills || []
                });
            });
            
            // Set up a stats interval for this socket and store it for cleanup
            const statsInterval = setInterval(() => {
                const player = this.playerManager.getPlayer(socket.id);
                if (player) {
                    this.io.emit('lifeUpdate', {
                        id: socket.id,
                        life: player.life,
                        maxLife: player.maxLife || 100
                    });
                }
            }, 1000); // Update every second
            
            // Store the interval for cleanup on disconnect
            this.sockets.set(socket.id, { statsInterval });

            // Handle monster attack
            socket.on('attack_monster', (data) => {
                if (!data || !data.monsterId) {
                    return this.logSecurityEvent(`Invalid attack_monster data from ${socket.id}`);
                }
                
                // Special debug for Life Drain
                if (data.skillId === 'life_drain' || data.skillName === 'life_drain') {
                    console.log(`[LIFE DRAIN-MONSTER DEBUG] Received life_drain monster attack from ${socket.id} to monster ${data.monsterId}`);
                }
                
                // Check if monster manager exists
                if (!this.gameManager || !this.gameManager.monsterManager) {
                    console.warn(`Monster manager not initialized for attack from ${socket.id}`);
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Combat system initializing, please try again'
                    });
                    return;
                }
                
                
                // Apply rate limiting
                if (!this.rateLimitSkillUsage(socket.id, 'monster')) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Using skills too rapidly, please slow down'
                    });
                    return;
                }
                
                const attackingPlayer = this.playerManager.getPlayer(socket.id);
                if (!attackingPlayer) {
                    return this.logSecurityEvent(`Player not found for attack_monster from ${socket.id}`);
                }
                
                // Break invisibility if player is currently invisible
                this.breakInvisibilityIfActive(attackingPlayer, socket);
                
                // Check if player is dead
                if (attackingPlayer.isDead) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Cannot attack while dead'
                    });
                    return;
                }
                
                // Initialize skill cooldowns if not existing
                if (!attackingPlayer.skillCooldowns) {
                    attackingPlayer.skillCooldowns = new Map();
                }
                
                // Get the skill being used
                const skillId = data.skillId || 'martial_arts';
                
                // Make sure we use the skill name from the data if available
                const skillName = data.skillName || skillId;
                
                // Check if player has enough mana
                let manaCost = 0; // Default mana cost (0)
                if (skillName === 'dark_ball') {
                    manaCost = 25;
                } else if (skillName === 'martial_arts') {
                    manaCost = 0; // No mana cost for martial arts
                } else if (skillName === 'life_drain') {
                    manaCost = 30; // Mana cost for life_drain
                }
                
                // Initialize mana if not set
                if (attackingPlayer.mana === undefined) {
                    attackingPlayer.mana = 100;
                }
                if (attackingPlayer.maxMana === undefined) {
                    attackingPlayer.maxMana = 100;
                }
                
                // Check if player has enough mana (only for skills with mana cost > 0)
                if (manaCost > 0 && attackingPlayer.mana < manaCost) {
                    console.log(`Player ${socket.id} tried to use ${skillName} on monster without enough mana (${attackingPlayer.mana}/${manaCost})`);
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Not enough mana to use this skill'
                    });
                    return;
                }
                
                // Check server-side cooldown
                const now = Date.now();
                const lastUsedTime = attackingPlayer.skillCooldowns.get(skillName) || 0;
                const skillCooldown = this.getSkillCooldown(skillName);
                
                if (lastUsedTime > 0 && now - lastUsedTime < skillCooldown) {
                    console.log(`Player ${socket.id} tried to use ${skillName} on monster before cooldown finished`);
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Skill is on cooldown'
                    });
                    return;
                }
                
                // Update skill cooldown
                attackingPlayer.skillCooldowns.set(skillName, now);
                
                // Get the monster
                const monster = this.gameManager.monsterManager.getMonsterById(data.monsterId);
                if (!monster) {
                    return this.logSecurityEvent(`Monster ${data.monsterId} not found for attack_monster from ${socket.id}`);
                }
                
                // Skip attack if monster is already dead
                if (monster.health <= 0) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Cannot attack a dead monster'
                    });
                    return;
                }
                
                // Check if monster is in temple area
                const isMonsterInTemple = this.isPositionInTemple(monster.position);
                const isPlayerInTemple = this.isPositionInTemple(attackingPlayer.position);
                
                // Prevent attacks on monsters in temple safe zone
                if (isMonsterInTemple) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Cannot attack monsters in temple safe zone'
                    });
                    return;
                }
                
                // Prevent attacks from outside temple to inside temple
                if (!isPlayerInTemple && isMonsterInTemple) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Temple safe zone blocks your attack'
                    });
                    return;
                }
                
                // Check if the monster is within range
                const playerPos = attackingPlayer.position;
                const monsterPos = monster.position;
                const distance = this.calculateDistance(playerPos, monsterPos, 'monster', monster);
                
                // Get skill range
                const attackRange = this.getSkillRange(skillName);
                
                // Use a dynamic tolerance based on distance:
                // - For closer monsters (within range): more lenient
                // - For farther monsters: more strict
                const baseTolerance = 1.5; // Increased for better tolerance with larger monsters
                const rangeTolerance = Math.max(baseTolerance, attackRange * 0.25); // Increased from 20% to 25% of skill range
                
                // Log the check for debugging purposes
                console.log(`Range check for ${socket.id}: distance=${distance.toFixed(2)}, range=${attackRange}, tolerance=${rangeTolerance.toFixed(2)}, monster type=${monster.type}, skill=${skillName}`);

                if (distance > attackRange + rangeTolerance) {
                    socket.emit('errorMessage', {
                        type: 'combat',
                        message: 'Target is out of range'
                    });
                    // Log detailed distance information for debugging
                    this.log(`Range error: Player ${socket.id} tried to attack monster ${monster.id} but is out of range (distance: ${distance.toFixed(2)}, range: ${attackRange}, tolerance: ${rangeTolerance.toFixed(2)}, skill: ${skillName})`);
                    return; // Important: return here to prevent attack processing
                }
                
                // Consume mana
                attackingPlayer.mana -= manaCost;
                
                // Calculate damage from the server side
                const damage = this.calculateMonsterDamage(skillName, attackingPlayer, monster);
                
                // Apply damage to monster
                const previousHealth = monster.health;
                monster.health = Math.max(0, monster.health - damage);
                
                // Add debug logging for life drain
                if (skillName === 'life_drain') {
                    console.log(`[LIFE DRAIN-MONSTER] HEALTH: Monster ${monster.id} damaged: ${previousHealth} -> ${monster.health} (damage: ${damage})`);
                }
                
                // Special handling for life_drain - heal the player
                if (skillName === 'life_drain') {
                    console.log(`[LIFE DRAIN-MONSTER] Starting life drain processing from ${socket.id} to monster ${monster.id}`);
                    
                    // Define healing amount (same as base damage)
                    const healingAmount = 15;
                    
                    // Apply healing to player
                    const previousLife = attackingPlayer.life;
                    attackingPlayer.life = Math.min(attackingPlayer.maxLife, attackingPlayer.life + healingAmount);
                    
                    // Log the healing
                    console.log(`[LIFE DRAIN-MONSTER] Player ${socket.id} healed for ${healingAmount} using life_drain on monster ${monster.id}. Health: ${previousLife} -> ${attackingPlayer.life}`);
                    
                    // Emit healing effect to player
                    socket.emit('skillDamage', {
                        sourceId: socket.id,
                        targetId: socket.id,
                        damage: -healingAmount, // Negative value indicates healing
                        skillName: 'life_drain',
                        isHealing: true,
                        isDrain: true
                    });
                    
                    // Broadcast life update to all players - ensure it's persistent
                    this.io.emit('lifeUpdate', {
                        id: socket.id,
                        life: attackingPlayer.life,
                        maxLife: attackingPlayer.maxLife || 100,
                        timestamp: Date.now(),
                        final: true,
                        isHealing: true,
                        isPersistent: true, // Add flag to ensure client preserves this value
                        skillName: 'life_drain' // Include skill name to help client colorize the effect
                    });
                    
                    // Also emit a special drain effect for clients that support it
                    this.io.emit('monsterDamageEffect', {
                        monsterId: monster.id,
                        playerId: socket.id,
                        damage: damage,
                        skillId: skillName,
                        isDrain: true // Flag this as a drain effect
                    });
                    
                    console.log(`[LIFE DRAIN-MONSTER] Completed life drain against monster ${monster.id}`);
                }
                
                // Log the attack
                this.log(`Player ${socket.id} used ${skillName} on monster ${monster.id} for ${damage} damage (health: ${monster.health}/${monster.maxHealth || 100})`);
                
                // Broadcast mana update for the player who used the skill
                this.io.emit('manaUpdate', {
                    id: socket.id,
                    mana: attackingPlayer.mana,
                    maxMana: attackingPlayer.maxMana || 100,
                    timestamp: Date.now()
                });
                
                // Check if monster is dead
                if (monster.health <= 0) {
                    // Handle monster death
                    this.gameManager.handleMonsterDeath(socket.id, monster.id);
                    
                    // Award XP and potentially items
                    this.rewardPlayerForMonsterKill(attackingPlayer, monster);
                } else {
                    // Broadcast monster health update to all clients
                    this.io.emit('monster_update', {
                        monsterId: monster.id,
                        health: monster.health,
                        maxHealth: monster.maxHealth || 100
                    });
                }
                
                // Broadcast damage effect to all nearby clients
                this.io.emit('monsterDamageEffect', {
                    monsterId: monster.id,
                    playerId: socket.id,
                    damage: damage,
                    skillId: skillName
                });

                // Send confirmation response for specific skill types
                if (skillName === 'life_drain') {
                    socket.emit('skillResponse', {
                        skillName: 'life_drain',
                        success: true,
                        targetId: data.monsterId,
                        isMonster: true,
                        damage: damage,
                        healing: 15 // Match the healing amount
                    });
                    console.log(`[LIFE DRAIN-MONSTER DEBUG] Sent skill response for life_drain to ${socket.id}`);
                }
            });
            
            // Handle player respawn request
            socket.on('requestRespawn', () => {
                console.log(`Player ${socket.id} requested respawn`);
                
                const player = this.playerManager.getPlayer(socket.id);
                if (!player) {
                    console.warn(`Player ${socket.id} not found for respawn request`);
                    return;
                }
                
                // Even if player is not marked as dead, force respawn
                if (!player.isDead) {
                    console.warn(`Player ${socket.id} requested respawn but is not marked as dead - forcing respawn anyway`);
                }
                
                // Respawn the player at the temple
                this.playerManager.respawnPlayer(socket.id);
                
                // Log temple position for debugging
                console.log(`Temple position for respawn: ${JSON.stringify(GameConstants.PLAYER.SPAWN_POSITION)}`);
                
                // Send respawn confirmation with temple coordinates
                const respawnData = {
                    position: { 
                        x: GameConstants.PLAYER.SPAWN_POSITION.x,
                        y: GameConstants.PLAYER.SPAWN_POSITION.y,
                        z: GameConstants.PLAYER.SPAWN_POSITION.z 
                    },
                    rotation: {
                        y: GameConstants.PLAYER.DEFAULT_ROTATION.y // Make sure player faces south (same as initial spawn)
                    },
                    life: player.life,
                    maxLife: player.maxLife || 100,
                    mana: player.mana, // Add mana to respawn data
                    maxMana: player.maxMana || 100,
                    deathCount: player.deathCount || 0
                };
                
                socket.emit('respawnConfirmed', respawnData);
                console.log(`Sent respawnConfirmed to player ${socket.id} with position:`, respawnData.position, `and rotation:`, respawnData.rotation);
                
                // Update player's rotation in server state
                player.rotation = { ...GameConstants.PLAYER.DEFAULT_ROTATION };
                
                // Broadcast updated player position to all clients EXCEPT the respawning player
                // This ensures other clients see the player in temple
                socket.broadcast.emit('playerMoved', {
                    id: socket.id,
                    position: { ...GameConstants.PLAYER.SPAWN_POSITION },
                    rotation: { ...GameConstants.PLAYER.DEFAULT_ROTATION },
                    timestamp: Date.now()
                });
                
                // Also notify all clients that this player has respawned
                this.io.emit('playerRespawned', {
                    id: socket.id,
                    position: { ...GameConstants.PLAYER.SPAWN_POSITION },
                    stats: {
                        life: player.life,
                        maxLife: player.maxLife
                    },
                    visible: true
                });
                
                console.log(`Broadcast player ${socket.id} respawn to all clients`);
            });

            // Handle client requesting state synchronization
            socket.on('request_sync', () => {
                // Send current state only to the requesting client
                this.synchronizeClientState(socket.id);
            });

            // Handle client-side monster state updates
            socket.on('client_monster_state', (data) => {
                if (!data || !data.monsterId || !data.clientState) {
                    console.warn('Received invalid client_monster_state data:', data);
                    return;
                }
                
                const { monsterId, clientState } = data;
                const monster = this.gameManager.monsterManager.getMonsterById(monsterId);
                
                // If monster doesn't exist or is already marked as dead, nothing to do
                if (!monster) {
                    console.log(`Client reported state for non-existent monster ${monsterId}`);
                    return;
                }
                
                // If client reports monster is dead with 0 health
                if (clientState.isAlive === false && clientState.health === 0) {
                    // Check if our server thinks it's alive
                    if (monster.isAlive === true) {
                        console.log(`Client reported monster ${monsterId} as dead but server thinks it's alive - syncing state`);
                        
                        // Trust the client in this case - mark as dead
                        monster.isAlive = false;
                        monster.health = 0;
                        
                        // Notify all clients about monster death
                        this.io.emit('monster_death', {
                            monsterId: monsterId,
                            killerId: null, // No known killer
                            position: monster.position
                        });
                    } else {
                        // Both agree monster is dead, log for monitoring
                        console.log(`Both client and server agree monster ${monsterId} is dead`);
                    }
                }
            });
        });

        // Start state synchronization
        this.startStateSynchronization();
    }
    
    /**
     * Initialize the network manager
     */
    initialize() {
        // Set up interval to broadcast all player stats periodically
        this.startStatsUpdateInterval();
    }
    
    /**
     * Start an interval to broadcast all player stats periodically
     * This ensures all clients have the most up-to-date information
     */
    startStatsUpdateInterval() {
        // Clear any existing interval
        if (this.statsUpdateInterval) {
            clearInterval(this.statsUpdateInterval);
        }
        
        // Set up interval to broadcast all player stats
        this.statsUpdateInterval = setInterval(() => {
            // Skip if no players
            if (!this.playerManager.players || this.playerManager.players.size === 0) {
                return;
            }
            
            // Create a batch update with all player stats
            const batchUpdate = {
                timestamp: Date.now(),
                players: [],
                source: 'periodic' // Add source identification for client filtering
            };
            
            // Add each player's stats to the batch update
            this.playerManager.players.forEach((player, playerId) => {
                // Skip if player doesn't have stats
                if (!player) {
                    return;
                }
                
                // Ensure player has valid health values
                const life = typeof player.life === 'number' ? player.life : 100;
                const maxLife = typeof player.maxLife === 'number' ? player.maxLife : 100;
                const isDead = Boolean(player.isDead);
                
                // Add player stats to batch update
                batchUpdate.players.push({
                    id: playerId,
                    life: life,
                    maxLife: maxLife,
                    isDead: isDead,
                    mana: typeof player.mana === 'number' ? player.mana : 100,
                    maxMana: typeof player.maxMana === 'number' ? player.maxMana : 100,
                    experience: player.experience || 0,
                    level: player.level || 1,
                    // Add a unique update ID to prevent race conditions
                    updateId: `${playerId}-${Date.now()}`
                });
            });
            
            // Skip if no players with stats
            if (batchUpdate.players.length === 0) {
                return;
            }
            
            // Broadcast the batch update to all clients
            this.io.emit('statsUpdate', batchUpdate);
        }, 500); // Update every 500ms for more responsive health updates
    }
    
    /**
     * Broadcast a full player list to all connected clients
     */
    broadcastPlayerList() {
        // Check if there are any connected clients
        if (this.io.engine.clientsCount > 0) {
            // Send a game state update to all clients with the current player list
            this.io.emit('gameStateUpdate', {
                players: this.playerManager.getAllPlayers(),
                serverTime: Date.now()
            });
        }
    }
    
    /**
     * Broadcast NPC updates to all connected clients
     */
    broadcastNPCUpdates() {
        this.io.emit('npcUpdates', this.gameManager.getAllNPCs());
    }
    
    /**
     * Validate player movement data
     */
    validateMovementData(data) {
        // Check if data exists and has position
        if (!data || !data.position) {
            return false;
        }
        
        // Check if position has x, y, z coordinates
        if (typeof data.position.x !== 'number' && typeof data.position.x !== 'string' ||
            typeof data.position.y !== 'number' && typeof data.position.y !== 'string' ||
            typeof data.position.z !== 'number' && typeof data.position.z !== 'string') {
            return false;
        }
        
        // Check for NaN or Infinity values
        if (isNaN(Number(data.position.x)) || isNaN(Number(data.position.y)) || isNaN(Number(data.position.z)) ||
            !isFinite(Number(data.position.x)) || !isFinite(Number(data.position.y)) || !isFinite(Number(data.position.z))) {
            return false;
        }
        
        return true;
    }

    /**
     * Rate limiting for player movement
     */
    rateLimitMovement(socketId) {
        const now = Date.now();
        const lastUpdate = this.lastUpdateTime.get(socketId) || 0;
        
        // Check if enough time has passed since the last update
        if (now - lastUpdate < 50) { // 50ms = 20 updates per second max
            this.logSecurityEvent(`Rate limit exceeded for player ${socketId}`, socketId);
            return false;
        }
        
        // Update the last update time
        this.lastUpdateTime.set(socketId, now);
        return true;
    }

    /**
     * Utility logging function with optional throttling
     */
    log(message, level = 'info', throttle = false, throttleKey = null, throttleTime = 30000) {
        // If throttling is requested, check if we should log based on time
        if (throttle && throttleKey) {
            const now = Date.now();
            
            // If we haven't logged this message recently, or it's the first time
            if (!this._lastLogs[throttleKey] || now - this._lastLogs[throttleKey] > throttleTime) {
                this._lastLogs[throttleKey] = now;
                console[level](`[NetworkManager] ${message}`);
            }
        } else {
            // Regular non-throttled logging
            console[level](`[NetworkManager] ${message}`);
        }
    }

    /**
     * Enhanced logging with throttling for security events
     */
    logSecurityEvent(message, throttleKey = null) {
        // Always log security events, but throttle identical messages
        const throttleTime = 60000; // 1 minute throttle for identical security events
        this.log(`SECURITY: ${message}`, 'warn', true, throttleKey || message, throttleTime);
    }

    /**
     * Validate session
     */
    validateSession(socketId) {
        // Check if socket is still connected
        if (!this.sockets.has(socketId)) {
            this.logSecurityEvent(`Invalid session: Socket ${socketId} not found`);
            return false;
        }
        return true;
    }

    /**
     * Calculate distance between two positions
     */
    calculateDistance(pos1, pos2, entityType = null, entityData = null) {
        if (!pos1 || !pos2) return Infinity;
        
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        
        // Calculate the basic distance
        const basicDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // If this is a monster with collision data, adjust the distance
        if (entityType === 'monster' && entityData) {
            // Subtract the monster's collision radius to account for its size
            const adjustedDistance = basicDistance - (entityData.collisionRadius || 0);
            // Return the adjusted distance, but never less than 0
            return Math.max(0, adjustedDistance);
        } else if (entityType === 'player') {
            // Add a small buffer for player targets to account for player collision radius
            // This helps prevent edge cases where client and server disagree on distance
            return Math.max(0, basicDistance - 0.75); // 0.75 units buffer for player targets
        }
        
        return basicDistance;
    }

    /**
     * Check if a position is in the temple area
     */
    isPositionInTemple(position) {
        // Temple dimensions with buffer zone to ensure the edges are protected
        const buffer = 1.5; // Buffer of 1.5 units around the temple
        const baseHalfWidth = 15 + buffer; // 30/2 for base platform + buffer
        const crossVerticalHalfWidth = 4 + buffer; // 8/2 for vertical part + buffer
        const crossHorizontalHalfWidth = 12 + buffer; // 24/2 for horizontal part + buffer
        const crossVerticalHalfLength = 12 + buffer; // 24/2 for vertical part + buffer
        const crossHorizontalHalfLength = 4 + buffer; // 8/2 for horizontal part + buffer
        
        // Check if position is within base platform bounds
        const isOnBase = Math.abs(position.x) <= baseHalfWidth && 
                        Math.abs(position.z) <= baseHalfWidth;
        
        // Check if position is within cross vertical part
        const isOnVertical = Math.abs(position.x) <= crossVerticalHalfWidth && 
                            Math.abs(position.z) <= crossVerticalHalfLength;
        
        // Check if position is within cross horizontal part
        const isOnHorizontal = Math.abs(position.x) <= crossHorizontalHalfWidth && 
                                Math.abs(position.z) <= crossHorizontalHalfLength;

        return isOnBase || isOnVertical || isOnHorizontal;
    }

    /**
     * Get the cooldown time for a specific skill in milliseconds
     */
    getSkillCooldown(skillName) {
        switch(skillName) {
            case 'martial_arts':
                return 1000; // 1 second cooldown
            case 'dark_ball':
                return 1500; // 1.5 second cooldown
            case 'flow_of_life':
                return 10000; // 10 second cooldown
            case 'life_drain':
                return 2000; // 2 second cooldown (reduced from 3s to make it more usable)
            case 'one_with_universe':
                return 60000; // 60 second cooldown
            case 'embrace_void':
                return 60000; // 60 second cooldown
            default:
                return 1000; // Default cooldown
        }
    }

    /**
     * Calculate skill damage based on skill type and player stats
     */
    calculateSkillDamage(skillName, attacker, target) {
        // Base damage for each skill
        let baseDamage = 0;
        switch(skillName) {
            case 'martial_arts':
                baseDamage = 25;
                break;
            case 'dark_ball':
                baseDamage = 20; // Reduced from 35 to be less than martial arts
                break;
            case 'life_drain':
                baseDamage = 15; // Same as healing amount
                break;
            case 'one_with_universe':
                baseDamage = 0; // No damage
                break;
            case 'flow_of_life':
                baseDamage = 0; // No damage
                break;
            case 'embrace_void':
                baseDamage = 0; // No damage
                break;
            default:
                baseDamage = 20;
        }
        
        // If base damage is 0, return early (no damage skills)
        if (baseDamage === 0) {
            return 0;
        }
        
        // Add randomness to damage (±20%)
        const varianceFactor = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2
        
        // Apply level-based damage bonus
        const attackerLevel = attacker.level || 1;
        const damageBonus = 1 + (attackerLevel - 1) * GameConstants.LEVEL_REWARDS.DAMAGE_BONUS_PER_LEVEL;
        
        // Apply attacker's path bonuses if applicable
        let pathBonus = 1.0;
        if (attacker.path === 'light' && skillName === 'martial_arts') {
            pathBonus = 1.2; // 20% bonus for light path using martial arts
        } else if (attacker.path === 'dark' && skillName === 'dark_ball') {
            pathBonus = 1.2; // 20% bonus for dark path using dark ball
        } else if (attacker.path === 'dark' && skillName === 'life_drain') {
            pathBonus = 1.3; // 30% bonus for dark path using life drain on monsters
        }
        
        // Apply damage calculation
        let finalDamage = Math.floor(baseDamage * varianceFactor * damageBonus * pathBonus);
        
        // Apply target's level-based damage reduction
        const targetLevel = target.level || 1;
        const maxDamageReduction = 0.3; // Cap at 30% damage reduction
        const damageReduction = Math.min(
            maxDamageReduction, 
            (targetLevel - 1) * GameConstants.LEVEL_REWARDS.DAMAGE_REDUCTION_PER_LEVEL
        );
        
        // Apply damage reduction to the final damage
        finalDamage = Math.floor(finalDamage * (1 - damageReduction));
        
        // Cap damage at remaining health to prevent overkill
        if (target.life < finalDamage) {
            finalDamage = target.life;
        }
        
        return finalDamage;
    }

    /**
     * Get the range for a specific skill
     */
    getSkillRange(skillId) {
        switch(skillId) {
            case 'martial_arts':
                return 4.5; // Increased from 3 to 4.5 units range
            case 'dark_ball':
                return 10.5; // Increased to match the updated 7 units on client (7 * 1.5 server scale)
            case 'flow_of_life':
                return 7.5; // 5 units on client
            case 'life_drain':
                return 6.0; // Fix for life drain - reduced from 9 to 6 units to match client range of 3-4
            case 'one_with_universe':
                return 0; // Self-cast only
            case 'embrace_void':
                return 0; // Self-cast only
            default:
                return 3; // Increased default range from 2 to 3
        }
    }

    /**
     * Calculate damage against a monster
     */
    calculateMonsterDamage(skillId, player, monster) {
        // Base damage for each skill
        let baseDamage = 0;
        switch(skillId) {
            case 'martial_arts':
                baseDamage = 25;
                break;
            case 'dark_ball':
                baseDamage = 20; // Reduced from 35 to be less than martial arts
                break;
            case 'life_drain':
                baseDamage = 25; // Increased from 15 to 25 for monster targets
                break;
            default:
                baseDamage = 20;
        }
        
        // Add randomness to damage (±20%)
        const varianceFactor = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2
        
        // Apply player's level-based damage bonus
        const playerLevel = player.level || 1;
        const damageBonus = 1 + (playerLevel - 1) * GameConstants.LEVEL_REWARDS.DAMAGE_BONUS_PER_LEVEL;
        
        // Apply player path bonuses if applicable
        let pathBonus = 1.0;
        if (player.path === 'light' && skillId === 'martial_arts') {
            pathBonus *= 1.2; // 20% bonus for light path using martial arts
        } else if (player.path === 'dark' && skillId === 'dark_ball') {
            pathBonus *= 1.2; // 20% bonus for dark path using dark ball
        } else if (player.path === 'dark' && skillId === 'life_drain') {
            pathBonus *= 1.3; // 30% bonus for dark path using life drain on monsters
        }
        
        // Calculate final damage
        let finalDamage = Math.floor(baseDamage * varianceFactor * damageBonus * pathBonus);
        
        // Cap damage at remaining health to prevent overkill
        if (monster.health < finalDamage) {
            finalDamage = monster.health;
        }
        
        return finalDamage;
    }

    /**
     * Award XP and potentially items when a player kills a monster
     */
    rewardPlayerForMonsterKill(player, monster) {
        // This method can be expanded later with more sophisticated reward logic
        // For now, just log the kill
        console.log(`Player ${player.id} killed monster ${monster.id}`);
    }

    /**
     * Rate limiting for skill usage
     * @param {string} socketId - The player's socket ID
     * @param {string} skillType - Type of skill (e.g., 'pvp', 'monster')
     * @returns {boolean} - Whether the action passes rate limiting
     */
    rateLimitSkillUsage(socketId, skillType = 'generic') {
        const now = Date.now();
        const key = `${socketId}:${skillType}`;
        
        // Initialize attempts tracker if not exists
        if (!this.skillAttempts.has(key)) {
            this.skillAttempts.set(key, {
                count: 0,
                firstAttempt: now,
                lastAttempt: 0
            });
        }
        
        const attempts = this.skillAttempts.get(key);
        
        // If it's been more than 5 seconds since first attempt, reset counter
        if (now - attempts.firstAttempt > 5000) {
            attempts.count = 0;
            attempts.firstAttempt = now;
        }
        
        // Check for spam - max 10 attempts in 5 second window
        if (attempts.count >= 10) {
            // This is likely a spam attack
            this.logSecurityEvent(`Rate limit exceeded for skill usage by player ${socketId}`, socketId);
            return false;
        }
        
        // Check if using skills too rapidly - minimum 150ms between skill uses
        if (now - attempts.lastAttempt < 150) {
            return false;
        }
        
        // Update attempts info
        attempts.count++;
        attempts.lastAttempt = now;
        this.skillAttempts.set(key, attempts);
        
        return true;
    }

    /**
     * Periodically synchronize game state with all clients
     */
    startStateSynchronization() {
        // Clear any existing interval
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        // Add a small delay before starting synchronization to ensure all managers are initialized
        setTimeout(() => {
            // Synchronize every 10 seconds
            this.syncInterval = setInterval(() => {
                this.synchronizeGameState();
            }, 10000);
            
            console.log('Started game state synchronization');
        }, 5000); // 5 second delay before starting sync
    }
    
    /**
     * Send authoritative game state to all clients
     */
    synchronizeGameState() {
        if (!this.playerManager || !this.gameManager) {
            console.warn('Cannot synchronize game state: managers not initialized');
            return;
        }
        
        // Collect all players data in a format clients can process
        const playersData = [];
        this.playerManager.players.forEach(player => {
            playersData.push({
                id: player.id,
                position: player.position,
                life: player.life,
                maxLife: player.maxLife,
                isDead: player.isDead,
                visible: player.visible !== false, // Include visibility state, default to visible if not specified
                timestamp: Date.now()
            });
        });
        
        // Collect all monsters data
        const monstersData = [];
        if (this.gameManager.monsterManager) {
            try {
                // Check if the getMonsters function exists
                if (typeof this.gameManager.monsterManager.getMonsters === 'function') {
                    const monsters = this.gameManager.monsterManager.getMonsters();
                    if (Array.isArray(monsters)) {
                        monsters.forEach(monster => {
                            if (monster && monster.id) {
                                monstersData.push({
                                    id: monster.id,
                                    position: monster.position || { x: 0, y: 0, z: 0 },
                                    health: monster.health || 0,
                                    maxHealth: monster.maxHealth || 100,
                                    isDead: monster.health <= 0,
                                    timestamp: Date.now()
                                });
                            }
                        });
                    }
                } else if (this.gameManager.monsterManager.monsters instanceof Map) {
                    // If getMonsters() doesn't exist but we have a monsters Map
                    this.gameManager.monsterManager.monsters.forEach(monster => {
                        if (monster && monster.id) {
                            monstersData.push({
                                id: monster.id,
                                position: monster.position || { x: 0, y: 0, z: 0 },
                                health: monster.health || 0,
                                maxHealth: monster.maxHealth || 100,
                                isDead: monster.health <= 0,
                                timestamp: Date.now()
                            });
                        }
                    });
                }
            } catch (error) {
                console.error('Error collecting monster data for synchronization:', error);
            }
        }
        
        // Send synchronization data to all clients
        this.io.emit('game_state_sync', {
            players: playersData,
            monsters: monstersData,
            timestamp: Date.now()
        });
    }
    
    /**
     * Send current game state to a specific client
     */
    synchronizeClientState(socketId) {
        if (!this.playerManager || !this.gameManager) {
            console.warn(`Cannot synchronize state for client ${socketId}: managers not initialized`);
            return;
        }
        
        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket) {
            console.warn(`Cannot find socket for client ${socketId}`);
            return;
        }
        
        // Send the same data as the global sync but only to this client
        this.synchronizeGameState();
        
        console.log(`Synchronized game state for client ${socketId}`);
    }

    /**
     * Break player invisibility if it's currently active
     * @param {Object} player - The player object
     * @param {Object} socket - The player's socket
     */
    breakInvisibilityIfActive(player, socket) {
        // Check if player is invisible and has an active invisibility timeout
        if (player && player.visible === false && player.invisibilityTimeoutId) {
            console.log(`Breaking invisibility for player ${player.id || socket.id} due to combat action`);
            
            // Clear the scheduled invisibility timeout
            clearTimeout(player.invisibilityTimeoutId);
            delete player.invisibilityTimeoutId;
            
            // Make player visible again
            player.visible = true;
            
            // Broadcast visibility change to all clients
            this.io.emit('player_visibility_change', {
                playerId: player.id || socket.id,
                visible: true
            });
            
            // Notify player that invisibility has ended due to attack
            socket.emit('notification', {
                message: 'Your attack has revealed you from the void!',
                type: 'warning'
            });
        }
    }
}

export default NetworkManager;
