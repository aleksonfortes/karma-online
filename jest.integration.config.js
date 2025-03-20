/**
 * Jest configuration for integration tests
 */
export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(js|jsx)$': ['babel-jest', { configFile: './babel.config.js' }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!.*\\.mjs$)'
  ],
  testMatch: [
    '**/tests/integration/**/*.test.js'
  ],
  collectCoverage: true,
  collectCoverageFrom: [
    'server/src/**/*.js',
    'src/modules/**/*.js',
    '!**/node_modules/**'
  ],
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 10,
      branches: 10,
      functions: 10,
      lines: 10
    }
  },
  setupFilesAfterEnv: [
    '<rootDir>/tests/integration/setup.js'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  },
  testTimeout: 10000
}; 