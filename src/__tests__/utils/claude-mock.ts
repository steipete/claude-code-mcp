import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Mock Claude CLI for testing
 * This creates a fake Claude CLI that can be used during testing
 */
export class ClaudeMock {
  private mockPath: string;
  private mockDir: string;
  private scriptPath: string;
  private responses = new Map<string, string>();

  constructor(binaryName: string = 'claude') {
    // Use platform-appropriate temp directory
    this.mockDir = join(tmpdir(), 'claude-code-test-mock');
    this.scriptPath = join(this.mockDir, `${binaryName}.js`);

    // On Windows, use a batch wrapper; on Unix, use the script directly
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      this.mockPath = join(this.mockDir, `${binaryName}.cmd`);
    } else {
      this.mockPath = this.scriptPath;
    }
  }

  /**
   * Get the mock directory path
   */
  getMockDir(): string {
    return this.mockDir;
  }

  /**
   * Get the executable path to use for CLAUDE_CLI_NAME
   */
  getMockPath(): string {
    return this.mockPath;
  }

  /**
   * Get the script path
   */
  getScriptPath(): string {
    return this.scriptPath;
  }

  /**
   * Setup the mock Claude CLI
   */
  async setup(): Promise<void> {
    const dir = dirname(this.scriptPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Create a Node.js script that works on all platforms
    const mockScript = `#!/usr/bin/env node
// Mock Claude CLI for testing

// Parse arguments
let prompt = '';
const args = process.argv.slice(2);

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-p' || args[i] === '--prompt') {
    prompt = args[i + 1] || '';
    i++;
  }
  // Skip other flags
}

// Mock responses based on prompt
const promptLower = prompt.toLowerCase();

if (promptLower.includes('error')) {
  console.error('Error: Mock error response');
  process.exit(1);
}

if (promptLower.includes('create')) {
  console.log('Created file successfully');
  process.exit(0);
}

if (promptLower.includes('git') && promptLower.includes('commit')) {
  console.log('Committed changes successfully');
  process.exit(0);
}

console.log('Command executed successfully');
process.exit(0);
`;

    writeFileSync(this.scriptPath, mockScript);

    // On Windows, create a batch wrapper that calls node with the script
    if (process.platform === 'win32') {
      // Use %~dp0 to get the directory of the batch file
      const batchWrapper = `@echo off
node "%~dp0claudeMocked.js" %*
`;
      writeFileSync(this.mockPath, batchWrapper);
    } else {
      // Make executable on Unix
      const { chmod } = await import('node:fs/promises');
      await chmod(this.scriptPath, 0o755);
    }
  }

  /**
   * Cleanup the mock Claude CLI
   */
  async cleanup(): Promise<void> {
    const { rm } = await import('node:fs/promises');
    await rm(this.mockPath, { force: true });
  }

  /**
   * Add a mock response for a specific prompt pattern
   */
  addResponse(pattern: string, response: string): void {
    this.responses.set(pattern, response);
  }
}