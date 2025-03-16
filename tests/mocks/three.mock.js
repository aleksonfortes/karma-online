// Mock for three.js
class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(vector) {
    this.x = vector.x;
    this.y = vector.y;
    this.z = vector.z;
    return this;
  }

  clone() {
    return new Vector3(this.x, this.y, this.z);
  }

  distanceTo(v) {
    return Math.sqrt(
      (this.x - v.x) * (this.x - v.x) +
      (this.y - v.y) * (this.y - v.y) +
      (this.z - v.z) * (this.z - v.z)
    );
  }
}

class Object3D {
  constructor() {
    this.position = new Vector3();
    this.rotation = { x: 0, y: 0, z: 0, set: jest.fn((x, y, z) => {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    })};
    this.userData = {};
    this.children = [];
    this.visible = true;
    this.parent = null;
  }

  add(child) {
    if (child.parent !== null) {
      child.parent.remove(child);
    }
    child.parent = this;
    this.children.push(child);
    return this;
  }

  remove(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      child.parent = null;
      this.children.splice(index, 1);
    }
    return this;
  }
}

class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
    this.type = 'Mesh';
  }
}

class Group extends Object3D {
  constructor() {
    super();
    this.type = 'Group';
  }
}

class Scene extends Object3D {
  constructor() {
    super();
    this.type = 'Scene';
    this.background = null;
  }
}

class BoxGeometry {
  constructor(width, height, depth) {
    this.type = 'BoxGeometry';
    this.parameters = { width, height, depth };
    this.dispose = jest.fn();
  }
}

class PlaneGeometry {
  constructor(width, height, widthSegments, heightSegments) {
    this.type = 'PlaneGeometry';
    this.parameters = { width, height, widthSegments, heightSegments };
    this.dispose = jest.fn();
  }
}

class CylinderGeometry {
  constructor(radiusTop, radiusBottom, height, radialSegments) {
    this.type = 'CylinderGeometry';
    this.parameters = { radiusTop, radiusBottom, height, radialSegments };
    this.dispose = jest.fn();
  }
}

class SphereGeometry {
  constructor(radius, widthSegments, heightSegments) {
    this.type = 'SphereGeometry';
    this.parameters = { radius, widthSegments, heightSegments };
    this.dispose = jest.fn();
  }
}

class MeshBasicMaterial {
  constructor(parameters = {}) {
    this.type = 'MeshBasicMaterial';
    this.color = parameters.color || 0xffffff;
    this.map = parameters.map || null;
    this.wireframe = parameters.wireframe || false;
    this.transparent = parameters.transparent || false;
    this.opacity = parameters.opacity !== undefined ? parameters.opacity : 1.0;
    this.dispose = jest.fn();
    this.clone = function() {
      return new MeshBasicMaterial({ 
        color: this.color,
        map: this.map,
        wireframe: this.wireframe
      });
    };
  }
}

class Loader {
  constructor() {
    this.crossOrigin = 'anonymous';
    this.path = '';
    this.resourcePath = '';
    this.manager = {
      itemStart: jest.fn(),
      itemEnd: jest.fn(),
      itemError: jest.fn()
    };
  }

  setCrossOrigin(value) {
    this.crossOrigin = value;
  }

  setPath(value) {
    this.path = value;
  }

  setResourcePath(value) {
    this.resourcePath = value;
  }
}

class Sprite extends Object3D {
  constructor(material) {
    super();
    this.type = 'Sprite';
    this.material = material;
  }
}

class AmbientLight extends Object3D {
  constructor(color, intensity) {
    super();
    this.type = 'AmbientLight';
    this.color = color;
    this.intensity = intensity;
  }
}

class DirectionalLight extends Object3D {
  constructor(color, intensity) {
    super();
    this.type = 'DirectionalLight';
    this.color = color;
    this.intensity = intensity;
    this.position = new Vector3();
    this.target = new Object3D();
  }
}

class HemisphereLight extends Object3D {
  constructor(skyColor, groundColor, intensity) {
    super();
    this.type = 'HemisphereLight';
    this.color = skyColor;
    this.groundColor = groundColor;
    this.intensity = intensity;
  }
}

class Fog {
  constructor(color, near, far) {
    this.color = color;
    this.near = near;
    this.far = far;
  }
}

export {
  Vector3,
  Object3D,
  Mesh,
  Group,
  Scene,
  BoxGeometry,
  PlaneGeometry,
  CylinderGeometry,
  SphereGeometry,
  MeshBasicMaterial,
  Loader,
  Sprite,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Fog
};

// Default export with all THREE components
export default {
  Vector3,
  Object3D,
  Mesh,
  Group,
  Scene,
  BoxGeometry,
  PlaneGeometry,
  CylinderGeometry,
  SphereGeometry,
  MeshBasicMaterial,
  Loader,
  Sprite,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Fog
};
