# Release Checklist

## Pre-Release Checks

- [ ] Tests are green on GitHub CI
- [ ] Run linter locally (`npm run lint`)
- [ ] Run type checker locally (`npm run typecheck`)
- [ ] Run tests locally (`npm test`)
- [ ] Run build locally (`npm run build`)
- [ ] Changelog version has been increased
- [ ] Changelog entries for the new version are written
- [ ] Version in `server.ts` (hardcoded) is updated
- [ ] Version in `package.json` is updated

## Local Verification

- [ ] Install npm package locally (`npm pack && npm install -g <package-name>-<version>.tgz`)
- [ ] Test the locally installed package using the npm inspector (automated tests)

## Release Steps

- [ ] Push all changes to the main branch
- [ ] Create a git tag for the version (e.g., `git tag v1.2.3`)
- [ ] Push the git tag (e.g., `git push origin v1.2.3`)
- [ ] Publish to npm (`npm publish`)
- [ ] Create a GitHub Release based on the tag, including changelog notes 