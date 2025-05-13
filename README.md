# Claude Code MCP Server

An MCP (Model Context Protocol) server that allows running Claude Code in one-shot mode with permissions bypassed automatically.

Did you notice that Cursor often struggles to apply smaller edits via edit_file, especially when linting? And then it tries multiple times till it eventually works? Yeah... no more. It LOVES magic_file.

<img src="screenshot.png" width="600" alt="Screenshot">

## Overview

This MCP server provides one tool that can be used by LLMs to interact with Claude Code. When integrated with Claude Desktop or other MCP clients, it allows LLMs to:

- Run Claude Code with all permissions bypassed (using `--dangerously-skip-permissions`)
- Execute Claude Code with any prompt without permission interruptions
- Access file editing capabilities directly
- Enable specific tools by default

## Prerequisites

- Node.js v16 or later
- TypeScript (for development)
- Claude CLI installed and working. Ensure Claude CLI is installed and accessible, preferably by running `/doctor`. This installs/updates the CLI to `~/.claude/local/claude`, which this server checks by default.

## Installation

1. Clone or download this repository:

```bash
git clone https://github.com/yourusername/claude-mcp-server.git
cd claude-mcp-server
```

2. Install dependencies (this will also install `tsx` for direct TypeScript execution):

```bash
npm install
```

3. Make the start script executable:

```bash
chmod +x start.sh
```

## Important First-Time Setup: Accepting Permissions

**Before the MCP server can successfully use the `code` tool, you must first run the Claude CLI manually once with the `--dangerously-skip-permissions` flag and accept the terms.**

This is a one-time requirement by the Claude CLI. You can do this by running a simple command in your terminal, for example:

```bash
claude -p "hello" --dangerously-skip-permissions
```

Or, if `claude` is not in your PATH but you're using the default install location:

```bash
~/.claude/local/claude -p "hello" --dangerously-skip-permissions
```

Follow the prompts to accept. Once this is done, the MCP server will be able to use the flag non-interactively.

## Connecting to Cursor/Windsurf/Visual Studio Code

### macOS

1. Locate the MCP configuration file:
   ```
   ~/.cursor/mcp.json
   ```
   Create this file if it doesn't exist.

2. Add the server configuration to the file:

```json
{
  "mcpServers": {
    "claude_code": {
      "type": "stdio",
      "command": "/absolute/path/to/claude-mcp-server/start.sh",
      "args": []
    }
  }
}
```

Make sure to replace `/absolute/path/to/claude-mcp-server` with the actual path to where you installed this server.

### Windows

1. Locate the MCP configuration file:
   ```
   %APPDATA%\cursor\mcp.json
   ```
   Create this file if it doesn't exist.

2. Add the server configuration to the file, making sure to use Windows path format:

```json
{
  "mcpServers": {
    "claude_code": {
      "type": "stdio",
      "command": "C:\\path\\to\\claude-mcp-server\\start.bat",
      "args": []
    }
  }
}
```

For Windows, you should use the batch file (start.bat) instead of the shell script.

### Linux

1. Locate the MCP configuration file:
   ```
   ~/.config/cursor/mcp.json
   ```
   Create this file if it doesn't exist.

2. Add the server configuration to the file:

```json
{
  "mcpServers": {
    "claude_code": {
      "type": "stdio",
      "command": "/absolute/path/to/claude-mcp-server/start.sh",
      "args": []
    }
  }
}
```

3. After updating the configuration, restart your IDE to load the MCP server.

## Environment Variables

You can customize the server behavior with the following environment variables (edit them in `start.sh` or `start.bat`):

- `CLAUDE_CLI_PATH`: **Optional.** Set a custom absolute path to the Claude CLI executable. If set and the path points to an existing file, this path will be used directly.
- `MCP_CLAUDE_DEBUG`: Set to `true` to enable verbose debug logging from the server to stderr (e.g., `MCP_CLAUDE_DEBUG=true ./start.sh`).

