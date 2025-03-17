import * as THREE from 'three';

export class CameraManager {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;

        // Initialize camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = game.renderer;

        // Camera settings
        this.cameraOffset = { x: 0, y: 8, z: 10 };
        this.cameraTarget = null;
        this.minZoom = 12;
        this.maxZoom = 20;
        this.zoomSpeed = 0.5;
        this.currentZoom = 15;

        // Setup zoom controls
        this.setupZoomControls();
    }

    setupZoomControls() {
        window.addEventListener('wheel', (event) => {
            if (event.ctrlKey) return; // Prevent conflict with browser zoom
            const delta = Math.sign(event.deltaY);
            this.adjustZoom(delta);
        });
    }

    adjustZoom(delta) {
        this.currentZoom = THREE.MathUtils.clamp(
            this.currentZoom + delta * this.zoomSpeed,
            this.minZoom,
            this.maxZoom
        );
    }

    setupCamera() {
        if (this.game.playerManager.player) {
            // Set camera to follow player from behind
            this.camera.position.set(0, 5, 10);

            // Create a camera target that follows the player smoothly
            this.cameraTarget = new THREE.Object3D();
            this.cameraTarget.position.copy(this.game.playerManager.player.position);
            this.cameraTarget.position.y += 2; // Look at player head level
            this.scene.add(this.cameraTarget);

            this.camera.lookAt(this.cameraTarget.position);
        }
    }

    update(delta) {
        if (!this.game.localPlayer) return;

        const playerPosition = this.game.localPlayer.position;
        const zoomFactor = this.currentZoom / 15;
        const offsetY = this.cameraOffset.y * zoomFactor;
        const offsetZ = this.cameraOffset.z * zoomFactor;
        
        // Smoothly move camera
        const smoothness = 0.05;
        this.camera.position.x += (playerPosition.x - this.camera.position.x) * smoothness;
        this.camera.position.y += (playerPosition.y + offsetY - this.camera.position.y) * smoothness;
        this.camera.position.z += (playerPosition.z + offsetZ - this.camera.position.z) * smoothness;
        
        // Look at player
        const lookAtPosition = playerPosition.clone();
        lookAtPosition.y += 1.5;
        this.camera.lookAt(lookAtPosition);
    }

    getCamera() {
        return this.camera;
    }

    updateAspectRatio() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }
}
