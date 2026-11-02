// Builds the GitHub Pages site into dist/pages:
//   /            the live stats pages (schedule, tracker, games, rosters, game logs),
//                saving to and reading from Supabase straight from the browser
//   /demo/       the preserved intramural concept demo
//
// The Supabase project comes from SUPABASE_URL and SUPABASE_ANON_KEY (in GitHub:
// repository variables, read by .github/workflows/demo-pages.yml). Both are public by
// design: the key only reaches the API functions in 002-api.sql, and changes need the
// scorer passcode. Without them the site builds and says it is not connected yet.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps/live-stats');
const out = path.join(root, 'dist/pages');
if (path.relative(root, out) !== path.join('dist', 'pages')) throw new Error('Unsafe output');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const key = (process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
if (url && !/^https:\/\/[\w.-]+$|^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url))
  throw new Error('SUPABASE_URL should look like https://abcdefghijklmnopqrst.supabase.co');
if (Boolean(url) !== Boolean(key))
  throw new Error('Set both SUPABASE_URL and SUPABASE_ANON_KEY, or neither.');
// Never publish a key that bypasses the database's protections.
const role = (() => {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role;
  } catch {
    return undefined;
  }
})();
if (key.startsWith('sb_secret_') || role === 'service_role')
  throw new Error(
    'That is the secret (service_role) key. Use the anon or publishable key: the secret key must never be put on a website.',
  );

// Pages: the server's paths (/css/..., /js/..., /) become relative to the site.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  `connect-src 'self'${url ? ` ${new URL(url).origin}` : ''}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');
for (const name of fs.readdirSync(path.join(app, 'public'))) {
  if (!name.endsWith('.html')) continue;
  let html = fs.readFileSync(path.join(app, 'public', name), 'utf8');
  html = html
    .replaceAll('="/css/', '="css/')
    .replaceAll('="/js/', '="js/')
    .replaceAll('="/img/', '="img/')
    .replaceAll('href="/"', 'href="./"')
    .replace(
      '<meta charset="utf-8" />',
      `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    );
  fs.writeFileSync(path.join(out, name), html);
}
fs.cpSync(path.join(app, 'public/css'), path.join(out, 'css'), { recursive: true });
fs.mkdirSync(path.join(out, 'js'));
for (const name of fs.readdirSync(path.join(app, 'public/js')))
  if (name !== 'config.js')
    fs.copyFileSync(path.join(app, 'public/js', name), path.join(out, 'js', name));
fs.writeFileSync(
  path.join(out, 'js/config.js'),
  `// Built by scripts/build-pages.mjs: the static site, saving to Supabase.\nexport const config = ${JSON.stringify({ mode: 'supabase', url, key })};\n`,
);
fs.writeFileSync(
  path.join(out, 'js/engine.js'),
  stripTypeScriptTypes(
    fs.readFileSync(path.join(root, 'packages/sports/src/basketball/live.ts'), 'utf8'),
  ),
);
await build({
  entryPoints: [path.join(app, 'web/supabase-api.ts')],
  outfile: path.join(out, 'js/supabase-api.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
});
fs.mkdirSync(path.join(out, 'img'));
for (const name of ['ahs-lions.png', 'alhadi-logo.png'])
  fs.copyFileSync(
    path.join(root, 'examples/alhadi-school/assets', name),
    path.join(out, 'img', name === 'ahs-lions.png' ? 'lions.png' : name),
  );

// The concept demo, built by build-demo.mjs, under demo/.
if (!fs.existsSync(path.join(root, 'dist/demo/index.html'))) {
  const demo = spawnSync(process.execPath, [path.join(root, 'scripts/build-demo.mjs')], {
    stdio: 'inherit',
  });
  if (demo.status !== 0) throw new Error('The demo build failed.');
}
fs.cpSync(path.join(root, 'dist/demo'), path.join(out, 'demo'), { recursive: true });
// Serve files as they are, without GitHub Pages' Jekyll processing.
fs.writeFileSync(path.join(out, '.nojekyll'), '');

console.log(
  `Built the site in dist/pages: live stats at the root (${url ? `saving to ${new URL(url).host}` : 'not connected to Supabase yet: set SUPABASE_URL and SUPABASE_ANON_KEY'}), the concept demo under demo/.`,
);
