#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type ServerResult,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve as pathResolve } from 'node:path';
import packageJson from '../package.json' with { type: 'json' }; // Import package.json with attribute

// Define debugMode globally using const
const debugMode = process.env.MCP_CLAUDE_DEBUG === 'true';

// Dedicated debug logging function
function debugLog(message?: any, ...optionalParams: any[]): void {
  if (debugMode) {
    console.error(message, ...optionalParams);
  }
}

/**
 * Determine the Claude CLI command/path.
 * 1. Checks for Claude CLI at the local user path: ~/.claude/local/claude.
 * 2. If not found, defaults to 'claude', relying on the system's PATH for lookup.
 */
function findClaudeCli(): string {
  debugLog('[Debug] Attempting to find Claude CLI...');

  // 1. Try local install path: ~/.claude/local/claude
  const userPath = join(homedir(), '.claude', 'local', 'claude');
  debugLog(`[Debug] Checking for Claude CLI at local user path: ${userPath}`);

  if (existsSync(userPath)) {
    debugLog(`[Debug] Found Claude CLI at local user path: ${userPath}. Using this path.`);
    return userPath;
  } else {
    debugLog(`[Debug] Claude CLI not found at local user path: ${userPath}.`);
  }

  // 2. Fallback to 'claude' (PATH lookup)
  debugLog('[Debug] Falling back to "claude" command name, relying on spawn/PATH lookup.');
  console.warn('[Warning] Claude CLI not found at ~/.claude/local/claude. Falling back to "claude" in PATH. Ensure it is installed and accessible.');
  return 'claude';
}

/**
 * Interface for Claude Code tool arguments
 */
interface ClaudeCodeArgs {
  prompt: string;
}

