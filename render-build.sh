#!/bin/bash
set -e

# Display node and npm versions
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "Working directory: $(pwd)"

# Show environment variables (excluding secrets)
echo "Environment variables:"
printenv | grep -v "_KEY\|SECRET\|TOKEN" | grep "VITE_"

# Install dependencies
echo "Installing dependencies..."
npm install --save

# Ensure vite is available (using local installation)
echo "Vite version: $(./node_modules/.bin/vite --version)"

# Build the project
echo "Building project..."
if [ "$1" = "landing" ]; then
  echo "Building landing page..."
  # List landing page directory contents
  echo "Landing page directory contents:"
  ls -la landing-page
  
  # Build directly from the root, specifying the landing page as root
  echo "Running vite build with root option..."
  ./node_modules/.bin/vite build --config landing-page/vite.config.js
  
  # Create the expected directory structure if needed
  echo "Creating landing-page/dist directory if not exists..."
  mkdir -p landing-page/dist
  
  # Copy build output if it went somewhere else
  if [ -d "dist" ]; then
    echo "Found dist directory at root, copying to landing-page/dist..."
    cp -r dist/* landing-page/dist/
  fi
  
  echo "Final landing-page/dist contents:"
  ls -la landing-page/dist || echo "Directory not found"
else
  echo "Building client..."
  # Create .env.production file to force environment variables
  echo "Creating .env.production file with socket URL..."
  echo "VITE_SOCKET_URL=${VITE_SOCKET_URL:-wss://api.karmaonline.io}" > .env.production
  echo "VITE_API_URL=${VITE_API_URL:-https://api.karmaonline.io}" >> .env.production
  echo "VITE_ENV=production" >> .env.production
  
  # Show created .env.production
  echo "Contents of .env.production:"
  cat .env.production
  
  # Temporary build config for render
  echo "Creating simplified build config..."
  
  cat > vite.simple.config.js << 'EOF'
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser'
  },
  // This ensures environment variables are properly injected
  envPrefix: 'VITE_'
});
EOF

  echo "Running vite build with simple config..."
  ./node_modules/.bin/vite build --config vite.simple.config.js --mode production
  
  echo "Dist contents:"
  ls -la dist || echo "Dist directory not found"
fi

echo "Build completed successfully!" 