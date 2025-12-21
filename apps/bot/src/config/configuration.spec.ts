import { fs, vol } from 'memfs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsonConfig } from './config.type';

const configPath = path.join(__dirname, '..', '..', 'config.json');
const baseConfig = {
  discord: {
    devGuildIds: ['123'],
    guildsSettings: {
      '123': {
        language: 'en-US',
        roles: {
          admin: 'role-admin',
        },
        theme: {
          accentColor: '#ffffff',
        },
      },
    },
    token: 'base-token',
  },
};

type EnvShape = Record<string, string>;

vi.mock('node:fs', () => ({
  ...fs,
  default: fs,
}));

describe('configuration loader', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vol.reset();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('BOT__')) {
        process.env[key] = '';
      }
    }
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  it('loads base config from config.json with no overrides', async () => {
    vol.fromJSON({ [configPath]: JSON.stringify(baseConfig) });

    const result = await loadConfig();

    expect(result).toEqual(baseConfig);
  });

  it('applies BOT__ env overrides and merges into config', async () => {
    vol.fromJSON({ [configPath]: JSON.stringify(baseConfig) });
    const env: EnvShape = {
      BOT__DISCORD__TOKEN: 'override-token',
      BOT__DISCORD__DEV_GUILD_IDS: 'a,b',
      BOT__DISCORD__GUILDS_SETTINGS__123__LANGUAGE: 'fr-FR',
      BOT__DISCORD__GUILDS_SETTINGS__123__ROLES__ADMIN: 'role-override',
      BOT__DISCORD__GUILDS_SETTINGS__123__THEME__ACCENT_COLOR: '#000000',
    };

    Object.assign(process.env, env);
    const result = await loadConfig();

    expect(result.discord.token).toBe('override-token');
    expect(result.discord.devGuildIds).toEqual(['a', 'b']);
    expect(result.discord.guildsSettings['123']).toEqual({
      language: 'fr-FR',
      roles: {
        admin: 'role-override',
      },
      theme: {
        accentColor: '#000000',
      },
    });
  });

  it('parses devGuildIds from JSON arrays', async () => {
    vol.fromJSON({ [configPath]: JSON.stringify(baseConfig) });
    const env: EnvShape = {
      BOT__DISCORD__DEV_GUILD_IDS: '["x","y"]',
    };

    Object.assign(process.env, env);
    const result = await loadConfig();

    expect(result.discord.devGuildIds).toEqual(['x', 'y']);
  });

  it('throws when base config fails validation', async () => {
    const invalidConfig = {
      ...baseConfig,
      discord: { ...baseConfig.discord, devGuildIds: 'not-an-array' },
    };
    vol.fromJSON({ [configPath]: JSON.stringify(invalidConfig) });

    await expect(loadConfig()).rejects.toThrowError();
  });

  it('throws when config root is not an object', async () => {
    vol.fromJSON({ [configPath]: '"oops"' });

    await expect(loadConfig()).rejects.toThrowError();
  });

  it('ignores BOT__ env entries with empty values', async () => {
    vol.fromJSON({ [configPath]: JSON.stringify(baseConfig) });
    process.env.BOT__DISCORD__TOKEN = '';

    const result = await loadConfig();

    expect(result.discord.token).toBe('base-token');
  });

  it('returns empty list for non-array/non-string devGuildIds override', async () => {
    vol.fromJSON({ [configPath]: JSON.stringify(baseConfig) });
    process.env.BOT__DISCORD__DEV_GUILD_IDS = '123';

    const result = await loadConfig();

    expect(result.discord.devGuildIds).toEqual([]);
  });

  it('skips BOT__ entries with no path segments', async () => {
    vol.fromJSON({ [configPath]: JSON.stringify(baseConfig) });
    process.env.BOT__ = 'ignored';

    const result = await loadConfig();

    expect(result.discord.token).toBe('base-token');
  });

  it('treats whitespace-only values as empty strings', async () => {
    vol.fromJSON({ [configPath]: JSON.stringify(baseConfig) });
    process.env.BOT__DISCORD__GUILDS_SETTINGS__123__THEME__ACCENT_COLOR = '   ';

    const result = await loadConfig();

    expect(result.discord.guildsSettings['123'].theme.accentColor).toBe('');
  });

  it('validates env with allowed NODE_ENV values', async () => {
    const { validateEnv } = (await import('./configuration.js')) as {
      validateEnv: (env: Record<string, unknown>) => unknown;
    };

    expect(() => validateEnv({ NODE_ENV: 'production' })).not.toThrow();
  });

  it('rejects invalid NODE_ENV values', async () => {
    const { validateEnv } = (await import('./configuration.js')) as {
      validateEnv: (env: Record<string, unknown>) => unknown;
    };

    expect(() => validateEnv({ NODE_ENV: 'invalid' })).toThrowError();
  });
});

async function loadConfig(): Promise<JsonConfig> {
  const mod = (await import('./configuration.js')) as unknown as {
    default: () => JsonConfig;
  };

  return mod.default();
}
