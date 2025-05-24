import { vi, afterEach } from 'vitest';

// Clear all mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Mock for the MCP SDK Server - must be at the top level
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  const MockServerClass = vi.fn().mockImplementation(() => {
    console.log('MockServerClass instantiated');
    const mockInstance = {
      __isGlobalMock: true,
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      setRequestHandler: vi.fn(),
      setErrorHandler: vi.fn(),
      setDisposeHandler: vi.fn(),
      sendNotification: vi.fn(),
      dispose: vi.fn(),
      isDisposed: vi.fn().mockReturnValue(false),
      onDispose: vi.fn(),
      getAuthenticatedUser: vi.fn().mockReturnValue(null),
      onerror: null, // Property that can be set
    };
    return mockInstance;
  });
  
  return { Server: MockServerClass };
});

console.log('Global test setup complete with SDK Server mock.'); 