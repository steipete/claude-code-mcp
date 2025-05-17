# AGENT.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is the source code for the Claude Code MCP tool - a server that allows running Claude Code in one-shot mode with permissions bypassed automatically. When you're asked to edit the Claude Code tool description or behavior, update it in `src/server.ts`.

## Key Files

- `src/server.ts`: The main server implementation containing the Claude Code tool description and functionality
- `package.json`: Package configuration and dependencies
- `start.sh`/`start.bat`: Scripts to start the server

## Development Commands

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm run start

# Development mode with auto-reloading
npm run dev
```

## Tool Description

The tool description can be found in `src/server.ts`. When asked to update the Claude Code tool description, look for the `description` field in the `setupToolHandlers` method.

## Architecture Notes

- This MCP server provides a single tool (`claude_code`) that executes Claude CLI with bypassed permissions
- The server handles execution via the `spawnAsync` function that runs Claude CLI with appropriate parameters
- Error handling and timeout management are implemented for reliability
- Working directory can be specified via the `workFolder` parameter

## Environment Variables

- `CLAUDE_CLI_PATH`: Path to the Claude CLI executable
- `MCP_CLAUDE_DEBUG`: Set to `true` for verbose debug logging

## Best Practices

- Always test changes locally before committing
- Maintain compatibility with the Model Context Protocol spec
- Keep error messages informative for troubleshooting
- Document any changes to the API or configuration options
- Pure updates to the readme and/or adding new images do not require a version bump.
- **Comprehensive Staging for README Image Updates:** When updating `README.md` to include new images, ensure that prompts for `claude_code` explicitly instruct it to stage *both* the modified `README.md` file *and* all new image files (e.g., from the `assets/` directory). Committing the `README.md` without its new image assets is a common pitfall.
- **Clarity in Multi-Step Git Prompts:** For complex, multi-step `claude_code` prompts involving Git operations (like creating branches, committing multiple files, and pushing/creating PRs):
    - Clearly list all files to be staged in the commit (text files, new image assets, etc.).
- **Automatic Push on PR Branches:** When the user asks to commit changes while on a pull request branch, Claude should automatically push the changes to the remote after committing. This ensures PR updates are immediately visible for review.