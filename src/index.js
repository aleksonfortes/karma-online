import * as THREE from 'three';
import { io } from 'socket.io-client';

// Determine the server URL based on the environment
const SERVER_URL = window.location.hostname === 'localhost' && window.location.port === '5173'
    ? 'http://localhost:3000'  // Development
    : window.location.origin;  // Production

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.players = new Map();
        this.localPlayer = null;
        this.socket = null;
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false
        };
        
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

        // Setup camera
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);

        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Add directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
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
            side: THREE.DoubleSide
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    createEnvironment() {
        // Add some basic environment elements
        const boxGeometry = new THREE.BoxGeometry(2, 2, 2);
        const boxMaterial = new THREE.MeshPhongMaterial({ color: 0x808080 });
        
        // Add some random boxes as obstacles
        for (let i = 0; i < 10; i++) {
            const box = new THREE.Mesh(boxGeometry, boxMaterial);
            box.position.set(
                Math.random() * 40 - 20,
                0,
                Math.random() * 40 - 20
            );
            box.castShadow = true;
            box.receiveShadow = true;
            this.scene.add(box);
        }
    }

    createPlayer(id, position = { x: 0, y: 0, z: 0 }) {
        const playerGroup = new THREE.Group();
        
        // Create character body
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 32);
        const bodyMaterial = new THREE.MeshPhongMaterial({ 
            color: id === this.socket?.id ? 0x00ff00 : 0xff0000 
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        body.receiveShadow = true;
        playerGroup.add(body);

        // Create character head
        const headGeometry = new THREE.SphereGeometry(0.3, 32, 32);
        const headMaterial = new THREE.MeshPhongMaterial({ 
            color: id === this.socket?.id ? 0x00ff00 : 0xff0000 
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.5;
        head.castShadow = true;
        head.receiveShadow = true;
        playerGroup.add(head);

        playerGroup.position.set(position.x, position.y, position.z);
        return playerGroup;
    }

    setupMultiplayer() {
        this.socket = io(SERVER_URL);

        this.socket.on('connect', () => {
            console.log('Connected to server');
            // Create our own player when we connect
            this.localPlayer = this.createPlayer(this.socket.id, { x: 0, y: 0, z: 0 });
            this.scene.add(this.localPlayer);
        });

        this.socket.on('connect_error', (error) => {
            console.error('Failed to connect to server:', error);
        });

        this.socket.on('currentPlayers', (players) => {
            // Add other players only
            players.forEach((player) => {
                if (player.id !== this.socket.id) {
                    const playerMesh = this.createPlayer(player.id, player.position);
                    this.players.set(player.id, playerMesh);
                    this.scene.add(playerMesh);
                }
            });
        });

        this.socket.on('newPlayer', (player) => {
            if (player.id !== this.socket.id) {
                const playerMesh = this.createPlayer(player.id, player.position);
                this.players.set(player.id, playerMesh);
                this.scene.add(playerMesh);
            }
        });

        this.socket.on('playerMoved', (player) => {
            this.updatePlayerPosition(player);
        });

        this.socket.on('playerDisconnected', (playerId) => {
            this.removePlayer(playerId);
        });
    }

    updatePlayerPosition(player) {
        const playerMesh = this.players.get(player.id);
        if (playerMesh) {
            playerMesh.position.set(player.position.x, player.position.y, player.position.z);
            playerMesh.rotation.y = player.rotation.y;
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

        if (this.controls.forward) this.localPlayer.translateZ(speed);
        if (this.controls.backward) this.localPlayer.translateZ(-speed);
        if (this.controls.left) this.localPlayer.rotation.y += rotationSpeed;
        if (this.controls.right) this.localPlayer.rotation.y -= rotationSpeed;
        if (this.controls.jump) {
            // Simple jump animation
            this.localPlayer.position.y = Math.sin(Date.now() * 0.01) * 2 + 1;
        } else {
            this.localPlayer.position.y = 0;
        }

        // Emit position to server
        this.socket.emit('playerMovement', {
            position: this.localPlayer.position,
            rotation: this.localPlayer.rotation
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.updatePlayer();
        this.renderer.render(this.scene, this.camera);
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
}); 