**Claude CLI Discovery Order:**
1.  The path specified by the `CLAUDE_CLI_PATH` environment variable (if set and valid).
2.  The default installation path for Unix-like systems: `~/.claude/local/claude` (where `~` is the user's home directory). For Windows users, this automatic check may not apply; relying on `CLAUDE_CLI_PATH` or ensuring `claude` is in the system PATH is recommended.
3.  Defaults to simply `claude`, relying on the system's PATH for resolution (a warning will be logged if this fallback is used).

## Connecting to VSCode Claude

To use this MCP server with Claude in VSCode:

1. Install the Claude extension in VSCode

2. Create or edit the MCP settings file:
   ```
   ~/.vscode/extensions/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
   ```

3. Add the server configuration:

```json
{
  "mcpServers": {
    "claude_code": {
      "command": "/absolute/path/to/claude-mcp-server/start.sh",
      "args": [],
      "disabled": false
    }
  }
}
```

## Usage

Once installed and connected to an MCP client, you can invoke the tools using the following formats:

### Claude Code Tool (renamed to `code`)

```json
{
  "tool_name": "code",
  "params": {
    "prompt": "Your prompt to Claude Code here"
  }
}
```

#### Prompting Best Practices
The more detailed, clear, and well-structured your prompt, the better Claude can understand and execute your intent. For complex tasks, breaking them down into numbered steps within the prompt is highly effective.

#### Advanced Usage Tip: Handling Large Text Inputs
For prompts that require embedding very large blocks of text (e.g., entire files to be processed, extensive code snippets to be analyzed), directly including them in the JSON payload for the `code` tool can sometimes lead to formatting or escaping issues within the prompt string itself. A robust workaround is to:
1.  Have Claude (or another process) write the large text block to a temporary file within its accessible working directory.
2.  Instruct Claude in your `code` tool prompt to read the content from this temporary file.
3.  Proceed with the rest of your prompt, referencing the content read from the file for subsequent operations.
4.  Optionally, instruct Claude to delete the temporary file after use to clean up.

Example prompt snippet demonstrating this:
```
"Your work folder is /path/to/project

1. Read the full content of './large_input_data.txt' into a variable named DATA.
2. Analyze DATA to find all email addresses.
3. Create a new file 'emails.txt' and write the found email addresses to it.
4. Delete './large_input_data.txt'."
```

This multi-step approach ensures the integrity and accurate transmission of large text inputs.

`options.tools` can be used to specify internal Claude tools (e.g., `Bash`, `Read`, `Write`); common tools are enabled by default if this is omitted.

#### Example: Complex Multi-step Task

The `code` tool can handle surprisingly complex, multi-step instructions. For instance, the following prompt was used successfully to identify screenshots on the desktop, copy them to the project, update this README with the new images and captions, and then stage, commit, and push all related changes (including a `package.json` update) to GitHub, all in one go:

```text
Your work folder is /Users/steipete/Projects/claude-mcp/mcp-server/

Here's a multi-step task:
1.  Identify two screenshot image files on the user's desktop located at /Users/steipete/Desktop/. One is an existing screenshot, likely named something like 'cursor-screenshot.png' or related to Cursor IDE. The other is a newer screenshot depicting an AI tool (like Cascade) using another tool for git operations.
2.  Copy these two identified screenshot files into the current project directory (/Users/steipete/Projects/claude-mcp/mcp-server/). Ensure the one related to Cursor is named `cursor-screenshot.png`. Name the new screenshot (showing the AI tool and git operations) as `claude_tool_git_example.png`.
3.  Modify the `README.md` file in the project directory. In the '## Example Screenshots' section:
    a.  Ensure there's an entry for `cursor-screenshot.png` (e.g., `<img src="cursor-screenshot.png" width="600" alt="Cursor Screenshot">`).
    b.  Add a new entry for `claude_tool_git_example.png`. It should be an image tag like `<img src="claude_tool_git_example.png" width="600" alt="Screenshot of AI assistant using mcp1_code tool for git operations">` followed by the caption on a new line: "Tools seem to prefer it even for git operations as it runs faster and in one shot."
4.  Stage the following files for a git commit: `README.md`, `cursor-screenshot.png`, `claude_tool_git_example.png`, and `package.json`.
5.  Commit the staged changes with the message: "docs: add example screenshots and update dependencies".
6.  Push the commit to the default remote repository (origin) and the current branch (likely main).
```

7.  **Repairing Files with Syntax Errors:**
    - 
      ```
      "Your work folder is /path/to/project

      The file 'src/utils/parser.js' has syntax errors after a recent complex edit that broke its structure. Please analyze it, identify the syntax errors, and correct the file to make it valid JavaScript again, ensuring the original logic is preserved as much as possible."
      ```

8.  **Interacting with GitHub (e.g., Creating a Pull Request):**
    - 
      ```
      "Your work folder is /Users/steipete/my_project

      Create a GitHub Pull Request in the repository 'owner/repo' from the 'feature-branch' to the 'main' branch. Title: 'feat: Implement new login flow'. Body: 'This PR adds a new and improved login experience for users.'"
      ```

9.  **Interacting with GitHub (e.g., Checking PR CI Status):**
    - 
      ```
      "Your work folder is /Users/steipete/my_project

      Check the status of CI checks for Pull Request #42 in the GitHub repository 'owner/repo'. Report if they have passed, failed, or are still running."
      ```

**Prompting Best Practices:** The more detailed, clear, and well-structured your prompt, the better Claude can understand and execute your intent. For complex tasks, breaking them down into numbered steps within the prompt is highly effective.

## Tool Descriptions

The server provides one tool:

1. **Tool name**: `code`
   - **Description**: "Executes a complex **prompt** directly using the Claude Code CLI, bypassing its internal permission checks (`--dangerously-skip-permissions`). This leverages Claude's ability to understand the prompt, reason about the task, and utilize its **internal tools** (like web search, file reading/writing, and bash execution) to achieve the goal. Ideal for complex code generation, analysis, refactoring, running build/test/lint commands (e.g., `npm test`, `pytest`), managing version control (e.g., `git status`, `git commit`), executing multi-step workflows (e.g., '''search for library updates and apply them'''), or performing other tasks requiring integrated reasoning and execution based on a single natural language instruction. Essentially, if you can describe a sequence of operations clearly, this tool can attempt to execute it. **Do not hesitate to use this tool for ambitious, multi-step tasks, even if they seem complex.** Best results are achieved with well-structured, detailed prompts. The server **does NOT automatically inject 'Your work folder is...'** context. If the `prompt` requires specific CWD context (for file operations, relative paths, git commands, etc.), the **`prompt` itself MUST explicitly start with 'Your work folder is /path/to/your/project_root'.** Claude executes within the server's CWD, so relative paths in prompts without explicit CWD context will resolve against the server's CWD. Using absolute paths in prompts is often safest if not providing explicit CWD context. Refer to the 'Example: Complex Multi-step Task' below for a concrete demonstration of its capabilities."
   - **Parameters**:
     - `prompt` (required): The prompt to send to Claude Code
   - **Implementation**: Uses `claude --dangerously-skip-permissions` (invoked via `child_process.spawn`) to bypass all permission checks. The server locates the Claude CLI by first checking the `CLAUDE_CLI_PATH` environment variable, then looking in `~/.claude/local/claude`, and finally falling back to `claude` in the system PATH.

## Example Screenshots

<img src="cursor-screenshot.png" width="600" alt="Cursor Screenshot">

<img src="claude_tool_git_example.png" width="600" alt="Screenshot of AI assistant using mcp1_code tool for git operations">
Tools seem to prefer it even for git operations as it runs faster and in one shot.

<img src="additional_claude_screenshot.png" width="600" alt="Additional example screenshot provided by the user">
This screenshot showcases another aspect of the project.

## Troubleshooting

- **Tool not showing up**: Check the Claude logs for errors when starting the MCP server. Ensure `start.sh` or `start.bat` is executable and `tsx` is installed and runnable (usually via `npx`).
- **Command not found / "Error: spawn claude ENOENT" / "[Warning] Claude CLI not found... Falling back to \"claude\" in PATH..."**: This means the server could not find the `claude` executable via the `CLAUDE_CLI_PATH` environment variable (if set), at the default Unix-like location (`~/.claude/local/claude`), or in the system PATH (if it fell back to just `'claude'`).
    - Ensure the Claude CLI is installed correctly. For Unix-like systems, this is often at `~/.claude/local/claude` (verify by running `/doctor` in a Claude context). For Windows, ensure it's in your system PATH or set `CLAUDE_CLI_PATH`.
    - Explicitly set the `CLAUDE_CLI_PATH` environment variable in `start.sh` or `start.bat` to the correct absolute path of your `claude` executable.
- **Permission errors**: Ensure the `start.sh` script is executable and that Node.js has permission to execute `tsx` and the Claude CLI (whether found via `CLAUDE_CLI_PATH`, the default path, or the system PATH).

## License

MIT

Server test complete.

<a href="https://glama.ai/mcp/servers/@steipete/claude-code-mcp">
<img width="380" height="200" src="https://glama.ai/mcp/servers/@steipete/claude-code-mcp/badge" alt="Claude Code Server MCP server" />
</a>