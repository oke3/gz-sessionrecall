# Contributing to gz-sessionrecall

Thanks for your interest in contributing!

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
npx tsc --noEmit

# Build
bun run build
```

## Pull Requests

1. Fork the repo and create a feature branch
2. Write tests for new functionality
3. Ensure all tests pass: `bun test`
4. Ensure type check passes: `npx tsc --noEmit`
5. Submit a PR with a clear description

## Adding Search Features

Search logic lives in `src/search.ts`. The scoring pipeline is:

1. `tokenize` — split text into lowercase word tokens
2. `scoreSession` — term-frequency scoring, title matches weighted higher
3. `search` — filter (project/model/since) + score + sort + snippet

Add tests in `test/search.test.ts` for any scoring changes.

## SQLite Compatibility

The DB adapter in `src/sqlite.ts` supports both `node:sqlite` (Node 22.5+) and `bun:sqlite` (Bun). Keep it dependency-free — do not add a SQLite npm package.

## Code Style

- TypeScript strict mode
- ES modules (`import`/`export`)
- Zero runtime dependencies
- Tests for all new features

## License

By contributing, you agree that your contributions will be licensed under the MIT License.