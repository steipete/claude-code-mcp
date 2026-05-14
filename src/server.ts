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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as path from 'path';

// Server version - update this when releasing new versions
const SERVER_VERSION = "1.10.12";

// Define debugMode globally using const
const debugMode = process.env.MCP_CLAUDE_DEBUG === 'true';

// Track if this is the first tool use for version printing
let isFirstToolUse = true;

// Capture server startup time when the module loads
const serverStartupTime = new Date().toISOString();

// Dedicated debug logging function
export function debugLog(message?: any, ...optionalParams: any[]): void {
  if (debugMode) {
    console.error(message, ...optionalParams);
  }
}

/**
 * Determine the Claude CLI command/path.
 * 1. Checks CLAUDE_CLI_PATH env var (absolute path to the CLI binary).
 * 2. Checks CLAUDE_CLI_NAME env var (custom binary name or absolute path).
 * 3. Checks local user path: ~/.claude/local/claude (+ .cmd/.exe on Windows).
 * 4. Falls back to the CLI name (or 'claude'), relying on the system's PATH.
 */
export function findClaudeCli(): string {
  debugLog('[Debug] Attempting to find Claude CLI...');
  const isWindows = process.platform === 'win32';

  // 1. Check CLAUDE_CLI_PATH first (explicit absolute path to the binary)
  const cliPath = process.env.CLAUDE_CLI_PATH;
  if (cliPath) {
    debugLog(`[Debug] CLAUDE_CLI_PATH is set: ${cliPath}`);
    if (existsSync(cliPath)) {
      debugLog(`[Debug] Found Claude CLI at CLAUDE_CLI_PATH: ${cliPath}`);
      return cliPath;
    }
    console.warn(`[Warning] CLAUDE_CLI_PATH is set to "${cliPath}" but file does not exist. Continuing with other methods.`);
  }

  // 2. Check for custom CLI name from environment variable
  const customCliName = process.env.CLAUDE_CLI_NAME;
  if (customCliName) {
    debugLog(`[Debug] Using custom Claude CLI name from CLAUDE_CLI_NAME: ${customCliName}`);

    // If it's an absolute path, use it directly
    if (path.isAbsolute(customCliName)) {
      debugLog(`[Debug] CLAUDE_CLI_NAME is an absolute path: ${customCliName}`);
      return customCliName;
    }

    // If it starts with ~ or ./, reject as relative paths are not allowed
    if (customCliName.startsWith('./') || customCliName.startsWith('../') || customCliName.includes('/')) {
      throw new Error(`Invalid CLAUDE_CLI_NAME: Relative paths are not allowed. Use either a simple name (e.g., 'claude') or an absolute path (e.g., '/tmp/claude-test')`);
    }
  }

  const cliName = customCliName || 'claude';

  // 3. Try local install path: ~/.claude/local/claude
  //    On Windows, also check .cmd and .exe extensions since npm installs create .cmd wrappers
  const userPath = join(homedir(), '.claude', 'local', 'claude');
  const candidatePaths = isWindows
    ? [userPath, `${userPath}.cmd`, `${userPath}.exe`]
    : [userPath];

  for (const candidate of candidatePaths) {
    debugLog(`[Debug] Checking for Claude CLI at: ${candidate}`);
    if (existsSync(candidate)) {
      debugLog(`[Debug] Found Claude CLI at: ${candidate}`);
      return candidate;
    }
  }
  debugLog(`[Debug] Claude CLI not found at local user path: ${userPath}`);

  // 4. On Windows, also check common npm global install locations
  if (isWindows) {
    const npmGlobalPaths = [
      join(homedir(), 'AppData', 'Roaming', 'npm', 'claude.cmd'),
      join(homedir(), 'AppData', 'Roaming', 'npm', 'claude.exe'),
    ];
    for (const npmPath of npmGlobalPaths) {
      debugLog(`[Debug] Checking Windows npm global path: ${npmPath}`);
      if (existsSync(npmPath)) {
        debugLog(`[Debug] Found Claude CLI at npm global path: ${npmPath}`);
        return npmPath;
      }
    }
  }

  // 5. Fallback to CLI name (PATH lookup)
  debugLog(`[Debug] Falling back to "${cliName}" command name, relying on spawn/PATH lookup.`);
  console.warn(`[Warning] Claude CLI not found at local paths. Falling back to "${cliName}" in PATH. Ensure it is installed and accessible.`);
  return cliName;
}

