import { type } from 'arktype';
import fs from 'node:fs';
import path from 'node:path';
import { EnvConfig, JsonConfig, configSchema } from './config.type';

type JsonObject = Record<string, unknown>;

export default (): JsonConfig => {
  const baseConfigContent = fs.readFileSync(
    path.join(__dirname, '..', '..', 'config.json'),
    'utf-8',
  );

  const baseConfig = parseRootObject(baseConfigContent);
  const overrides = collectEnvOverrides(process.env);
  const mergedConfig = mergeConfig(baseConfig, overrides);

  const validationResult = configSchema.json(mergedConfig);

  if (validationResult instanceof type.errors) {
    throw validationResult.toTraversalError();
  }

  return validationResult;
};

export function validateEnv(env: Record<string, unknown>): EnvConfig {
  const validationResult = configSchema.env(env);

  if (validationResult instanceof type.errors) {
    throw validationResult.toTraversalError();
  }

  return validationResult;
}

function parseRootObject(serialized: string): JsonObject {
  const parsed: unknown = JSON.parse(serialized);

  if (!isPlainObject(parsed)) {
    throw new Error('Invalid config: root must be an object');
  }

  return parsed;
}

function collectEnvOverrides(env: NodeJS.ProcessEnv): JsonObject {
  const overrides: JsonObject = {};
  const entries = Object.entries(env).filter(
    (pair): pair is [string, string] => {
      const [key, val] = pair;
      return (
        key.startsWith('BOT__') && typeof val === 'string' && val.length > 0
      );
    },
  );

  for (const [rawKey, rawValue] of entries) {
    const [, ...parts] = rawKey.split('__');
    if (parts.length === 0 || parts.some((segment) => segment.length === 0)) {
      continue;
    }

    const pathSegments = parts.map(toCamelFromConst);
    const leaf = pathSegments.at(-1);

    if (!leaf) {
      continue;
    }

    const parentSegments = pathSegments.slice(0, -1);

    const value =
      leaf === 'devGuildIds' ? parseList(rawValue) : coerceValue(rawValue);
    setDeep(overrides, [...parentSegments, leaf], value);
  }

  return overrides;
}

function toCamelFromConst(segment: string): string {
  const lower = segment.toLowerCase();
  const parts = lower.split('_');
  return parts
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

function coerceValue(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed === '') return '';

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  return trimmed;
}

function parseList(value: string): string[] {
  const coerced = coerceValue(value);
  if (Array.isArray(coerced)) {
    return coerced.map((entry) => String(entry));
  }

  if (typeof coerced === 'string') {
    return coerced
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function setDeep(
  target: JsonObject,
  pathSegments: string[],
  value: unknown,
): void {
  if (pathSegments.length === 0) {
    return;
  }

  let current: JsonObject = target;

  for (let i = 0; i < pathSegments.length - 1; i += 1) {
    const segment = pathSegments[i];

    if (!segment) {
      return;
    }

    current = ensureChildObject(current, segment);
  }

  const leaf = pathSegments[pathSegments.length - 1];

  if (!leaf) {
    return;
  }

  current[leaf] = value;
}

function mergeConfig(base: JsonObject, overrides: JsonObject): JsonObject {
  const output: JsonObject = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = output[key];

    if (isPlainObject(baseValue) && isPlainObject(value)) {
      output[key] = mergeConfig(baseValue, value);
      continue;
    }

    output[key] = value;
  }

  return output;
}

function ensureChildObject(parent: JsonObject, key: string): JsonObject {
  const candidate = parent[key];

  if (isPlainObject(candidate)) {
    return candidate;
  }

  const created: JsonObject = {};
  parent[key] = created;
  return created;
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
