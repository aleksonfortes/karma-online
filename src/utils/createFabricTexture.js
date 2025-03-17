// This utility creates a fabric texture for character robes

function createFabricTexture(baseColor = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    
    const ctx = canvas.getContext('2d');
    
    // Base color
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Create fabric weave pattern
    const weaveSize = 4;
    const darkerColor = adjustColor(baseColor, -20);
    const lighterColor = adjustColor(baseColor, 10);
    
    // Draw horizontal and vertical lines for fabric texture
    ctx.strokeStyle = darkerColor;
    ctx.lineWidth = 1;
    
    // Horizontal lines
    for (let y = 0; y < canvas.height; y += weaveSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // Vertical lines
    for (let x = 0; x < canvas.width; x += weaveSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    // Add some subtle highlights
    ctx.fillStyle = lighterColor;
    ctx.globalAlpha = 0.1;
    
    for (let i = 0; i < 500; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = Math.random() * 4 + 1;
        
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Add some wrinkles/folds
    ctx.strokeStyle = darkerColor;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    
    for (let i = 0; i < 20; i++) {
        const x1 = Math.random() * canvas.width;
        const y1 = Math.random() * canvas.height;
        const length = Math.random() * 200 + 50;
        const angle = Math.random() * Math.PI * 2;
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        
        // Curved wrinkle line
        const cp1x = x1 + Math.cos(angle) * length * 0.3;
        const cp1y = y1 + Math.sin(angle) * length * 0.3;
        const cp2x = x1 + Math.cos(angle) * length * 0.7;
        const cp2y = y1 + Math.sin(angle) * length * 0.7;
        const x2 = x1 + Math.cos(angle) * length;
        const y2 = y1 + Math.sin(angle) * length;
        
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
        ctx.stroke();
    }
    
    return canvas.toDataURL('image/jpeg');
}

// Helper function to adjust color brightness
function adjustColor(color, amount) {
    // Convert hex to RGB
    let hex = color;
    if (color.startsWith('#')) {
        hex = color.slice(1);
    }
    
    // Parse color
    let r = parseInt(hex.substr(0, 2), 16);
    let g = parseInt(hex.substr(2, 2), 16);
    let b = parseInt(hex.substr(4, 2), 16);
    
    // Adjust brightness
    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));
    
    // Convert back to hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function downloadFabricTexture() {
    console.log('Generating and downloading fabric texture...');
    
    // Create white fabric texture for player robes
    const whiteTexture = createFabricTexture('#ffffff');
    
    // Create blue fabric texture for light NPC
    const blueTexture = createFabricTexture('#6666ff');
    
    // Create red fabric texture for dark NPC
    const redTexture = createFabricTexture('#660000');
    
    // Download textures
    downloadTexture(whiteTexture, 'fabric.jpg');
    downloadTexture(blueTexture, 'fabric_blue.jpg');
    downloadTexture(redTexture, 'fabric_red.jpg');
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

window.downloadFabricTexture = downloadFabricTexture;
console.log('Fabric texture generator loaded. Call window.downloadFabricTexture() to generate and download fabric textures.');

export { createFabricTexture }; 