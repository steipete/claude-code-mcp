import { ClaudeMock } from './claude-mock.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
let sharedMock = null;
export async function getSharedMock() {
    if (!sharedMock) {
        sharedMock = new ClaudeMock('claudeMocked');
    }
    // Always ensure mock exists
    const mockPath = join('/tmp', 'claude-code-test-mock', 'claudeMocked');
    if (!existsSync(mockPath)) {
        console.error(`[DEBUG] Mock not found at ${mockPath}, creating it...`);
        await sharedMock.setup();
    }
    else {
        console.error(`[DEBUG] Mock already exists at ${mockPath}`);
    }
    return sharedMock;
}
export async function cleanupSharedMock() {
    if (sharedMock) {
        await sharedMock.cleanup();
        sharedMock = null;
    }
}
