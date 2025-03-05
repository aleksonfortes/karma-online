# Karma Online - Multiplayer Web Game

A multiplayer web game where players can walk around and interact in a 3D environment.

## Features

- Real-time multiplayer gameplay
- 3D character movement
- Interactive environment
- Smooth graphics and animations
- Responsive design

## Controls

- W: Move forward
- S: Move backward
- A: Turn left
- D: Turn right
- Space: Jump

## Development Setup

1. Install dependencies:
```bash
npm install
```

2. Build the game for development:
```bash
npm run build:dev
```

3. Start the development server:
```bash
npm start
```

4. Start the game server:
```bash
npm run server
```

5. Open your browser and navigate to `http://localhost:5173`

## Building for Production

To create a production build:

```bash
npm run build
```

The built files will be in the `dist` directory.

## Deployment

### Local Deployment

1. First, build the game files:
```bash
npm run build
```

2. Then start the production server:
```bash
npm run server:prod
```

3. Access the game at `http://localhost:3000`

Note: Always run either `npm run build:dev` for development or `npm run build` for production before starting the server. The server will show an error if the `dist` directory is missing.

### Cloud Deployment

#### Heroku

1. Install the Heroku CLI
2. Create a new Heroku app:
```bash
heroku create karma-online
```

3. Add a `Procfile` in the root directory:
```
web: npm run build && npm run server:prod
```

4. Deploy to Heroku:
```bash
git push heroku main
```

#### DigitalOcean App Platform

1. Create a new app in DigitalOcean App Platform
2. Connect your GitHub repository
3. Configure the app:
   - Build Command: `npm run build`
   - Run Command: `npm run server:prod`
   - Environment Variables:
     - `NODE_ENV=production`

#### AWS Elastic Beanstalk

1. Install the AWS CLI and EB CLI
2. Initialize EB:
```bash
eb init karma-online
```

3. Create an environment:
```bash
eb create production
```

4. Deploy:
```bash
eb deploy
```

### Docker Deployment

1. Create a `Dockerfile`:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "server:prod"]
```

2. Build the Docker image:
```bash
docker build -t karma-online .
```

3. Run the container:
```bash
docker run -p 3000:3000 karma-online
```

### Environment Variables

For production deployment, you might want to set these environment variables:

- `PORT`: The port the server will listen on (default: 3000)
- `NODE_ENV`: Set to 'production' for production mode
- `CORS_ORIGIN`: Allowed origins for CORS (default: '*')

Example:
```bash
PORT=8080 NODE_ENV=production CORS_ORIGIN=https://yourdomain.com npm run server:prod
```

## Multiplayer Features

- Real-time player movement synchronization
- Player joining/leaving notifications
- Unique player colors (green for local player, red for other players)
- Interactive environment with obstacles

## Development

The game is built using:
- Three.js for 3D graphics
- Socket.IO for real-time multiplayer
- Express for the game server
- Vite for development and building
- Modern JavaScript (ES6+)

## Troubleshooting

### Port Conflicts

If you encounter port conflicts during development:

1. Run the cleanup script to kill all development servers:
```bash
npm run cleanup
```

2. Restart the development servers:
```bash
npm run server
npm start
```

### Production Issues

1. Make sure all environment variables are set correctly
2. Check server logs for errors
3. Ensure the server has enough resources (CPU, memory)
4. Verify firewall rules allow the necessary ports
5. If you see "Build Required" error:
   - Run `npm run build:dev` for development or `npm run build` for production
   - Restart the server with `npm run server` or `npm run server:prod`