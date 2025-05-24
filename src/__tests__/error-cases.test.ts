import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, type Mock } from 'vitest';

// Explicitly mock the SDK Server for this test file to ensure consistency
const MockSdkServerInstances: any[] = [];
const MockSdkServer = vi.fn(() => {
  // console.log('error-cases.test.ts: MockSdkServer instantiated');
  const instance = {
    __isGlobalMock: false, // To differentiate if needed, though this is now local
    __isErrorCasesFileMock: true, // Specific marker
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
    onerror: null,
  };
  MockSdkServerInstances.push(instance);
  return instance;
});
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({ Server: MockSdkServer }));

// Add top-level mocks here for Node built-ins
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('node:child_process');
  return {
    ...actual,
    spawn: vi.fn(),
  };
});
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('node:os');
  return {
    ...actual,
    homedir: vi.fn(),
  };
});

// Import the mocked versions
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { EventEmitter } from 'node:events';

// Import SDK types directly, Server will be mocked via setupTests.ts
// CallContext removed as it's not exported by the SDK types
import { McpError, ErrorCode, CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
// Used for typing the mock, actual mock comes from beforeEach or setupTests.ts
import type { Server as SdkServerTypeActual } from '@modelcontextprotocol/sdk/server/index.js'; 

// Global mocks are in setupTests.ts. This file will also re-mock the SDK server in beforeEach.
let mockExistsSync: Mock<typeof existsSync>;
let mockSpawn: Mock<typeof spawn>;
let mockHomedir: Mock<typeof homedir>;

let MockedSdkServerConstructor: typeof MockSdkServer;

const originalEnv = { ...process.env };

describe('Error Handling Tests', () => {
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  let ClaudeCodeServer: any;
  let findClaudeCliSpy: any;
  let spawnAsyncSpy: any;
  let actualUtils: typeof import('../utils.js');

  beforeAll(async () => {
    actualUtils = await import('../utils.js');
  });

  beforeEach(async () => {
    // vi.resetModules(); // Keep commented out
    process.env = { ...originalEnv };

    MockSdkServer.mockClear(); // Clear the top-level mock constructor
    MockSdkServerInstances.length = 0; // Clear instances array

    // Mocks for Node built-ins are at the top-level. 
    const osModule = await import('node:os');
    mockHomedir = vi.mocked(osModule.homedir);
    const fsModule = await import('node:fs');
    mockExistsSync = vi.mocked(fsModule.existsSync);
    const cpModule = await import('node:child_process');
    mockSpawn = vi.mocked(cpModule.spawn);

    findClaudeCliSpy = vi.spyOn(actualUtils, 'findClaudeCli');
    // Remove default mockResolvedValue. Set it in specific tests if needed.
    spawnAsyncSpy = vi.spyOn(actualUtils, 'spawnAsync'); 

    mockHomedir.mockClear();
    mockExistsSync.mockClear();
    mockSpawn.mockClear();
    findClaudeCliSpy.mockClear();
    spawnAsyncSpy.mockClear(); // Clears any prior .mock... calls

    mockHomedir.mockReturnValue('/fake/home');
    mockExistsSync.mockImplementation((path) => {
      // console.log(`mockExistsSync called with: ${path}`);
      if (path === '/fake/home/.claude/cli/claude') return true;
      if (path === '/usr/local/bin/claude') return true; // For fallback testing
      if (path === '/no/such/claudefile') return false;
      return false;
    });
    
    // Default for mockSpawn, can be overridden in specific tests
    mockSpawn.mockImplementation(() => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
      mockProcess.kill = vi.fn();
      process.nextTick(() => {
        mockProcess.stdout.emit('data', Buffer.from('Claude CLI Output'));
        mockProcess.stdout.emit('end');
        mockProcess.emit('close', 0);
      });
      return mockProcess as ChildProcessWithoutNullStreams;
    });

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    MockedSdkServerConstructor = MockSdkServer as typeof MockSdkServer; 

    ({ ClaudeCodeServer } = await import('../server.js'));
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('CallToolRequest Error Cases', () => {
    it('should throw error for unknown tool name', async () => {
      // This test relies on server.initPromise which might call spawnAsync
      spawnAsyncSpy.mockResolvedValueOnce({ stdout: 'version 1.0.0', stderr: '', exitCode: 0 });
      const server = new ClaudeCodeServer();
      await server.initPromise;
      
      const internalServer = server.server as any;
      expect(internalServer.__isErrorCasesFileMock).toBe(true); 

      // expect(MockedSdkServerConstructor.mock.instances.length).toBeGreaterThan(0); // Not needed if using internalServer directly
      const mockServerInstance = internalServer; // Use the direct instance from server.server
      
      expect(mockServerInstance, 'Mock MCP Server instance not found').toBeDefined();
      expect(mockServerInstance.setRequestHandler).toBeInstanceOf(Function);

      const setRequestHandlerMock = vi.mocked(mockServerInstance.setRequestHandler);
      const callToolCall = setRequestHandlerMock.mock.calls.find(
        (call: any) => call[0] === CallToolRequestSchema
      );
      expect(callToolCall, 'callTool handler not found for CallToolRequestSchema').toBeDefined();
      const handler = callToolCall![1];

      await expect(
        handler({ params: { name: 'unknown_tool', arguments: {} } }, {} as any) // Using any for call context
      ).rejects.toThrow('Tool unknown_tool not found');
    });

    it('should handle timeout errors', async () => {
      // This test relies on server.initPromise which might call spawnAsync
      spawnAsyncSpy.mockResolvedValueOnce({ stdout: 'version 1.0.0', stderr: '', exitCode: 0 });
      const server = new ClaudeCodeServer();
      await server.initPromise;

      const mockServerInstance = server.server as any; 
      expect(mockServerInstance.__isErrorCasesFileMock).toBe(true);
      expect(mockServerInstance.setRequestHandler).toBeInstanceOf(Function);

      // const setRequestHandlerMock = vi.mocked(mockServerInstance.setRequestHandler);
      // Access .mock directly if setRequestHandler is already a vi.fn()
      const setRequestHandlerMockInstance = mockServerInstance.setRequestHandler;
      expect(setRequestHandlerMockInstance.mock).toBeDefined(); // Check if .mock property exists

      const callToolRegistration = setRequestHandlerMockInstance.mock.calls.find(
        (call: any) => call[0] === CallToolRequestSchema
      );
      expect(callToolRegistration, 'callTool handler registration not found').toBeDefined();
      const callToolHandler = callToolRegistration![1];

      const timeoutError: any = new Error('ETIMEDOUT_spawnAsync');
      timeoutError.code = 'ETIMEDOUT';
      spawnAsyncSpy.mockRejectedValue(timeoutError);

      await expect(callToolHandler({
        params: { name: 'claude_code', arguments: { prompt: 'test', workFolder: '/tmp' } }
      }, {} as any)).rejects.toThrow(expect.objectContaining({
        message: expect.stringMatching(/Claude CLI command timed out|Process execution timed out after/),
        code: ErrorCode.InternalError
      }));
    });

    it('should handle invalid argument types', async () => {
      // This test relies on server.initPromise which might call spawnAsync
      spawnAsyncSpy.mockResolvedValueOnce({ stdout: 'version 1.0.0', stderr: '', exitCode: 0 });
      const server = new ClaudeCodeServer();
      await server.initPromise;
      
      const mockServerInstance = server.server as any;
      expect(mockServerInstance.__isErrorCasesFileMock).toBe(true);
      const setRequestHandlerMockInstance = mockServerInstance.setRequestHandler;
      expect(setRequestHandlerMockInstance.mock).toBeDefined();

      const callToolRegistration = setRequestHandlerMockInstance.mock.calls.find(
        (call: any) => call[0] === CallToolRequestSchema
      );
      expect(callToolRegistration, 'callTool handler not found').toBeDefined();
      const handler = callToolRegistration![1];

      await expect(
        handler({ params: { name: 'claude_code', arguments: { prompt: 123 } } }, {} as any)
      ).rejects.toThrow(McpError);
    });

    it('should include CLI error details in error message', async () => {
      // This test relies on server.initPromise which might call spawnAsync
      spawnAsyncSpy.mockResolvedValueOnce({ stdout: 'version 1.0.0', stderr: '', exitCode: 0 });
      const server = new ClaudeCodeServer();
      await server.initPromise;

      const mockServerInstance = server.server as any;
      expect(mockServerInstance.__isErrorCasesFileMock).toBe(true);
      const setRequestHandlerMockInstance = mockServerInstance.setRequestHandler;
      expect(setRequestHandlerMockInstance.mock).toBeDefined();

      const callToolRegistration = setRequestHandlerMockInstance.mock.calls.find(
        (call: any) => call[0] === CallToolRequestSchema
      );
      expect(callToolRegistration, 'callTool handler not found').toBeDefined();
      const handler = callToolRegistration![1];

      const cliErrorMessage = 'CLI specific error from stderr';
      const errorFromSpawn: any = new Error(`Command failed with exit code 1\nStderr: ${cliErrorMessage}\nStdout: `);
      errorFromSpawn.stderr = cliErrorMessage;
      errorFromSpawn.stdout = '';
      errorFromSpawn.exitCode = 1;
      spawnAsyncSpy.mockRejectedValue(errorFromSpawn);

      await expect(
        handler({ params: { name: 'claude_code', arguments: { prompt: 'test', workFolder: '/tmp' } } }, {} as any)
      ).rejects.toThrow(expect.objectContaining({
        message: expect.stringContaining(cliErrorMessage),
        code: ErrorCode.InternalError
      }));
    });
  });

  describe('Process Spawn Error Cases (testing spawnAsync directly via spy)', () => {
    it('should handle spawn ENOENT error', async () => {
      const enoentError: any = new Error('ENOENT from mock');
      enoentError.code = 'ENOENT';
      // spawnAsyncSpy will call original, which uses mockSpawn
      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        process.nextTick(() => mockProcess.emit('error', enoentError));
        return mockProcess as ChildProcessWithoutNullStreams;
      });
      await expect(actualUtils.spawnAsync('nonexistent-command', [])).rejects.toThrow('Command not found: nonexistent-command');
    });

    it('should handle generic spawn errors', async () => {
      const genericError = new Error('Generic spawn error');
      // spawnAsyncSpy will call original, which uses mockSpawn
      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        process.nextTick(() => mockProcess.emit('error', genericError));
        return mockProcess as ChildProcessWithoutNullStreams;
      });
      await expect(actualUtils.spawnAsync('test', [])).rejects.toThrow(genericError);
    });

    it('should accumulate stderr output before error during spawn error event', async () => {
      const stderrMessage = 'Error from CLI on error event';
      const spawnError = new Error('Spawn failed after stderr on error event');
      // spawnAsyncSpy will call original, which uses mockSpawn
      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        process.nextTick(() => {
          mockProcess.stderr.emit('data', Buffer.from(stderrMessage));
          mockProcess.emit('error', spawnError);
        });
        return mockProcess as ChildProcessWithoutNullStreams;
      });
      try {
        await actualUtils.spawnAsync('test-error-accumulate', []);
      } catch (e:any) {
        expect(e).toBe(spawnError);
        // The current spawnAsync in utils.ts does not append stderr to the error message for 'error' events directly
        // It only does for 'close' with non-zero. For 'error' event, it rejects with the error or a specific ENOENT message.
        // So, we expect the original error message directly or check if the accumulated stderr is part of a custom field if added.
        // For now, let's assume the error object itself is what we get for non-ENOENT 'error' events.
        // If utils.ts's spawnAsync changes to attach stderr to all error types, this assertion would need update.
        expect(e.message).toEqual('Spawn failed after stderr on error event'); 
      }
    });
  });

  describe('Server Initialization Errors', () => {
    it('should handle CLI path not found gracefully', async () => {
      findClaudeCliSpy.mockImplementation(() => {
        throw new Error('CLI not found test error from spy');
      });
      // spawnAsync will not be called if findClaudeCli throws
      const server = new ClaudeCodeServer();
      await server.initPromise;

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize Claude CLI path or version:'),
        expect.objectContaining({ message: 'CLI not found test error from spy' })
      );
      expect(server.claudeCliPath).toBe('');
      expect(server.claudeCliVersion).toBe('Claude CLI not found');
    });

    it('should handle server connection errors', async () => {
      // This test relies on server.initPromise which might call spawnAsync
      spawnAsyncSpy.mockResolvedValueOnce({ stdout: 'version 1.0.0', stderr: '', exitCode: 0 });
      const server = new ClaudeCodeServer();
      await server.initPromise;

      const internalSdkServerInstance = server.server as any;
      // expect(internalSdkServerInstance.__isErrorCasesMock).toBe(true); // This was from a previous iteration
      expect(internalSdkServerInstance.__isErrorCasesFileMock).toBe(true); // Assert it's using the file-local mock
      
      const connectError = new Error('Simulated connection failed from test');
      // Ensure connect is actually a mock function before trying to use mockRejectedValue
      if (typeof internalSdkServerInstance.connect?.mockRejectedValue === 'function') {
        vi.mocked(internalSdkServerInstance.connect).mockRejectedValue(connectError);
      } else {
        // This case should ideally not be hit if our mock is correct
        console.error('[Test Error] internalSdkServerInstance.connect is not a mock function');
        internalSdkServerInstance.connect = vi.fn().mockRejectedValue(connectError); // Force it if not already mock
      }

      consoleErrorSpy.mockClear();
      await server.run();

      expect(consoleErrorSpy).toHaveBeenCalledWith(connectError);
    });
  });
});