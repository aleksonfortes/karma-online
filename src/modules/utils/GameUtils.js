import * as THREE from 'three';

export class GameUtils {
    static calculateDistance(posA, posB) {
        const dx = posA.x - posB.x;
        const dz = posA.z - posB.z;
        return Math.sqrt(dx * dx + dz * dz);
    }
    
    static createSimpleText(text, fontSize = 24, color = '#ffffff', backgroundColor = 'rgba(0, 0, 0, 0.5)') {
        // Create a canvas for the text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        // Set canvas properties for the text
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = `bold ${fontSize}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = color;
        
        // Draw text
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        
        return texture;
    }
    
    static createSprite(texture, width = 2, height = 0.5) {
        // Create sprite material and sprite
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(width, height, 1);
        
        return sprite;
    }
    
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    
    static lerp(a, b, t) {
        return a + (b - a) * t;
    }
    
    static generateRandomId(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    static createBasicGeometries() {
        return {
            box: new THREE.BoxGeometry(1, 1, 1),
            sphere: new THREE.SphereGeometry(0.5, 16, 16),
            cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
            plane: new THREE.PlaneGeometry(1, 1)
        };
    }
    
    static createBasicMaterials() {
        return {
            red: new THREE.MeshPhongMaterial({ color: 0xff0000 }),
            green: new THREE.MeshPhongMaterial({ color: 0x00ff00 }),
            blue: new THREE.MeshPhongMaterial({ color: 0x0000ff }),
            white: new THREE.MeshPhongMaterial({ color: 0xffffff }),
            black: new THREE.MeshPhongMaterial({ color: 0x000000 })
        };
    }
    
    static animate(onFrame, duration) {
        const startTime = Date.now();
        const endTime = startTime + duration;
        
        const update = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            
            onFrame(progress);
            
            if (now < endTime) {
                requestAnimationFrame(update);
            }
        };
        
        update();
    }
    
    static fadeIn(element, duration = 500) {
        element.style.opacity = '0';
        
        this.animate((progress) => {
            element.style.opacity = progress.toString();
        }, duration);
    }
    
    static fadeOut(element, duration = 500, removeAfter = true) {
        element.style.opacity = '1';
        
        this.animate((progress) => {
            element.style.opacity = (1 - progress).toString();
            
            if (progress === 1 && removeAfter) {
                element.remove();
            }
        }, duration);
    }
} 