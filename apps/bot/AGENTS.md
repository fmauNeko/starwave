# apps/bot AGENTS

## Package Identity

| Aspect    | Details                                   |
| --------- | ----------------------------------------- |
| Type      | NestJS 11 Discord bot                     |
| Framework | Necord (discord.js 14 wrapper)            |
| Config    | Arktype schema validation + env overrides |
| Testing   | Vitest + @suites/unit for automocking     |

Lightweight service exposing only health endpoint (`GET /`). All Discord interaction via Necord decorators.

## Setup & Run

```bash
# From repo root
pnpm install

# Create local config
cp apps/bot/config.example.json apps/bot/config.json
# Edit config.json with your Discord token and guild settings

# Development (watch mode)
cd apps/bot && pnpm run start:dev

# Production
cd apps/bot && pnpm run build && pnpm run start:prod

# Tests
cd apps/bot && pnpm run test          # Unit tests
cd apps/bot && pnpm run test:e2e      # E2E tests
cd apps/bot && pnpm run test:cov      # Coverage
```

### Environment Variable Overrides

Config can be overridden via env vars with `BOT__` prefix. Keys use UPPER_SNAKE_CASE with `__` as path separator:

| Config Path                                           | Env Var                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| `discord.token`                                       | `BOT__DISCORD__TOKEN`                                            |
| `discord.devGuildIds`                                 | `BOT__DISCORD__DEV_GUILD_IDS` (comma-separated or JSON array)    |
| `discord.guildsSettings.<GUILD_ID>.language`          | `BOT__DISCORD__GUILDS_SETTINGS__<GUILD_ID>__LANGUAGE`            |
| `discord.guildsSettings.<GUILD_ID>.roles.admin`       | `BOT__DISCORD__GUILDS_SETTINGS__<GUILD_ID>__ROLES__ADMIN`        |
| `discord.guildsSettings.<GUILD_ID>.theme.accentColor` | `BOT__DISCORD__GUILDS_SETTINGS__<GUILD_ID>__THEME__ACCENT_COLOR` |

Env vars merge over `config.json` before validation.

## How To...

### Add a New Slash Command

1. Create command file in `src/discord/` (or subdirectory):

```typescript
// src/discord/example/example.command.ts
import { Injectable } from '@nestjs/common';
import { Context, SlashCommand, type SlashCommandContext } from 'necord';
import { RequireRole } from '../authorization/require-role.decorator';
import { Role } from '../authorization/role.enum';

@Injectable()
@RequireRole(Role.Admin) // Optional: restrict access
export class ExampleCommand {
  @SlashCommand({
    name: 'example',
    description: 'Example command',
  })
  public execute(@Context() [interaction]: SlashCommandContext) {
    return interaction.reply({ content: 'Example response!' });
  }
}
```

2. Register in `DiscordModule`:

```typescript
// src/discord/discord.module.ts
providers: [DiscordService, PingCommand, ExampleCommand],  // Add here
```

3. Add tests in `src/discord/example/example.command.spec.ts`

### Add a New Role

1. Add to role enum in `src/discord/authorization/role.enum.ts`:

```typescript
export const Role = {
  Admin: 'admin',
  Moderator: 'moderator', // Add new role
} as const satisfies Record<string, string>;

export const RoleRank = {
  [Role.Admin]: 2, // Bump admin rank
  [Role.Moderator]: 1, // New role gets lower rank
} as const satisfies Record<Role, number>;
```

2. Add role ID mapping in `config.json` per guild:

```json
"roles": {
  "admin": "111111111111111111",
  "moderator": "222222222222222222"
}
```

3. Update `config.example.json` and `config.schema.json` accordingly

### Add a New Config Field

1. Update Arktype schema in `src/config/config.type.ts`
2. Update `config.example.json` with example value
3. Update `config.schema.json` with JSON Schema definition
4. If Helm-deployed, update `charts/starwave/values.yaml` and `values.schema.json`

### Add a New Module

1. Create module directory: `src/discord/<feature>/`
2. Create module file with providers:

```typescript
// src/discord/feature/feature.module.ts
@Module({
  providers: [FeatureService],
  exports: [FeatureService],
})
export class FeatureModule {}
```

3. Import in `DiscordModule`:

```typescript
imports: [ConfigModule, NecordModule.forRootAsync(...), FeatureModule],
```

## Architecture Decisions

