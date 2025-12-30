# AGENTS

## Project Snapshot

| Aspect      | Details                                            |
| ----------- | -------------------------------------------------- |
| Type        | Turborepo + pnpm workspaces monorepo               |
| Structure   | `apps/*` (deployables), `packages/*` (shared libs) |
| Active Apps | `apps/bot` - NestJS Discord bot                    |
| Stack       | TypeScript (ESM), Node >=18, pnpm 10+              |
| Testing     | Vitest + SWC                                       |
| Linting     | ESLint 9 flat config + Prettier                    |
| Commits     | Conventional Commits via Husky + Commitlint        |
| CI/CD       | GitHub Actions → GHCR (Docker + Helm)              |

Each app/package maintains its own AGENTS.md with domain-specific guidance. Always use the nearest one.

## Quick Reference

```bash
# Setup
pnpm install

# Development
pnpm run dev              # All apps in watch mode
pnpm run build            # Build all
pnpm run lint             # Lint all
pnpm run test             # Unit tests all
pnpm run test:e2e         # E2E tests all
pnpm run format           # Prettier format all

# Package-specific (faster iteration)
cd apps/bot && pnpm run start:dev   # Bot in watch mode
cd apps/bot && pnpm run test        # Bot unit tests only
```

## Universal Conventions

### Code Style

- Prettier-formatted, ESLint-clean (run both before committing)
- TypeScript strict mode, ESM modules
- No `as any`, `@ts-ignore`, or `@ts-expect-error`

### File Organization

- Tests alongside source (`*.spec.ts`) or under `test/` for e2e
- Config files at package root, not in `src/`
- Never commit `dist/` outputs

### Dependencies

- Prefer existing packages over new dependencies
- Security-sensitive deps (Discord tokens, API keys) via config files or env vars, never hardcoded

## Branching & PR Workflow

| Branch      | Purpose             | Merges To            |
| ----------- | ------------------- | -------------------- |
| `main`      | Production releases | -                    |
| `develop`   | Integration branch  | `main` (via release) |
| `feature/*` | New features        | `develop`            |
| `fix/*`     | Bug fixes           | `develop`            |

### PR Requirements

1. Branch from `develop`
2. Conventional commit messages
3. All checks pass: `pnpm run lint && pnpm run test && pnpm run test:e2e && pnpm run build`
4. Update relevant AGENTS.md if behavior/structure changes
5. Update `config.example.json` if adding config keys

## Security & Secrets

| Secret        | Storage                                                 | Never                    |
| ------------- | ------------------------------------------------------- | ------------------------ |
| Discord token | `config.json` (gitignored) or env `BOT__DISCORD__TOKEN` | Commit to git            |
| Guild IDs     | `config.json` or env vars                               | Log in CI output         |
| Role IDs      | `config.json` per guild                                 | Expose in error messages |

Local setup: Copy `apps/bot/config.example.json` → `apps/bot/config.json` and fill values.

## Package Index

| Package        | Path               | AGENTS.md                                              | Description                    |
| -------------- | ------------------ | ------------------------------------------------------ | ------------------------------ |
| bot            | `apps/bot/`        | [apps/bot/AGENTS.md](apps/bot/AGENTS.md)               | NestJS Discord bot with Necord |
| starwave chart | `charts/starwave/` | [charts/starwave/AGENTS.md](charts/starwave/AGENTS.md) | Helm chart for K8s deployment  |
| (packages)     | `packages/*`       | Add per package                                        | Shared libraries (none active) |

## Search Patterns

Use these patterns with grep/glob tools to find code quickly:

| Find                   | Pattern                                   | Tool                                  |
| ---------------------- | ----------------------------------------- | ------------------------------------- |
| NestJS modules         | `class.*Module`                           | grep in `apps/*/src`                  |
| Discord event handlers | `@(On\|Once)`                             | grep in `apps/bot/src/discord`        |
| Slash commands         | `@SlashCommand`                           | grep in `apps/bot/src`                |
| Config usage           | `configService.get`                       | grep in `apps/bot/src`                |
| Test files             | `*.spec.ts`                               | glob                                  |
| Vitest describes       | `describe\(`                              | grep in `apps/*/src` or `apps/*/test` |
| Guards/Filters         | `implements CanActivate\|ExceptionFilter` | grep                                  |

## CI/CD Pipeline

### On Push to `develop` / PR to non-main

File: `.github/workflows/develop.yaml`

```
lint → unit-tests ─┬→ docker build+push (dev tags)
      e2e-tests ───┘
```

- Runs: lint, unit tests (with coverage), e2e tests
- Builds: Docker images for each app, pushes to GHCR with branch tags
- Matrix: Auto-discovers apps via `turbo ls`

### On Push to `main` (Release)

Files: `.github/workflows/release-please.yaml`, `docker-release.yaml`, `helm-release.yaml`

- Release Please manages changelogs and version bumps
- Docker images tagged with semver
- Helm chart packaged and pushed to GHCR

## Definition of Done

Before marking work complete:

- [ ] `pnpm run lint` passes
- [ ] `pnpm run test` passes
- [ ] `pnpm run test:e2e` passes
- [ ] `pnpm run build` succeeds
- [ ] No secrets in committed code
- [ ] `config.example.json` updated if config changed
- [ ] Relevant AGENTS.md updated if behavior/structure changed
- [ ] Conventional commit message used
