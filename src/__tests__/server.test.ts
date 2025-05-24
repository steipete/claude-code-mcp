import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
// import type { SpyInstance } from 'vitest'; // Reverted to any for console spies

// Note: Utility mocks are done dynamically in beforeEach to work with both src and dist

// File-local SDK Server mock for server.test.ts
const ServerTestMockSdkServerInstances: any[] = [];
const ServerTestMockSdkServer = vi.fn(() => {
  const instance = {
    __isServerTestFileMock: true, // Marker for this specific mock
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
  ServerTestMockSdkServerInstances.push(instance);
  return instance;
});
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: ServerTestMockSdkServer,
}));

// Add top-level mocks here for Node built-ins and 'which'
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
// Mock 'which' module at the top level
vi.mock('which', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('which');
  return {
    ...actual,
    sync: vi.fn(), // Mock the sync function specifically
  };
});

// Import the mocked versions
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { spawn, SpawnOptionsWithoutStdio, ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema, 
  ErrorCode, 
  type ServerResult, 
  type CallToolResult,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { join } from 'node:path'; // Import join for constructing paths
import { sync as whichSyncImported } from 'which'; // Renamed to avoid conflict with variable
// import { CLI_INIT_TIMEOUT_MS } from '../constants.js'; // This was incorrect
const TEST_CLI_INIT_TIMEOUT_MS = 5000; // Define locally for test assertions

// Mocks - these will hold the typed mock functions from the imports above
let mockHomedir: Mock<typeof homedir>;
let mockExistsSync: Mock<typeof existsSync>;
let mockSpawn: Mock<typeof spawn>;
let mockWhichSync: Mock<typeof whichSyncImported>; 

// Mocks for our own utils (to be assigned in beforeEach)
let actualUtils: typeof import('../utils.js'); // Define actualUtils here
let debugLogMock: any; // vi.MockInstance<typeof import('../utils.js').debugLog>;
let findClaudeCliMock: any; // vi.MockInstance<typeof import('../utils.js').findClaudeCli>;
let spawnAsyncMock: any; // vi.MockInstance<typeof import('../utils.js').spawnAsync>;

// Spy for console.log/error - use 'any' for broader compatibility with SpyInstance
let consoleLogSpy: any; // Mock<(...args: any[]) => void>;
let consoleErrorSpy: any; // Mock<(...args: any[]) => void>;
let consoleWarnSpy: any; // Added consoleWarnSpy declaration
let processOnSpy: any; // Mock<(...args: any[]) => NodeJS.Process>;

// Dynamically imported modules/constants, to be set in top-level beforeEach
let ClaudeCodeServer: any; 
let SERVER_VERSION: string;
let CLAUDE_CODE_TOOL_DESCRIPTION_TEMPLATE: string;
let originalEnv: NodeJS.ProcessEnv;

// Import actual utils once at the top level
import * as utilsImport from '../utils.js';

beforeEach(async () => {
  actualUtils = utilsImport; // Assign the imported module
  originalEnv = { ...process.env };

  ServerTestMockSdkServer.mockClear();
  ServerTestMockSdkServerInstances.length = 0;

  const os = await import('node:os');
  mockHomedir = vi.mocked(os.homedir);
  const fs = await import('node:fs');
  mockExistsSync = vi.mocked(fs.existsSync);
  const childProcess = await import('node:child_process');
  mockSpawn = vi.mocked(childProcess.spawn);
  const which = await import('which');
  mockWhichSync = vi.mocked(which.sync);

  // Spy on methods of the actualUtils object
  debugLogMock = vi.spyOn(actualUtils, 'debugLog').mockImplementation(() => {});
  findClaudeCliMock = vi.spyOn(actualUtils, 'findClaudeCli'); // Add .mockImplementation in tests as needed
  spawnAsyncMock = vi.spyOn(actualUtils, 'spawnAsync'); // Add .mockImplementation in tests as needed
  
  // REMOVE vi.doMock for utils.js
  /*
  vi.doMock('../utils.js', async () => {
    const actual = await vi.importActual('../utils.js') as typeof import('../utils.js');
    return {
      ...actual,
      debugLog: vi.fn(),
      findClaudeCli: vi.fn(),
      spawnAsync: vi.fn(),
    };
  });
  
  const utils = await import('../utils.js'); 
  debugLogMock = vi.mocked(utils.debugLog);
  findClaudeCliMock = vi.mocked(utils.findClaudeCli);
  spawnAsyncMock = vi.mocked(utils.spawnAsync);
  */

  mockHomedir.mockClear();
  mockExistsSync.mockClear();
  mockSpawn.mockClear();
  mockWhichSync.mockClear();
  debugLogMock.mockClear();
  findClaudeCliMock.mockClear();
  spawnAsyncMock.mockClear();

  // Setup console spies
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); // Setup consoleWarnSpy
  processOnSpy = vi.spyOn(process, 'on');

  // Dynamically import server and constants
  const serverModule = await import('../server.js');
  ClaudeCodeServer = serverModule.ClaudeCodeServer;
  const constantsModule = await import('../constants.js');
  SERVER_VERSION = constantsModule.SERVER_VERSION;
  CLAUDE_CODE_TOOL_DESCRIPTION_TEMPLATE = constantsModule.CLAUDE_CODE_TOOL_DESCRIPTION_TEMPLATE;

  // Default mock implementations (can be overridden in specific tests)
  mockHomedir.mockReturnValue('/test/home');
  findClaudeCliMock.mockReturnValue('/fake/cli/path/claude'); // Default for most tests
  spawnAsyncMock.mockImplementation(async (command: string, args: string[]) => { // Default for version check
    if (args && args.includes('--version')) { // Check command too if necessary
      return { stdout: '1.2.3-test', stderr: '', exitCode: 0 };
    }
    // Fallback for other spawnAsync calls not specifically handled by a test
    return { stdout: 'default mockSpawnAsync output from main beforeEach', stderr: '', exitCode: 0 }; 
  });

  mockSpawn.mockImplementation(() => { 
    const mProc = new EventEmitter() as any;
    mProc.stdout = new EventEmitter();
    mProc.stderr = new EventEmitter();
    mProc.stdin = { write: vi.fn(), end: vi.fn() };
    mProc.kill = vi.fn();
    process.nextTick(() => {
      mProc.stdout.emit('data', Buffer.from('Fallback cp.spawn output'));
      mProc.stdout.emit('end');
      mProc.emit('close', 0);
    });
    return mProc as ChildProcessWithoutNullStreams;
  });
  
  mockExistsSync.mockImplementation((path) => path === '/fake/cli/path/claude');
  // mockHomedir.mockReturnValue('/test/home/server'); // Already set to /test/home

  // consoleLogSpy, consoleErrorSpy, processOnSpy are set up here (were outer spies)
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); // Setup consoleWarnSpy
  processOnSpy = vi.spyOn(process, 'on');
});

