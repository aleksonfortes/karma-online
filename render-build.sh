#!/bin/bash
set -e

# Set npm to use the public registry
echo "Ensuring we use the public npm registry..."
npm config set registry https://registry.npmjs.org/
npm config set always-auth false
npm config list

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
  
  # For landing page, we'll use a simple approach that doesn't rely on JS or Vite
  echo "Using simple static HTML approach for landing page..."
  
  # Create dist directory
  mkdir -p landing-page/dist
  
  # Directly copy the HTML file
  cp landing-page/index.html landing-page/dist/
  
  # Create a simple favicon if it doesn't exist
  if [ ! -f "landing-page/favicon.svg" ]; then
    echo "Creating simple favicon..."
    echo '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#333"/><path d="M10 22L16 10L22 22H10Z" fill="#ff6b6b"/></svg>' > landing-page/dist/favicon.svg
  else
    cp landing-page/favicon.svg landing-page/dist/
  fi
  
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