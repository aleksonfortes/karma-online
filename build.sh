#!/bin/bash

# Set up npm registry and config
echo "registry=https://registry.npmjs.org/" > .npmrc
echo "always-auth=false" >> .npmrc
echo "fund=false" >> .npmrc
echo "audit=false" >> .npmrc

# Install dependencies
npm install --no-fund --no-audit

# Use the explicit path to vite
NODE_MODULES_BIN="$(pwd)/node_modules/.bin"
echo "Using vite at $NODE_MODULES_BIN/vite"

# Build landing page
echo "Building landing page..."
$NODE_MODULES_BIN/vite build landing-page

# Build client
echo "Building client..."
$NODE_MODULES_BIN/vite build

echo "Build completed successfully" 