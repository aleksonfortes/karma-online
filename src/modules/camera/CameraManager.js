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

    /**
     * Immediately resets the camera position to follow the player
     * Used when player teleports or respawns
     */
    resetCamera() {
        if (!this.game.localPlayer) {
            console.error('Reset camera failed: local player not found');
            return;
        }
        
        console.log('===== CAMERA RESET =====');
        
        // Get current player position
        const playerPosition = this.game.localPlayer.position.clone();
        console.log(`Player position: ${JSON.stringify({
            x: playerPosition.x.toFixed(2),
            y: playerPosition.y.toFixed(2),
            z: playerPosition.z.toFixed(2)
        })}`);
        
        // Get current camera position before reset
        const oldCameraPos = {
            x: this.camera.position.x.toFixed(2),
            y: this.camera.position.y.toFixed(2),
            z: this.camera.position.z.toFixed(2)
        };
        console.log(`Camera position before reset: ${JSON.stringify(oldCameraPos)}`);
        
        // Move the camera directly behind the player
        // Use the player's current rotation to position the camera properly
        const playerRotation = this.game.localPlayer.rotation.y;
        const distance = this.currentZoom;
        
        // Calculate camera position behind player based on player's rotation
        this.camera.position.x = playerPosition.x - Math.sin(playerRotation) * distance;
        this.camera.position.z = playerPosition.z - Math.cos(playerRotation) * distance;
        this.camera.position.y = playerPosition.y + this.cameraOffset.y;
        
        // Look at player - focus on player head for better visibility
        const lookAtPosition = playerPosition.clone();
        lookAtPosition.y += 1.5; // Look at player head level
        this.camera.lookAt(lookAtPosition);
        
        // Log new camera position
        const newCameraPos = {
            x: this.camera.position.x.toFixed(2),
            y: this.camera.position.y.toFixed(2),
            z: this.camera.position.z.toFixed(2)
        };
        console.log(`Camera position after reset: ${JSON.stringify(newCameraPos)}`);
        
        // Force camera update
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();
        
        console.log('===== CAMERA RESET COMPLETE =====');
    }
}
