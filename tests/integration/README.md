# Integration Tests

This directory contains integration tests for Karma Online that validate communication between different parts of the application, particularly between client and server.

## Client-Server Tests

The `client-server` directory contains tests that validate the communication between the client and server components. These tests ensure that:

- Client requests are properly processed by the server
- Server responses are correctly handled by the client
- Real-time communication works as expected
- Game state synchronization functions properly
- Edge cases in network communication are handled gracefully

## Running Integration Tests

To run all integration tests:

```bash
npm run test:integration
```

To run only client-server integration tests:

```bash
npm run test:integration:client-server
```

## Writing Integration Tests

When adding new integration tests, follow these guidelines:

1. **Test Real Communication**: Integration tests should use actual network communication between client and server components.
2. **Isolate Test Environments**: Each test should run in an isolated environment to prevent cross-test contamination.
3. **Clean Up Resources**: Always clean up server and client resources after tests to prevent memory leaks.
4. **Test Full Flows**: Test complete user flows rather than individual messages.
5. **Mock External Services**: External services not being tested should be mocked.
6. **Handle Asynchronous Operations**: Use proper async/await patterns to handle the asynchronous nature of network communication.

## Test Utilities

The `utils` directory contains helper functions for setting up test environments, creating test clients, and managing test servers. 