/**
 * Interface for Claude Code tool arguments
 */
interface ClaudeCodeArgs {
  prompt: string;
  workFolder?: string;
  sessionId?: string;
  messages?: ConversationMessage[];
  stateless?: boolean;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeCliResponse {
  type: string;
  result?: string;
  session_id?: string;
}

interface SessionEntry {
  claudeSessionId: string;
  updatedAt: string;
}

const MAX_SESSIONS = 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_FILE =
  process.env.CLAUDE_CODE_MCP_SESSION_FILE ||
  join(homedir(), '.config', 'claude-code-mcp', 'sessions.json');
let sessionMap: Map<string, SessionEntry> | null = null;

function ensureSessionMap(): Map<string, SessionEntry> {
  if (sessionMap) return sessionMap;
  sessionMap = new Map();
  try {
    if (existsSync(SESSION_FILE)) {
      const parsed = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as Record<string, SessionEntry>;
      sessionMap = new Map(Object.entries(parsed));
      cleanExpiredSessions();
    }
  } catch (error) {
    debugLog('[Debug] Failed to load Claude session map:', error);
    sessionMap = new Map();
  }
  return sessionMap;
}

function saveSessionMap(): void {
  const map = ensureSessionMap();
  try {
    mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    writeFileSync(SESSION_FILE, JSON.stringify(Object.fromEntries(map), null, 2), {
      mode: 0o600,
    });
  } catch (error) {
    debugLog('[Debug] Failed to save Claude session map:', error);
  }
}

function cleanExpiredSessions(): void {
  const map = ensureSessionMap();
  const now = Date.now();
  let changed = false;
  for (const [key, entry] of map) {
    if (now - new Date(entry.updatedAt).getTime() > SESSION_TTL_MS) {
      map.delete(key);
      changed = true;
    }
  }
  if (changed) saveSessionMap();
}

function getSessionMapping(parentSessionId: string): string | undefined {
  const map = ensureSessionMap();
  const entry = map.get(parentSessionId);
  if (!entry) return undefined;
  if (Date.now() - new Date(entry.updatedAt).getTime() > SESSION_TTL_MS) {
    map.delete(parentSessionId);
    saveSessionMap();
    return undefined;
  }
  return entry.claudeSessionId;
}

function setSessionMapping(parentSessionId: string, claudeSessionId: string): void {
  const map = ensureSessionMap();
  if (map.size >= MAX_SESSIONS) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
  map.set(parentSessionId, {
    claudeSessionId,
    updatedAt: new Date().toISOString(),
  });
  saveSessionMap();
}

function formatConversationContext(messages: ConversationMessage[]): string {
  if (messages.length === 0) return '';
  const formatted = messages
    .map((message) => {
      const role = message.role === 'assistant' ? 'Assistant' : 'User';
      return `[${role}]: ${message.content}`;
    })
    .join('\n\n');
  return `<conversation_context>\n${formatted}\n</conversation_context>\n\n`;
}

function translateSlashCommands(prompt: string): string {
  return prompt.replace(/^\/([a-zA-Z][a-zA-Z0-9_-]*)(?=\s|$)/gm, '@$1');
}

function parseClaudeResponse(stdout: string): ClaudeCliResponse | null {
  const trimmed = stdout.trim();
  const candidates = trimmed.startsWith('{') && trimmed.endsWith('}')
    ? [trimmed]
    : trimmed.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('{') && line.endsWith('}')).reverse();

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as ClaudeCliResponse;
      if (parsed.type === 'result') return parsed;
    } catch {
      // Try the next JSON-looking line.
    }
  }
  return null;
}

