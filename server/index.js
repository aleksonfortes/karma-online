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
        origin: ["http://localhost:5173", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
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
const lastUpdateTime = new Map();

io.on('connection', (socket) => {
    console.log('\n=== New Connection ===');
    console.log('Socket ID:', socket.id);
    console.log('User Agent:', socket.handshake.headers['user-agent']);
    console.log('Transport:', socket.conn.transport.name);

    // Only create players for browser clients
    if (socket.handshake.headers['user-agent']?.includes('Mozilla')) {
        console.log('Browser client connected:', socket.id);
        
        // Initialize player data
        const player = {
            id: socket.id,
            position: {
                x: Math.random() * 20 - 10,  // Random position between -10 and 10
                y: 0,
                z: Math.random() * 20 - 10
            },
            rotation: {
                y: 0
            },
            color: `hsl(${Math.random() * 360}, 70%, 50%)`,
            displayName: `Player ${socket.id.slice(0, 4)}`
        };

        // Add player to the game state
        players.set(socket.id, player);
        console.log('Player joined:', player.displayName);
        console.log('Player position:', player.position);

        // Send current game state to the new player
        const currentPlayers = Array.from(players.values());
        console.log('Sending current players to new player:', currentPlayers);
        socket.emit('currentPlayers', currentPlayers);

        // Notify other players about the new player
        console.log('Broadcasting new player to others:', player);
        socket.broadcast.emit('newPlayer', player);

        // Log current players for debugging
        console.log('Current players on server:', currentPlayers);
        console.log('Total players:', players.size);

        // Log all connected sockets
        const connectedSockets = Array.from(io.sockets.sockets.values()).map(s => s.id);
        console.log('All connected socket IDs:', connectedSockets);
    }

    // Handle player movement with rate limiting
    socket.on('playerMovement', (data) => {
        const player = players.get(socket.id);
        if (player) {
            const now = Date.now();
            const lastUpdate = lastUpdateTime.get(socket.id) || 0;
            
            // Only update if at least 50ms has passed since last update
            if (now - lastUpdate >= 50) {
                player.position = data.position;
                player.rotation = data.rotation;
                lastUpdateTime.set(socket.id, now);
                
                // Only log significant position changes
                const positionChanged = Math.abs(player.position.x - data.position.x) > 0.1 ||
                                      Math.abs(player.position.z - data.position.z) > 0.1;
                
                if (positionChanged) {
                    console.log(`Player ${player.displayName} moved to:`, data.position);
                }
                
                socket.broadcast.emit('playerMoved', {
                    id: socket.id,
                    position: data.position,
                    rotation: data.rotation
                });
            }
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        if (player) {
            console.log('Player disconnected:', player.displayName);
            players.delete(socket.id);
            lastUpdateTime.delete(socket.id);
            io.emit('playerLeft', socket.id);
            console.log('Remaining players:', Array.from(players.values()));
            console.log('Total players:', players.size);
            
            // Log remaining connected sockets
            const remainingSockets = Array.from(io.sockets.sockets.values()).map(s => s.id);
            console.log('Remaining connected socket IDs:', remainingSockets);
        }
    });
});

// Add a periodic check of connected players
setInterval(() => {
    console.log('\n=== Periodic Player Check ===');
    console.log('Total connected sockets:', io.sockets.sockets.size);
    console.log('Total players in game:', players.size);
    console.log('Current players:', Array.from(players.values()));
}, 5000);

const startServer = async () => {
    const { port, isNew } = await findOrCreateServer();
    
    if (isNew) {
        http.listen(port, () => {
            console.log(`Server running on port ${port}`);
            console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Development URL: http://localhost:5173`);
            console.log(`Production URL: http://localhost:${port}`);
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