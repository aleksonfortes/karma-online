# Karma Online

A real-time multiplayer game where players interact through karma-based actions in a 3D environment.

## Features

- **Real-time Multiplayer**: Seamless player interaction using Socket.IO
- **3D Environment**: Built with Three.js for immersive gameplay
- **Karma System**: Players can give or take karma from others
- **Status Effects**: Dynamic effects based on karma levels:
  - Enlightened (75+ karma)
  - Blessed (60+ karma)
  - Haunted (≤40 karma)
  - Cursed (≤25 karma)
- **Player Stats**: Track karma, life, and mana for each player
- **Anti-Cheat**: Built-in movement validation and action cooldowns

## Architecture

### Client (`src/`)
- Built with Vite and Three.js
- Handles 3D rendering and player input
- Manages local player state and remote player updates
- Real-time communication with server via Socket.IO

### Server (`server/`)
- Node.js server using Socket.IO
- Manages game state and player synchronization
- Validates player actions and movements
- Processes karma effects and updates

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

This will start both the client (port 5173) and server (port 3000) in development mode.

## Deployment

1. Build the client:
```bash
npm run build
```

2. Start production server:
```bash
npm run start
```

The game will be available at `http://localhost:3000`.

## Environment Variables

- `NODE_ENV`: Set to 'production' or 'development'
- `PORT`: Server port (default: 3000)
- `CLIENT_URL`: URL for production client (default: http://localhost:3000)

## Game Mechanics

### Player Actions
- Movement: WASD keys
- Give Karma: Left-click on player
- Take Karma: Right-click on player
- Cooldown: 1 second between karma actions

### Status Effects
Effects are automatically applied based on karma levels:
```
Karma Level | Effects
75+         | Enlightened
60+         | Blessed
≤40         | Haunted
≤25         | Cursed
```

## Development

### Client-Server Communication Events

```javascript
// Server -> Client
'currentPlayers'   // Initial game state
'newPlayer'        // Player joined
'playerLeft'       // Player disconnected
'playerMoved'      // Player position update
'karmaUpdate'      // Player karma/stats update

// Client -> Server
'playerMovement'   // Position/rotation update
'karmaAction'      // Give/take karma
'karmaUpdate'      // Stats update
```

## Security Features

- Movement validation to prevent speed hacks
- Rate limiting on player updates (50ms cooldown)
- Karma action cooldown (1s)
- Browser-only client validation
- CORS protection

## Deployment Guide

Karma Online uses Render for deployment with three separate services:

1. **Landing Page** (karmaonline.io)
   - Code location: `/landing-page`
   - When to deploy: After changes to landing page content

2. **Game Client** (play.karmaonline.io)
   - Code location: Main directory and `/src`
   - When to deploy: After changes to game client code

3. **Game Server** (api.karmaonline.io)
   - Code location: `/server`
   - When to deploy: After changes to server code

### Deployment Process

1. Make changes to the codebase
2. Push changes to the main branch on GitHub
3. In the Render dashboard, manually deploy only the affected services

This approach keeps all code in the main branch while giving you control over which services are deployed.