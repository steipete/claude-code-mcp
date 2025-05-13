# Changelog

## [1.4.0] - 2025-05-13

### Changed
- **Unified Claude Tools into a Single Agentic `code` Tool:**
  - Removed the `magic_file` tool. All its functionalities are now integrated into the `code` tool.
  - The `code` tool is now the sole interface to Claude's capabilities, acting as a versatile agent.
- **Massively Expanded `code` Tool Description:**
  - The description for the `code` tool in both `src/server.ts` and `README.md` has been significantly enhanced to reflect its broad agentic capabilities. This includes:
    - Code generation, analysis, and refactoring.
    - File system operations (creating, reading, editing, moving, copying, deleting files).
    - Version control operations (e.g., staging, committing, pushing changes).
    - Running terminal commands.
    - Web searching and summarization.
    - Managing complex multi-step workflows.
  - **CRITICAL:** Added explicit guidance and examples on the necessity for the user's prompt to provide Current Working Directory (CWD) context (e.g., "Your work folder is /path/to/project") when operations depend on it.
  - Added an "Advanced Usage Tip" explaining how to use temporary files to pass large text inputs to Claude, avoiding JSON formatting issues.
  - Added GitHub interaction examples (creating PRs, checking CI status) to the `code` tool description in `src/server.ts` and `README.md`.
  - Removed 'options.tools' from all documentation.
- Updated `README.md` to remove references to `magic_file` and reflect the new, comprehensive `code` tool description.

## [1.3.0] - 2025-05-13

### Changed
- Unified CWD (Current Working Directory) handling for `code` and `magic_file` tools.
  - The server no longer automatically injects 'Your work folder is...' context into prompts for these tools.
  - Users MUST now explicitly provide CWD context (e.g., by starting their `prompt` for the `code` tool, or `instruction` for the `magic_file` tool, with 'Your work folder is /path/to/project_root') if operations require it, especially for relative paths or context-sensitive tasks.
  - Updated tool descriptions in `README.md` and `src/server.ts` to reflect this new responsibility for the client/user.

## [1.2.0] - 2025-05-13

### Added
- More example screenshots to `README.md`.
- Detailed example of a complex multi-step prompt for the `code` tool in `README.md`.
- `@eslint/js` dependency (via user update to `package.json`).

### Changed
- Significantly enhanced the `code` tool description in `README.md` to highlight its power for complex tasks and encourage ambitious use.
- Updated the `code` tool description within `src/server.ts` to align with the enhanced `README.md` version.
- Clarified in `README.md` that the server automatically injects the Current Working Directory (CWD) context into prompts for the `code` tool.

## [1.1.0] - 2025-05-13

### Added
- Automatically prepend the current working directory (CWD) to the prompt for the `code` tool, providing better context to Claude Code.

## [1.0.0] - 2025-05-13

### Added
- Initial version of the Claude Code MCP server.
- `code` tool: Executes arbitrary prompts with the Claude CLI, enabling code generation, web search, and running terminal commands (like opening apps/URLs).
- `magic_file` tool: Edits files based on natural language instructions using the Claude CLI. Handles relative and absolute paths.
- Dynamic Claude CLI path finding: Checks `CLAUDE_CLI_PATH` env var, then `~/.claude/local/claude`, then falls back to `claude` in PATH.