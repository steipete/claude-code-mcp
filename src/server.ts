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

// Define debugMode globally using const
const debugMode = process.env.MCP_CLAUDE_DEBUG === 'true';

/**
 * Determine the Claude CLI command/path.
 * 1. Checks CLAUDE_CLI_PATH environment variable.
 * 2. Checks for Claude CLI at ~/.claude/local/claude.
 * 3. Defaults to 'claude' if not found, relying on spawn() to perform PATH lookup.
 */
function findClaudeCli(debugMode: boolean): string {
  // 1. Check environment variable first
  if (debugMode) console.error('[Debug] Checking for CLAUDE_CLI_PATH environment variable...');
  const envPath = process.env.CLAUDE_CLI_PATH;

  if (envPath) {
    if (debugMode) console.error(`[Debug] CLAUDE_CLI_PATH is set to: "${envPath}".`);
    if (existsSync(envPath)) {
      if (debugMode) console.error(`[Debug] Found Claude CLI via CLAUDE_CLI_PATH: "${envPath}". Using this path.`);
      return envPath;
    }
    // If existsSync(envPath) was false, we reach here.
    if (debugMode) console.error(`[Debug] CLAUDE_CLI_PATH "${envPath}" was set, but the file does not exist. Checking default user path next.`);
  } else {
    if (debugMode) console.error('[Debug] CLAUDE_CLI_PATH environment variable is not set. Checking default user path next.');
  }

  // 2. Check default user path: ~/.claude/local/claude
  if (debugMode) console.error('[Debug] Checking for Claude CLI at default user path (~/.claude/local/claude)...');
  try {
    const userPath = join(homedir(), '.claude', 'local', 'claude');
    if (existsSync(userPath)) {
      if (debugMode) console.error(`[Debug] Found Claude CLI at default user path: ${userPath}`);
      return userPath;
    }
    // If not returned, it means userPath does not exist, so log it.
    if (debugMode) console.error(`[Debug] Claude CLI not found at default user path: ${userPath}.`);
  } catch (err) {
    if (debugMode) console.error(`[Debug] Error checking default user path: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Default to 'claude' command name
  if (debugMode) console.error('[Debug] CLAUDE_CLI_PATH not set or invalid, and not found at default user path. Defaulting to "claude" command name, relying on spawn/PATH lookup.');
  console.warn('[Warning] Claude CLI not found via CLAUDE_CLI_PATH or at ~/.claude/local/claude. Falling back to "claude" in PATH. Ensure it is installed and accessible.');
  return 'claude'; // Return base command name
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
    if (debugMode) {
      console.error(`[Spawn] Running command: ${command} ${args.join(' ')}`);
    }
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
      if (debugMode) { console.error(`[Spawn Stderr Chunk] ${data.toString()}`); }
    });

    process.on('error', (error) => {
      if (debugMode) { console.error(`[Spawn Error Event] ${error.message}`); }
      reject(new Error(`Spawn error: ${error.message}\nStderr: ${stderr.trim()}`));
    });

    process.on('close', (code) => {
      if (debugMode) {
        console.error(`[Spawn Close] Exit code: ${code}`);
        console.error(`[Spawn Stderr Full] ${stderr.trim()}`);
        console.error(`[Spawn Stdout Full] ${stdout.trim()}`);
      }
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

  constructor() {
    // Use the simplified findClaudeCli function
    this.claudeCliPath = findClaudeCli(debugMode);
    console.error(`[Setup] Using Claude CLI command/path: ${this.claudeCliPath}`);

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
          description: `**Claude Code Agent: Your Direct Line to Advanced AI Capabilities**

Executes a given \`prompt\` directly with the Claude Code CLI, bypassing ALL permission checks (\`--dangerously-skip-permissions\`). This single, powerful tool allows you to leverage Claude's full range of agentic capabilities, including complex multi-step workflows, based on your natural language \`prompt\`.

**CRITICAL: Current Working Directory (CWD) Context**
The server **does NOT automatically inject 'Your work folder is...'** into your prompt. If your operations require specific CWD context (e.g., for file system interactions, relative paths, git commands), **your \`prompt\` argument ITSELF MUST EXPLICITLY START WITH 'Your work folder is /path/to/your/project_root'.** Claude executes within the server's own CWD; relative paths in prompts without this explicit CWD context will resolve against the server's CWD, which may not be your intent. Using absolute paths within your prompt is often the safest approach if not providing explicit CWD context.

**Key Capabilities & Example Prompts:**

1.  **Code Generation, Analysis & Refactoring:**
    - \`"Generate a Python script to parse CSV data and output JSON."\`
    - \`"Analyze my_script.py for potential bugs and suggest improvements."\`

2.  **File System Operations (Create, Read, Edit, Manage):**
    - **Creating Files:** \`"Your work folder is /Users/steipete/my_project\\n\\nCreate a new file named 'config.yml' in the 'app/settings' directory with the following content:\\nport: 8080\\ndatabase: main_db"\`
    - **Reading Files:** \`"Your work folder is /Users/steipete/my_project\\n\\nRead the contents of 'src/api/endpoints.js' and list all defined GET routes."\`
    - **Editing Files (replaces dedicated file editing tools):** \`"Your work folder is /Users/steipete/my_project\\n\\nEdit file 'public/css/style.css': Add a new CSS rule at the end to make all 'h2' elements have a 'color: navy'."\`
    - **Moving/Copying/Deleting:** \`"Your work folder is /Users/steipete/my_project\\n\\nMove the file 'report.docx' from the 'drafts' folder to the 'final_reports' folder and rename it to 'Q1_Report_Final.docx'."\`

3.  **Version Control (Git):** (As seen in \`claude_tool_git_example.png\`)
    - \`"Your work folder is /Users/steipete/my_project\\n\\n1. Stage the file 'src/main.java'.\\n2. Commit the changes with the message 'feat: Implement user authentication'.\\n3. Push the commit to the 'develop' branch on origin."\`

4.  **Running Terminal Commands:**
    - \`"Your work folder is /Users/steipete/my_project/frontend\\n\\nRun the command 'npm run build'."\`
    - \`"Open the URL https://developer.mozilla.org in my default web browser."\`

5.  **Web Search & Summarization:**
    - \`"Search the web for 'benefits of server-side rendering' and provide a concise summary."\`

6.  **Complex Multi-Step Workflows:** (Like performing a full version bump, updating changelogs, and tagging a release, as previously demonstrated)
    - \`"Your work folder is /Users/steipete/my_project\\n\\nFollow these steps: 1. Update the version in package.json to 2.5.0. 2. Add a new section to CHANGELOG.md for version 2.5.0 with the heading '### Added' and list 'New feature X'. 3. Stage package.json and CHANGELOG.md. 4. Commit with message 'release: version 2.5.0'. 5. Push the commit. 6. Create and push a git tag v2.5.0."\`

7.  **Repairing Files with Syntax Errors:**
    - \`"Your work folder is /path/to/project\\n\\nThe file 'src/utils/parser.js' has syntax errors after a recent complex edit that broke its structure. Please analyze it, identify the syntax errors, and correct the file to make it valid JavaScript again, ensuring the original logic is preserved as much as possible."\`

8.  **Interacting with GitHub (e.g., Creating a Pull Request):**
    - \`"Your work folder is /Users/steipete/my_project\\n\\nCreate a GitHub Pull Request in the repository 'owner/repo' from the 'feature-branch' to the 'main' branch. Title: 'feat: Implement new login flow'. Body: 'This PR adds a new and improved login experience for users.'"\`

9.  **Interacting with GitHub (e.g., Checking PR CI Status):**
    - \`"Your work folder is /Users/steipete/my_project\\n\\nCheck the status of CI checks for Pull Request #42 in the GitHub repository 'owner/repo'. Report if they have passed, failed, or are still running."\`

**Prompting Best Practices:** The more detailed, clear, and well-structured your prompt, the better Claude can understand and execute your intent. For complex tasks, breaking them down into numbered steps within the prompt is highly effective.

**Advanced Usage Tip:** When working with the \\\`code\\\` tool, you can set up complex workflows by using explicit step-by-step instructions. For example, instead of just asking \\\`"Fix the bugs in my code"\\\`, try: \\\`"Your work folder is /path/to/project\\n\\n1. Run the test suite to identify failing tests\\n2. Examine the failing tests to understand what's breaking\\n3. Check the relevant source files and fix the issues\\n4. Run the tests again to verify your fixes worked\\n5. Explain what you changed and why"\\\``,
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
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<ServerResult> => {
      try {
        let claudePrompt: string;
        const baseCommandArgs: string[] = ['--dangerously-skip-permissions'];
        let finalCommandArgs: string[];

        const toolNameForLogging = request.params.toolName; // Use toolName from schema

        // Validate and construct the prompt based on the tool
        if (request.params.toolName === 'code') { // Only 'code' tool remains
          const args = request.params.arguments as unknown as ClaudeCodeArgs;
          if (!args.prompt) throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: prompt');
          claudePrompt = args.prompt;

          if (debugMode) { 
            console.error(`[Code Tool] Claude Prompt(direct from user): ${claudePrompt}`); 
          }

          finalCommandArgs = [...baseCommandArgs];
          finalCommandArgs.push('-p', claudePrompt);

        } else {
          // Unknown tool - this case should ideally not be hit if ListTools is accurate
          throw new McpError(ErrorCode.MethodNotFound, `Tool ${request.params.toolName} not found`);
        }

        // Unified execution logic
        try {
          const { stdout } = await spawnAsync(this.claudeCliPath, finalCommandArgs);
          if (debugMode) {
            console.debug(`Claude CLI stdout(${toolNameForLogging}, plain text):`, stdout);
          }
          return { content: [{ type: 'text', text: stdout }] };
        } catch (error) {
          let errorMessage = `Unknown error during Claude CLI execution for tool ${toolNameForLogging}`;
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          console.error(`[Error] Tool execution failed(${toolNameForLogging}): ${errorMessage}`);
          if (error instanceof McpError) {
            throw error; // Re-throw existing McpError
          }
          // Wrap other errors as InternalError
          throw new McpError(ErrorCode.InternalError, `Tool execution failed(${toolNameForLogging}): ${errorMessage}`);
        }

      } catch (error) { // Catch errors from prompt construction or if an McpError was thrown above
        let errorMessage = 'Unknown error';
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        // Ensure toolNameForLogging is available or use a generic message
        const toolContext = request.params.toolName ? `for tool ${request.params.toolName}` : '';
        console.error(`[Error] Tool request processing failed ${toolContext}: ${errorMessage}`);
        if (error instanceof McpError) {
          throw error; // Re-throw existing McpError
        }
        // Wrap other errors as InternalError
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