#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import packageJson from '../package.json' with { type: 'json' }; // Import package.json with attribute
// Define debugMode globally using const
const debugMode = process.env.MCP_CLAUDE_DEBUG === 'true';
/**
 * Determine the Claude CLI command/path.
 * 1. Checks CLAUDE_CLI_PATH environment variable.
 * 2. Checks for Claude CLI at ~/.claude/local/claude.
 * 3. Defaults to 'claude' if not found, relying on spawn() to perform PATH lookup.
 */
function findClaudeCli(debugMode) {
    // 1. Check environment variable first
    if (debugMode)
        console.error('[Debug] Checking for CLAUDE_CLI_PATH environment variable...');
    const envPath = process.env.CLAUDE_CLI_PATH;
    if (envPath) {
        if (debugMode)
            console.error(`[Debug] CLAUDE_CLI_PATH is set to: "${envPath}".`);
        if (existsSync(envPath)) {
            if (debugMode)
                console.error(`[Debug] Found Claude CLI via CLAUDE_CLI_PATH: "${envPath}". Using this path.`);
            return envPath;
        }
        // If existsSync(envPath) was false, we reach here.
        if (debugMode)
            console.error(`[Debug] CLAUDE_CLI_PATH "${envPath}" was set, but the file does not exist. Checking default user path next.`);
    }
    else {
        if (debugMode)
            console.error('[Debug] CLAUDE_CLI_PATH environment variable is not set. Checking default user path next.');
    }
    // 2. Check default user path: ~/.claude/local/claude
    if (debugMode)
        console.error('[Debug] Checking for Claude CLI at default user path (~/.claude/local/claude)...');
    try {
        const userPath = join(homedir(), '.claude', 'local', 'claude');
        if (existsSync(userPath)) {
            if (debugMode)
                console.error(`[Debug] Found Claude CLI at default user path: ${userPath}`);
            return userPath;
        }
        // If not returned, it means userPath does not exist, so log it.
        if (debugMode)
            console.error(`[Debug] Claude CLI not found at default user path: ${userPath}.`);
    }
    catch (err) {
        if (debugMode)
            console.error(`[Debug] Error checking default user path: ${err instanceof Error ? err.message : String(err)}`);
    }
    // 3. Default to 'claude' command name
    if (debugMode)
        console.error('[Debug] CLAUDE_CLI_PATH not set or invalid, and not found at default user path. Defaulting to "claude" command name, relying on spawn/PATH lookup.');
    console.warn('[Warning] Claude CLI not found via CLAUDE_CLI_PATH or at ~/.claude/local/claude. Falling back to "claude" in PATH. Ensure it is installed and accessible.');
    return 'claude'; // Return base command name
}
// Ensure spawnAsync is defined correctly *before* the class
async function spawnAsync(command, args, options) {
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
            if (debugMode) {
                console.error(`[Spawn Stderr Chunk] ${data.toString()}`);
            }
        });
        process.on('error', (error) => {
            if (debugMode) {
                console.error(`[Spawn Error Event] ${error.message}`);
            }
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
            }
            else {
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
    server;
    claudeCliPath; // This now holds either a full path or just 'claude'
    packageVersion; // Add packageVersion property
    constructor() {
        // Use the simplified findClaudeCli function
        this.claudeCliPath = findClaudeCli(debugMode);
        console.error(`[Setup] Using Claude CLI command/path: ${this.claudeCliPath}`);
        this.packageVersion = packageJson.version; // Access version directly
        this.server = new Server({
            name: 'claude_code',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
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
    setupToolHandlers() {
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

**Advanced Usage Tip:** When working with the \`code\` tool, you can set up complex workflows by using explicit step-by-step instructions. For example, instead of just asking \`"Fix the bugs in my code"\`, try: \`"Your work folder is /path/to/project\\n\\n1. Run the test suite to identify failing tests\\n2. Examine the failing tests to understand what's breaking\\n3. Check the relevant source files and fix the issues\\n4. Run the tests again to verify your fixes worked\\n5. Explain what you changed and why"\`.
\n\n**Pro Tip for Complex Inputs (e.g., multi-line text with backticks \`):**\nWhen your prompt needs to include multi-line text that contains special characters (like backticks or quotes) which might cause issues if directly embedded (e.g., for a GitHub PR body or editing this server's own source code):\n1.  First, instruct this \`code\` tool to write your complex text to a *separate temporary file*. For example: \`"Write the following exact content to /tmp/my_complex_text.txt:\\nThis is line one with a \\\`backtick\\\`.\\nThis is line two."\`\n2.  Then, in the *same prompt*, instruct the \`code\` tool to use the content of that temporary file for its main operation (e.g., editing a target file, or using it as a command argument). For instance: \`"Then, in the file src/target_file.js, replace the placeholder '%%COMPLEX_TEXT%%' with the entire content of /tmp/my_complex_text.txt."\` Or, for a command: \`"Then run the command: gh pr edit 123 --body-file /tmp/my_complex_text.txt"\`\n3.  Finally, instruct the \`code\` tool to delete the temporary file: \`"Then delete /tmp/my_complex_text.txt"\`\nThis method avoids issues with escaping special characters within the prompt itself and is highly recommended for reliability when dealing with complex string literals or multi-step commands.
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
        this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
            try {
                console.error(`[Claude Call] Using claude-code-mcp version: ${this.packageVersion}`);
                const toolName = req.params.name;
                if (toolName !== 'code' && toolName !== 'claude') {
                    console.error(`[Error] Tool name mismatch. Expected 'code' or 'claude', got: '${toolName}'`);
                    console.error(`[Error] Tool request processing failed : MCP error -32601: Tool ${toolName} not found`);
                    throw new McpError(ErrorCode.MethodNotFound, `Tool ${toolName} not found`);
                }
                let claudePrompt;
                const baseCommandArgs = ['--dangerously-skip-permissions'];
                let finalCommandArgs;
                // Validate and construct the prompt based on the tool
                const args = req.params.arguments; // Correctly access arguments
                if (!args || !args.prompt)
                    throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: prompt');
                claudePrompt = args.prompt;
                if (debugMode) {
                    console.error(`[Code Tool] Claude Prompt(direct from user): ${claudePrompt}`);
                }
                finalCommandArgs = [...baseCommandArgs];
                finalCommandArgs.push('-p', claudePrompt);
                // Unified execution logic
                try {
                    const { stdout, stderr } = await spawnAsync(this.claudeCliPath, finalCommandArgs, { timeout: 60000 }); // 60-second timeout
                    if (debugMode) {
                        console.error(`Claude CLI stdout(code, plain text):`, stdout);
                    }
                    return { content: [{ type: 'text', text: stdout }] };
                }
                catch (error) {
                    let errorMessage = `Unknown error during Claude CLI execution for tool ${toolName}`;
                    if (error instanceof Error) {
                        errorMessage = error.message;
                    }
                    console.error(`[Error] Tool execution failed(${toolName}): ${errorMessage}`);
                    if (error instanceof McpError) {
                        throw error; // Re-throw existing McpError
                    }
                    throw new McpError(ErrorCode.InternalError, `Tool execution failed(${toolName}): ${errorMessage}`);
                }
            }
            catch (error) { // Catch errors from prompt construction or if an McpError was thrown above
                let errorMessage = 'Unknown error';
                if (error instanceof Error) {
                    errorMessage = error.message;
                }
                // Ensure toolNameForLogging is available or use a generic message
                const toolContext = req.params.name ? `for tool ${req.params.name}` : ''; // Use req.params.name here too
                console.error(`[Error] Tool request processing failed ${toolContext}: ${errorMessage}`);
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
    async run() {
        // Revert to original server start logic if listen caused errors
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Claude Code MCP server running on stdio');
    }
}
// Create and run the server
const server = new ClaudeCodeServer();
server.run().catch(console.error);
