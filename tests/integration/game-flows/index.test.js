/**
 * @jest-environment node
 * 
 * Game Flow Integration Tests - Test Runner
 * 
 * This file imports and runs all the game flow integration tests
 */

// Import individual test files
import './game-start.test.js';
import './npc-interactions.test.js';
import './pvm.test.js';
import './pvp.test.js';
import './collision.test.js';
import './karma.test.js';
import './ui.test.js';

// This file doesn't contain any tests of its own
// It serves as a central entry point to run all game flow tests together 