import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { findOrCreateServer } from './serverManager.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const http = createServer(app);
const io = new Server(http, {
    cors: {
        origin: process.env.NODE_ENV === 'development' ? "http://localhost:5173" : "*",
        methods: ["GET", "POST"]
    }
});

// Check if dist directory exists
const distPath = path.join(__dirname, '../dist');
if (!fs.existsSync(distPath)) {
    console.warn('Warning: dist directory not found. Please run "npm run build" or "npm run build:dev" first.');
}

// Serve static files from the dist directory
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    
    // Handle client-side routing
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
} else {
    app.get('*', (req, res) => {
        res.status(500).send(`
            <h1>Error: Build Required</h1>
            <p>The game files have not been built yet. Please run:</p>
            <pre>npm run build:dev</pre>
            <p>for development or</p>
            <pre>npm run build</pre>
            <p>for production, then restart the server.</p>
        `);
    });
}

const players = new Map();

io.on('connection', (socket) => {
    // Only create player for browser clients
    if (socket.handshake.headers['user-agent']?.includes('Mozilla')) {
        console.log('Browser client connected:', socket.id);
        
        // Initialize player
        players.set(socket.id, {
            id: socket.id,
            position: { x: 0, y: 0, z: 0 },
            rotation: { y: 0 }
        });

        // Send current players to new player
        socket.emit('currentPlayers', Array.from(players.values()));

        // Broadcast new player to others
        socket.broadcast.emit('newPlayer', players.get(socket.id));

        // Handle browser close/tab close
        socket.on('disconnect', () => {
            console.log('Browser client disconnected:', socket.id);
            players.delete(socket.id);
            io.emit('playerDisconnected', socket.id);
        });
    }

    // Handle player movement
    socket.on('playerMovement', (movementData) => {
        const player = players.get(socket.id);
        if (player) {
            player.position = movementData.position;
            player.rotation = movementData.rotation;
            socket.broadcast.emit('playerMoved', player);
        }
    });

    // Handle player actions
    socket.on('playerAction', (actionData) => {
        socket.broadcast.emit('playerAction', {
            id: socket.id,
            action: actionData
        });
    });
});

const startServer = async () => {
    const { port, isNew } = await findOrCreateServer();
    
    if (isNew) {
        http.listen(port, () => {
            console.log(`Server running on port ${port}`);
            console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
            if (process.env.NODE_ENV !== 'development') {
                console.log(`Game available at http://localhost:${port}`);
            }
            if (!fs.existsSync(distPath)) {
                console.warn('Warning: dist directory not found. Please run "npm run build" or "npm run build:dev" first.');
            }
        });
    } else {
        console.log(`Server already running on port ${port}`);
        process.exit(0);
    }
};

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
}); 