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
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve as pathResolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { debugLog, findClaudeCli, spawnAsync } from './utils.js';
import { SERVER_VERSION, CLAUDE_CODE_TOOL_DESCRIPTION_TEMPLATE } from './constants.js';
import type { ClaudeCodeArgs } from './types.js'; // Import moved interface

// Declare vi as any for TypeScript to recognize Vitest's global in test environments
declare const vi: any;

// Vitest's `vi` is expected to be globally available in test environments when globals: true

// Capture server startup time when the module loads
const serverStartupTime = new Date().toISOString();

/**
 * MCP Server for Claude Code
 * Provides a simple MCP tool to run Claude CLI in one-shot mode
 */
export class ClaudeCodeServer {
  private server: Server;
  public claudeCliPath: string; // Made public for tests
  private packageVersion: string; // Add packageVersion property
  public claudeCliVersionString: string = "unknown"; // Made public for tests
  public claudeCliVersion: string = "unknown"; // Add alias for tests
  public readonly initPromise: Promise<void>; // Expose the init promise
  private cliPathResolver: typeof findClaudeCli;
  private spawnFunction: typeof spawnAsync;

  constructor(options?: {
    cliPathResolver?: typeof findClaudeCli;
    spawnFunction?: typeof spawnAsync;
  }) {
    // Allow dependency injection for testing
    this.cliPathResolver = options?.cliPathResolver || findClaudeCli;
    this.spawnFunction = options?.spawnFunction || spawnAsync;
    
    try {
      // Use the simplified findClaudeCli function
      this.claudeCliPath = this.cliPathResolver(); // Removed debugMode argument
      console.error(`[Setup] Using Claude CLI command/path: ${this.claudeCliPath}`);
    } catch (error: any) {
      console.error(`Failed to initialize Claude CLI path or version: ${error.message}`, error);
      this.claudeCliPath = ''; // Set to empty string so tests can check
    }
    
    this.packageVersion = SERVER_VERSION;
    this.initPromise = this._initializeClaudeCliVersion(); // Assign the promise

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
    ) as any;

