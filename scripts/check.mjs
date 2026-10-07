import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = path.join(root, 'examples/alhadi-school');
const manifest = JSON.parse(fs.readFileSync(path.join(example, 'manifest.json'), 'utf8'));
const known = new Set(Object.keys(manifest.modules).map((key) => '@demo/' + key));
let count = 0;
for (const filename of Object.values(manifest.modules)) {
  const file = path.join(example, filename);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/(?:from\s+|import\s*)['"](@demo\/[^'"]+)['"]/g)) {
    if (!known.has(match[1])) throw new Error('Unknown module import ' + match[1]);
  }
  // This example intentionally has no network or production authentication implementation.
  if (/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(content))
    throw new Error('Unexpected network call in offline example');
  count++;
}
for (const file of [...manifest.styles, ...manifest.assets]) {
  if (!fs.existsSync(path.join(example, file))) throw new Error('Missing asset ' + file);
}
console.log(`Validated ${count} modules, import targets, local assets, and the offline boundary.`);
