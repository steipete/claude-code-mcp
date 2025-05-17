import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { EventEmitter } from 'node:events';

// Mock dependencies
vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('node:os');
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

// Re-import after mocks
const mockExistsSync = vi.mocked(existsSync);
const mockSpawn = vi.mocked(spawn);
const mockHomedir = vi.mocked(homedir);

// Module loading will happen in tests

describe('ClaudeCodeServer Unit Tests', () => {
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;
  let originalEnv: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    originalEnv = { ...process.env };
    // Reset env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    process.env = originalEnv;
  });

  describe('debugLog function', () => {
    it('should log when debug mode is enabled', async () => {
      process.env.MCP_CLAUDE_DEBUG = 'true';
      const module = await import('../server.js');
      // @ts-ignore - accessing private function for testing
      const { debugLog } = module;
      
      debugLog('Test message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Test message');
    });

    it('should not log when debug mode is disabled', async () => {
      // Reset modules to clear cache
      vi.resetModules();
      consoleErrorSpy.mockClear();
      process.env.MCP_CLAUDE_DEBUG = 'false';
      const module = await import('../server.js');
      // @ts-ignore
      const { debugLog } = module;
      
      debugLog('Test message');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('findClaudeCli function', () => {
    it('should return local path when it exists', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockImplementation((path) => {
        // Mock returns true for real CLI path
        if (path === '/home/user/.claude/local/claude') return true;
        return false;
      });
      
      const module = await import('../server.js');
      // @ts-ignore
      const findClaudeCli = module.default?.findClaudeCli || module.findClaudeCli;
      
      const result = findClaudeCli();
      expect(result).toBe('/home/user/.claude/local/claude');
    });

    it('should fallback to PATH when local does not exist', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(false);
      
      const module = await import('../server.js');
      // @ts-ignore
      const findClaudeCli = module.default?.findClaudeCli || module.findClaudeCli;
      
      const result = findClaudeCli();
      expect(result).toBe('claude');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Claude CLI not found at ~/.claude/local/claude')
      );
    });

    it('should use custom name from CLAUDE_CLI_NAME', async () => {
      process.env.CLAUDE_CLI_NAME = 'my-claude';
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(false);
      
      const module = await import('../server.js');
      // @ts-ignore
      const findClaudeCli = module.default?.findClaudeCli || module.findClaudeCli;
      
      const result = findClaudeCli();
      expect(result).toBe('my-claude');
    });

    it('should use absolute path from CLAUDE_CLI_NAME', async () => {
      process.env.CLAUDE_CLI_NAME = '/absolute/path/to/claude';
      
      const module = await import('../server.js');
      // @ts-ignore
      const findClaudeCli = module.default?.findClaudeCli || module.findClaudeCli;
      
      const result = findClaudeCli();
      expect(result).toBe('/absolute/path/to/claude');
    });

    it('should throw error for relative paths in CLAUDE_CLI_NAME', async () => {
      process.env.CLAUDE_CLI_NAME = './relative/path/claude';
      
      const module = await import('../server.js');
      // @ts-ignore
      const findClaudeCli = module.default?.findClaudeCli || module.findClaudeCli;
      
      expect(() => findClaudeCli()).toThrow('Invalid CLAUDE_CLI_NAME: Relative paths are not allowed');
    });

    it('should throw error for paths with ../ in CLAUDE_CLI_NAME', async () => {
      process.env.CLAUDE_CLI_NAME = '../relative/path/claude';
      
      const module = await import('../server.js');
      // @ts-ignore
      const findClaudeCli = module.default?.findClaudeCli || module.findClaudeCli;
      
      expect(() => findClaudeCli()).toThrow('Invalid CLAUDE_CLI_NAME: Relative paths are not allowed');
    });
  });

  describe('spawnAsync function', () => {
    let mockProcess: any;
    
    beforeEach(() => {
      // Create a mock process
      mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdout.on = vi.fn((event, handler) => {
        mockProcess.stdout[event] = handler;
      });
      mockProcess.stderr.on = vi.fn((event, handler) => {
        mockProcess.stderr[event] = handler;
      });
      mockSpawn.mockReturnValue(mockProcess);
    });

    it('should execute command successfully', async () => {
      const module = await import('../server.js');
      // @ts-ignore
      const { spawnAsync } = module;
      
      // mockProcess is already defined in the outer scope
      
      // Start the async operation
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
      const module = await import('../server.js');
      // @ts-ignore
      const { spawnAsync } = module;
      
      // mockProcess is already defined in the outer scope
      
      // Start the async operation
      const promise = spawnAsync('false', []);
      
      // Simulate failed execution
      setTimeout(() => {
        mockProcess.stderr['data']('error output');
        mockProcess.emit('close', 1);
      }, 10);
      
      await expect(promise).rejects.toThrow('Command failed with exit code 1');
    });

    it('should handle spawn error', async () => {
      const module = await import('../server.js');
      // @ts-ignore
      const { spawnAsync } = module;
      
      // mockProcess is already defined in the outer scope
      
      // Start the async operation
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
      const module = await import('../server.js');
      // @ts-ignore
      const { spawnAsync } = module;
      
      const result = spawnAsync('sleep', ['10'], { timeout: 100 });
      
      expect(mockSpawn).toHaveBeenCalledWith('sleep', ['10'], expect.objectContaining({
        timeout: 100
      }));
    });

    it('should use provided cwd option', async () => {
      const module = await import('../server.js');
      // @ts-ignore
      const { spawnAsync } = module;
      
      const result = spawnAsync('ls', [], { cwd: '/tmp' });
      
      expect(mockSpawn).toHaveBeenCalledWith('ls', [], expect.objectContaining({
        cwd: '/tmp'
      }));
    });
  });

  describe('ClaudeCodeServer class', () => {
    it('should initialize with correct settings', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);
      
      // Set up Server mock before resetting modules
      vi.mocked(Server).mockImplementation(() => ({
        setRequestHandler: vi.fn(),
        connect: vi.fn(),
        close: vi.fn(),
        onerror: undefined,
      }) as any);
      
      const module = await import('../server.js');
      // @ts-ignore
      const { ClaudeCodeServer } = module;
      
      const server = new ClaudeCodeServer();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Setup] Using Claude CLI command/path:')
      );
    });

    it('should set up tool handlers', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);
      
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const mockSetRequestHandler = vi.fn();
      vi.mocked(Server).mockImplementation(() => ({
        setRequestHandler: mockSetRequestHandler,
        connect: vi.fn(),
        close: vi.fn(),
        onerror: undefined,
      }) as any);
      
      const module = await import('../server.js');
      // @ts-ignore
      const { ClaudeCodeServer } = module;
      
      const server = new ClaudeCodeServer();
      
      expect(mockSetRequestHandler).toHaveBeenCalled();
    });

    it('should set up error handler', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);
      
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
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
      
      const module = await import('../server.js');
      // @ts-ignore
      const { ClaudeCodeServer } = module;
      
      const server = new ClaudeCodeServer();
      
      // Test error handler
      errorHandler(new Error('Test error'));
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Error]', expect.any(Error));
    });

    it('should handle SIGINT', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);
      
      // Set up Server mock first
      vi.mocked(Server).mockImplementation(() => ({
        setRequestHandler: vi.fn(),
        connect: vi.fn(),
        close: vi.fn(),
        onerror: undefined,
      }) as any);
      
      const module = await import('../server.js');
      // @ts-ignore
      const { ClaudeCodeServer } = module;
      
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;
      
      // Emit SIGINT
      const sigintHandler = process.listeners('SIGINT').slice(-1)[0] as any;
      await sigintHandler();
      
      expect(mockServerInstance.close).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
      
      exitSpy.mockRestore();
    });
  });

  describe('Tool handler implementation', () => {
    // Define setupServerMock for this describe block
    let errorHandler: any = null;
    function setupServerMock() {
      errorHandler = null;
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

    it('should handle ListToolsRequest', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);
      
      // Use the setupServerMock function from the beginning of the file
      setupServerMock();
      
      const module = await import('../server.js');
      // @ts-ignore
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
      
      // Set up Server mock
      setupServerMock();
      
      const module = await import('../server.js');
      // @ts-ignore
      const { ClaudeCodeServer } = module;
      
      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;
      
      // Find the CallToolRequest handler
      const callToolCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'callTool'
      );
      
      expect(callToolCall).toBeDefined();
      
      // Create a mock process for the tool execution
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdout.on = vi.fn((event, handler) => {
        if (event === 'data') mockProcess.stdout['data'] = handler;
      });
      mockProcess.stderr.on = vi.fn((event, handler) => {
        if (event === 'data') mockProcess.stderr['data'] = handler;
      });
      
      mockSpawn.mockReturnValue(mockProcess);
      
      // Test the handler
      const handler = callToolCall[1];
      const promise = handler({
        params: {
          name: 'claude_code',
          arguments: {
            prompt: 'test prompt',
            workFolder: '/tmp'
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

    it('should handle non-existent workFolder', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockImplementation((path) => {
        // Make the CLI path exist but the workFolder not exist
        if (String(path).includes('.claude')) return true;
        if (path === '/nonexistent') return false;
        return false;
      });
      
      // Enable debug mode to see warning messages
      process.env.MCP_CLAUDE_DEBUG = 'true';
      
      // Set up Server mock
      setupServerMock();
      
      const module = await import('../server.js');
      // @ts-ignore
      const { ClaudeCodeServer } = module;
      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;
      
      // Find the CallToolRequest handler
      const callToolCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'callTool'
      );
      
      const handler = callToolCall[1];
      
      // Create mock response
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdout.on = vi.fn();
      mockProcess.stderr.on = vi.fn();
      mockSpawn.mockReturnValue(mockProcess);
      
      const promise = handler({
        params: {
          name: 'claude_code',
          arguments: {
            prompt: 'test',
            workFolder: '/nonexistent'
          }
        }
      });
      
      // Simulate execution
      setTimeout(() => {
        mockProcess.emit('close', 0);
      }, 10);
      
      await promise;
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Warning] Specified workFolder does not exist: /nonexistent.')
      );
    });
  });
});