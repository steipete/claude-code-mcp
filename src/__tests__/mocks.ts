import { vi } from 'vitest';

// Mock Claude CLI responses
export const mockClaudeResponse = (stdout: string, stderr = '', exitCode = 0) => {
  return {
    stdout: { on: vi.fn((event, cb) => event === 'data' && cb(stdout)) },
    stderr: { on: vi.fn((event, cb) => event === 'data' && cb(stderr)) },
    on: vi.fn((event, cb) => {
      if (event === 'exit') setTimeout(() => cb(exitCode), 10);
    }),
  };
};

// Mock MCP request builder
export const createMCPRequest = (tool: string, args: any, id = 1) => ({
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name: tool,
    arguments: args,
  },
  id,
});

// Mock file system operations
export const setupTestEnvironment = () => {
  const testFiles = new Map<string, string>();
  
  return {
    writeFile: (path: string, content: string) => testFiles.set(path, content),
    readFile: (path: string) => testFiles.get(path),
    exists: (path: string) => testFiles.has(path),
    cleanup: () => testFiles.clear(),
  };
};