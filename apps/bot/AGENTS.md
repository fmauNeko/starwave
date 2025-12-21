# apps/bot AGENTS

## Package Identity

- NestJS 11 Discord bot using Necord over discord.js; schedules presence and enforces role-based access.
- Runs as a lightweight service; exposes only the default health GET route.

## Setup & Run

- Install deps at repo root: `bun install`.
- Create local config: copy apps/bot/config.example.json to apps/bot/config.json and fill tokens/guild settings (keep private).
- Config can be overridden per-field via env vars using uppercase keys with double underscores and the BOT__ prefix (e.g., BOT__DISCORD__TOKEN, BOT__DISCORD__DEV_GUILD_IDS, BOT__DISCORD__GUILDS_SETTINGS__<GUILD_ID>__LANGUAGE/ROLE_ADMIN/ACCENT_COLOR); env overrides merge over config.json before validation.
- Dev watch: `cd apps/bot && bun run start:dev`.
- Prod: `cd apps/bot && bun run build && bun run start:prod`.
- Tests: `cd apps/bot && bun run test` (unit), `bun run test:e2e` (e2e), `bun run test:cov` (coverage).
- Lint/format: `cd apps/bot && bun run lint && bun run format`.

## Patterns & Conventions

- Use the validated config bootstrap shown in [apps/bot/src/app.module.ts#L1-L23](apps/bot/src/app.module.ts#L1-L23) with `ConfigModule.forRoot` and `validateEnv`.
- Define new config fields via arktype schema [apps/bot/src/config/config.type.ts#L1-L33](apps/bot/src/config/config.type.ts#L1-L33) and load through [apps/bot/src/config/configuration.ts#L1-L24](apps/bot/src/config/configuration.ts#L1-L24).
- Configure Discord/Necord intents and tokens inside [apps/bot/src/discord/discord.module.ts#L1-L31](apps/bot/src/discord/discord.module.ts#L1-L31); use `ConfigService.get(..., { infer: true })` as shown.
- Implement event handlers with `@Once`/`@On` decorators like [apps/bot/src/discord/discord.service.ts#L5-L20](apps/bot/src/discord/discord.service.ts#L5-L20); keep logging through Nest Logger.
- Update presence on client readiness following [apps/bot/src/discord/presence/presence.service.ts#L5-L20](apps/bot/src/discord/presence/presence.service.ts#L5-L20).
- Wire global guard/filter in [apps/bot/src/discord/authorization/authorization.module.ts#L1-L15](apps/bot/src/discord/authorization/authorization.module.ts#L1-L15); guard logic lives in [apps/bot/src/discord/authorization/role.guard.ts#L1-L88](apps/bot/src/discord/authorization/role.guard.ts#L1-L88).
- Set role metadata via [apps/bot/src/discord/authorization/require-role.decorator.ts#L1-L6](apps/bot/src/discord/authorization/require-role.decorator.ts#L1-L6) and reuse role enums from [apps/bot/src/discord/authorization/role.enum.ts#L1-L6](apps/bot/src/discord/authorization/role.enum.ts#L1-L6).
- Handle forbidden responses with themed messages as in [apps/bot/src/discord/authorization/discord-forbidden.filter.ts#L1-L55](apps/bot/src/discord/authorization/discord-forbidden.filter.ts#L1-L55).
- ✅ DO register new Discord handlers under `src/discord/**` and import their modules into DiscordModule.
- ✅ DO reuse Vitest + `@golevelup/ts-vitest` mocking seen in [apps/bot/src/discord/discord.service.spec.ts#L1-L16](apps/bot/src/discord/discord.service.spec.ts#L1-L16) and [apps/bot/test/app.e2e-spec.ts#L1-L29](apps/bot/test/app.e2e-spec.ts#L1-L29).
- ❌ DON'T read config.json directly or bypass schema; always go through the validated loader [apps/bot/src/config/configuration.ts#L1-L24](apps/bot/src/config/configuration.ts#L1-L24).
- ✅ DO keep guild role maps ordered by rank; follow RoleRank in [apps/bot/src/discord/authorization/role.enum.ts#L1-L6](apps/bot/src/discord/authorization/role.enum.ts#L1-L6) and mapping in [apps/bot/src/discord/authorization/role.guard.ts#L19-L33](apps/bot/src/discord/authorization/role.guard.ts#L19-L33).

## Touch Points / Key Files

- Entrypoint bootstrap: [apps/bot/src/main.ts#L1-L8](apps/bot/src/main.ts#L1-L8)
- App composition with config + schedule: [apps/bot/src/app.module.ts#L1-L23](apps/bot/src/app.module.ts#L1-L23)
- Config schema/loader: [apps/bot/src/config/config.type.ts#L1-L33](apps/bot/src/config/config.type.ts#L1-L33), [apps/bot/src/config/configuration.ts#L1-L24](apps/bot/src/config/configuration.ts#L1-L24)
- Discord wiring/events: [apps/bot/src/discord/discord.module.ts#L1-L31](apps/bot/src/discord/discord.module.ts#L1-L31), [apps/bot/src/discord/discord.service.ts#L5-L20](apps/bot/src/discord/discord.service.ts#L5-L20)
- Authorization guard/filter/decorator: [apps/bot/src/discord/authorization/role.guard.ts#L1-L88](apps/bot/src/discord/authorization/role.guard.ts#L1-L88), [apps/bot/src/discord/authorization/discord-forbidden.filter.ts#L1-L55](apps/bot/src/discord/authorization/discord-forbidden.filter.ts#L1-L55), [apps/bot/src/discord/authorization/require-role.decorator.ts#L1-L6](apps/bot/src/discord/authorization/require-role.decorator.ts#L1-L6)
- Presence status: [apps/bot/src/discord/presence/presence.service.ts#L5-L20](apps/bot/src/discord/presence/presence.service.ts#L5-L20)
- Tests and mocks: [apps/bot/test/app.e2e-spec.ts#L1-L29](apps/bot/test/app.e2e-spec.ts#L1-L29), [apps/bot/src/discord/discord.service.spec.ts#L1-L16](apps/bot/src/discord/discord.service.spec.ts#L1-L16), [apps/bot/test/mocks/discord.mock.module.ts#L1-L7](apps/bot/test/mocks/discord.mock.module.ts#L1-L7)

## JIT Index Hints

- Find Necord handlers: `rg -n "@(On|Once)" apps/bot/src/discord`
- Find guards/filters: `rg -n "Guard|Filter" apps/bot/src/discord`
- Locate config keys: `rg -n "discord\." apps/bot/src apps/bot/config.*.json`
- Search tests: `rg -n "describe\(" apps/bot/src apps/bot/test`
- Discover Nest modules: `rg -n "class .*Module" apps/bot/src`

## Common Gotchas

- apps/bot/config.json must include guild entries and role IDs or RoleGuard will block interactions.
- Accent colors must be hex strings (e.g. #ffffff) matching the schema; the filter converts them to numbers for Discord components.
- Necord token and devGuildIds must be set; missing values prevent the client from logging in.
- Tests use apps/bot/test/config.test.json; keep it in sync with the schema when adding config keys.

## Pre-PR Checks

- `cd apps/bot && bun run lint && bun run test && bun run test:e2e && bun run build`