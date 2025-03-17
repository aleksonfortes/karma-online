# Test Mocks

This directory contains mock implementations for testing various modules in the Karma Online game.

## Directory Structure

- `network/`: Mocks for the network module
  - `networkManagerMocks.js`: Shared mocks for NetworkManager tests
  - `README.md`: Documentation for network mocks

## Best Practices

When creating mocks, follow these best practices:

1. **Reusability**: Create mocks that can be reused across multiple test files
2. **Edge Cases**: Design mocks to handle common edge cases gracefully
3. **Modularity**: Break down complex mocks into smaller, focused functions
4. **Documentation**: Document the purpose and usage of each mock
5. **Consistency**: Follow consistent naming conventions and patterns

## Adding New Mocks

To add new mocks:

1. Create a subdirectory for the module you're mocking (if it doesn't exist)
2. Create a file with the suffix `.mock.js` or a descriptive name like `moduleMocks.js`
3. Export the mocks from the file
4. Document the mocks in a README.md file in the subdirectory

## Example

```javascript
// Example mock for a UI component
const createMockUIComponent = () => ({
  render: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
  isVisible: jest.fn().mockReturnValue(true)
});

module.exports = {
  createMockUIComponent
};
``` 