// Ensure spawnAsync is defined correctly *before* the class
export async function spawnAsync(command: string, args: string[], options?: { timeout?: number, cwd?: string }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    debugLog(`[Spawn] Running command: ${command} ${args.join(' ')}`);

    // On Windows, .cmd/.bat files need shell: true to execute properly
    const needsShell = process.platform === 'win32' &&
      (command.toLowerCase().endsWith('.cmd') || command.toLowerCase().endsWith('.bat'));

    const childProcess = spawn(command, args, {
      shell: needsShell,
      timeout: options?.timeout,
      cwd: options?.cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout.on('data', (data) => { stdout += data.toString(); });
    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      debugLog(`[Spawn Stderr Chunk] ${data.toString()}`);
    });

    childProcess.on('error', (error: NodeJS.ErrnoException) => {
      debugLog(`[Spawn Error Event] Full error object:`, error);
      let errorMessage = `Spawn error: ${error.message}`;
      if (error.path) {
        errorMessage += ` | Path: ${error.path}`;
      }
      if (error.syscall) {
        errorMessage += ` | Syscall: ${error.syscall}`;
      }
      errorMessage += `\nStderr: ${stderr.trim()}`;
      reject(new Error(errorMessage));
    });

    childProcess.on('close', (code) => {
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
export class ClaudeCodeServer {
  private server: Server;
  private claudeCliPath: string; // This now holds either a full path or just 'claude'
  private packageVersion: string; // Add packageVersion property

  constructor() {
    // Use the simplified findClaudeCli function
    this.claudeCliPath = findClaudeCli(); // Removed debugMode argument
    console.error(`[Setup] Using Claude CLI command/path: ${this.claudeCliPath}`);
    this.packageVersion = SERVER_VERSION;

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
          name: 'claude_code',
          description: `Claude Code Agent: Your versatile multi-modal assistant for code, file, Git, and terminal operations via Claude CLI. Use \`workFolder\` for contextual execution.

• File ops: Create, read, (fuzzy) edit, move, copy, delete, list files, analyze/ocr images, file content analysis
    └─ e.g., "Create /tmp/log.txt with 'system boot'", "Edit main.py to replace 'debug_mode = True' with 'debug_mode = False'", "List files in /src", "Move a specific section somewhere else"

• Code: Generate / analyse / refactor / fix
    └─ e.g. "Generate Python to parse CSV→JSON", "Find bugs in my_script.py"

• Git: Stage ▸ commit ▸ push ▸ tag (any workflow)
    └─ "Commit '/workspace/src/main.java' with 'feat: user auth' to develop."

• Terminal: Run any CLI cmd or open URLs
    └─ "npm run build", "Open https://developer.mozilla.org"

• Web search + summarise content on-the-fly

• Multi-step workflows  (Version bumps, changelog updates, release tagging, etc.)

• GitHub integration  Create PRs, check CI status

• Confused or stuck on an issue? Ask Claude Code for a second opinion, it might surprise you!

**Prompt tips**

1. Be concise, explicit & step-by-step for complex tasks. No need for niceties, this is a tool to get things done.
2. For multi-line text, write it to a temporary file in the project root, use that file, then delete it.
3. If you get a timeout, split the task into smaller steps.
4. **Seeking a second opinion/analysis**: If you're stuck or want advice, you can ask \`claude_code\` to analyze a problem and suggest solutions. Clearly state in your prompt that you are looking for analysis only and no actual file modifications should be made.
5. If workFolder is set to the project path, there is no need to repeat that path in the prompt and you can use relative paths for files.
6. Claude Code is really good at complex multi-step file operations and refactorings and faster than your native edit features.
7. Combine file operations, README updates, and Git commands in a sequence.
8. Claude can do much more, just ask it!

        `,
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
              sessionId: {
                type: 'string',
                description: 'Parent session ID. When provided, repeated calls resume the same Claude Code session.',
              },
              messages: {
                type: 'array',
                description: 'Conversation history to inject on the first call for a session.',
                items: {
                  type: 'object',
                  properties: {
                    role: {
                      type: 'string',
                      enum: ['user', 'assistant'],
                    },
                    content: {
                      type: 'string',
                    },
                  },
                  required: ['role', 'content'],
                },
              },
              stateless: {
                type: 'boolean',
                description: 'Disable session continuity for this call.',
                default: false,
              },
            },
            required: ['prompt'],
          },
        }
      ],
    }));

    // Handle tool calls
    const executionTimeoutMs = 1800000; // 30 minutes timeout

    this.server.setRequestHandler(CallToolRequestSchema, async (args, call): Promise<ServerResult> => {
      debugLog('[Debug] Handling CallToolRequest:', args);

      // Correctly access toolName from args.params.name
      const toolName = args.params.name;
      if (toolName !== 'claude_code') {
        // ErrorCode.ToolNotFound should be ErrorCode.MethodNotFound as per SDK for tools
        throw new McpError(ErrorCode.MethodNotFound, `Tool ${toolName} not found`);
      }

      // Robustly access prompt from args.params.arguments
      const toolArguments = args.params.arguments;
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

      const sessionId = toolArguments.sessionId;
      if (sessionId !== undefined && typeof sessionId !== 'string') {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid parameter: sessionId must be a string.');
      }

      const messages = toolArguments.messages;
      if (messages !== undefined) {
        if (!Array.isArray(messages)) {
          throw new McpError(ErrorCode.InvalidParams, 'Invalid parameter: messages must be an array.');
        }
        for (const message of messages) {
          if (
            typeof message !== 'object' ||
            message === null ||
            (message.role !== 'user' && message.role !== 'assistant') ||
            typeof message.content !== 'string'
          ) {
            throw new McpError(ErrorCode.InvalidParams, 'Invalid parameter: each message must include role and content strings.');
          }
        }
      }

      const stateless = toolArguments.stateless === true;

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

        // Print tool info on first use
        if (isFirstToolUse) {
          const versionInfo = `claude_code v${SERVER_VERSION} started at ${serverStartupTime}`;
          console.error(versionInfo);
          isFirstToolUse = false;
        }

        let processedPrompt = translateSlashCommands(prompt);
        const claudeProcessArgs = ['--dangerously-skip-permissions'];
        const useSessionContinuity = !stateless && typeof sessionId === 'string' && sessionId.length > 0;

        if (useSessionContinuity) {
          const existingClaudeSessionId = getSessionMapping(sessionId);
          claudeProcessArgs.push('--output-format', 'json');
          if (existingClaudeSessionId) {
            claudeProcessArgs.push('--resume', existingClaudeSessionId);
          } else if (Array.isArray(messages) && messages.length > 0) {
            processedPrompt = formatConversationContext(messages as ConversationMessage[]) +
              'Continue the conversation. ' +
              processedPrompt;
          }
        }

        claudeProcessArgs.push('-p', processedPrompt);
        debugLog(`[Debug] Invoking Claude CLI: ${this.claudeCliPath} ${claudeProcessArgs.join(' ')}`);

        const { stdout, stderr } = await spawnAsync(
          this.claudeCliPath, // Run the Claude CLI directly
          claudeProcessArgs, // Pass the arguments
          { timeout: executionTimeoutMs, cwd: effectiveCwd }
        );

        debugLog('[Debug] Claude CLI stdout:', stdout.trim());
        if (stderr) {
          debugLog('[Debug] Claude CLI stderr:', stderr.trim());
        }

        if (!useSessionContinuity) {
          // Return stdout content, even if there was stderr, as claude-cli might output main result to stdout.
          return { content: [{ type: 'text', text: stdout }] };
        }

        const parsedResponse = parseClaudeResponse(stdout);
        if (!parsedResponse) {
          return { content: [{ type: 'text', text: stdout }] };
        }

        const resultText = parsedResponse.result ?? '';
        const claudeSessionId = parsedResponse.session_id;
        if (claudeSessionId) {
          setSessionMapping(sessionId, claudeSessionId);
        }

        const content: { type: 'text'; text: string }[] = [{ type: 'text', text: resultText }];
        if (claudeSessionId) {
          content.push({ type: 'text', text: `\n---\n_Session ID: ${claudeSessionId}_` });
        }
        return { content };

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
  async run(): Promise<void> {
    // Revert to original server start logic if listen caused errors
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Claude Code MCP server running on stdio');
  }
}

export async function main(): Promise<void> {
  const server = new ClaudeCodeServer();
  await server.run();
}

const isMainModule = process.argv[1] !== undefined
  && pathResolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch(console.error);
}
