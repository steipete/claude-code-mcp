# End-to-End Testing for Claude Code MCP

This document explains how to run and maintain the end-to-end tests for the Claude Code MCP server.

## Overview

The e2e tests are designed to validate the Claude Code MCP server's functionality in real-world scenarios. Since the Claude CLI requires authentication and isn't easily installable in automated environments, the tests use a mock Claude CLI for automated testing and provide optional integration tests for local development.

## Test Structure

The e2e tests are organized into several files:

- `src/__tests__/e2e.test.ts` - Main e2e test suite with mock Claude CLI
- `src/__tests__/edge-cases.test.ts` - Edge case and error handling tests
- `src/__tests__/utils/mcp-client.ts` - Mock MCP client for testing
- `src/__tests__/utils/claude-mock.ts` - Mock Claude CLI implementation

## Running Tests

### Quick Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run all tests (unit + e2e)
npm test

# Run only e2e tests with mocks
npm run test:e2e

# Run unit tests only
npm run test:unit
```

### Local Integration Testing

When Claude CLI is installed locally, you can run the full integration tests:

```bash
# Run all tests including integration tests
npm run test:e2e:local
```

The integration tests are marked with `.skip()` by default and will only run when you have Claude CLI installed and authenticated.

## Test Scenarios

### Basic Operations
- Tool registration and discovery
- Simple prompt execution
- Error handling
- Default working directory behavior

### Working Directory Handling
- Custom working directory support
- Non-existent directory handling
- Permission errors

### Edge Cases
- Input validation (missing/invalid parameters)
- Special characters in prompts
- Concurrent request handling
- Large prompt handling
- Path traversal prevention

### Integration Tests (Local Only)
- File creation with real Claude CLI
- Git operations
- Complex multi-step workflows

## Mock Claude CLI

The tests use a mock Claude CLI that simulates basic Claude behavior. The mock:

1. Creates a fake executable at `~/.claude/local/claude`
2. Responds to basic commands based on prompt patterns
3. Simulates errors for testing error handling

The mock is automatically set up before tests run and cleaned up afterwards.

## Writing New Tests

When adding new e2e tests:

1. Use the `MCPTestClient` for communicating with the server
2. Set up test directories in `beforeEach` and clean up in `afterEach`
3. Use descriptive test names that explain the scenario
4. Add appropriate assertions for both success and failure cases

Example:

```typescript
it('should handle complex file operations', async () => {
  const response = await client.callTool('claude_code', {
    prompt: 'Create multiple files and organize them',
    workFolder: testDir,
  });

  expect(response).toBeTruthy();
  // Add specific assertions about the result
});
```

## Debugging Tests

To debug e2e tests:

1. Enable debug mode by setting `MCP_CLAUDE_DEBUG=true`
2. Add console.log statements in test code
3. Use the VSCode debugger with the test runner
4. Check server stderr output for debug logs

## CI/CD Considerations

The e2e tests are designed to run in CI environments without Claude CLI:

- Mock tests run automatically in CI
- Integration tests are skipped unless explicitly enabled
- Tests use temporary directories to avoid conflicts
- All tests clean up after themselves

## Common Issues

### Tests Timing Out
- Increase timeout in `vitest.config.e2e.ts`
- Check if the mock Claude CLI is set up correctly
- Verify the server is building properly

### Mock Not Found
- Ensure the mock setup runs in `beforeAll`
- Check file permissions on the mock executable
- Verify the mock path matches the server's expectations

### Integration Tests Failing
- Ensure Claude CLI is installed and authenticated
- Check that you're running the local test command
- Verify Claude CLI is accessible in your PATH

## Future Improvements

- Add performance benchmarking tests
- Implement stress testing scenarios
- Add tests for specific Claude Code features
- Create visual regression tests for output formatting