# charts/starwave AGENTS

## Chart Identity

| Aspect   | Details                                 |
| -------- | --------------------------------------- |
| Type     | Helm chart for Kubernetes deployment    |
| Apps     | `bot` - NestJS Discord bot              |
| Registry | GHCR (`ghcr.io/fmauneko/starwave/*`)    |
| Config   | ConfigMap from values, token via Secret |
| Service  | ClusterIP on port 3000 (no Ingress)     |

## Values Structure

```yaml
global: # Shared defaults across all apps
  imagePullSecrets: []
  podAnnotations: {}
  serviceAccount:
    create: true

apps:
  bot: # Bot-specific config
    enabled: true
    replicaCount: 1
    image:
      repository: ghcr.io/fmauneko/starwave/bot
      tag: '' # Defaults to chart appVersion
    config:
      discord:
        devGuildIds: []
        guildsSettings: {} # Required: guild configs
      configMountPath: /app/config.json
    secret:
      create: true # true = create from value, false = use existing
      value: '' # Discord token (if create: true)
      existingSecret: '' # Secret name (if create: false)
      existingKey: discordToken
    service:
      enabled: true
      type: ClusterIP
      port: 3000
    probes:
      liveness/readiness/startup: { ... }
    resources: {}
```

### Key Value Paths

| Path                                     | Purpose                       | Required                     |
| ---------------------------------------- | ----------------------------- | ---------------------------- |
| `apps.bot.enabled`                       | Enable/disable bot deployment | No (default: true)           |
| `apps.bot.image.repository`              | Container image               | No (has default)             |
| `apps.bot.image.tag`                     | Image tag                     | No (defaults to appVersion)  |
| `apps.bot.config.discord.guildsSettings` | Guild configurations          | **Yes**                      |
| `apps.bot.secret.value`                  | Discord token                 | **Yes** (if `create: true`)  |
| `apps.bot.secret.existingSecret`         | Existing secret name          | **Yes** (if `create: false`) |

### Value Inheritance

Global values merge with app-specific values. App values take precedence:

```yaml
global:
  podAnnotations:
    prometheus.io/scrape: 'true' # Applied to all apps

apps:
  bot:
    podAnnotations:
      app-specific: 'value' # Merged with global
```

## Quick Start

### Minimal values.yaml

```yaml
apps:
  bot:
    image:
      tag: 'v0.2.0'
    config:
      discord:
        devGuildIds:
          - '123456789012345678'
        guildsSettings:
          '123456789012345678':
            language: en-US
            roles:
              admin: '222222222222222222'
            theme:
              accentColor: '#ffffff'
    secret:
      create: true
      value: 'your-discord-bot-token'
```

### Install/Upgrade

```bash
# Install
helm upgrade --install starwave ./charts/starwave -f my-values.yaml

# Dry run (preview)
helm upgrade --install starwave ./charts/starwave -f my-values.yaml --dry-run

# Template only (debug)
helm template starwave ./charts/starwave -f my-values.yaml
```

## How To...

### Use an Existing Token Secret

If you manage secrets externally (e.g., Sealed Secrets, External Secrets):

```yaml
apps:
  bot:
    secret:
      create: false
      existingSecret: my-discord-secret # Your secret name
      existingKey: token # Key within secret
```

### Add Environment Variables

```yaml
apps:
  bot:
    env:
      - name: LOG_LEVEL
        value: debug
      - name: CUSTOM_VAR
        valueFrom:
          secretKeyRef:
            name: my-secret
            key: my-key
```

### Configure Resources

```yaml
apps:
  bot:
    resources:
      requests:
        memory: '128Mi'
        cpu: '100m'
      limits:
        memory: '256Mi'
        cpu: '500m'
```

### Disable Health Probes

```yaml
apps:
  bot:
    probes:
      liveness:
        enabled: false
      readiness:
        enabled: false
```

### Add a New Guild

Add entry to `guildsSettings` with guild ID as key:

```yaml
apps:
  bot:
    config:
      discord:
        devGuildIds:
          - '111111111111111111'
          - '999999999999999999' # New guild
        guildsSettings:
          '111111111111111111':
            language: en-US
            roles:
              admin: '222222222222222222'
            theme:
              accentColor: '#ffffff'
          '999999999999999999': # New guild config
            language: fr-FR
            roles:
              admin: '888888888888888888'
            theme:
              accentColor: '#0066cc'
```

