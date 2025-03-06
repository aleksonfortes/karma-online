import * as THREE from 'three';
import { io } from 'socket.io-client';

// Determine the server URL based on the environment
const SERVER_URL = window.location.hostname === 'localhost' && window.location.port === '5173'
    ? 'http://localhost:3000'  // Development
    : window.location.origin;  // Production

console.log('Connecting to server URL:', SERVER_URL);

function clearGameData() {
    localStorage.removeItem('gameSessionId');
    // Clear any other game-related data
    sessionStorage.clear();
    // Force a hard reload to clear cache
    window.location.reload(true);
}

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.players = new Map();
        this.localPlayer = null;
        this.socket = null;
        this.isRunning = true;
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false
        };
        
        // Camera settings for LoL-style view
        this.cameraOffset = new THREE.Vector3(0, 15, 15); // Height and distance from player
        this.cameraAngle = Math.PI / 4; // 45-degree angle
        this.cameraSmoothness = 0.1; // Lower = smoother camera movement
        
        this.init();
        this.setupEventListeners();
        this.setupMultiplayer();
        this.animate();
    }

    init() {
        // Setup renderer
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // Setup camera for isometric view
        this.camera.position.set(0, 15, 15);
        this.camera.lookAt(0, 0, 0);
        this.camera.rotation.x = -Math.PI / 4; // Angle camera down 45 degrees

        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Add directional light from above and slightly behind
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(0, 10, 5);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // Create ground
        this.createGround();

        // Create environment
        this.createEnvironment();
    }

    createGround() {
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x3a7e3a,
            side: THREE.DoubleSide,
            shininess: 0
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Add grid helper for better depth perception
        const gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x444444);
        gridHelper.position.y = 0;
        this.scene.add(gridHelper);
    }

    createEnvironment() {
        // Add some basic environment elements
        const boxGeometry = new THREE.BoxGeometry(2, 2, 2);
        const boxMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x808080,
            shininess: 0 // Make boxes less shiny
        });
        
        // Use a fixed seed for consistent environment
        const seed = 12345; // Fixed seed for consistent environment
        const boxes = [
            { x: -15, z: -15 },
            { x: 15, z: -15 },
            { x: -15, z: 15 },
            { x: 15, z: 15 },
            { x: 0, z: -10 },
            { x: 0, z: 10 },
            { x: -10, z: 0 },
            { x: 10, z: 0 },
            { x: -5, z: -5 },
            { x: 5, z: 5 }
        ];
        
        // Add boxes in fixed positions
        boxes.forEach(({ x, z }) => {
            const box = new THREE.Mesh(boxGeometry, boxMaterial);
            box.position.set(x, 0, z);
            box.castShadow = true;
            box.receiveShadow = true;
            this.scene.add(box);
        });
    }

    createPlayer(id, position = { x: 0, y: 0, z: 0 }, rotation = { y: 0 }) {
        console.log('Creating player mesh for ID:', id);
        console.log('Position:', position);
        console.log('Rotation:', rotation);
        console.log('Is local player:', id === this.socket?.id);
        
        const playerGroup = new THREE.Group();
        
        // Create character body
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 32);
        const bodyMaterial = new THREE.MeshPhongMaterial({ 
            color: id === this.socket?.id ? 0x00ff00 : 0xff0000,
            shininess: 0
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        body.receiveShadow = true;
        playerGroup.add(body);

        // Create character head
        const headGeometry = new THREE.SphereGeometry(0.3, 32, 32);
        const headMaterial = new THREE.MeshPhongMaterial({ 
            color: id === this.socket?.id ? 0x00ff00 : 0xff0000,
            shininess: 0
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.5;
        head.castShadow = true;
        head.receiveShadow = true;
        playerGroup.add(head);

        // Set position and rotation
        playerGroup.position.set(position.x, position.y, position.z);
        playerGroup.rotation.y = rotation.y || 0;
        console.log('Player mesh created and positioned');
        return playerGroup;
    }

    setupMultiplayer() {
        console.log('Connecting to server...');
        
        // Create socket with initial configuration
        this.socket = io(SERVER_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            autoConnect: true,
            forceNew: true
        });

        // Set up connection event handlers
        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
        });

        this.socket.on('connect_error', (error) => {
            console.error('Failed to connect to server:', error);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.cleanup();
        });

        this.socket.on('currentPlayers', (players) => {
            console.log('\n=== Received Current Players ===');
            console.log('Players:', players);
            console.log('My socket ID:', this.socket.id);
            
            // Clear existing players
            console.log('Clearing existing players...');
            this.players.forEach((playerMesh) => {
                this.scene.remove(playerMesh);
            });
            this.players.clear();
            
            // Add all players including our own
            console.log('Creating players...');
            players.forEach((player) => {
                console.log('Creating player:', player);
                console.log('Is this player me?', player.id === this.socket.id);
                const playerMesh = this.createPlayer(
                    player.id,
                    player.position,
                    { y: player.rotation._y || player.rotation.y || 0 }
                );
                if (player.id === this.socket.id) {
                    console.log('Setting local player:', player.id);
                    this.localPlayer = playerMesh;
                } else {
                    console.log('Adding remote player:', player.id);
                    this.players.set(player.id, playerMesh);
                }
                this.scene.add(playerMesh);
            });
            console.log('Total players created:', players.length);
            console.log('Local player:', this.localPlayer ? 'exists' : 'missing');
            console.log('Remote players:', this.players.size);
        });

        this.socket.on('newPlayer', (player) => {
            console.log('\n=== New Player Joined ===');
            console.log('Player:', player);
            console.log('Is this player me?', player.id === this.socket.id);
            if (player.id !== this.socket.id) {
                console.log('Creating new player mesh');
                const playerMesh = this.createPlayer(
                    player.id,
                    player.position,
                    { y: player.rotation._y || player.rotation.y || 0 }
                );
                this.players.set(player.id, playerMesh);
                this.scene.add(playerMesh);
                console.log('New player added to scene');
            }
        });

        this.socket.on('playerMoved', (player) => {
            console.log('\n=== Player Moved ===');
            console.log('Player:', player);
            this.updatePlayerPosition(player);
        });

        this.socket.on('playerLeft', (playerId) => {
            console.log('\n=== Player Left ===');
            console.log('Player ID:', playerId);
            this.removePlayer(playerId);
        });
    }

    cleanup() {
        // Remove the game canvas
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.remove();
        }
        // Clear any game state
        this.players.clear();
        this.localPlayer = null;
        // Stop the animation loop
        this.isRunning = false;
    }

    updatePlayerPosition(player) {
        const playerMesh = this.players.get(player.id);
        if (playerMesh) {
            console.log(`Updating position for player ${player.id}:`, player.position);
            playerMesh.position.set(
                player.position.x,
                player.position.y,
                player.position.z
            );
            playerMesh.rotation.y = player.rotation._y || player.rotation.y || 0;
        } else {
            console.log(`No mesh found for player ${player.id}`);
            console.log('Current players:', Array.from(this.players.keys()));
        }
    }

    removePlayer(playerId) {
        const playerMesh = this.players.get(playerId);
        if (playerMesh) {
            this.scene.remove(playerMesh);
            this.players.delete(playerId);
        }
    }

    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        window.addEventListener('keydown', (event) => {
            switch(event.key.toLowerCase()) {
                case 'w': this.controls.forward = true; break;
                case 's': this.controls.backward = true; break;
                case 'a': this.controls.left = true; break;
                case 'd': this.controls.right = true; break;
                case ' ': this.controls.jump = true; break;
            }
        });

        window.addEventListener('keyup', (event) => {
            switch(event.key.toLowerCase()) {
                case 'w': this.controls.forward = false; break;
                case 's': this.controls.backward = false; break;
                case 'a': this.controls.left = false; break;
                case 'd': this.controls.right = false; break;
                case ' ': this.controls.jump = false; break;
            }
        });
    }

    updatePlayer() {
        if (!this.localPlayer) return;

        const speed = 0.1;
        const rotationSpeed = 0.02;
        let hasMoved = false;

        if (this.controls.forward) {
            this.localPlayer.translateZ(speed);
            hasMoved = true;
        }
        if (this.controls.backward) {
            this.localPlayer.translateZ(-speed);
            hasMoved = true;
        }
        if (this.controls.left) {
            this.localPlayer.rotation.y += rotationSpeed;
            hasMoved = true;
        }
        if (this.controls.right) {
            this.localPlayer.rotation.y -= rotationSpeed;
            hasMoved = true;
        }
        if (this.controls.jump) {
            // Simple jump animation
            this.localPlayer.position.y = Math.sin(Date.now() * 0.01) * 2 + 1;
            hasMoved = true;
        } else if (this.localPlayer.position.y !== 0) {
            this.localPlayer.position.y = 0;
            hasMoved = true;
        }

        // Only emit position to server if the player has moved
        if (hasMoved) {
            this.socket.emit('playerMovement', {
                position: this.localPlayer.position,
                rotation: this.localPlayer.rotation
            });
        }
    }

    updateCamera() {
        if (!this.localPlayer) return;

        // Get the player's position
        const playerPosition = this.localPlayer.position;
        
        // Calculate target camera position
        const targetX = playerPosition.x + this.cameraOffset.x;
        const targetY = playerPosition.y + this.cameraOffset.y;
        const targetZ = playerPosition.z + this.cameraOffset.z;
        
        // Smoothly move camera to target position
        this.camera.position.x += (targetX - this.camera.position.x) * this.cameraSmoothness;
        this.camera.position.y += (targetY - this.camera.position.y) * this.cameraSmoothness;
        this.camera.position.z += (targetZ - this.camera.position.z) * this.cameraSmoothness;
        
        // Look at player position
        this.camera.lookAt(
            playerPosition.x,
            playerPosition.y + 1, // Look slightly above the player
            playerPosition.z
        );
    }

    animate() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.animate());
        this.updatePlayer();
        this.updateCamera();
        this.renderer.render(this.scene, this.camera);
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
}); 