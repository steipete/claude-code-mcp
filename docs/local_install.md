# Local Installation & Development Setup

This guide is for developers who want to contribute to this server, run it directly from a cloned repository, or use `npm link` for local testing.

For general users, the recommended methods (global NPM install or `npx`) are covered in the main [README.md](../README.md).

## Option 1: Running Directly from a Cloned Repository (using `start.sh`)

This method is suitable if you prefer not to install the server globally or want to manage it directly within a specific path for development or testing.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/steipete/claude-code-mcp.git # Or your fork/actual repo URL
    cd claude-code-mcp
    ```

2.  **Install dependencies:**
    This will also install `tsx` for direct TypeScript execution via `start.sh`.
    ```bash
    npm install
    ```

3.  **Make the start script executable:**
    ```bash
    chmod +x start.sh
    ```

4.  **Configure MCP Client for `start.sh`:**
    Update your `mcp.json` file (e.g., `~/.codeium/windsurf/mcp_config.json` or `~/.cursor/mcp.json`) to point to the `start.sh` script:
    ```json
    {
      "mcpServers": {
        "claude_code": {
          "type": "stdio",
          "command": "/absolute/path/to/claude-mcp-server/start.sh",
          "args": []
        }
        // ... other MCP server configurations
      }
    }
    ```
    **Important:** Replace `/absolute/path/to/claude-mcp-server` with the actual absolute path to where you cloned the server.

5.  **First-Time Claude CLI Permissions:**
    As mentioned in the main README, ensure you've run the Claude CLI once with `--dangerously-skip-permissions` to accept terms:
    ```bash
    claude -p "hello" --dangerously-skip-permissions
    # Or ~/.claude/local/claude -p "hello" --dangerously-skip-permissions
    ```

6.  **Environment Variables for `start.sh` (Optional):**
    You can customize the server behavior by setting environment variables before running `start.sh` or by editing the `start.sh` script itself:
    - `CLAUDE_CLI_PATH`: Set a custom absolute path to the Claude CLI executable.
    - `MCP_CLAUDE_DEBUG`: Set to `true` to enable verbose debug logging from the MCP server.
    - `CLAUDE_CLI_TOOLS_DEFAULT`: Comma-separated list of default tools.
    - `CLAUDE_CLI_TOOLS_DANGEROUS`: Comma-separated list of tools to always enable.
    Refer to `start.sh` and the main README's "Configuration via Environment Variables" section for more details.

## Option 2: Local Development with `npm link`

This method allows you to install the package globally but have it point to your local cloned repository. This is useful for testing the global command (`claude-code-mcp`) with your local changes.

1.  **Clone the repository (if not already done):**
    ```bash
    git clone https://github.com/steipete/claude-code-mcp.git # Or your fork/actual repo URL
    cd claude-code-mcp
    ```

2.  **Install dependencies and build:**
    ```bash
    npm install       # Install dependencies
    npm run build     # Compile TypeScript to the dist/ directory
    ```

3.  **Link the package:**
    This makes `claude-code-mcp` (as defined in `package.json`'s `bin` field) available globally, pointing to your local `dist/server.js`.
    ```bash
    npm link
    ```
    After linking, running `claude-code-mcp` in your terminal will execute your local build.

4.  **Configure MCP Client for Linked Command:**
    Update your `mcp.json` file to use the `claude-code-mcp` command (which now points to your local linked version):
    ```json
    {
      "mcpServers": {
        "claude_code": {
          "type": "stdio",
          "command": "claude-code-mcp",
          "args": [],
          "env": {
            "MCP_CLAUDE_DEBUG": "false" // Or "true" for debugging
            // You can set other ENV VARS here too if needed for the linked command
          }
        }
      }
    }
    ```

5.  **Rebuilding after changes:**
    If you make changes to the TypeScript source (`src/`), you'll need to rebuild for `npm link` to reflect them:
    ```bash
    npm run build
    ```
    There's no need to run `npm link` again unless `package.json` (especially the `bin` field) changes.

## General Development Notes

- **TypeScript:** The server is written in TypeScript. Code is in the `src/` directory and compiled to `dist/`.
- **Prerequisites:** Ensure Node.js v20+ and a working Claude CLI are installed.
- **Contributing:** Submit issues and pull requests to the main [GitHub repository](https://github.com/steipete/claude-code-mcp).