## Template Files

| File                      | Purpose                                     |
| ------------------------- | ------------------------------------------- |
| `_helpers.tpl`            | Template functions (fullname, labels, etc.) |
| `bot-deployment.yaml`     | Bot Deployment spec                         |
| `bot-configmap.yaml`      | Config JSON from values (excludes token)    |
| `bot-secret.yaml`         | Discord token Secret (if `create: true`)    |
| `bot-service.yaml`        | ClusterIP Service                           |
| `bot-serviceaccount.yaml` | ServiceAccount                              |
| `NOTES.txt`               | Post-install instructions                   |

## Architecture Notes

### Config Flow

```
values.yaml → ConfigMap (config.json) → mounted at /app/config.json
                                        ↓
            Secret (token) → env BOT__DISCORD__TOKEN (overrides config)
```

- ConfigMap contains all config **except** token
- Token injected via environment variable from Secret
- Bot merges env vars over config.json at startup

### Checksum Annotations

Deployment includes checksums for ConfigMap and Secret:

```yaml
annotations:
  checksum/config: <sha256>
  checksum/secret: <sha256>
```

This triggers pod restart when config/secret changes.

### No Ingress

Chart intentionally omits Ingress. Bot only needs outbound Discord API access. If you need HTTP access (health checks from outside cluster), add your own Ingress resource.

## Schema Validation

Values validated by `values.schema.json`. IDE support via:

```yaml
# yaml-language-server: $schema=./values.schema.json
```

Key validations:

- `apps.bot.config.discord.guildsSettings` is required
- Secret must have either `value` (if `create: true`) or `existingSecret` (if `create: false`)
- Probe settings have sensible constraints

## CI/CD Integration

### Release Flow

1. Push to `main` triggers Release Please
2. Version bump → `helm-release.yaml` workflow
3. Chart packaged to `.cr-release-packages/`
4. Pushed to GHCR as OCI artifact

### Using from GHCR

```bash
helm pull oci://ghcr.io/fmauneko/starwave/charts/starwave --version 0.1.0
```

## Common Gotchas

| Issue                               | Cause                                   | Fix                                                                        |
| ----------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| Pod crash loop                      | Missing/invalid Discord token           | Check `secret.value` or `existingSecret`                                   |
| Config validation error             | Missing required guild fields           | Ensure `guildsSettings` has `language`, `roles.admin`, `theme.accentColor` |
| Pod not restarting on config change | Missing checksum annotation             | Verify `bot-deployment.yaml` has checksum annotations                      |
| Secret not created                  | `create: false` but no `existingSecret` | Either set `create: true` with `value`, or provide `existingSecret`        |
| Schema validation fails             | values.yaml structure mismatch          | Check `values.schema.json` for required fields                             |

## Troubleshooting

### Debug Template Rendering

```bash
# Full template output
helm template starwave ./charts/starwave -f my-values.yaml

# Specific template
helm template starwave ./charts/starwave -f my-values.yaml -s templates/bot-deployment.yaml

# With debug info
helm template starwave ./charts/starwave -f my-values.yaml --debug
```

### Check Deployed Config

```bash
# View ConfigMap
kubectl get configmap <release>-bot-config -o yaml

# View Secret (base64 encoded)
kubectl get secret <release>-bot-token -o yaml

# Pod logs
kubectl logs -l app.kubernetes.io/name=bot
```

### Validate Values Against Schema

```bash
# Using helm lint
helm lint ./charts/starwave -f my-values.yaml

# Strict mode
helm lint ./charts/starwave -f my-values.yaml --strict
```

## Pre-PR Checklist

When modifying the chart:

- [ ] `values.yaml` updated with new fields (with sensible defaults)
- [ ] `values.schema.json` updated to match
- [ ] Templates handle new values correctly
- [ ] `helm lint ./charts/starwave` passes
- [ ] `helm template` renders without errors
- [ ] AGENTS.md updated if structure/behavior changes
- [ ] Chart.yaml version bumped (if releasing)
