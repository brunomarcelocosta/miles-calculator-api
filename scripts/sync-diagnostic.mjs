// The API owns the versioned catalog. Run after changing catalog.json.
import { readFileSync, writeFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/domain/diagnostic/catalog.json', import.meta.url));
for (const target of ['../../miles-calculator-frontend/src/features/diagnostic/catalog.json', '../../travion-web/src/features/leads/lib/diagnosticCatalog.json']) {
  const path = new URL(target, import.meta.url);
  if (process.argv.includes('--check')) {
    if (JSON.stringify(JSON.parse(readFileSync(path))) !== JSON.stringify(JSON.parse(source))) throw new Error(`Catalog out of sync: ${path}`);
  } else writeFileSync(path, source);
}
