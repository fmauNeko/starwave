import { type } from 'arktype';
import { Role } from '../discord/authorization/role.enum';

export const configSchema = type.module({
  roles: type.enumerated(...Object.values(Role)),
  json: {
    discord: {
      devGuildIds: 'string[]',
      guildsSettings: {
        '[string]': {
          language: 'string',
          roles: {
            '[roles]': 'string',
          },
          theme: {
            accentColor: 'string',
          },
        },
      },
      token: 'string',
    },
    'youtube?': {
      'cookiesPath?': 'string',
    },
    'spotify?': {
      clientId: 'string',
      clientSecret: 'string',
    },
  },
  env: {
    NODE_ENV: "'development' | 'production' | 'test'",
    '+': 'ignore',
  },
  result: 'Merge<json, env>',
});

export type JsonConfig = typeof configSchema.json.infer;
export type EnvConfig = typeof configSchema.env.infer;
export type Config = typeof configSchema.result.infer;
