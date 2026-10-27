import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)),
  app = path.join(root, 'apps/varsity-hosted');
await mkdir(path.join(app, 'shared'), { recursive: true });
await mkdir(path.join(app, 'lib'), { recursive: true });
await mkdir(path.join(app, 'public'), { recursive: true });
for (const name of ['contracts', 'sports'])
  await cp(path.join(root, 'packages', name), path.join(app, 'shared', name), { recursive: true });
for (const name of ['app.js', 'views.js', 'style.css'])
  await cp(path.join(root, 'apps/varsity-preview/public', name), path.join(app, 'public', name));
for (const [from, to] of [
  ['ahs-lions.png', 'logo.png'],
  ['ahs-team-latest.png', 'team.png'],
])
  await cp(path.join(root, 'examples/alhadi-school/assets', from), path.join(app, 'public', to));
let html = await readFile(path.join(root, 'apps/varsity-preview/public/index.html'), 'utf8');
html = html
  .replace('<body>', '<body data-storage="cloud">')
  .replace('Game-day preview', 'Shared SQL pilot')
  .replace(
    'Local rehearsal · records saved on this computer',
    'Private pilot · every accepted action saved to shared SQL',
  )
  .replace(
    'TCSAAL fixtures are an external source',
    'Team-maintained records · TCSAAL remains the official competition source',
  );
await writeFile(
  path.join(app, 'lib/shell.ts'),
  `// Generated from the shared scorer UI. Run npm run prepare:varsity:hosted.\nexport const html=${JSON.stringify(html)};\n`,
);
console.log('Prepared hosted UI and shared contracts/rules from canonical repository sources.');
