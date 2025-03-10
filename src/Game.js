async initialize() {
    try {
        console.log('Initializing game...');
        
        // Create Three.js scene
        this.setupScene();
        
        // Load initial environment (temple)
        this.setupEnvironment();
        
        // Initialize managers in the correct order
        await this.initializeManagers();
        
        // Setup input handling
        this.setupInputHandlers();
        
        // Start the game loop
        this.startGameLoop();
        
        console.log('Game initialization complete');
    } catch (error) {
        console.error('Failed to initialize game:', error);
        this.handleInitializationError(error);
    }
}

async initializeManagers() {
    // Create all managers
    this.uiManager = new UIManager(this);
    this.networkManager = new NetworkManager(this);
    this.playerManager = new PlayerManager(this);
    this.skillsManager = new SkillsManager(this);
    this.karmaManager = new KarmaManager(this);
    this.npcManager = new NPCManager(this);
    
    // Initialize UI first so we can show loading indicators
    this.uiManager.init();
    this.uiManager.showLoadingScreen('Connecting to server...');
    
    try {
        // Initialize network first to determine if we're online
        await this.networkManager.init();
    } catch (error) {
        console.warn('Network initialization failed, continuing in offline mode:', error);
        // UI will be updated by the NetworkManager's offline mode handling
    }
    
    // Initialize player (with or without network)
    await this.playerManager.init();
    await this.playerManager.loadCharacterModel();
    
    // Initialize other systems that depend on player
    this.skillsManager.init();
    this.karmaManager.init();
    
    // NPCs should be initialized last
    this.npcManager.init();
    
    // Now that everything is loaded, hide loading screen and show game UI
    this.uiManager.hideLoadingScreen();
    this.uiManager.createUI();
}

// Handle network-related events from NetworkManager
onNetworkEvent(eventName, data) {
    console.log(`Network event: ${eventName}`, data);
    
    switch (eventName) {
        case 'offlineMode':
            // Show offline mode notification
            this.uiManager.showNotification('Playing in offline mode', 'yellow');
            break;
            
        case 'gameUpdate':
            // Handle game state update from server
            this.handleGameUpdate(data);
            break;
            
        default:
            console.log('Unhandled network event:', eventName);
    }
}

// Handle events from PlayerManager
onPlayerEvent(eventName) {
    console.log(`Player event: ${eventName}`);
    
    switch (eventName) {
        case 'characterLoaded':
            // Character is ready to be shown in scene
            console.log('Character loaded and ready');
            // Set camera to follow player
            this.setupCamera();
            break;
            
        default:
            console.log('Unhandled player event:', eventName);
    }
}

setupCamera() {
    if (this.playerManager.player) {
        // Set camera to follow player from behind
        this.camera.position.set(0, 5, 10); // Position behind and above player
        
        // Create a camera target that follows the player smoothly
        this.cameraTarget = new THREE.Object3D();
        this.cameraTarget.position.copy(this.playerManager.player.position);
        this.cameraTarget.position.y += 2; // Look at player head level
        this.scene.add(this.cameraTarget);
        
        this.camera.lookAt(this.cameraTarget.position);
    }
}

handleInitializationError(error) {
    console.error('Game initialization error:', error);
    
    // Show error message to the user
    this.uiManager.hideLoadingScreen();
    this.uiManager.showErrorScreen(`Failed to initialize game: ${error.message}`);
}

handleGameUpdate(data) {
    // Process game state updates from server
    console.log('Processing game update:', data);
    
    // Update karma if provided
    if (data.karma !== undefined && this.playerManager && this.karmaManager) {
        this.playerManager.playerStats.currentKarma = data.karma;
        this.karmaManager.updateKarmaEffects();
        this.uiManager.updateStatusBars();
    }
} 