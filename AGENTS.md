# AGENTS

## Project Snapshot

- Monorepo via Turborepo + Bun workspaces (apps/_, packages/_); active app is a NestJS Discord bot at apps/bot.
- Stack: TypeScript (ESM), NestJS 11 + Necord + discord.js 14, Vitest + SWC, ESLint/Prettier, Husky/Commitlint.
- Each app/package keeps its own AGENTS.md; use the nearest one to your edits.

## Root Setup Commands

- Install: `bun install`
- Build all: `bun run build`
- Test all: `bun run test`
- E2E all: `bun run test:e2e`
- Lint all: `bun run lint`
- Format (optional): `bun run format`

## Universal Conventions

- Keep code Prettier-formatted and ESLint-clean; TypeScript targets Node >=18 and the repo uses ESM.
- Conventional Commits enforced (commitlint); prefer feature branches from develop and PRs back to develop.
- Prefer package-local scripts when iterating; Turbo caches build/test/lint where available.
- Keep tests alongside src or under test/ using Vitest patterns; prefer SWC transforms for speed.
- Avoid committing generated dist outputs; they are build artifacts only.
- When behavior, commands, or structure changes, update the nearest AGENTS.md (and add a new one for new packages/apps) so agents stay in sync.

## Security & Secrets

- Never commit real Discord tokens or guild IDs; use ignored env files and local config.
- Copy apps/bot/config.example.json to apps/bot/config.json and fill locally; keep secrets out of git and CI logs.
- Treat guild settings and role IDs with care; avoid logging user-identifying data.

## JIT Index (what to open, not what to paste)

### Package Structure

- Discord bot: apps/bot → see [apps/bot/AGENTS.md](apps/bot/AGENTS.md)
- Shared packages: packages/\* (currently none active) → add local AGENTS.md per new package.

### Quick Find Commands

- Search modules/controllers: `rg -n "class .*Module" apps/bot/src`
- Find Necord event handlers: `rg -n "@(On|Once)" apps/bot/src/discord`
- Locate config usage: `rg -n "discord\." apps/bot/src`
- List tests: `rg -n "describe\(" apps/bot/src apps/bot/test`

## Definition of Done

- `bun run lint && bun run test && bun run test:e2e && bun run build`
- Ensure apps/bot/config.example.json stays updated when adding config keys; no secrets committed.
- PR includes brief notes on new commands/config requirements.
- Helm: chart lives at charts/starwave; config.json is rendered from values (token always via Secret), Service enabled by default on :3000, no ingress; keep values.yaml aligned with values.schema.json when adding config.
