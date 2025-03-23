/**
 * Integration Test Initialization Script
 * 
 * This script ensures the test environment is properly set up and
 * the correct directory structure exists for running integration tests.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Define necessary directories
const dirs = [
  'tests/integration',
  'tests/integration/game-flows',
  'tests/integration/client-server',
  'tests/utils'
];

// Create directories if they don't exist
for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

// Verify all test files exist
const testFiles = [
  'tests/integration/game-flows/game-start.test.js',
  'tests/integration/game-flows/npc-interactions.test.js',
  'tests/integration/game-flows/pvm.test.js',
  'tests/integration/game-flows/pvp.test.js',
  'tests/integration/game-flows/collision.test.js',
  'tests/integration/game-flows/karma.test.js',
  'tests/integration/game-flows/ui.test.js',
  'tests/integration/game-flows/index.test.js'
];

// Check if test files exist
let allFilesExist = true;
for (const file of testFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Missing test file: ${file}`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.error('Some test files are missing. Please ensure all test files exist.');
  process.exit(1);
}

// Verify utility files exist
const utilFiles = [
  'tests/utils/MockClient.js',
  'tests/utils/TestableNetworkManager.js',
  'tests/utils/TestAdapter.js'
];

// Check if utility files exist
for (const file of utilFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Missing utility file: ${file}`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.error('Some utility files are missing. Please ensure all utility files exist.');
  process.exit(1);
}

// Verify config files
const configFiles = [
  'jest.integration.config.js',
  'babel.config.js'
];

for (const file of configFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Missing config file: ${file}`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.error('Some config files are missing. Please ensure all config files exist.');
  process.exit(1);
}

console.log('All necessary files and directories exist.');
console.log('Setup complete. Running initial test to verify...');

// Run a single test to verify everything is working
try {
  execSync('NODE_OPTIONS=--experimental-vm-modules npm run test:game-flows -- --testMatch="**/tests/integration/game-flows/game-start.test.js" --coverage=false', { 
    stdio: 'inherit' 
  });
  console.log('Initial test ran successfully!');
} catch (error) {
  console.error('Failed to run initial test:', error.message);
  process.exit(1);
}

console.log('Integration test environment is now ready.'); 