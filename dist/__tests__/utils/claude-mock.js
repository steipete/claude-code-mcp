import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
/**
 * Mock Claude CLI for testing
 * This creates a fake Claude CLI that can be used during testing
 */
export class ClaudeMock {
    mockPath;
    responses = new Map();
    constructor(binaryName = 'claude') {
        // Always use /tmp directory for mocks in tests
        this.mockPath = join('/tmp', 'claude-code-test-mock', binaryName);
    }
    /**
     * Setup the mock Claude CLI
     */
    async setup() {
        const dir = dirname(this.mockPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        // Create a simple bash script that echoes responses
        const mockScript = `#!/bin/bash
# Mock Claude CLI for testing

# Extract the prompt from arguments
prompt=""
verbose=false
while [[ $# -gt 0 ]]; do
  case $1 in
    -p|--prompt)
      prompt="$2"
      shift 2
      ;;
    --verbose)
      verbose=true
      shift
      ;;
    --yes|-y|--dangerously-skip-permissions)
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# Mock responses based on prompt
if [[ "$prompt" == *"create"* ]]; then
  echo "Created file successfully"
elif [[ "$prompt" == *"Create"* ]]; then
  echo "Created file successfully"  
elif [[ "$prompt" == *"git"* ]] && [[ "$prompt" == *"commit"* ]]; then
  echo "Committed changes successfully"
elif [[ "$prompt" == *"error"* ]]; then
  echo "Error: Mock error response" >&2
  exit 1
else
  echo "Command executed successfully"
fi
`;
        writeFileSync(this.mockPath, mockScript);
        // Make executable
        const { chmod } = await import('node:fs/promises');
        await chmod(this.mockPath, 0o755);
    }
    /**
     * Cleanup the mock Claude CLI
     */
    async cleanup() {
        const { rm } = await import('node:fs/promises');
        await rm(this.mockPath, { force: true });
    }
    /**
     * Add a mock response for a specific prompt pattern
     */
    addResponse(pattern, response) {
        this.responses.set(pattern, response);
    }
}
