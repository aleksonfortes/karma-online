import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GameServer } from './src/GameServer.js';

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

// Handle client-side routing
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../dist/index.html'));
});

// Initialize game server
const gameServer = new GameServer(server);

// Start server with port fallback logic
const startServer = (port) => {
    return new Promise((resolve, reject) => {
        // Try to start the server
        const serverInstance = server.listen(port);
        
        // Handle successful start
        serverInstance.once('listening', () => {
            console.log(`Server running on port ${port}`);
            console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Development URL: http://localhost:5173`);
            console.log(`Production URL: http://localhost:${port}`);
            resolve(serverInstance);
        });
        
        // Handle error (like port in use)
        serverInstance.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${port} is already in use, trying another port...`);
                serverInstance.close();
                reject(err);
            } else {
                console.error('Server error:', err);
                reject(err);
            }
        });
    });
};

// Try to start server with different ports if needed
const PORT = process.env.PORT || 3000;
const MAX_PORT = PORT + 10; // Try up to 10 ports

async function attemptServerStart() {
    let currentPort = PORT;
    
    while (currentPort <= MAX_PORT) {
        try {
            await startServer(currentPort);
            // Server started successfully
            return;
        } catch (err) {
            if (err.code === 'EADDRINUSE') {
                currentPort++;
            } else {
                // Some other error occurred
                console.error('Failed to start server:', err);
                process.exit(1);
            }
        }
    }
    
    // If we get here, all ports are in use
    console.error(`Could not find an available port between ${PORT} and ${MAX_PORT}`);
    process.exit(1);
}

// Start the server
attemptServerStart(); 