    // Fallback for test environments if Server is not properly mocked
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test' && 
        typeof vi !== 'undefined' && typeof vi.fn === 'function') { 
      // Only activate fallback if setRequestHandler is missing (i.e., not a real or properly mocked Server)
      if (typeof (this.server as any)?.setRequestHandler !== 'function') {
        console.error('!!!!!!!!!!!! SERVER FALLBACK ACTIVATED (setRequestHandler missing) !!!!!!!!!!!!'); 
        this.server = {
          __isViFnFallback: true, 
          connect: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined),
          setRequestHandler: vi.fn(),
          setErrorHandler: vi.fn(),
          setBroadcastHandler: vi.fn(),
          setDisposeHandler: vi.fn(), 
          sendNotification: vi.fn(),
          sendProgress: vi.fn(), 
          getAuthenticatedUser: vi.fn().mockReturnValue(null),
          dispose: vi.fn(), 
          isDisposed: vi.fn().mockReturnValue(false), 
          onDispose: vi.fn(), 
          onerror: null, 
        } as any;
      }
    }

    this.setupToolHandlers();

    this.server.onerror = (error: Error) => console.error('[Error]', error);
    process.on('SIGINT', async () => {
      console.log('Claude Code MCP server shutting down...');
      await this.server.close();
      if (process.env.NODE_ENV !== 'test') {
        process.exit(0);
      }
    });
  }

  /**
   * Initializes the Claude CLI version string asynchronously.
   */
  private async _initializeClaudeCliVersion(): Promise<void> {
    // Skip if CLI path was not initialized
    if (!this.claudeCliPath) {
      this.claudeCliVersionString = "Claude CLI not found";
      this.claudeCliVersion = this.claudeCliVersionString;
      return;
    }
    
    try {
      debugLog(`[Version] Attempting to fetch Claude CLI version from: ${this.claudeCliPath}`);
      const { stdout } = await this.spawnFunction(this.claudeCliPath, ['--version'], { timeout: 5000 }); // 5s timeout
      this.claudeCliVersionString = stdout.trim() || "unknown";
      this.claudeCliVersion = this.claudeCliVersionString; // Update alias
      debugLog(`[Version] Successfully fetched Claude CLI version: ${this.claudeCliVersionString}`);
    } catch (error: any) {
      this.claudeCliVersionString = "Claude CLI not found or version check failed";
      this.claudeCliVersion = this.claudeCliVersionString; // Update alias
      debugLog(`[Error][Version] Failed to fetch Claude CLI version: ${error.message}`);
      console.error(`[Error][Version] Failed to fetch Claude CLI version: ${error.message}`);
    }
  }

  /**
   * Set up the MCP tool handlers
   */
  private setupToolHandlers(): void {
    // Define available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Ensure CLI version is fetched if it was too slow on initial startup or failed
      if (this.claudeCliVersionString === "unknown" || this.claudeCliVersionString === "Claude CLI not found or version check failed") {
        await this._initializeClaudeCliVersion();
      }
      this.claudeCliVersion = this.claudeCliVersionString; // Ensure alias is synced
      const description = CLAUDE_CODE_TOOL_DESCRIPTION_TEMPLATE
        .replace('{{SERVER_VERSION}}', SERVER_VERSION)
        .replace('{{CLAUDE_CLI_VERSION}}', this.claudeCliVersionString);
      return {
        tools: [
          {
            name: 'claude_code',
            description: description,
            inputSchema: {
              type: 'object',
              properties: {
                prompt: {
                  type: 'string',
                  description: 'The detailed natural language prompt for Claude to execute.',
                },
                workFolder: {
                  type: 'string',
                  description: 'Mandatory when using file operations or referencing any file. The working directory for the Claude CLI execution. Must be an absolute path.',
                },
              },
              required: ['prompt'],
            },
          }
        ],
      };
    });

    // Handle tool calls
    const defaultTimeoutSeconds = 3600; // Default to 60 minutes
    const timeoutSecondsEnv = process.env.CLAUDE_CLI_TIMEOUT_SECONDS;
    let executionTimeoutSeconds = defaultTimeoutSeconds;

    if (timeoutSecondsEnv) {
      const parsedTimeout = parseInt(timeoutSecondsEnv, 10);
      if (!isNaN(parsedTimeout) && parsedTimeout > 0) {
        executionTimeoutSeconds = parsedTimeout;
        debugLog(`[Config] Using custom Claude CLI timeout: ${executionTimeoutSeconds} seconds from CLAUDE_CLI_TIMEOUT_SECONDS.`);
      } else {
        debugLog(`[Warning] Invalid value for CLAUDE_CLI_TIMEOUT_SECONDS: "${timeoutSecondsEnv}". Using default: ${defaultTimeoutSeconds} seconds.`);
      }
    } else {
      debugLog(`[Config] Using default Claude CLI timeout: ${defaultTimeoutSeconds} seconds.`);
    }
    const executionTimeoutMs = executionTimeoutSeconds * 1000;

    this.server.setRequestHandler(CallToolRequestSchema, async (args: any, call: any): Promise<ServerResult> => {
      debugLog('[Debug] Handling CallToolRequest:', args);

      // Correctly access toolName from args.params.name
      const toolName = args.params.name;
      if (toolName !== 'claude_code') {
        // ErrorCode.ToolNotFound should be ErrorCode.MethodNotFound as per SDK for tools
        throw new McpError(ErrorCode.MethodNotFound, `Tool ${toolName} not found`);
      }

      // Robustly access prompt from args.params.arguments
      const toolArguments = args.params.arguments as ClaudeCodeArgs; // Use the imported type
      let prompt: string;

      if (
        toolArguments &&
        typeof toolArguments === 'object' &&
        'prompt' in toolArguments &&
        typeof toolArguments.prompt === 'string'
      ) {
        prompt = toolArguments.prompt;
      } else {
        throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid required parameter: prompt (must be an object with a string "prompt" property) for claude_code tool');
      }

      // Determine the working directory
      let effectiveCwd = homedir(); // Default CWD is user's home directory

      // Check if workFolder is provided in the tool arguments
      if (toolArguments.workFolder && typeof toolArguments.workFolder === 'string') {
        const resolvedCwd = pathResolve(toolArguments.workFolder);
        debugLog(`[Debug] Specified workFolder: ${toolArguments.workFolder}, Resolved to: ${resolvedCwd}`);

        // Check if the resolved path exists
        if (existsSync(resolvedCwd)) {
          effectiveCwd = resolvedCwd;
          debugLog(`[Debug] Using workFolder as CWD: ${effectiveCwd}`);
        } else {
          debugLog(`[Warning] Specified workFolder does not exist: ${resolvedCwd}. Using default: ${effectiveCwd}`);
        }
      } else {
        debugLog(`[Debug] No workFolder provided, using default CWD: ${effectiveCwd}`);
      }

      try {
        debugLog(`[Debug] Attempting to execute Claude CLI with prompt: "${prompt}" in CWD: "${effectiveCwd}"`);

        const claudeProcessArgs = ['--dangerously-skip-permissions', '-p', prompt];
        debugLog(`[Debug] Invoking Claude CLI: ${this.claudeCliPath} ${claudeProcessArgs.join(' ')}`);

        const { stdout, stderr } = await this.spawnFunction(
          this.claudeCliPath, // Run the Claude CLI directly
          claudeProcessArgs, // Pass the arguments
          { timeout: executionTimeoutMs, cwd: effectiveCwd }
        );

        debugLog('[Debug] Claude CLI stdout:', stdout.trim());
        if (stderr) {
          debugLog('[Debug] Claude CLI stderr:', stderr.trim());
        }

        // Return stdout content, even if there was stderr, as claude-cli might output main result to stdout.
        return { content: [{ type: 'text', text: stdout }] };

      } catch (error: any) {
        debugLog('[Error] Error executing Claude CLI:', error);
        let errorMessage = error.message || 'Unknown error';
        // Attempt to include stderr and stdout from the error object if spawnAsync attached them
        if (error.stderr) {
          errorMessage += `\nStderr: ${error.stderr}`;
        }
        if (error.stdout) {
          errorMessage += `\nStdout: ${error.stdout}`;
        }

        if (error.signal === 'SIGTERM' || (error.message && error.message.includes('ETIMEDOUT')) || (error.code === 'ETIMEDOUT')) {
          // Reverting to InternalError due to lint issues, but with a specific timeout message.
          throw new McpError(ErrorCode.InternalError, `Claude CLI command timed out after ${executionTimeoutMs / 1000}s. Details: ${errorMessage}`);
        }
        // ErrorCode.ToolCallFailed should be ErrorCode.InternalError or a more specific execution error if available
        throw new McpError(ErrorCode.InternalError, `Claude CLI execution failed: ${errorMessage}`);
      }
    });
  }

  /**
   * Start the MCP server
   */
  public async run(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.log('Claude Code MCP server running on stdio');
    } catch (e) {
      console.error(e);
      // Prevent process.exit during tests, which can prematurely end test execution
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  }
}

// Create and run the server if this is the main module
const server = new ClaudeCodeServer();
server.run().catch(console.error);
