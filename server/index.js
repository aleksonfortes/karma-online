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
    // Only create players for browser clients
    if (socket.handshake.headers['user-agent']?.includes('Mozilla')) {
        // Initialize player data
        const player = {
            id: socket.id,
            position: {
                x: Math.random() * 80 - 40,  // Random position between -40 and 40 (inside grass arena)
                y: 0,
                z: Math.random() * 80 - 40   // Random position between -40 and 40 (inside grass arena)
            },
            rotation: {
                y: 0
            },
            karma: 50,
            maxKarma: 100,
            life: 100,
            maxLife: 100,
            mana: 100,
            maxMana: 100,
            color: `hsl(${Math.random() * 360}, 70%, 50%)`,
            displayName: `Player ${socket.id.slice(0, 4)}`
        };

        // Add player to the game state
        players.set(socket.id, player);
        console.log(`Player joined: ${player.displayName} (Total Players: ${players.size})`);

        // Send current game state to the new player
        const currentPlayers = Array.from(players.values());
        socket.emit('currentPlayers', currentPlayers);

        // Notify other players about the new player
        socket.broadcast.emit('newPlayer', player);
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
            players.delete(socket.id);
            lastUpdateTime.delete(socket.id);
            io.emit('playerLeft', socket.id);
            console.log(`Player left: ${player.displayName} (Total Players: ${players.size})`);
        }
    });

    // Handle karma updates
    socket.on('karmaUpdate', (data) => {
        const player = players.get(socket.id);
        if (player) {
            console.log(`\nReceived karma update from ${socket.id}:`, data);
            
            // Update player's stats in server state
            player.karma = data.karma;
            player.maxKarma = data.maxKarma;
            player.life = data.life;
            player.maxLife = data.maxLife;
            player.mana = data.mana;
            player.maxMana = data.maxMana;
            
            // Broadcast to ALL clients including sender for consistency
            io.emit('karmaUpdate', {
                id: socket.id,
                karma: data.karma,
                maxKarma: data.maxKarma,
                life: data.life,
                maxLife: data.maxLife,
                mana: data.mana,
                maxMana: data.maxMana
            });
            
            console.log(`Broadcasted karma update to all clients for player ${socket.id}`);
            console.log(`Updated player stats in server state:`, player);
        } else {
            console.warn(`No player found for karma update from socket ${socket.id}`);
        }
    });
});

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