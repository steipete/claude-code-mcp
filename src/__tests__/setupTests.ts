import { vi } from 'vitest';
import { EventEmitter } from 'node:events';

// Global mock for node:os
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    homedir: vi.fn(() => '/fake/home'), // Default mock for homedir
    tmpdir: vi.fn(() => '/fake/tmp'),   // Default mock for tmpdir
    // Add other os functions if needed by tests
  };
});

// Global mock for @modelcontextprotocol/sdk/server/index.js
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  const MockServer = vi.fn();
  MockServer.prototype.setRequestHandler = vi.fn();
  MockServer.prototype.connect = vi.fn();
  MockServer.prototype.close = vi.fn();
  MockServer.mockImplementation(function(this: any) {
    this.onerror = undefined;
  });
  return { Server: MockServer };
});

// Global mock for @modelcontextprotocol/sdk/client/index.js
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  const MockClient = vi.fn().mockImplementation(function(this: any) {
    this.connect = vi.fn().mockResolvedValue(undefined); // Mock connect to resolve
    this.disconnect = vi.fn().mockResolvedValue(undefined); // Mock disconnect to resolve
    this.callTool = vi.fn();
    // Add other client methods if needed
  });
  return { Client: MockClient };
});

// It might also be beneficial to mock other SDK parts globally if they are consistently problematic
// For example, parts of '@modelcontextprotocol/sdk/types.js' if McpError or ErrorCode mocks are needed universally.
vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: { name: 'listTools' },
  CallToolRequestSchema: { name: 'callTool' },
  ErrorCode: { 
    InternalError: 'InternalError',
    MethodNotFound: 'MethodNotFound',
    // Add other error codes if used by the main code and needed in mocks
  },
  McpError: vi.fn().mockImplementation((code, message) => {
    const error = new Error(message);
    (error as any).code = code;
    return error;
  })
}));

// Ensure other frequently mocked modules are here if they cause issues across files
vi.mock('node:child_process', () => ({
  spawn: vi.fn().mockImplementation(() => {
    const mockProcess = new EventEmitter();
    (mockProcess as any).stdout = new EventEmitter();
    (mockProcess as any).stderr = new EventEmitter();
    (mockProcess as any).stdin = {
      write: vi.fn(),
      end: vi.fn(),
    };
    // Make kill a spy function
    (mockProcess as any).kill = vi.fn(); 
    // Ensure it can emit 'spawn' and 'exit' for the client logic
    // The actual emit calls will be done by test logic or a more sophisticated mock if needed.
    return mockProcess;
  }),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    existsSync: vi.fn(() => true), 
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    mkdtempSync: vi.fn((prefix) => `${prefix}mockedpath`), // Mock mkdtempSync to return a string path
    // Add other fs functions if they are specifically used and need mocking
  };
});

// Mock package.json globally if its version is used in a way that affects tests
vi.mock('../../package.json', () => ({
  default: { version: '1.0.0-test-global' }
}));

// You can add global beforeEach/afterEach hooks here if needed
// import { beforeEach } from 'vitest';
// beforeEach(() => {
//   vi.clearAllMocks(); // This is often good, but vitest.config.unit.ts already has mockReset etc.
// }); 