import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { EventEmitter } from 'node:events';

// Store original process.env
const originalEnv = { ...process.env };

// Mock dependencies - these are hoisted
vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/user'),
  tmpdir: vi.fn(() => '/tmp'),
}));
vi.mock('@modelcontextprotocol/sdk/server/stdio.js');
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
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(function() {
    return {
      setRequestHandler: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(),
      onerror: undefined,
    };
  }),
}));

// Mock package.json
vi.mock('../../package.json', () => ({
  default: { version: '1.0.0-test' }
}));

// Get mocked functions
const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
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
      onerror: undefined
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

describe('ClaudeCodeServer Unit Tests', () => {
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Re-establish the Server mock after resetModules
    setupServerMock();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Reset env to original
    process.env = { ...originalEnv };
    delete process.env.CLAUDE_CLI_PATH;
    delete process.env.CLAUDE_CLI_NAME;
    delete process.env.MCP_CLAUDE_DEBUG;
    mockReadFileSync.mockImplementation(() => {
      throw new Error('not found');
    });
    mockMkdirSync.mockReturnValue(undefined as any);
    mockWriteFileSync.mockReturnValue(undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  describe('debugLog function', () => {
    it('should log when debug mode is enabled', async () => {
      process.env.MCP_CLAUDE_DEBUG = 'true';
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { debugLog } = module;

      // Clear spy after module load (which logs startup messages)
      consoleErrorSpy.mockClear();

      debugLog('Test message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Test message');
    });

    it('should not log when debug mode is disabled', async () => {
      process.env.MCP_CLAUDE_DEBUG = 'false';
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { debugLog } = module;

      // Clear spy after module load
      consoleErrorSpy.mockClear();

      debugLog('Test message');
      // With debug mode off, debugLog should not call console.error
      expect(consoleErrorSpy).not.toHaveBeenCalledWith('Test message');
    });
  });

  describe('findClaudeCli function', () => {
    it('should return local path when it exists', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockImplementation((path) => {
        // Use string comparison that works on both platforms
        const pathStr = String(path);
        if (pathStr.includes('.claude') && pathStr.includes('local') && pathStr.includes('claude')) {
          return true;
        }
        return false;
      });

      const module = await import('../server.js');
      const { findClaudeCli } = module;

      const result = findClaudeCli();
      // Path should contain .claude/local/claude (platform-independent check)
      expect(result).toContain('.claude');
      expect(result).toContain('local');
      expect(result).toContain('claude');
    });

    it('should fallback to PATH when local does not exist', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(false);

      const module = await import('../server.js');
      const { findClaudeCli } = module;

      const result = findClaudeCli();
      expect(result).toBe('claude');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Claude CLI not found at local paths')
      );
    });

    it('should use CLAUDE_CLI_PATH when set and file exists', async () => {
      process.env.CLAUDE_CLI_PATH = '/custom/path/to/claude';
      mockExistsSync.mockImplementation((p) => {
        if (p === '/custom/path/to/claude') return true;
        return false;
      });

      const module = await import('../server.js');
      const { findClaudeCli } = module;

      const result = findClaudeCli();
      expect(result).toBe('/custom/path/to/claude');
    });

    it('should warn and continue when CLAUDE_CLI_PATH is set but file missing', async () => {
      process.env.CLAUDE_CLI_PATH = '/nonexistent/claude';
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(false);

      const module = await import('../server.js');
      const { findClaudeCli } = module;

      const result = findClaudeCli();
      expect(result).toBe('claude');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('CLAUDE_CLI_PATH is set to')
      );
    });

    it('should use custom name from CLAUDE_CLI_NAME', async () => {
      process.env.CLAUDE_CLI_NAME = 'my-claude';
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(false);

      const module = await import('../server.js');
      const { findClaudeCli } = module;

      const result = findClaudeCli();
      expect(result).toBe('my-claude');
    });

    it('should use absolute path from CLAUDE_CLI_NAME', async () => {
      // Use platform-appropriate absolute path
      const absolutePath = process.platform === 'win32'
        ? 'C:\\absolute\\path\\to\\claude'
        : '/absolute/path/to/claude';
      process.env.CLAUDE_CLI_NAME = absolutePath;
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { findClaudeCli } = module;

      const result = findClaudeCli();
      expect(result).toBe(absolutePath);
    });

    it('should throw error for relative paths in CLAUDE_CLI_NAME', async () => {
      process.env.CLAUDE_CLI_NAME = './relative/path/claude';
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { findClaudeCli } = module;

      expect(() => findClaudeCli()).toThrow('Invalid CLAUDE_CLI_NAME: Relative paths are not allowed');
    });

    it('should throw error for paths with ../ in CLAUDE_CLI_NAME', async () => {
      process.env.CLAUDE_CLI_NAME = '../relative/path/claude';
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { findClaudeCli } = module;

      expect(() => findClaudeCli()).toThrow('Invalid CLAUDE_CLI_NAME: Relative paths are not allowed');
    });
  });

  describe('spawnAsync function', () => {
    let mockProcess: any;

    beforeEach(() => {
      mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);
    });

    it('should execute command successfully', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { spawnAsync } = module;

      const promise = spawnAsync('echo', ['test']);

      // Simulate successful execution
      setTimeout(() => {
        mockProcess.stdout['data']('test output');
        mockProcess.stderr['data']('');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await promise;
      expect(result).toEqual({
        stdout: 'test output',
        stderr: ''
      });
    });

    it('should handle command failure', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { spawnAsync } = module;

      const promise = spawnAsync('false', []);

      // Simulate failed execution
      setTimeout(() => {
        mockProcess.stderr['data']('error output');
        mockProcess.emit('close', 1);
      }, 10);

      await expect(promise).rejects.toThrow('Command failed with exit code 1');
    });

    it('should handle spawn error', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { spawnAsync } = module;

      const promise = spawnAsync('nonexistent', []);

      // Simulate spawn error
      setTimeout(() => {
        const error: any = new Error('spawn error');
        error.code = 'ENOENT';
        error.path = 'nonexistent';
        error.syscall = 'spawn';
        mockProcess.emit('error', error);
      }, 10);

      await expect(promise).rejects.toThrow('Spawn error');
    });

    it('should respect timeout option', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { spawnAsync } = module;

      spawnAsync('sleep', ['10'], { timeout: 100 });

      expect(mockSpawn).toHaveBeenCalledWith('sleep', ['10'], expect.objectContaining({
        timeout: 100
      }));
    });

    it('should use provided cwd option', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { spawnAsync } = module;

      spawnAsync('ls', [], { cwd: '/tmp' });

      expect(mockSpawn).toHaveBeenCalledWith('ls', [], expect.objectContaining({
        cwd: '/tmp'
      }));
    });
  });

  describe('ClaudeCodeServer class', () => {
    it('should initialize with correct settings', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;

      const server = new ClaudeCodeServer();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Setup] Using Claude CLI command/path:')
      );
    });

    it('should set up tool handlers', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;

      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;

      expect(mockServerInstance.setRequestHandler).toHaveBeenCalled();
    });

    it('should set up error handler', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;

      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;

      // Get the error handler that was set
      const errorHandler = mockServerInstance.onerror;
      expect(errorHandler).toBeDefined();

      // Test error handler
      if (errorHandler) {
        errorHandler(new Error('Test error'));
        expect(consoleErrorSpy).toHaveBeenCalledWith('[Error]', expect.any(Error));
      }
    });

    it('should handle SIGINT', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      // Track close calls
      let closeWasCalled = false;
      vi.mocked(Server).mockImplementation(() => {
        const instance = {
          setRequestHandler: vi.fn(),
          connect: vi.fn(),
          close: vi.fn(() => { closeWasCalled = true; }),
          onerror: undefined
        } as any;
        return instance;
      });

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const server = new ClaudeCodeServer();

      // Get the most recent SIGINT handler
      const sigintHandlers = process.listeners('SIGINT');
      const sigintHandler = sigintHandlers[sigintHandlers.length - 1] as any;

      if (sigintHandler) {
        await sigintHandler();
        expect(closeWasCalled).toBe(true);
        expect(exitSpy).toHaveBeenCalledWith(0);
      }

      exitSpy.mockRestore();
    });
  });

  describe('Tool handler implementation', () => {
    it('should handle ListToolsRequest', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;

      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;

      // Find the ListToolsRequest handler
      const listToolsCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'listTools'
      );

      expect(listToolsCall).toBeDefined();

      // Test the handler
      const handler = listToolsCall[1];
      const result = await handler();

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('claude_code');
      expect(result.tools[0].description).toContain('Claude Code Agent');
    });

    it('should handle CallToolRequest', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;

      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;

      // Find the CallToolRequest handler
      const callToolCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'callTool'
      );

      expect(callToolCall).toBeDefined();

      // Create a mock process for the tool execution
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      // Test the handler
      const handler = callToolCall[1];
      const promise = handler({
        params: {
          name: 'claude_code',
          arguments: {
            prompt: 'test prompt',
            workFolder: process.platform === 'win32' ? 'C:\\tmp' : '/tmp'
          }
        }
      });

      // Simulate successful execution
      setTimeout(() => {
        mockProcess.stdout['data']('tool output');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await promise;
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('tool output');
    });

    it('should inject first-call context and persist Claude session mapping', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockImplementation((value) => {
        const path = String(value);
        return path === '/home/user/.claude/local/claude' || path === '/tmp';
      });

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;
      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;
      const callToolCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'callTool'
      );
      const handler = callToolCall[1];
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const promise = handler({
        params: {
          name: 'claude_code',
          arguments: {
            prompt: '/review the diff',
            workFolder: '/tmp',
            sessionId: 'parent-session',
            messages: [
              { role: 'user', content: 'Please inspect carefully.' },
              { role: 'assistant', content: 'I will review the code.' },
            ],
          },
        },
      });

      setTimeout(() => {
        mockProcess.stdout['data'](
          JSON.stringify({
            type: 'result',
            result: 'done',
            session_id: 'claude-session',
          })
        );
        mockProcess.emit('close', 0);
      }, 10);

      const result = await promise;
      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--output-format');
      expect(spawnArgs).not.toContain('--resume');
      expect(spawnArgs.at(-1)).toContain('<conversation_context>');
      expect(spawnArgs.at(-1)).toContain('@review the diff');
      expect(result.content[0].text).toBe('done');
      expect(result.content[1].text).toContain('claude-session');
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/home/user/.config/claude-code-mcp/sessions.json',
        expect.stringContaining('claude-session'),
        { mode: 0o600 }
      );
    });

    it('should resume existing Claude sessions by parent sessionId', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockImplementation((value) => {
        const path = String(value);
        return (
          path === '/home/user/.claude/local/claude' ||
          path === '/tmp' ||
          path === '/home/user/.config/claude-code-mcp/sessions.json'
        );
      });
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          'parent-session': {
            claudeSessionId: 'claude-old',
            updatedAt: new Date().toISOString(),
          },
        }) as any
      );

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;
      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;
      const callToolCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'callTool'
      );
      const handler = callToolCall[1];
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const promise = handler({
        params: {
          name: 'claude_code',
          arguments: {
            prompt: 'continue',
            workFolder: '/tmp',
            sessionId: 'parent-session',
          },
        },
      });

      setTimeout(() => {
        mockProcess.stdout['data'](
          JSON.stringify({
            type: 'result',
            result: 'continued',
            session_id: 'claude-new',
          })
        );
        mockProcess.emit('close', 0);
      }, 10);

      await promise;
      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--resume');
      expect(spawnArgs).toContain('claude-old');
      expect(spawnArgs.at(-1)).toBe('continue');
    });

    it('should handle non-existent workFolder', async () => {
      // Create a non-existent path that works on both platforms
      const nonExistentPath = process.platform === 'win32'
        ? 'C:\\nonexistent_path_12345'
        : '/nonexistent_path_12345';

      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockImplementation((path) => {
        const pathStr = String(path);
        // Make the CLI path exist but the workFolder not exist
        if (pathStr.includes('.claude')) return true;
        if (pathStr.includes('nonexistent_path_12345')) return false;
        return false;
      });

      // Enable debug mode to see warning messages
      process.env.MCP_CLAUDE_DEBUG = 'true';

      const module = await import('../server.js');
      const { ClaudeCodeServer } = module;
      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;

      // Find the CallToolRequest handler
      const callToolCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'callTool'
      );

      const handler = callToolCall[1];

      // Create mock response
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const promise = handler({
        params: {
          name: 'claude_code',
          arguments: {
            prompt: 'test',
            workFolder: nonExistentPath
          }
        }
      });

      // Simulate execution
      setTimeout(() => {
        mockProcess.emit('close', 0);
      }, 10);

      await promise;

      // Check that a warning was logged about the non-existent workFolder
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Warning] Specified workFolder does not exist')
      );
    });
  });
});
