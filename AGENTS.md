# Repository Guidelines

## Project Structure & Module Organization
- `packages/server`: Node.js WebSocket server + CLI (published as `codex-blocker`).
- `packages/extension`: Chrome extension (Manifest V3) source and build outputs in `dist/`.
- `packages/shared`: Shared TypeScript types.
- Root config: `package.json` (workspace scripts), `tsconfig.json` (TS defaults).

## Build, Test, and Development Commands
- `pnpm install`: Install workspace dependencies.
- `pnpm build`: Build all packages (`server` and `extension`).
- `pnpm dev`: Run dev builds in parallel (server runs via `tsx`; extension rebuilds on changes).
- `pnpm typecheck`: TypeScript checks for all packages.
- `pnpm --filter @codex-blocker/extension build`: Build only the extension.
- `pnpm --filter codex-blocker build`: Build only the server/CLI.

## Coding Style & Naming Conventions
- Language: TypeScript, ESM (`"type": "module"`). Node 18+ required.
- Indentation: 2 spaces (match existing files).
- Naming: `kebab-case` for package names, `camelCase` for variables/functions, `PascalCase` for types.
- Formatting/linting: No Prettier/ESLint configured; keep changes consistent with surrounding code.

## Testing Guidelines
- No automated test framework currently configured.
- Use `pnpm typecheck` as the primary safety net.
- If adding tests, keep them close to the package (e.g., `packages/server/test/`) and document the new command here.

## Commit & Pull Request Guidelines
- Commit history uses short, sentence-case messages (no strict convention). Keep messages concise and descriptive.
- PRs should include:
  - A clear summary of behavior changes
  - Screenshots/GIFs for UI or extension changes
  - Notes on manual verification (e.g., extension load, server CLI flow)

## Security & Configuration Tips
- The server runs locally; avoid adding external network calls without justification.
- Codex sessions are stored under `~/.codex/sessions`.
- Extension settings are stored via Chrome sync if enabled.
