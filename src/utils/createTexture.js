// This utility script creates basic texture files when they don't exist
// It creates canvas-based textures and saves them to the textures folder

function createTextureCanvas(width, height, callback) {
    // Create a canvas element
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    // Get the 2D rendering context
    const ctx = canvas.getContext('2d');
    
    // Use callback to draw on the canvas
    callback(ctx, width, height);
    
    // Convert canvas to data URL
    return canvas.toDataURL('image/png');
}

function createGrassTexture() {
    return createTextureCanvas(512, 512, (ctx, width, height) => {
        // Base green color
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(0, 0, width, height);
        
        // Draw grass-like patterns
        ctx.strokeStyle = '#81C784';
        ctx.lineWidth = 2;
        
        // Create random grass blades
        for (let i = 0; i < 300; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const length = Math.random() * 20 + 10;
            const angle = Math.random() * Math.PI - Math.PI / 2; // mostly upward
            
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(
                x + Math.cos(angle) * length,
                y + Math.sin(angle) * length
            );
            ctx.stroke();
        }
        
        // Add some darker patches
        ctx.fillStyle = 'rgba(50, 130, 50, 0.3)';
        for (let i = 0; i < 20; i++) {
            const size = Math.random() * 80 + 40;
            ctx.beginPath();
            ctx.arc(
                Math.random() * width,
                Math.random() * height,
                size,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    });
}

function createWaterTexture() {
    return createTextureCanvas(512, 512, (ctx, width, height) => {
        // Create gradient from darker to lighter blue
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#0077be');  // Deep blue
        gradient.addColorStop(0.5, '#58b0d6'); // Medium blue
        gradient.addColorStop(1, '#90c8e0');  // Light blue
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        // Add wave patterns
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        
        // Horizontal waves
        for (let y = 0; y < height; y += 8) {
            ctx.beginPath();
            
            // Create wavy line
            ctx.moveTo(0, y);
            
            for (let x = 0; x < width; x += 20) {
                const waveHeight = Math.sin(x * 0.05) * 3;
                ctx.lineTo(x, y + waveHeight);
            }
            
            ctx.stroke();
        }
        
        // Add some highlights
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        for (let i = 0; i < 30; i++) {
            const size = Math.random() * 20 + 10;
            const x = Math.random() * width;
            const y = Math.random() * height;
            
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function createMarbleTexture() {
    return createTextureCanvas(512, 512, (ctx, width, height) => {
        // Base white color
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, width, height);
        
        // Create marble-like veins
        for (let i = 0; i < 15; i++) {
            // Create a path for marble vein
            ctx.beginPath();
            
            // Starting point
            const startX = Math.random() * width;
            const startY = Math.random() * height;
            ctx.moveTo(startX, startY);
            
            // Create a bezier curve for natural-looking veins
            const cp1x = startX + (Math.random() - 0.5) * width * 0.8;
            const cp1y = startY + (Math.random() - 0.5) * height * 0.8;
            const cp2x = startX + (Math.random() - 0.5) * width * 0.8;
            const cp2y = startY + (Math.random() - 0.5) * height * 0.8;
            const endX = startX + (Math.random() - 0.5) * width * 0.5;
            const endY = startY + (Math.random() - 0.5) * height * 0.5;
            
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
            
            // Set vein style
            ctx.lineWidth = Math.random() * 3 + 1;
            const alpha = Math.random() * 0.2 + 0.1;
            const grayValue = Math.floor(Math.random() * 100 + 155); // Light gray
            ctx.strokeStyle = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${alpha})`;
            ctx.stroke();
        }
        
        // Add subtle texture
        for (let i = 0; i < 5000; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = Math.random() * 1.5 + 0.5;
            const alpha = Math.random() * 0.05 + 0.02;
            
            const grayValue = Math.floor(Math.random() * 40 + 210); // Very light gray
            ctx.fillStyle = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${alpha})`;
            
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function createSandTexture() {
    return createTextureCanvas(512, 512, (ctx, width, height) => {
        // Base sand color
        ctx.fillStyle = '#d2b48c'; // Tan/sand color
        ctx.fillRect(0, 0, width, height);
        
        // Add grain texture
        for (let i = 0; i < 20000; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = Math.random() * 1.5 + 0.5;
            
            // Random sand grain color
            const r = Math.floor(210 + Math.random() * 30);
            const g = Math.floor(180 + Math.random() * 30);
            const b = Math.floor(140 + Math.random() * 30);
            const a = Math.random() * 0.4 + 0.1;
            
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
            
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Add some darker patches
        ctx.fillStyle = 'rgba(160, 120, 90, 0.2)';
        for (let i = 0; i < 15; i++) {
            const size = Math.random() * 80 + 40;
            ctx.beginPath();
            ctx.arc(
                Math.random() * width,
                Math.random() * height,
                size,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    });
}

function createSkyboxTexture(side) {
    return createTextureCanvas(512, 512, (ctx, width, height) => {
        // Different colors for different sides
        let gradient;
        
        if (side === 'py') { // top - blue sky
            gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#1E88E5');
            gradient.addColorStop(1, '#64B5F6');
        } 
        else if (side === 'ny') { // bottom - dark ground
            gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#4CAF50');
            gradient.addColorStop(1, '#2E7D32');
        }
        else if (['px', 'nx', 'pz', 'nz'].includes(side)) { // sides - sky gradient
            gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#2196F3');
            gradient.addColorStop(0.7, '#90CAF9');
            gradient.addColorStop(1, '#E3F2FD');
            
            // Add some clouds
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
            
            // Draw clouds
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            for (let i = 0; i < 10; i++) {
                const x = Math.random() * width;
                const y = Math.random() * height * 0.5; // clouds in top half
                const size = Math.random() * 60 + 40;
                
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
                
                // Add more cloud puffs
                for (let j = 0; j < 3; j++) {
                    const puffX = x + (Math.random() - 0.5) * size;
                    const puffY = y + (Math.random() - 0.5) * size * 0.5;
                    const puffSize = size * (0.6 + Math.random() * 0.4);
                    
                    ctx.beginPath();
                    ctx.arc(puffX, puffY, puffSize, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            
            return;
        }
        
        // Fill with gradient
        ctx.fillStyle = gradient || '#87CEEB';
        ctx.fillRect(0, 0, width, height);
    });
}

// This function will be called to download the textures
function downloadTextureFiles() {
    console.log('Generating and downloading texture files...');
    
    // Create and download grass texture
    const grassTexture = createGrassTexture();
    downloadTexture(grassTexture, 'grass.jpg');
    
    // Create and download water texture
    const waterTexture = createWaterTexture();
    downloadTexture(waterTexture, 'water.jpg');
    
    // Create and download marble texture
    const marbleTexture = createMarbleTexture();
    downloadTexture(marbleTexture, 'marble.jpg');
    
    // Create and download sand texture
    const sandTexture = createSandTexture();
    downloadTexture(sandTexture, 'sand.jpg');
    
    // Create and download skybox textures
    const sides = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
    sides.forEach(side => {
        const skyboxTexture = createSkyboxTexture(side);
        downloadTexture(skyboxTexture, `skybox/${side}.jpg`);
    });
}

function downloadTexture(dataURL, filename) {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `textures/${filename}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log(`Texture ${filename} download prepared`);
}

window.downloadTextureFiles = downloadTextureFiles;
console.log('Texture generator loaded. Call window.downloadTextureFiles() to generate and download all textures.');

export { createGrassTexture, createSkyboxTexture, createWaterTexture, createMarbleTexture, createSandTexture }; 