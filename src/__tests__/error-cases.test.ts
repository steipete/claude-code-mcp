import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { EventEmitter } from 'node:events';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Store original env
const originalEnv = { ...process.env };

// Mock dependencies
vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/user'),
  tmpdir: vi.fn(() => '/tmp'),
}));
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn()
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: { name: 'listTools' },
  CallToolRequestSchema: { name: 'callTool' },
  ErrorCode: {
    InternalError: 'InternalError',
    MethodNotFound: 'MethodNotFound'
  },
  McpError: vi.fn().mockImplementation((code, message) => {
    const error = new Error(message);
    (error as any).code = code;
    return error;
  })
}));

const mockExistsSync = vi.mocked(existsSync);
const mockSpawn = vi.mocked(spawn);
const mockHomedir = vi.mocked(homedir);

// Helper to setup Server mock with proper handlers
function setupServerMock() {
  let errorHandler: any = null;
  vi.mocked(Server).mockImplementation(() => {
    const instance = {
      setRequestHandler: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(),
      onerror: null
    } as any;
    Object.defineProperty(instance, 'onerror', {
      get() { return errorHandler; },
      set(handler) { errorHandler = handler; },
      enumerable: true,
      configurable: true
    });
    return instance;
  });
}

// Helper to create mock process
function createMockProcess() {
  const mockProcess = new EventEmitter() as any;
  mockProcess.stdout = new EventEmitter();
  mockProcess.stderr = new EventEmitter();
  mockProcess.stdout.on = vi.fn((event, handler) => {
    mockProcess.stdout[event] = handler;
  });
  mockProcess.stderr.on = vi.fn((event, handler) => {
    mockProcess.stderr[event] = handler;
  });
  return mockProcess;
}

describe('Error Handling Tests', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Re-establish the Server mock after resetModules
    setupServerMock();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env = { ...originalEnv };
    delete process.env.CLAUDE_CLI_NAME;
    delete process.env.MCP_CLAUDE_DEBUG;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  describe('CallToolRequest Error Cases', () => {
    it('should throw error for unknown tool name', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;

      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;

      const callToolCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'callTool'
      );

      const handler = callToolCall[1];

      await expect(
        handler({
          params: {
            name: 'unknown_tool',
            arguments: {}
          }
        })
      ).rejects.toThrow('Tool unknown_tool not found');
    });

    it('should handle timeout errors', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;
      const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;

      // Find the callTool handler
      let callToolHandler: any;
      for (const call of mockServerInstance.setRequestHandler.mock.calls) {
        if (call[0].name === 'callTool') {
          callToolHandler = call[1];
          break;
        }
      }

      // Mock spawn
      mockSpawn.mockImplementation(() => {
        const mockProcess = createMockProcess();

        setImmediate(() => {
          const timeoutError: any = new Error('ETIMEDOUT');
          timeoutError.code = 'ETIMEDOUT';
          mockProcess.emit('error', timeoutError);
        });

        return mockProcess;
      });

      // Use platform-appropriate path
      const workFolder = process.platform === 'win32' ? 'C:\\tmp' : '/tmp';

      // Call handler
      try {
        await callToolHandler({
          params: {
            name: 'claude_code',
            arguments: {
              prompt: 'test',
              workFolder
            }
          }
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        // Check if McpError was called with the timeout message
        expect(McpError).toHaveBeenCalledWith(
          'InternalError',
          expect.stringMatching(/Claude CLI command timed out/)
        );
      }
    });

    it('should handle invalid argument types', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;

      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;

      const callToolCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'callTool'
      );

      const handler = callToolCall[1];

      await expect(
        handler({
          params: {
            name: 'claude_code',
            arguments: 'invalid-should-be-object'
          }
        })
      ).rejects.toThrow();
    });

    it('should include CLI error details in error message', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;

      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;

      const callToolCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'callTool'
      );

      const handler = callToolCall[1];

      // Create a simple mock process
      mockSpawn.mockImplementation(() => {
        const mockProcess = createMockProcess();

        // Emit close event after data is sent
        setTimeout(() => {
          mockProcess.emit('close', 1);
        }, 10);

        return mockProcess;
      });

      // Use platform-appropriate path
      const workFolder = process.platform === 'win32' ? 'C:\\tmp' : '/tmp';

      await expect(
        handler({
          params: {
            name: 'claude_code',
            arguments: {
              prompt: 'test',
              workFolder
            }
          }
        })
      ).rejects.toThrow();
    });
  });

  describe('Process Spawn Error Cases', () => {
    it('should handle spawn ENOENT error', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { spawnAsync } = module;

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const promise = spawnAsync('nonexistent-command', []);

      // Simulate ENOENT error
      setTimeout(() => {
        const error: any = new Error('spawn ENOENT');
        error.code = 'ENOENT';
        error.path = 'nonexistent-command';
        error.syscall = 'spawn';
        mockProcess.emit('error', error);
      }, 10);

      await expect(promise).rejects.toThrow('Spawn error');
    });

    it('should handle generic spawn errors', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { spawnAsync } = module;

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const promise = spawnAsync('test', []);

      // Simulate generic error
      setTimeout(() => {
        mockProcess.emit('error', new Error('Generic spawn error'));
      }, 10);

      await expect(promise).rejects.toThrow('Generic spawn error');
    });

    it('should accumulate stderr output before error', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { spawnAsync } = module;

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      let stderrHandler: any;

      mockProcess.stdout.on = vi.fn();
      mockProcess.stderr.on = vi.fn((event, handler) => {
        if (event === 'data') stderrHandler = handler;
      });

      mockSpawn.mockReturnValue(mockProcess);

      const promise = spawnAsync('test', []);

      // Simulate stderr data then error
      setTimeout(() => {
        stderrHandler('error line 1\n');
        stderrHandler('error line 2\n');
        mockProcess.emit('error', new Error('Command failed'));
      }, 10);

      await expect(promise).rejects.toThrow('error line 1\nerror line 2');
    });
  });

  describe('Server Initialization Errors', () => {
    it('should handle CLI path not found gracefully', async () => {
      // Mock no CLI found anywhere
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;

      const server = new ClaudeCodeServer();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Claude CLI not found')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle server connection errors', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      // Set up mock to reject on connect before importing
      vi.mocked(Server).mockImplementation(() => {
        const instance = {
          setRequestHandler: vi.fn(),
          connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
          close: vi.fn(),
          onerror: null
        } as any;
        return instance;
      });

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;

      const server = new ClaudeCodeServer();

      await expect(server.run()).rejects.toThrow('Connection failed');
    });
  });
});
