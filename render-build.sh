#!/bin/bash
set -e

# Display node and npm versions
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "Working directory: $(pwd)"

# Install dependencies
echo "Installing dependencies..."
npm install --save

# Install vite globally for access in PATH
echo "Installing Vite globally..."
npm install -g vite

# Ensure vite is available
which vite
echo "Vite version: $(vite --version)"

# Check for crypto-browserify
echo "Checking for crypto-browserify..."
if ! npm list crypto-browserify; then
  echo "Installing crypto-browserify..."
  npm install --save crypto-browserify
fi

# Build the project
echo "Building project..."
if [ "$1" = "landing" ]; then
  echo "Building landing page..."
  # List landing page directory contents
  echo "Landing page directory contents:"
  ls -la landing-page
  
  # Build directly from the root, specifying the landing page as root
  echo "Running vite build with root option..."
  vite build --config landing-page/vite.config.js
  
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
  # Temporary build config for render
  echo "Creating simplified build config..."
  
  cat > vite.simple.config.js << 'EOF'
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser'
  }
});
EOF

  echo "Running vite build with simple config..."
  vite build --config vite.simple.config.js
  
  echo "Dist contents:"
  ls -la dist || echo "Dist directory not found"
fi

echo "Build completed successfully!" 