| Decision                       | Rationale                                                          |
| ------------------------------ | ------------------------------------------------------------------ |
| **Arktype over Zod**           | Better TypeScript inference, smaller bundle, faster validation     |
| **@suites/unit**               | Auto-mocking for NestJS DI; reduces boilerplate in unit tests      |
| **Config file + env merge**    | File for structure, env for secrets/overrides in deployment        |
| **RoleRank numeric system**    | Allows hierarchy comparisons (`>=`) instead of exact role matching |
| **Necord over raw discord.js** | NestJS-native decorators, better DI integration, cleaner handlers  |

## Key Files

| Purpose          | File                                                    |
| ---------------- | ------------------------------------------------------- |
| App bootstrap    | `src/main.ts`                                           |
| Root module      | `src/app.module.ts`                                     |
| Config schema    | `src/config/config.type.ts`                             |
| Config loader    | `src/config/configuration.ts`                           |
| Discord wiring   | `src/discord/discord.module.ts`                         |
| Event handlers   | `src/discord/discord.service.ts`                        |
| Role guard       | `src/discord/authorization/role.guard.ts`               |
| Forbidden filter | `src/discord/authorization/discord-forbidden.filter.ts` |
| Role decorator   | `src/discord/authorization/require-role.decorator.ts`   |
| Role enum        | `src/discord/authorization/role.enum.ts`                |
| Presence updates | `src/discord/presence/presence.service.ts`              |
| E2E test setup   | `test/app.e2e-spec.ts`                                  |
| Test config mock | `test/__mocks__/configuration.ts`                       |

## Search Patterns

| Find                  | Pattern                                   | Scope           |
| --------------------- | ----------------------------------------- | --------------- |
| Necord event handlers | `@(On\|Once)`                             | `src/discord/`  |
| Slash commands        | `@SlashCommand`                           | `src/discord/`  |
| Guards/Filters        | `implements CanActivate\|ExceptionFilter` | `src/`          |
| Config access         | `configService.get`                       | `src/`          |
| Test suites           | `describe\(`                              | `src/`, `test/` |
| NestJS modules        | `@Module`                                 | `src/`          |
| Role usage            | `@RequireRole`                            | `src/discord/`  |

## Testing Guide

### Unit Tests

- Use `@suites/unit` TestBed for automatic mocking
- Place alongside source: `*.spec.ts`
- Mock Logger to avoid console noise

```typescript
import { TestBed } from '@suites/unit';

const { unit } = await TestBed.solitary(MyService).compile();
```

### E2E Tests

- Place in `test/` directory
- Use `DiscordMockModule` to replace Discord connection
- Config mocked via `test/__mocks__/configuration.ts`

```typescript
vi.mock(import('../src/config/configuration.js'));

const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
  .overrideModule(DiscordModule)
  .useModule(DiscordMockModule)
  .compile();
```

### Test Config

- `test/config.test.json` - keep in sync with schema when adding fields

## Common Gotchas

| Issue                             | Cause                                | Fix                                                  |
| --------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| RoleGuard blocks all interactions | Missing guild entry in `config.json` | Add guild ID to `guildsSettings`                     |
| Bot won't log in                  | Missing/invalid token                | Check `discord.token` in config                      |
| Commands not registering          | Missing `devGuildIds`                | Add guild IDs for dev command sync                   |
| Accent color errors               | Wrong format                         | Use hex string with `#` (e.g., `#ffffff`)            |
| Tests fail on config              | `config.test.json` out of sync       | Update test config to match schema                   |
| E2E Discord errors                | Missing mock                         | Ensure `DiscordMockModule` overrides `DiscordModule` |

## Troubleshooting

### "Cannot find module './config.json'"

Config file missing. Copy from example:

```bash
cp config.example.json config.json
```

### "Invalid config: ..." validation error

Schema mismatch. Check `src/config/config.type.ts` for required fields and types.

### Discord interactions timeout

1. Check bot has correct intents enabled in Discord Developer Portal
2. Verify `devGuildIds` contains your test server
3. Check role IDs match actual Discord roles

### Tests hang indefinitely

Logger or Discord client not mocked. Ensure:

- Unit tests use `TestBed.solitary()`
- E2E tests override `DiscordModule` with mock

## Pre-PR Checklist

```bash
cd apps/bot
pnpm run lint
pnpm run test
pnpm run test:e2e
pnpm run build
```

- [ ] All commands pass
- [ ] `config.example.json` updated if config changed
- [ ] `config.schema.json` updated if config changed
- [ ] Tests added for new functionality
- [ ] AGENTS.md updated if patterns/structure changed
