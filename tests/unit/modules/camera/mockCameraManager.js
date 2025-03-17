/**
 * Mock implementation of CameraManager for testing
 */

export class MockCameraManager {
  constructor(game) {
    this.game = game;
    this.camera = {
      position: { 
        x: 0, 
        y: 0, 
        z: 0,
        set: jest.fn()
      },
      rotation: { x: 0, y: 0, z: 0 },
      lookAt: jest.fn(),
      updateProjectionMatrix: jest.fn(),
      aspect: 16/9
    };
    this.cameraTarget = {
      position: { 
        x: 0, 
        y: 0, 
        z: 0, 
        copy: jest.fn() 
      }
    };
    this.cameraOffset = { x: 0, y: 5, z: 10 };
    this.minZoom = 5;
    this.maxZoom = 20;
    this.currentZoom = 10;
    this.zoomSpeed = 0.5;
    this.initialized = false;
    
    // Bind methods
    this.handleMouseWheel = this.handleMouseWheel.bind(this);
  }
  
  init() {
    this.initialized = true;
    this.setupCamera();
    this.setupZoomControls();
  }
  
  setupCamera() {
    // Set initial camera position
    this.camera.position.set(
      this.cameraOffset.x,
      this.cameraOffset.y,
      this.cameraOffset.z
    );
    
    // Add camera target to scene
    this.game.scene.add(this.cameraTarget);
  }
  
  setupZoomControls() {
    // Add event listener for mouse wheel
    window.addEventListener('wheel', this.handleMouseWheel);
  }
  
  handleMouseWheel(event) {
    // Adjust zoom based on wheel delta
    const zoomDelta = Math.sign(event.deltaY);
    this.adjustZoom(zoomDelta);
  }
  
  adjustZoom(delta) {
    // Adjust current zoom level
    this.currentZoom += delta * this.zoomSpeed;
    
    // Clamp zoom level between min and max
    this.currentZoom = Math.min(Math.max(this.currentZoom, this.minZoom), this.maxZoom);
    
    // Update camera position based on new zoom level
    this.updateCameraPosition();
  }
  
  updateCameraPosition() {
    // Update camera position based on target and zoom level
    if (this.game.playerManager && this.game.playerManager.player) {
      this.cameraTarget.position.copy(this.game.playerManager.player.position);
    }
    
    // Set camera position based on offset and zoom
    this.camera.position.set(
      this.cameraTarget.position.x + this.cameraOffset.x,
      this.cameraTarget.position.y + this.cameraOffset.y,
      this.cameraTarget.position.z + this.cameraOffset.z + this.currentZoom
    );
    
    // Make camera look at target
    this.camera.lookAt(this.cameraTarget.position);
  }
  
  update(deltaTime) {
    if (!this.initialized) return;
    
    // Update camera position to follow player
    this.updateCameraPosition();
  }
  
  updateAspectRatio() {
    // Update camera aspect ratio based on window size
    if (this.game.renderer && this.game.renderer.domElement) {
      const width = this.game.renderer.domElement.clientWidth;
      const height = this.game.renderer.domElement.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }
  
  cleanup() {
    // Remove event listeners
    window.removeEventListener('wheel', this.handleMouseWheel);
    
    // Remove camera target from scene
    if (this.cameraTarget && this.game.scene) {
      this.game.scene.remove(this.cameraTarget);
    }
  }
} 