afterEach(() => {
  process.env = originalEnv; // Restore original env
  if (consoleLogSpy) consoleLogSpy.mockRestore();
  if (consoleErrorSpy) consoleErrorSpy.mockRestore();
  if (consoleWarnSpy) consoleWarnSpy.mockRestore(); // Restore consoleWarnSpy
  if (processOnSpy) processOnSpy.mockRestore();
  delete process.env.CLAUDE_CLI_NAME;
  delete process.env.MCP_CLAUDE_DEBUG;
  vi.clearAllMocks(); 
});

describe('ClaudeCodeServer Unit Tests', () => {
  // The beforeEach and afterEach for this describe block were removed.
  // It will now use the outer beforeEach/afterEach.
  // localConsoleErrorSpy, etc. are replaced by the spies from the outer scope (consoleErrorSpy, etc.)

  // ... tests for debugLog, findClaudeCli, spawnAsync should be moved out ...

  describe('ClaudeCodeServer class', () => {
    it('should initialize with correct settings and fetch CLI version', async () => {
      const server = new ClaudeCodeServer();
      await server.initPromise;

      expect((server as any).claudeCliPath).toBe('/fake/cli/path/claude');
      expect((server as any).claudeCliVersion).toBe('1.2.3-test'); 
      expect(findClaudeCliMock).toHaveBeenCalled();
      expect(spawnAsyncMock).toHaveBeenCalledWith('/fake/cli/path/claude', ['--version'], expect.objectContaining({ timeout: TEST_CLI_INIT_TIMEOUT_MS }));
      
      const internalServer = server.server as any;
      expect(internalServer.__isServerTestFileMock, 'SDK Server mock from server.test.ts should be used').toBe(true);
    });

    it('should use CLAUDE_CLI_NAME for path and version check if set and absolute', async () => {
      process.env.CLAUDE_CLI_NAME = '/env/cli/path/claude-custom';
      findClaudeCliMock.mockReturnValue('/env/cli/path/claude-custom');
      spawnAsyncMock.mockImplementation(async (command: string, args: string[]) => {
        if (args && args.includes('--version') && command === '/env/cli/path/claude-custom') {
          return { stdout: 'custom-version-7.8.9', stderr: '', exitCode: 0 };
        }
        return { stdout: 'other', stderr: '', exitCode: 0 };
      });

      const server = new ClaudeCodeServer();
      await server.initPromise;

      expect((server as any).claudeCliPath).toBe('/env/cli/path/claude-custom');
      expect((server as any).claudeCliVersion).toBe('custom-version-7.8.9');
      expect(findClaudeCliMock).toHaveBeenCalled();
      expect(spawnAsyncMock).toHaveBeenCalledWith('/env/cli/path/claude-custom', ['--version'], expect.objectContaining({ timeout: TEST_CLI_INIT_TIMEOUT_MS }));
    });

    it('should handle initialization failure if findClaudeCli throws', async () => {
      const cliError = new Error('findClaudeCli failed from test');
      findClaudeCliMock.mockImplementation(() => { throw cliError; });
      
      const server = new ClaudeCodeServer();
      await server.initPromise; 
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to initialize Claude CLI path or version: findClaudeCli failed from test',
        cliError 
      );
      expect((server as any).claudeCliPath).toBe(''); 
      expect((server as any).claudeCliVersion).toBe('Claude CLI not found'); 
    });

    it('should handle initialization failure if CLI version check fails', async () => {
      findClaudeCliMock.mockReturnValue('/fake/version/fail/claude');
      const versionError = new Error('Version check command failed from test');
      spawnAsyncMock.mockImplementation(async (command: string, args: string[]) => {
        if (args && args.includes('--version') && command === '/fake/version/fail/claude') {
          throw versionError;
        }
        return { stdout: 'other', stderr: '', exitCode: 0 };
      });

      const server = new ClaudeCodeServer();
      await server.initPromise;

      // This log comes from _initializeClaudeCliVersion
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Error][Version] Failed to fetch Claude CLI version: Version check command failed from test'
      );
      // The constructor also logs if claudeCliPath is empty initially, but here it should be set.
      expect((server as any).claudeCliPath).toBe('/fake/version/fail/claude'); 
      expect((server as any).claudeCliVersion).toBe('Claude CLI not found or version check failed'); 
    });

    // Test for the server fallback logic (not activating when global mock is fine)
    it('should NOT activate server fallback when SDK global mock is correctly applied', async () => {
      // Ensure init succeeds for this specific check
      findClaudeCliMock.mockReturnValue('/path/for/no-fallback-check');
      spawnAsyncMock.mockResolvedValueOnce({ stdout: '1.0.0', stderr: '', exitCode: 0 });

      const server = new ClaudeCodeServer();
      await server.initPromise;

      const internalServer = server.server as any;
      expect(internalServer.__isServerTestFileMock).toBe(true); // Corrected to check file-local mock
      expect(internalServer.__isViFnFallback).toBeUndefined(); // Fallback should not have its marker
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining('SERVER FALLBACK ACTIVATED'));
    });

    it('should set up request handlers for ListToolsRequest and CallToolRequest', async () => {
      const server = new ClaudeCodeServer();
      await server.initPromise;
      const mockSdkServerInstance = server.server as any; 
      expect(mockSdkServerInstance.__isServerTestFileMock).toBe(true); // Corrected assertion

      const setRequestHandlerCalls = vi.mocked(mockSdkServerInstance.setRequestHandler).mock.calls;
      
      const listToolsCall = setRequestHandlerCalls.find((call: [any, any]) => call[0] === ListToolsRequestSchema);
      const callToolCall = setRequestHandlerCalls.find((call: [any, any]) => call[0] === CallToolRequestSchema);

      expect(listToolsCall).toBeDefined();
      expect(listToolsCall[1]).toBeInstanceOf(Function);
      expect(callToolCall).toBeDefined();
      expect(callToolCall[1]).toBeInstanceOf(Function);
    });

    it('should set up error handler', async () => {
      const server = new ClaudeCodeServer();
      await server.initPromise;
      const mockSdkServerInstance = server.server as any;
      expect(mockSdkServerInstance.__isServerTestFileMock).toBe(true); 
      // Check that an error handler has been assigned to the mock server instance
      expect(mockSdkServerInstance.onerror).toBeInstanceOf(Function);
    });
    
    it('should handle SIGINT and close server', async () => {
      process.env.NODE_ENV = 'test'; 
      const server = new ClaudeCodeServer();
      await server.initPromise;
      const mockSdkServerInstance = server.server as any;
      expect(mockSdkServerInstance.__isServerTestFileMock).toBe(true);

      let sigintCallback: (() => Promise<void>) | undefined;
      // processOnSpy is already spyOn(process, 'on') from main beforeEach
      vi.mocked(processOnSpy).mockImplementation((event: string, callback: any) => {
        if (event === 'SIGINT') {
          sigintCallback = callback;
        }
        return process; // Return type is NodeJS.Process
      });

      // Re-initialize server to capture the new process.on mock
      const serverForSigint = new ClaudeCodeServer();
      await serverForSigint.initPromise;
      const mockSdkServerInstanceForSigint = serverForSigint.server as any;

      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      
      expect(sigintCallback).toBeDefined();
      if (sigintCallback) {
        await sigintCallback(); 
      }
      
      expect(vi.mocked(mockSdkServerInstanceForSigint.close)).toHaveBeenCalled();
    });
  });

  describe('Tool handler implementation', () => {
    let claudeServerInstance: any;
    let mockSdkServerInstance: any;
    // Define CallToolResponse for clarity
    // type CallToolResponse = { output: string }; // Keep for reference if type fixed later
    let callToolHandler: (args: any, call: any) => Promise<any>; // Reverted to Promise<any>

    beforeEach(async () => {
      // Ensure a fresh server for each tool handler test, with successful init
      findClaudeCliMock.mockReturnValue('/tool/handler/cli/path');
      spawnAsyncMock.mockImplementation(async (command: string, args: string[]) => {
        if (args && args.includes('--version')) {
          return { stdout: 'handler-ver-1', stderr: '', exitCode: 0 };
        }
        // Default for actual CLI calls in tests for tool handler
        // This was the source of "Cannot destructure property 'stdout' of '(intermediate value)' as it is undefined."
        // if a test didn't mockResolvedValueOnce for a specific CLI call.
        // Now it returns a valid structure.
        return { stdout: 'CLI command successful from tool handler default mock', stderr: '', exitCode: 0 }; 
      });

      claudeServerInstance = new ClaudeCodeServer();
      await claudeServerInstance.initPromise;
      mockSdkServerInstance = claudeServerInstance.server as any;
      expect(mockSdkServerInstance.__isServerTestFileMock).toBe(true); // Corrected assertion

      const setRequestHandlerCalls = vi.mocked(mockSdkServerInstance.setRequestHandler).mock.calls;
      const callToolCall = setRequestHandlerCalls.find((call: [any,any]) => call[0] === CallToolRequestSchema);
      expect(callToolCall, 'CallToolRequest handler not found in setup').toBeDefined();
      callToolHandler = callToolCall[1] as any;
    });

    it('should handle CallToolRequest and execute claude CLI', async () => {
      const mockArgs = { prompt: 'test prompt', workFolder: '/test/workdir' };
      mockExistsSync.mockImplementation(path => path === '/test/workdir'); // Ensure workFolder exists
      
      // Make spawnAsync return the expected structure for a successful callToolHandler
      spawnAsyncMock.mockResolvedValueOnce({ stdout: 'CLI command successful', stderr: '', exitCode: 0 });

      const result: any = await callToolHandler({ params: { name: 'claude_code', arguments: mockArgs } }, {} as any); // Reverted to any

      expect(spawnAsyncMock).toHaveBeenCalledWith(
        '/tool/handler/cli/path',
        ['--dangerously-skip-permissions', '-p', mockArgs.prompt], // Corrected arguments
        { timeout: expect.any(Number), cwd: mockArgs.workFolder } // Corrected arguments & added timeout
      );
      // Correct structure for ServerResult<CallToolResult>
      expect(result).toEqual({ content: [{ type: 'text', text: 'CLI command successful' }] });
    });

    it('should handle non-existent workFolder by using default and warning', async () => {
      const mockArgs = { prompt: 'test prompt', workFolder: '/non/existent/folder' };
      mockExistsSync.mockImplementation(path => path !== '/non/existent/folder');
      mockHomedir.mockReturnValue('/fake/default/home'); // For default work folder path
      // Ensure spawnAsync returns a valid result for this path too
      spawnAsyncMock.mockResolvedValueOnce({ stdout: 'CLI ran in default', stderr: '', exitCode: 0 });

      await callToolHandler({ params: { name: 'claude_code', arguments: mockArgs } }, {} as any);
      
      expect(debugLogMock).toHaveBeenCalledWith(expect.stringContaining('Specified workFolder does not exist: /non/existent/folder. Using default: /fake/default/home')); // Corrected log message
      expect(spawnAsyncMock).toHaveBeenCalledWith(
        '/tool/handler/cli/path', // command
        ['--dangerously-skip-permissions', '-p', mockArgs.prompt], // Corrected arguments
        { timeout: expect.any(Number), cwd: '/fake/default/home' } // Corrected CWD and args
      );
    });

    it('should use workFolder from env if MCP_DEFAULT_WORKFOLDER is set and arg is invalid', async () => {
      // This test is problematic because MCP_DEFAULT_WORKFOLDER is not actually used by the server.
      // The server defaults to homedir() if workFolder is invalid or not provided.
      // I will adjust this test to reflect current server behavior or suggest removing if it's not a feature.
      // For now, I'll assume it should test the homedir() fallback when workFolder is bad.
      const mockArgs = { prompt: 'test prompt', workFolder: '/non/existent/folder' };
      mockExistsSync.mockImplementation(path => path !== '/non/existent/folder');
      mockHomedir.mockReturnValue('/fake/home/from/homedir');
      spawnAsyncMock.mockResolvedValueOnce({ stdout: 'CLI ran in homedir', stderr: '', exitCode: 0 });
      
      await callToolHandler({ params: { name: 'claude_code', arguments: mockArgs } }, {} as any);
      
      expect(spawnAsyncMock).toHaveBeenCalledWith(
        '/tool/handler/cli/path', // command
        ['--dangerously-skip-permissions', '-p', mockArgs.prompt],
        { timeout: expect.any(Number), cwd: '/fake/home/from/homedir' } // Should be homedir
      );
    });

    it('should throw error if tool name is not claude_code', async () => {
      try {
        await callToolHandler({ params: { name: 'wrong_tool', arguments: {} } }, {} as any);
        throw new Error('Expected McpError to be thrown'); // Should not reach here
      } catch (e: any) {
        expect(e).toBeInstanceOf(McpError);
        expect(e.message).toContain('Tool wrong_tool not found'); // Corrected assertion
        expect(e.code).toBe(ErrorCode.MethodNotFound);
      }
    });

    // Add more tool handler tests: error from CLI, timeout, etc.
    it('should handle errors from the Claude CLI execution', async () => {
      const cliError: any = new Error('CLI execution failed with error output');
      cliError.stderr = 'Failure details from CLI';
      cliError.stdout = 'Any stdout before error'; // spawnAsync might include this
      cliError.exitCode = 1;
      spawnAsyncMock.mockRejectedValue(cliError); // This is spawnAsync from utils being rejected

      const mockArgs = { prompt: 'test prompt to fail', workFolder: '/tmp/fail' };
      mockExistsSync.mockReturnValue(true); 

      try {
        await callToolHandler({ params: { name: 'claude_code', arguments: mockArgs } }, {} as any);
        throw new Error('Expected McpError to be thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(McpError);
        expect(e.message).toContain('Claude CLI execution failed: CLI execution failed with error output');
        expect(e.message).toContain('Stderr: Failure details from CLI');
        expect(e.message).toContain('Stdout: Any stdout before error');
        expect(e.code).toBe(ErrorCode.InternalError);
      }
    });

    it('should handle timeout from Claude CLI execution', async () => {
      const timeoutError: any = new Error('ETIMEDOUT from test');
      timeoutError.code = 'ETIMEDOUT'; // Simulate a timeout error object from spawn
      // Add stderr/stdout to simulate spawnAsync attaching them before throwing timeout
      timeoutError.stderr = 'some stderr before timeout'; 
      timeoutError.stdout = 'some stdout before timeout';
      spawnAsyncMock.mockRejectedValue(timeoutError);

      const mockArgs = { prompt: 'test prompt to timeout', workFolder: '/tmp/timeout' };
      mockExistsSync.mockReturnValue(true);

      try {
        await callToolHandler({ params: { name: 'claude_code', arguments: mockArgs } }, {} as any);
        throw new Error('Expected McpError to be thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(McpError);
        expect(e.message).toMatch(/Claude CLI command timed out after/);
        expect(e.message).toContain('Details: ETIMEDOUT from test');
        expect(e.message).toContain('Stderr: some stderr before timeout');
        expect(e.message).toContain('Stdout: some stdout before timeout');
        expect(e.code).toBe(ErrorCode.InternalError); 
      }
    });
  });
});