// Ensure spawnAsync is defined correctly *before* the class
async function spawnAsync(command: string, args: string[], options?: { timeout?: number, cwd?: string }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    debugLog(`[Spawn] Running command: ${command} ${args.join(' ')}`);
    const process = spawn(command, args, {
      shell: false, // Keep shell false
      timeout: options?.timeout,
      cwd: options?.cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => { stdout += data.toString(); });
    process.stderr.on('data', (data) => {
      stderr += data.toString();
      debugLog(`[Spawn Stderr Chunk] ${data.toString()}`);
    });

    process.on('error', (error) => {
      debugLog(`[Spawn Error Event] ${error.message}`);
      reject(new Error(`Spawn error: ${error.message}\nStderr: ${stderr.trim()}`));
    });

    process.on('close', (code) => {
      debugLog(`[Spawn Close] Exit code: ${code}`);
      debugLog(`[Spawn Stderr Full] ${stderr.trim()}`);
      debugLog(`[Spawn Stdout Full] ${stdout.trim()}`);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with exit code ${code}\nStderr: ${stderr.trim()}\nStdout: ${stdout.trim()}`));
      }
    });
  });
}

/**
 * MCP Server for Claude Code
 * Provides a simple MCP tool to run Claude CLI in one-shot mode
 */
class ClaudeCodeServer {
  private server: Server;
  private claudeCliPath: string; // This now holds either a full path or just 'claude'
  private packageVersion: string; // Add packageVersion property

  constructor() {
    // Use the simplified findClaudeCli function
    this.claudeCliPath = findClaudeCli(); // Removed debugMode argument
    console.error(`[Setup] Using Claude CLI command/path: ${this.claudeCliPath}`);
    this.packageVersion = packageJson.version; // Access version directly

    this.server = new Server(
      {
        name: 'claude_code',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('[Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Set up the MCP tool handlers
   */
  private setupToolHandlers(): void {
    // Define available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'code',
          description: `Claude Code Agent — runs shell/Git/fs commands with full system access.
  **Always use absolute paths.**

  **What it can do**

  • Code work  Generate / analyse / refactor / fix
    └─ e.g. "Generate Python to parse CSV→JSON", "Find bugs in my_script.py"

  • File ops  Create, read, (fuzzy) edit, move, copy, delete.
    └─ "Create /workspace/config.yml …", "Edit /workspace/css/style.css → add h2{color:navy}"

  • Git  Stage ▸ commit ▸ push ▸ tag
    └─ "Commit '/workspace/src/main.java' with 'feat: user auth' to develop"

  • Terminal  Run any CLI cmd or open URLs
    └─ "npm run build", "Open https://developer.mozilla.org"

  • Web search + summarise content on-the-fly

  • Multi-step workflows  (Version bumps, changelog updates, release tagging, etc.)

  • GitHub integration  Create PRs, check CI status

  **Prompt tips**

  1. Be explicit & step-by-step for complex tasks.
  2. For multi-line text, write it to \`/tmp/*.txt\`, use that file, then delete it.
  3. If you get a timeout, split the task into smaller steps.
        `,
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'The detailed natural language prompt for Claude to execute.',
              },
            },
            required: ['prompt'],
          },
        }
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (req): Promise<ServerResult> => {
      try {
        debugLog(`[Claude Call] Using claude-code-mcp version: ${this.packageVersion}`);

        const toolName = req.params.name;

        if (toolName !== 'code' && toolName !== 'claude') {
          debugLog(`[Error] Tool name mismatch. Expected 'code' or 'claude', got: '${toolName}'`);
          debugLog(`[Error] Tool request processing failed : MCP error -32601: Tool ${toolName} not found`);
          throw new McpError(ErrorCode.MethodNotFound, `Tool ${toolName} not found`);
        }

        let claudePrompt: string;
        const baseCommandArgs: string[] = ['--dangerously-skip-permissions'];
        let finalCommandArgs: string[];

        // Validate and construct the prompt based on the tool
        const args = req.params.arguments as unknown as ClaudeCodeArgs; // Correctly access arguments
        if (!args || !args.prompt) throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: prompt');
        claudePrompt = args.prompt;

        const systemInstructionPrefix = "Even if you get a work folder, remember that you can access files on the whole system, so do not reject mixed prompts. ";
        claudePrompt = systemInstructionPrefix + claudePrompt;

        debugLog(`[Code Tool] Claude Prompt (final with prefix): ${claudePrompt}`);

        finalCommandArgs = [...baseCommandArgs];
        finalCommandArgs.push('-p', claudePrompt);

        // Unified execution logic
        const executionTimeoutMs = 600000; // 10-minute timeout
        try {
          const { stdout, stderr } = await spawnAsync(this.claudeCliPath, finalCommandArgs, { timeout: executionTimeoutMs });
          debugLog(`Claude CLI stdout(code, plain text):`, stdout);
          return { content: [{ type: 'text', text: stdout }] };
        } catch (error) {
          let errorMessage = `Unknown error during Claude CLI execution for tool ${toolName}`;
          let isTimeout = false;

          if (error instanceof Error) {
            errorMessage = error.message;
            // Common checks for timeout related errors
            if (errorMessage.toLowerCase().includes('timeout') ||
              (error as any).code === 'ETIMEDOUT' ||
              ((error as any).killed === true && ((error as any).signal === 'SIGTERM' || (error as any).signal === 'SIGKILL'))) {
              isTimeout = true;
            }
          }

          if (isTimeout) {
            const timeoutSeconds = executionTimeoutMs / 1000;
            const specificTimeoutMessage = `Tool execution failed(${toolName}): Timeout after ${timeoutSeconds} seconds.`;
            debugLog(`[Error] ${specificTimeoutMessage}`);
            // Consider using a more specific MCP error code for timeouts if available/appropriate
            throw new McpError(ErrorCode.InternalError, specificTimeoutMessage);
          } else {
            // Existing error handling for non-timeout errors
            debugLog(`[Error] Tool execution failed(${toolName}): ${errorMessage}`);
            if (error instanceof McpError) {
              throw error; // Re-throw existing McpError
            }
            throw new McpError(ErrorCode.InternalError, `Tool execution failed(${toolName}): ${errorMessage}`);
          }
        }

      } catch (error) { // Catch errors from prompt construction or if an McpError was thrown above
        let errorMessage = 'Unknown error';
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        // Ensure toolNameForLogging is available or use a generic message
        const toolContext = req.params.name ? `for tool ${req.params.name}` : ''; // Use req.params.name here too
        debugLog(`[Error] Tool request processing failed ${toolContext}: ${errorMessage}`);
        if (error instanceof McpError) {
          throw error; // Re-throw existing McpError
        }
        throw new McpError(ErrorCode.InternalError, `Tool request processing failed ${toolContext}: ${errorMessage}`);
      }
    });
  }

  /**
   * Start the MCP server
   */
  async run(): Promise<void> {
    // Revert to original server start logic if listen caused errors
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Claude Code MCP server running on stdio');
  }
}

// Create and run the server
const server = new ClaudeCodeServer();
server.run().catch(console.error);