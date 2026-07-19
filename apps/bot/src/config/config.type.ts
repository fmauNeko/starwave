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
            accentColor: type('""').or(
              type.string.matching(/^#[0-9a-fA-F]{6}$/),
            ),
          },
        },
      },
      token: 'string',
    },
    'youtube?': {
      'cookiesPath?': 'string',
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
