module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  moduleNameMapper: {
    '^socket.io-client$': '<rootDir>/tests/mocks/socket.io-client.mock.js',
    '^three$': '<rootDir>/tests/mocks/three.mock.js',
    '\\.(css|less|sass|scss)$': '<rootDir>/tests/mocks/__mocks__/styleMock.js',
    '\\.(gif|ttf|eot|svg|png)$': '<rootDir>/tests/mocks/__mocks__/fileMock.js'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleFileExtensions: ['js'],
  transformIgnorePatterns: [],
  collectCoverage: true,
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    'server/src/**/*.js',
    '!src/assets/**',
    '!**/node_modules/**',
    '!**/dist/**'
  ],
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 17,
      lines: 12,
      statements: 12
    }
  },
  // Additional settings for integration tests
  testTimeout: 10000, // 10 seconds timeout for tests (useful for integration tests)
  testMatch: [
    '**/__tests__/**/*.js?(x)',
    '**/?(*.)+(spec|test).js?(x)',
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js'
  ],
  // Special configuration for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['**/tests/unit/**/*.test.js'],
      testEnvironment: 'jsdom'
    },
    {
      displayName: 'integration',
      testMatch: ['**/tests/integration/**/*.test.js'],
      testEnvironment: 'node'
    }
  ]
}
