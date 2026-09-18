import { type } from 'arktype';
import fs from 'node:fs';
import path from 'node:path';
import { JsonConfig, configSchema } from '../../src/config/config.type.js';

export default (): JsonConfig => {
  const jsonFileContent = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'config.test.json'),
    'utf-8',
  );

  const validationResult = configSchema.json(JSON.parse(jsonFileContent));

  if (validationResult instanceof type.errors) {
    throw validationResult.toTraversalError();
  }

  return validationResult;
};
