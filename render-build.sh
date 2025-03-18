#!/bin/bash
set -e

# Display node and npm versions
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Install dependencies
echo "Installing dependencies..."
npm install --save

# Install vite globally for access in PATH
echo "Installing Vite globally..."
npm install -g vite

# Ensure vite is available
which vite
echo "Vite version: $(vite --version)"

# Build the project
echo "Building project..."
if [ "$1" = "landing" ]; then
  echo "Building landing page..."
  cd landing-page
  vite build --outDir dist
  echo "Build path: $(pwd)/dist"
  ls -la dist
  cd ..
else
  echo "Building client..."
  vite build
fi

echo "Build completed successfully!" 