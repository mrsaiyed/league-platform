// Shows the new product on this computer, as it stands at the newest commit of this folder:
//   node scripts/preview-web.mjs            then open http://127.0.0.1:3210/north-valley
//   node scripts/preview-web.mjs --prepare  only gets the copy ready (first time: minutes)
//
// It runs the web app on its made-up stand-in (APP_ENV=test): made-up leagues, made-up
// people, no database, no outside service. It answers only this computer (127.0.0.1), so
// nothing leaves it and nothing real is read. Places to look: /north-valley and
// /harbor-city (two leagues, each with its own look), /signin, /signup, /find.
//
// It runs from a private copy under .local/preview, never from this folder: a server
// running here holds files open, and the build's own `npm ci` would then fail. Each time
// this starts, the copy is moved to this folder's newest commit, and built again if the
// product's code changed. So to see newer work, stop it and start it again.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copy = path.join(root, '.local', 'preview');
const host = '127.0.0.1';
const port = process.env.PREVIEW_PORT ?? '3210';
const say = (text) => console.log(`[preview] ${text}`);
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options });
  if (result.status !== 0) {
    say(`"${command} ${args.join(' ')}" did not work. Nothing else was changed.`);
    process.exit(1);
  }
};
const git = (...args) =>
  (spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout ?? '').trim();

// 1. The private copy, at this folder's newest commit.
const commit = git('rev-parse', 'HEAD');
if (!commit) {
  say('This folder has no commit to show.');
  process.exit(1);
}
if (!fs.existsSync(path.join(copy, '.git'))) {
  say('Making the private copy (first time only).');
  run('git', ['worktree', 'add', '--detach', copy, commit], { cwd: root });
} else if (git('-C', copy, 'rev-parse', 'HEAD') !== commit) {
  say(`Moving the private copy to ${commit.slice(0, 7)}.`);
  run('git', ['checkout', '--quiet', '--force', '--detach', commit], { cwd: copy });
}

// 2. Its libraries, when the list of them changed.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const lock = crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(copy, 'package-lock.json')))
  .digest('hex');
const lockNote = path.join(copy, 'node_modules', '.preview-lock');
if (!fs.existsSync(lockNote) || fs.readFileSync(lockNote, 'utf8') !== lock) {
  say('Installing libraries in the private copy.');
  run(npm, ['ci', '--no-audit', '--no-fund'], { cwd: copy, shell: process.platform === 'win32' });
  fs.writeFileSync(lockNote, lock);
}

// 3. Build it, when the product's code changed: the web app, the packages it is made of,
// or the libraries. All settings are made up (as in the app's own check,
// scripts/check-web-shell.mjs).
const app = path.join(copy, 'apps', 'web');
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  APP_ENV: 'test',
  PUBLIC_BASE_URL: `http://${host}:${port}`,
  LOG_LEVEL: 'warn',
  DATABASE_URL: 'postgres://made-up:made-up-password@127.0.0.1:1/nowhere',
  SESSION_SECRET: 'made-up-session-secret-0123456789abcdef',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SECRET_KEY: 'made-up-supabase-key',
  RESEND_API_KEY: 'made-up-resend-key',
  EMAIL_FROM: 'hello@example.test',
  STRIPE_SECRET_KEY: 'made-up-stripe-key',
  STRIPE_WEBHOOK_SECRET: 'made-up-webhook-key',
};
const nextBin = createRequire(path.join(app, 'package.json')).resolve('next/dist/bin/next');
const code = git('rev-parse', `${commit}:apps/web`, `${commit}:packages`).replace(/\s+/g, ' ');
const built = `${code} ${lock}`;
const builtNote = path.join(app, '.next', 'preview-built');
if (!fs.existsSync(builtNote) || fs.readFileSync(builtNote, 'utf8') !== built) {
  say(`Building the web app at ${commit.slice(0, 7)} (a few minutes when the lanes are busy).`);
  run(process.execPath, [nextBin, 'build'], { cwd: app, env });
  fs.writeFileSync(builtNote, built);
}
if (process.argv.includes('--prepare')) {
  say(`Ready at ${commit.slice(0, 7)}. Start it with: node scripts/preview-web.mjs`);
  process.exit(0);
}

// 4. Serve it, to this computer only.
say(`The product as of ${commit.slice(0, 7)}: http://${host}:${port}/north-valley`);
const server = spawn(process.execPath, [nextBin, 'start', '--hostname', host, '--port', port], {
  cwd: app,
  env,
  stdio: 'inherit',
});
server.on('exit', (status, signal) => process.exit(signal ? 1 : (status ?? 1)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
