// Exports the OpenAPI spec to ../openapi.json so openapi-typescript can generate frontend types offline.
// Usage: node scripts/dump-spec.js   (or  npm run dump-spec)
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import specs from '../utils/swagger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '../../openapi.json');

writeFileSync(outPath, JSON.stringify(specs, null, 2));
console.log(`✅  OpenAPI spec written to ${outPath}`);
