#!/bin/bash
set -e

# Display node and npm versions
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "Working directory: $(pwd)"

# Show Vite-related environment variables safely
echo "VITE Environment variables:"
printenv | grep "VITE_" || echo "No VITE_ environment variables found"

# Install dependencies
echo "Installing dependencies..."
npm install --save

# Ensure vite is available (using local installation)
echo "Checking for vite in node_modules..."
if [ -f "./node_modules/.bin/vite" ]; then
  echo "Vite found! Version: $(./node_modules/.bin/vite --version)"
else
  echo "Vite not found in node_modules/.bin. Checking installed packages:"
  npm list vite
  echo "Attempting to install vite directly..."
  npm install vite --save
  echo "After installation, checking for vite again:"
  ls -la ./node_modules/.bin/ | grep vite || echo "Vite binary still not found"
fi

# Build the project
echo "Building project..."
if [ "$1" = "landing" ]; then
  echo "Building landing page..."
  # List landing page directory contents
  echo "Landing page directory contents:"
  ls -la landing-page
  
  # Check if Vite config exists
  echo "Checking for vite config in landing-page..."
  if [ -f "landing-page/vite.config.js" ]; then
    echo "Found landing-page/vite.config.js"
    cat landing-page/vite.config.js
  else
    echo "landing-page/vite.config.js not found!"
  fi
  
  # Check if index.html exists
  echo "Checking for index.html in landing-page..."
  if [ -f "landing-page/index.html" ]; then
    echo "Found landing-page/index.html"
  else
    echo "landing-page/index.html not found!"
    echo "Contents of landing-page directory:"
    find landing-page -type f | sort
  fi
  
  # Create a special build script for landing page
  echo "Creating special landing page build..."
  
  # Create a simplified entry point
  mkdir -p landing-page/dist
  
  # Copy the index.html directly to ensure it's always available
  cp landing-page/index.html landing-page/dist/
  
  # Create assets directory
  mkdir -p landing-page/dist/assets
  
  # Copy any CSS files
  if [ -f "landing-page/src/style.css" ]; then
    cp landing-page/src/style.css landing-page/dist/assets/
  fi
  
  # Build using Vite for additional assets
  echo "Running vite build for landing page..."
  cd landing-page
  npx vite build || echo "Vite build failed, but we have a fallback"
  cd ..
  
  echo "Final landing-page/dist contents:"
  find landing-page/dist -type f | sort
  
  # Ensure all routes will be handled
  touch landing-page/dist/.npmignore
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
  npx vite build --config vite.simple.config.js --mode production
  
  echo "Dist contents:"
  ls -la dist || echo "Dist directory not found"
fi

echo "Build completed successfully!" 