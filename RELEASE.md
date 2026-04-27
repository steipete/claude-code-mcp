# Release Process

This document describes the release process for claude-code-mcp to ensure quality and prevent issues like the package.json import problem.

## Pre-release Testing

1. **Local Testing**

   ```bash
   # Run the test release script
   ./scripts/test-release.sh
   ```

   This will:
   - Build the project
   - Run all tests
   - Set up local testing in Claude

2. **Test in Claude**
   - Restart Claude Desktop app
   - Use the `claude-code-local` tool
   - Verify version print on first use
   - Test various commands

3. **Restore Original Config**
   ```bash
   # When done testing
   ./scripts/restore-config.sh
   ```

## Publishing a Release

Once local testing is complete:

```bash
./scripts/publish-release.sh
```

This will:

1. Ensure you're on main branch
2. Run tests
3. Build the project
4. Bump version (patch/minor/major)
5. Update changelog
6. Create git tag
7. Push to GitHub
8. Create GitHub release
9. Publish to npm

## Emergency Fixes

For critical fixes:

1. Fix the issue
2. Test locally with `./scripts/test-release.sh`
3. Once verified, use `./scripts/publish-release.sh` with patch version

## Version Guidelines

- **Patch**: Bug fixes, documentation updates
- **Minor**: New features, non-breaking changes
- **Major**: Breaking changes, major refactors

## Testing Configurations

- **Production**: `/Library/Application Support/Claude/claude_desktop_config.json`
- **Local Test**: `/Library/Application Support/Claude/claude_desktop_config_local_test.json`

Always test with the local configuration before publishing!
