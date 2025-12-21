# starwave Helm chart

Helm chart for the starwave services, starting with the NestJS Discord bot.

## Highlights

- ConfigMap renders `config.json` (without `discord.token`) from values and mounts to `/app/config.json`.
- Discord token supplied via Secret: create from `apps.bot.secret.value` or reference an existing secret/key.
- Service enabled by default (ClusterIP) on port 3000; ingress intentionally omitted.
- Values validated by `values.schema.json` (wired via yaml-language-server in `values.yaml`).

## Quickstart

Create a values file:

```yaml
apps:
  bot:
    image:
      repository: ghcr.io/fmauNeko/starwave/bot
      tag: 'v0.1.0'
    config:
      discord:
        devGuildIds: ['123456789012345678']
        guildsSettings:
          '123456789012345678':
            language: en-US
            roles:
              admin: '222222222222222222'
            theme:
              accentColor: '#ffffff'
    secret:
      create: true
      value: 'replace-with-discord-token'
      existingKey: discordToken
```

Apply the release:

```bash
helm upgrade --install starwave ./charts/starwave -f my-values.yaml
```

### Using an existing token secret

```yaml
apps:
  bot:
    secret:
      create: false
      existingSecret: discord-token
      existingKey: discordToken
```

### External overrides

All config fields can also be overridden via env vars mounted in the pod using the `BOT__` prefix (e.g., `BOT__DISCORD__DEV_GUILD_IDS`, `BOT__DISCORD__GUILDS_SETTINGS__<GUILD_ID>__ROLES__ADMIN`).
