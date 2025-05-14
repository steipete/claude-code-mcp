# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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