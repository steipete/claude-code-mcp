# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.10.13] - 2025-05-20

### Changed
- Updated Claude tool description to mention statelessness.

## [1.10.12] - 2025-05-17

- Fixed MCP server startup issue by ensuring process runs regardless of module detection
- Updated server version constant to match package version
- Simplified entry point logic to prevent early exit

## [1.10.11] - 2025-05-17

- Restored package structure to v1.9.4 configuration after bundling issues
- Removed bundling approach and dependencies (esbuild)
- Fixed build by returning to simple TypeScript compilation with tsc
- Kept ESLint in devDependencies where it belongs
- Package now works correctly as MCP server again

## [1.10.10] - 2025-05-17

- Restored shipping TypeScript source files alongside compiled JavaScript
- Returns to the pre-bundling approach of versions 1.5.0-1.9.x
- Includes src/server.ts, tsconfig.json, and start scripts in package
- Provides flexibility for users to run or modify the TypeScript version

## [1.10.9] - 2025-05-17

- Switched from bundling approach to TypeScript compilation like working MCP servers
- Aligns with successful macos-automator-mcp package structure
- Simpler build process with tsc instead of esbuild bundling

## [1.10.8] - 2025-05-17

- Fixed critical dependency issue by moving @eslint/js to devDependencies
- This resolves the MCP server crash on initialization
- Cleaner production bundle without unnecessary development dependencies

## [1.10.7] - 2025-05-17

- Fixed bundling configuration to properly include all native modules
- Resolved MCP initialization errors in bundled version

## [1.10.6] - 2025-05-17

- Runs now from compiled dist, bundled. Faster startup & smaller package size.
- Tool version and startup time print on first use

## [1.10.0] - 2025-05-17

- Support for `CLAUDE_CLI_NAME` environment variable to override the Claude CLI binary name
- Support for absolute paths in `CLAUDE_CLI_NAME` (e.g., `/tmp/claude-test`)
- Comprehensive unit and e2e tests for the server functionality
- Test infrastructure with mocked Claude CLI for reliable testing
- `CLAUDE_CLI_NAME` now supports both simple names and absolute paths
- Relative paths in `CLAUDE_CLI_NAME` now throw an error (security improvement)
- Removed test mock directory lookup when absolute path is provided

## [1.9.5] - 2025-05-15

### Changed  
- Clarify that workingDir must be absolute.

## [1.9.4] - 2025-05-15

### Added
- Enhanced `claude_code` tool description in `src/server.ts` to reflect multi-modal capabilities (image analysis), file content analysis, and provide more comprehensive prompt tips.

### Changed
- Resized example images in `README.md` for better display via HTML width attributes.

## [1.9.3] - 2025-05-15

### Changed
- Better work directory management.

## [1.9.1] - 2025-05-14

### Changed
- Increased the maximum execution timeout for the Claude Code tool from 5 minutes to 30 minutes.

## [1.9.0] - 2025-05-14

### Changed
- Modified the input for the `claude_code` tool. The `workFolder` is now an optional explicit JSON parameter instead of being parsed from the `prompt` string. This improves clarity and simplifies prompt construction.

## [1.8.0] - 2025-05-14

### Changed
- Improved startup stability by explicitly using `/bin/bash` for Claude CLI script execution and ensuring correct command-line arguments are used.

## [1.7.0] - 2025-05-14

### Changed
- Renamed the primary MCP tool from `code` to `claude_code` for better clarity and consistency in UI (`src/server.ts`).
- Updated `README.md` to reflect the new tool name.

## [1.6.1] - 2025-05-14

### Fixed
- Amended previous commit on `feature/v1.6.0-updates` to include `dist/server.js` which was built but not staged.
- Resolved merge conflicts by rebasing `release/v1.6.1` onto `main` before merge.

*(Note: Version 1.6.1 was primarily a maintenance release for PR #6 hygiene after rebasing).*

## [1.6.0] - 2025-05-14

### Added
- Integrated logic in `src/server.ts` to parse "Your work folder is..." directive from prompts to set the Current Working Directory (CWD) for the underlying `claude-code-cli`.
- Default CWD for `claude-code-cli` is set to the user's home directory if no specific "Your work folder is..." directive is provided in the prompt.
- Enhanced error messages for `claude-code-cli` execution failures, including attempts to append `stderr` and `stdout` from the failed process to the error message.

### Fixed
- Resolved various linting errors in `src/server.ts` related to:
    - Correct access of request parameters (e.g., `args.params.name` for tool name, `args.params.arguments.prompt` for prompt).
    - Correct usage of `ErrorCode` enum members from `@modelcontextprotocol/sdk` (e.g., `ErrorCode.MethodNotFound`, `ErrorCode.InvalidParams`, `ErrorCode.InternalError` for timeouts and general failures).
- Ensured `npm run build` completes successfully after CWD logic integration and lint fixes.
- Ensured the `--dangerously-skip-permissions` flag is passed correctly as one of the first arguments to `claude-code-cli`.

### Changed
- Set default execution timeout for `claude-code-cli` to 5 minutes (300,000 ms).

---
*Older versions might not have detailed changelog entries.*