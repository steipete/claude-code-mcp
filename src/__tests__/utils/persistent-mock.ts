import { ClaudeMock } from './claude-mock.js';
import { existsSync } from 'node:fs';

let sharedMock: ClaudeMock | null = null;

/**
 * Get the mock CLI path for use in environment variables
 */
export function getMockCliPath(): string {
  if (!sharedMock) {
    sharedMock = new ClaudeMock('claudeMocked');
  }
  return sharedMock.getMockPath();
}

export async function getSharedMock(): Promise<ClaudeMock> {
  if (!sharedMock) {
    sharedMock = new ClaudeMock('claudeMocked');
  }

  // Always ensure mock exists - use the mock's dynamic path
  const mockPath = sharedMock.getMockPath();
  if (!existsSync(mockPath)) {
    console.error(`[DEBUG] Mock not found at ${mockPath}, creating it...`);
    await sharedMock.setup();
  } else {
    console.error(`[DEBUG] Mock already exists at ${mockPath}`);
  }

  // Set environment variable so tests can find the mock
  process.env.CLAUDE_CLI_NAME = mockPath;
  console.error(`[DEBUG] CLAUDE_CLI_NAME set to ${mockPath}`);

  return sharedMock;
}

export async function cleanupSharedMock(): Promise<void> {
  if (sharedMock) {
    await sharedMock.cleanup();
    sharedMock = null;
    delete process.env.CLAUDE_CLI_NAME;
  }
}