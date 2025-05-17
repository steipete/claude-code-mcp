import { vi } from 'vitest';
// Mock Claude CLI responses
export const mockClaudeResponse = (stdout, stderr = '', exitCode = 0) => {
    return {
        stdout: { on: vi.fn((event, cb) => event === 'data' && cb(stdout)) },
        stderr: { on: vi.fn((event, cb) => event === 'data' && cb(stderr)) },
        on: vi.fn((event, cb) => {
            if (event === 'exit')
                setTimeout(() => cb(exitCode), 10);
        }),
    };
};
// Mock MCP request builder
export const createMCPRequest = (tool, args, id = 1) => ({
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
    const testFiles = new Map();
    return {
        writeFile: (path, content) => testFiles.set(path, content),
        readFile: (path) => testFiles.get(path),
        exists: (path) => testFiles.has(path),
        cleanup: () => testFiles.clear(),
    };
};
