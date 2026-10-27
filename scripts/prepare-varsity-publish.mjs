import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Sites requires a provider source mirror; GitHub remains the authoring repository.
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'apps/varsity-hosted');
const destination = path.resolve(root, '../varsity-sites-source');
if (
  path.dirname(destination) !== path.resolve(root, '..') ||
  path.basename(destination) !== 'varsity-sites-source'
)
  throw new Error('Unexpected publish directory');
await mkdir(destination, { recursive: true });
const omitted = new Set([
  '.git',
  'node_modules',
  'dist',
  '.next',
  '.vinext',
  '.wrangler',
  '.sites-runtime',
  'outputs',
  'work',
]);
await cp(source, destination, {
  recursive: true,
  filter: (file) => {
    const rel = path.relative(source, file);
    if (!rel) return true;
    const parts = rel.split(path.sep);
    return (
      !parts.some((p) => omitted.has(p) || p.startsWith('.env') || p.startsWith('.dev.vars')) &&
      !rel.endsWith('.tsbuildinfo')
    );
  },
});
let ignore = await readFile(path.join(destination, '.gitignore'), 'utf8');
ignore = ignore.split('# Generated from canonical shared scorer sources')[0];
await writeFile(path.join(destination, '.gitignore'), ignore);
await cp(path.join(source, 'dist'), path.join(destination, 'dist'), { recursive: true });
console.log(`Prepared publish mirror: ${destination}`);
