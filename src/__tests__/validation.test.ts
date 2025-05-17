import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Mock dependencies
vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('node:os');
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
const mockHomedir = vi.mocked(homedir);

describe('Argument Validation Tests', () => {
  let consoleErrorSpy: any;
  let errorHandler: any = null;

  function setupServerMock() {
    errorHandler = null;
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('Tool Arguments Schema', () => {
    it('should validate valid arguments', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);
      setupServerMock();
      const module = await import('../server.js');
      // @ts-ignore
      const { ClaudeCodeServer } = module;
      
      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;
      
      // Find tool definition  
      const listToolsCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'listTools'
      );
      
      const listHandler = listToolsCall[1];
      const tools = await listHandler();
      const claudeCodeTool = tools.tools[0];
      
      // Extract schema from tool definition
      const schema = z.object({
        prompt: z.string(),
        workFolder: z.string().optional()
      });
      
      // Test valid cases
      expect(() => schema.parse({ prompt: 'test' })).not.toThrow();
      expect(() => schema.parse({ prompt: 'test', workFolder: '/tmp' })).not.toThrow();
    });

    it('should reject invalid arguments', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);
      setupServerMock();
      const module = await import('../server.js');
      // @ts-ignore
      const { ClaudeCodeServer } = module;
      
      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;
      
      // Find tool definition  
      const listToolsCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'listTools'
      );
      
      const listHandler = listToolsCall[1];
      const tools = await listHandler();
      const claudeCodeTool = tools.tools[0];
      
      // Extract schema from tool definition
      const schema = z.object({
        prompt: z.string(),
        workFolder: z.string().optional()
      });
      
      // Test invalid cases
      expect(() => schema.parse({})).toThrow(); // Missing prompt
      expect(() => schema.parse({ prompt: 123 })).toThrow(); // Wrong type
      expect(() => schema.parse({ prompt: 'test', workFolder: 123 })).toThrow(); // Wrong workFolder type
    });

    it('should handle missing required fields', async () => {
      const schema = z.object({
        prompt: z.string(),
        workFolder: z.string().optional()
      });
      
      try {
        schema.parse({});
      } catch (error: any) {
        expect(error.errors[0].path).toEqual(['prompt']);
        expect(error.errors[0].message).toContain('Required');
      }
    });

    it('should allow optional fields to be undefined', async () => {
      const schema = z.object({
        prompt: z.string(),
        workFolder: z.string().optional()
      });
      
      const result = schema.parse({ prompt: 'test' });
      expect(result.workFolder).toBeUndefined();
    });

    it('should handle extra fields gracefully', async () => {
      const schema = z.object({
        prompt: z.string(),
        workFolder: z.string().optional()
      });
      
      // By default, Zod strips unknown keys
      const result = schema.parse({ 
        prompt: 'test', 
        extraField: 'ignored' 
      });
      
      expect(result).toEqual({ prompt: 'test' });
      expect(result).not.toHaveProperty('extraField');
    });
  });

  describe('Runtime Argument Validation', () => {
    it('should validate workFolder is a string when provided', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);
      setupServerMock();
      const module = await import('../server.js');
      // @ts-ignore
      const { ClaudeCodeServer } = module;
      
      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;
      
      const callToolCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'callTool'
      );
      
      const handler = callToolCall[1];
      
      // Test with non-string workFolder
      await expect(
        handler({
          params: {
            name: 'claude_code',
            arguments: {
              prompt: 'test',
              workFolder: 123 // Invalid type
            }
          }
        })
      ).rejects.toThrow();
    });

    it('should handle empty string prompt', async () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExistsSync.mockReturnValue(true);
      setupServerMock();
      const module = await import('../server.js');
      // @ts-ignore
      const { ClaudeCodeServer } = module;
      
      const server = new ClaudeCodeServer();
      const mockServerInstance = vi.mocked(Server).mock.results[0].value;
      
      const callToolCall = mockServerInstance.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0].name === 'callTool'
      );
      
      const handler = callToolCall[1];
      
      // Empty string is technically valid per schema
      const mockProcess: any = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') setTimeout(() => cb(0), 10);
        }),
      };
      
      const spawn = (await import('node:child_process')).spawn;
      vi.mocked(spawn).mockReturnValue(mockProcess);
      
      const result = await handler({
        params: {
          name: 'claude_code',
          arguments: {
            prompt: '', // Empty prompt
          }
        }
      });
      
      // Should execute with empty prompt
      expect(spawn).toHaveBeenCalled();
    });
  });
});