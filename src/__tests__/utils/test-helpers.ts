import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function verifyMockExists(binaryName: string): boolean {
  const mockPath = join('/tmp', 'claude-code-test-mock', binaryName);
  return existsSync(mockPath);
}

export async function ensureMockExists(mock: any): Promise<void> {
  if (!verifyMockExists('claudeMocked')) {
    await mock.setup();
  }
}