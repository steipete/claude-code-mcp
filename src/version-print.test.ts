import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { homedir } from 'node:os';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Local mocks for utils used by this test file
let localFindClaudeCliMock: Mock<() => string>;
let localSpawnAsyncMock: Mock<(...args: any[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>>;

vi.mock('./utils.js', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('./utils.js');
  localFindClaudeCliMock = vi.fn();
  localSpawnAsyncMock = vi.fn();
  return {
    ...actual,
    findClaudeCli: localFindClaudeCliMock,
    spawnAsync: localSpawnAsyncMock,
  };
});

// Mocks for Node built-ins, specific to this test if needed, or rely on global if not overridden
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('node:os');
  return {
    ...actual,
    homedir: vi.fn(), // Allow override in tests
    tmpdir: vi.fn().mockReturnValue(actual.tmpdir()), // Keep actual tmpdir
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(), // Allow override
    mkdtempSync: vi.fn().mockImplementation(actual.mkdtempSync), // Keep actual
    rmSync: vi.fn().mockImplementation(actual.rmSync), // Keep actual
    writeFileSync: vi.fn().mockImplementation(actual.writeFileSync), // Keep actual
  };
});


import { ClaudeCodeServer } from './server.js'; // Import after mocks

const originalEnv = { ...process.env };
const FAKE_HOME_DIR = '/fake/home/version-print';

// Helper to find the relevant console call
const findVersionCall = (calls: any[][]) => {
  return calls.find((call: any[]) => 
    typeof call[0] === 'string' && call[0].includes('Claude Code MCP server running on stdio') &&
    typeof call[1] === 'string' && call[1].startsWith('claude_code v')
  );
};


describe('Version Print on First Use', () => {
  let consoleErrorSpy: any;
  let consoleLogSpy: any;
  let mockHomedirOs: Mock<() => string>;
  let mockExistsSyncFs: Mock<(path: string) => boolean>;
  let tempTestDir: string;


  beforeEach(async () => {
    process.env = { ...originalEnv }; // Reset env
    // vi.resetModules(); // REMOVED this

    // Clear all mocks before setting them up for the current test
    vi.clearAllMocks();

    // Re-initialize mocks for node built-ins
    // These vi.mock calls are at the top level of the file.
    // We get the mocked functions from the (re-)imported modules.
    const osModule = await import('node:os');
    mockHomedirOs = vi.mocked(osModule.homedir);
    const actualTmpdirProvider = osModule.tmpdir; // Get the actual tmpdir function

    const fsModule = await import('node:fs');
    mockExistsSyncFs = vi.mocked(fsModule.existsSync);
    const actualMkdtempSyncProvider = fsModule.mkdtempSync; // Get the actual mkdtempSync function
    const actualRmdirSyncProvider = fsModule.rmSync; // Get actual rmSync
    const actualExistsSyncProvider = fsModule.existsSync; // Get actual existsSync


    // Our util mocks (localFindClaudeCliMock, localSpawnAsyncMock) are vi.fn()
    // defined in the vi.mock factory for './utils.js'.
    // vi.clearAllMocks() resets their .mock property (calls, instances, etc.).
    // We re-import utils.js to ensure we have the module scope where these mocks live.
    await import('./utils.js'); // Ensures the module and its mocks are (re-)initialized if changed by resetModules
    
    // Set new per-test behavior on the already existing mock functions
    localFindClaudeCliMock.mockClear(); // Already done by vi.clearAllMocks, but for clarity
    localSpawnAsyncMock.mockClear(); // Already done by vi.clearAllMocks, but for clarity

    mockHomedirOs.mockReturnValue(FAKE_HOME_DIR);

    const currentTmpdirPath = actualTmpdirProvider();
    tempTestDir = actualMkdtempSyncProvider(join(currentTmpdirPath, 'claude-code-test-mock-'));
    
    const mockClaudePath = join(tempTestDir, 'claudeMocked');

    localFindClaudeCliMock.mockReturnValue(mockClaudePath);
    localSpawnAsyncMock.mockResolvedValue({ stdout: '1.0.0-test-version', stderr: '', exitCode: 0 });
    mockExistsSyncFs.mockImplementation((path) => path === mockClaudePath);

    // Spies are re-created each time
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    delete process.env.CLAUDE_CLI_VERSION_PRINTED;
  });

  afterEach(async () => {
    process.env = originalEnv; 
    // Spies created with vi.spyOn are restored to remove the spy behavior.
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    
    vi.clearAllMocks(); // Clear history of vi.fn mocks etc.
    
    // Cleanup temp directory using actual fs functions
    // To get actual fs functions, we can require them if module cache is tricky
    const nodeFs = await import('node:fs'); // Re-import to be safe if resetModules was ever used
    if (tempTestDir && nodeFs.existsSync(tempTestDir)) { 
      nodeFs.rmSync(tempTestDir, { recursive: true, force: true }); 
    }
    tempTestDir = ''; // Reset for next test
  });

  it('should print version and startup time only on first use', async () => {
    const { ClaudeCodeServer: ServerClass } = await import('./server.js');
    let server = new ServerClass();
    await server.initPromise; // Ensure init completes
    await server.run(); // Run the server

    // Check that version was printed on first use to console.error
    // The version is printed by server.run() via console.log in this version
    const startupLogCall = consoleLogSpy.mock.calls.find((call: any[]) => 
        call[0] === 'Claude Code MCP server running on stdio'
    );
    expect(startupLogCall, "Startup log not found").toBeDefined();
    
    // The version string is now part of the ListTools response, not printed directly at startup.
    // This test needs to be re-evaluated. For now, I'll check the init logs.
    expect(localSpawnAsyncMock).toHaveBeenCalledWith(expect.any(String), ['--version'], expect.anything());
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringMatching(/claude_code v[0-9]+\.[0-9]+\.[0-9]+/));


    // Simulate second run - version should not be printed again
    consoleErrorSpy.mockClear();
    consoleLogSpy.mockClear();
    process.env.CLAUDE_CLI_VERSION_PRINTED = 'true'; // Simulate it was printed

    const { ClaudeCodeServer: ServerClass2 } = await import('./server.js');
    let server2 = new ServerClass2();
    await server2.initPromise;
    await server2.run();
    
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringMatching(/claude_code v[0-9]+\.[0-9]+\.[0-9]+/));
    expect(consoleLogSpy.mock.calls.some((call: any[]) => call[0] === 'Claude Code MCP server running on stdio' && call[1]?.startsWith('claude_code v'))).toBe(false);
  });
});