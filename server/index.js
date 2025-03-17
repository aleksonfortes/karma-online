import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import GameServer from './src/GameServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);

// Check if dist directory exists and serve static files
app.use(express.static(join(__dirname, '../dist')));

// Add a health check endpoint for server discovery
app.get('/api/status', (req, res) => {
    res.status(200).json({ status: 'online' });
});

// Add a configuration endpoint to provide server URL and other settings to the client
app.get('/api/config', (req, res) => {
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    res.status(200).json({
        serverUrl: baseUrl,
        environment: process.env.NODE_ENV || 'development',
        apiVersion: '1.0.0'
    });
});

// Handle client-side routing
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../dist/index.html'));
});

// Initialize game server
const gameServer = new GameServer(server);

// Start server with simple approach matching the original
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Development URL: http://localhost:5173`);
    console.log(`Production URL: http://localhost:${PORT}`);
}); 