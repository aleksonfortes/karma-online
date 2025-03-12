import * as THREE from 'three';
import { io } from 'socket.io-client';
import { getServerUrl } from './config.js';

export class GameClient {
    constructor() {
        console.log('GameClient: Initializing...');
        this.socket = io(getServerUrl());
        this.players = new Map();
        this.localPlayer = null;
        
        // Three.js setup
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        
        this.setupRenderer();
        this.setupScene();
        this.setupSocketHandlers();
        this.setupControls();
        
        // Socket connection handlers
        this.socket.on('connect', () => {
            console.log('GameClient: Connected to server');
            this.socket.emit('joinGame', {
                name: `Player${Math.floor(Math.random() * 1000)}`
            });
            console.log('GameClient: Sent joinGame event');
        });

        this.socket.on('connect_error', (error) => {
            console.error('GameClient: Connection error:', error);
        });

        this.socket.on('disconnect', () => {
            console.log('GameClient: Disconnected from server');
        });
        
        // Start render loop
        this.animate();
        console.log('GameClient: Initialization complete');

        // Add skills system initialization in the constructor
        this.skills = {
            martial_arts: {
                key: 'Space',
                damage: 75,
                range: 3,
                cooldown: 2000,
                lastUsed: 0
            }
        };
    }

    setupRenderer() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    setupScene() {
        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 50, 50);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // Add ground
        const groundGeometry = new THREE.PlaneGeometry(200, 200);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x33aa33 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Set camera position
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);
    }

    setupSocketHandlers() {
        console.log('GameClient: Setting up socket handlers');
        
        // Handle initial players list
        this.socket.on('currentPlayers', (players) => {
            console.log('Received current players:', players);
            players.forEach(playerData => {
                if (playerData.id === this.socket.id) {
                    this.createLocalPlayer(playerData);
                } else {
                    this.addPlayer(playerData);
                }
            });
        });

        // Handle new player
        this.socket.on('newPlayer', (playerData) => {
            console.log('New player joined:', playerData);
            if (playerData.id !== this.socket.id) {
                this.addPlayer(playerData);
            }
        });

        // Handle player movement
        this.socket.on('playerMoved', (data) => {
            const playerMesh = this.players.get(data.id);
            if (playerMesh) {
                playerMesh.position.copy(data.position);
                playerMesh.rotation.copy(data.rotation);
            }
        });

        // Handle karma updates
        this.socket.on('karmaUpdate', (data) => {
            const playerMesh = data.id === this.socket.id ? 
                this.localPlayer : this.players.get(data.id);
            if (playerMesh) {
                this.updatePlayerStats(playerMesh, data);
            }
        });

        // Handle player disconnect
        this.socket.on('playerLeft', (playerId) => {
            console.log('Player left:', playerId);
            const playerMesh = this.players.get(playerId);
            if (playerMesh) {
                this.scene.remove(playerMesh);
                this.players.delete(playerId);
            }
        });
    }

    createLocalPlayer(playerData) {
        console.log('Creating local player:', playerData);
        const geometry = new THREE.BoxGeometry(1, 2, 1);
        const material = new THREE.MeshStandardMaterial({ 
            color: playerData.color || 0x0000ff 
        });
        const playerMesh = new THREE.Mesh(geometry, material);
        
        playerMesh.position.copy(playerData.position);
        playerMesh.rotation.copy(playerData.rotation);
        playerMesh.castShadow = true;
        
        // Add status bars
        this.addStatusBars(playerMesh, playerData);
        
        this.scene.add(playerMesh);
        this.localPlayer = playerMesh;
        playerMesh.userData = playerData;

        // Position camera relative to player
        this.camera.position.set(
            playerMesh.position.x,
            playerMesh.position.y + 5,
            playerMesh.position.z + 10
        );
        this.camera.lookAt(playerMesh.position);
    }

    addPlayer(playerData) {
        console.log('Adding remote player:', playerData);
        const geometry = new THREE.BoxGeometry(1, 2, 1);
        const material = new THREE.MeshStandardMaterial({ 
            color: playerData.color || 0x00ff00 
        });
        const playerMesh = new THREE.Mesh(geometry, material);
        
        playerMesh.position.copy(playerData.position);
        playerMesh.rotation.copy(playerData.rotation);
        playerMesh.castShadow = true;
        
        // Add status bars
        this.addStatusBars(playerMesh, playerData);
        
        this.scene.add(playerMesh);
        this.players.set(playerData.id, playerMesh);
        playerMesh.userData = playerData;
    }

    addStatusBars(playerMesh, playerData) {
        const barGeometry = new THREE.PlaneGeometry(1, 0.1);
        
        // Karma bar (green)
        const karmaBar = this.createStatusBar(0x00ff00, playerData.karma / playerData.maxKarma);
        karmaBar.position.y = 2.5;
        playerMesh.add(karmaBar);
        playerMesh.karmaBar = karmaBar;

        // Life bar (red)
        const lifeBar = this.createStatusBar(0xff0000, playerData.life / playerData.maxLife);
        lifeBar.position.y = 2.3;
        playerMesh.add(lifeBar);
        playerMesh.lifeBar = lifeBar;

        // Mana bar (blue)
        const manaBar = this.createStatusBar(0x0000ff, playerData.mana / playerData.maxMana);
        manaBar.position.y = 2.1;
        playerMesh.add(manaBar);
        playerMesh.manaBar = manaBar;
    }

    createStatusBar(color, initialScale = 1) {
        const geometry = new THREE.PlaneGeometry(1, 0.1);
        const material = new THREE.MeshBasicMaterial({ color });
        const bar = new THREE.Mesh(geometry, material);
        bar.scale.x = initialScale;
        return bar;
    }

    updatePlayerStats(playerMesh, stats, silent = false) {
        if (!playerMesh.userData.statusGroup) {
            const statusGroup = new THREE.Group();
            ['life', 'mana', 'karma'].forEach((type, index) => {
                const bar = this.createStatusBar(type);
                bar.position.y = 2.5 + (0.15 * index);
                playerMesh.add(bar);
                playerMesh[`${type}Bar`] = bar;
            });
            playerMesh.userData.statusGroup = statusGroup;
        }

        ['life', 'mana', 'karma'].forEach(type => {
            const bar = playerMesh[`${type}Bar`];
            if (bar) {
                bar.scale.x = stats[type] / stats[`max${type.charAt(0).toUpperCase() + type.slice(1)}`];
            }
        });

        playerMesh.userData.stats = { ...stats };
    }

    setupControls() {
        // Basic keyboard controls
        const keys = new Set();
        
        window.addEventListener('keydown', (e) => keys.add(e.key));
        window.addEventListener('keyup', (e) => keys.delete(e.key));

        // Movement update loop
        setInterval(() => {
            if (this.localPlayer) {
                const movement = { x: 0, z: 0 };
                if (keys.has('w')) movement.z -= 1;
                if (keys.has('s')) movement.z += 1;
                if (keys.has('a')) movement.x -= 1;
                if (keys.has('d')) movement.x += 1;

                if (movement.x !== 0 || movement.z !== 0) {
                    // Normalize movement vector
                    const length = Math.sqrt(movement.x * movement.x + movement.z * movement.z);
                    movement.x /= length;
                    movement.z /= length;

                    // Update player position
                    this.localPlayer.position.x += movement.x * 0.1;
                    this.localPlayer.position.z += movement.z * 0.1;

                    // Update camera position
                    this.camera.position.set(
                        this.localPlayer.position.x,
                        this.localPlayer.position.y + 5,
                        this.localPlayer.position.z + 10
                    );
                    this.camera.lookAt(this.localPlayer.position);

                    // Send movement to server
                    this.socket.emit('playerMovement', {
                        position: {
                            x: this.localPlayer.position.x,
                            y: this.localPlayer.position.y,
                            z: this.localPlayer.position.z
                        },
                        rotation: {
                            y: this.localPlayer.rotation.y
                        }
                    });
                }
            }
        }, 16); // 60fps

        // Add keyboard event listener for skill usage
        window.addEventListener('keydown', (e) => {
            if (e.key === ' ') this.useMartialArts();
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.renderer.render(this.scene, this.camera);
    }

    // Public methods for karma actions
    giveKarma(targetId) {
        this.socket.emit('karmaAction', {
            action: 'give',
            targetId
        });
    }

    takeKarma(targetId) {
        this.socket.emit('karmaAction', {
            action: 'take',
            targetId
        });
    }

    // Method to use martial arts skill
    useMartialArts() {
        const now = Date.now();
        const skill = this.skills.martial_arts;
        if (now - skill.lastUsed >= skill.cooldown) {
            skill.lastUsed = now;
            this.socket.emit('skillDamage', {
                skillName: 'martial_arts',
                damage: skill.damage,
                targetId: this.getTargetId()
            });
        }
    }

    // Method to check if player is on temple platform
    isOnTemplePlatform(position) {
        const baseHalfWidth = 15;
        const crossVerticalHalfWidth = 4;
        const crossHorizontalHalfWidth = 12;
        const crossVerticalHalfLength = 12;
        const crossHorizontalHalfLength = 4;

        const isOnBase = Math.abs(position.x) <= baseHalfWidth && Math.abs(position.z) <= baseHalfWidth;
        const isOnVertical = Math.abs(position.x) <= crossVerticalHalfWidth && Math.abs(position.z) <= crossVerticalHalfLength;
        const isOnHorizontal = Math.abs(position.x) <= crossHorizontalHalfWidth && Math.abs(position.z) <= crossHorizontalHalfLength;

        if (isOnBase || isOnVertical || isOnHorizontal) {
            position.y = 3;
        } else {
            position.y = 1.5;
        }

        return isOnBase || isOnVertical || isOnHorizontal;
    }
}

export default GameClient; 