# Claude Code MCP Server

An MCP (Model Context Protocol) server that allows running Claude Code in one-shot mode with permissions bypassed automatically.

<a href="https://glama.ai/mcp/servers/@steipete/claude-code-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@steipete/claude-code-mcp/badge" alt="Claude Code Server MCP server" />
</a>

## Overview

This MCP server provides two tools that can be used by LLMs to interact with Claude Code. When integrated with Claude Desktop or other MCP clients, it allows LLMs to:

- Run Claude Code with all permissions bypassed (using `--dangerously-skip-permissions`)
- Execute Claude Code with any prompt without permission interruptions
- Access file editing capabilities directly
- Enable specific tools by default

## Prerequisites

- Node.js v16 or later
- TypeScript (for development)
- Claude CLI installed and working

## Installation

1. Clone or download this repository:

```bash
git clone https://github.com/yourusername/claude-mcp-server.git
cd claude-mcp-server
```

2. Install dependencies:

```bash
npm install
```

3. Build the TypeScript code:

```bash
npm run build
```

4. Make the start script executable:

```bash
chmod +x start.sh
```

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

You can customize the server behavior with the following environment variables (edit them in start.sh):

- `CLAUDE_CLI_PATH`: Set a custom path to the Claude CLI executable

If not specified, the server will attempt to find the Claude CLI in common locations:
- `~/.claude/local/claude`
- `~/.local/bin/claude`
- `~/bin/claude`
- `/usr/local/bin/claude`
- `/usr/bin/claude`
- `claude` (in PATH)

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

### Claude Code Tool

```json
{
  "prompt": "Your prompt to Claude Code here",
  "options": {
    "tools": ["Bash", "Read", "Write"]
  }
}
```

If no tools are specified, the server enables common tools by default.

### Claude File Edit Tool

```json
{
  "file_path": "/path/to/your/file.js",
  "instruction": "Add a new function that calculates the fibonacci sequence"
}
```

## Tool Descriptions

The server provides two tools:

1. **Tool name**: `claude_code`
   - **Description**: "Claude Code is an AI that has system tools to edit files, search the web and access mcp tools can do basically anything as it is an AI. It can modify files, fix bugs, and refactor code across your entire project."
   - **Parameters**:
     - `prompt` (required): The prompt to send to Claude Code
     - `options.tools` (optional): Array of specific tools to enable
   - **Implementation**: Uses `claude --dangerously-skip-permissions` to bypass all permission checks

2. **Tool name**: `claude_file_edit`
   - **Description**: "Edit any file with a free text description. Is your edit_file tool not working again? Tell me what file and the contents and I'll figure it out!"
   - **Parameters**:
     - `file_path` (required): The absolute path to the file to edit
     - `instruction` (required): Free text description of the edits to make to the file
   - **Implementation**: Uses `claude --dangerously-skip-permissions` with Edit tools enabled

## Troubleshooting

- **Tool not showing up**: Check the Claude logs for errors when starting the MCP server.
- **Command not found**: Ensure Claude CLI is installed and available in one of the search paths.
- **Permission errors**: Ensure the start.sh script is executable.

## License

MIT