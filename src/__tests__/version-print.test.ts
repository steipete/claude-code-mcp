import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MCPTestClient } from './utils/mcp-client.js';
import { getSharedMock } from './utils/persistent-mock.js';

describe('Version Print on First Use', () => {
  let client: MCPTestClient;
  let testDir: string;
  let consoleErrorSpy: any;
  const serverPath = 'dist/server.js';

  beforeEach(async () => {
    // Ensure mock exists
    await getSharedMock();
    
    // Create a temporary directory for test files
    testDir = mkdtempSync(join(tmpdir(), 'claude-code-test-'));
    
    // Spy on console.error
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Initialize MCP client with custom binary name using absolute path
    client = new MCPTestClient(serverPath, {
      CLAUDE_CLI_NAME: '/tmp/claude-code-test-mock/claudeMocked',
    });
    
    await client.connect();
  });

  afterEach(async () => {
    // Disconnect client
    await client.disconnect();
    
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });
    
    // Restore console.error spy
    consoleErrorSpy.mockRestore();
  });

  it('should print version and startup time only on first use', async () => {
    // First tool call
    await client.callTool('claude_code', {
      prompt: 'echo "test 1"',
      workFolder: testDir,
    });
    
    // Find the version print in the console.error calls
    const findVersionCall = (calls: any[][]) => {
      return calls.find(call => {
        const str = call[1] || call[0]; // message might be first or second param
        return typeof str === 'string' && str.includes('claude_code v') && str.includes('started at');
      });
    };
    
    // Check that version was printed on first use
    const versionCall = findVersionCall(consoleErrorSpy.mock.calls);
    expect(versionCall).toBeDefined();
    expect(versionCall![1]).toMatch(/claude_code v[0-9]+\.[0-9]+\.[0-9]+ started at \d{4}-\d{2}-\d{2}T/);
    
    // Clear the spy but keep the spy active
    consoleErrorSpy.mockClear();
    
    // Second tool call
    await client.callTool('claude_code', {
      prompt: 'echo "test 2"',
      workFolder: testDir,
    });
    
    // Check that version was NOT printed on second use
    const secondVersionCall = findVersionCall(consoleErrorSpy.mock.calls);
    expect(secondVersionCall).toBeUndefined();
    
    // Third tool call
    await client.callTool('claude_code', {
      prompt: 'echo "test 3"',
      workFolder: testDir,
    });
    
    // Should still not have been called with version print
    const thirdVersionCall = findVersionCall(consoleErrorSpy.mock.calls);
    expect(thirdVersionCall).toBeUndefined();
  });
});