import { Loader } from 'three';

export class GLTFLoader extends Loader {
  constructor(manager) {
    super(manager);
    this.dracoLoader = null;
    this.ktx2Loader = null;
    this.meshoptDecoder = null;
  }

  load(url, onLoad, onProgress, onError) {
    // Create a minimal GLTF response
    const mockScene = {
      type: 'Group',
      children: [],
      position: { x: 0, y: 0, z: 0 },
      rotation: { y: 0 },
      add: jest.fn(),
      remove: jest.fn(),
      traverse: jest.fn(callback => {
        callback({
          isMesh: true,
          material: {
            color: { setHex: jest.fn() },
            transparent: false,
            opacity: 1.0
          }
        });
      }),
      userData: {}
    };
    
    const gltf = {
      scene: mockScene,
      scenes: [mockScene],
      animations: [],
      cameras: [],
      asset: { version: '2.0' }
    };

    // Execute the success callback
    if (onLoad) {
      setTimeout(() => onLoad(gltf), 0);
    }

    return this;
  }

  setDRACOLoader(dracoLoader) {
    this.dracoLoader = dracoLoader;
    return this;
  }

  setKTX2Loader(ktx2Loader) {
    this.ktx2Loader = ktx2Loader;
    return this;
  }

  setMeshoptDecoder(meshoptDecoder) {
    this.meshoptDecoder = meshoptDecoder;
    return this;
  }

  parse(data, path, onLoad, onError) {
    const gltf = this.load(path, null);
    onLoad(gltf);
    return this;
  }
}

export default { GLTFLoader };
