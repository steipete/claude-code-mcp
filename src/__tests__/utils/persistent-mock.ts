import { ClaudeMock } from './claude-mock.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

let sharedMock: ClaudeMock | null = null;

export async function getSharedMock(): Promise<ClaudeMock> {
  if (!sharedMock) {
    sharedMock = new ClaudeMock('claudeMocked');
  }
  
  // Always ensure mock exists
  const mockPath = join('/tmp', 'claude-code-test-mock', 'claudeMocked');
  if (!existsSync(mockPath)) {
    await sharedMock.setup();
  }
  
  return sharedMock;
}

export async function cleanupSharedMock(): Promise<void> {
  if (sharedMock) {
    await sharedMock.cleanup();
    sharedMock = null;
  }
}