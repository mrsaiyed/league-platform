// Runs Next.js for the web app: node scripts/web.mjs dev | build | start [more].
// Next.js runs in apps/web with its anonymous usage reporting switched off, so
// nothing leaves this computer. Settings come from the environment, and from the
// root .env when the npm script loads it (see .env.example); the app checks them
// at startup (apps/web/src/server/config.ts).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps/web');
const [command, ...rest] = process.argv.slice(2);
if (!['dev', 'build', 'start'].includes(command ?? '')) {
  console.error('Usage: node scripts/web.mjs dev | build | start');
  process.exit(2);
}
const nextBin = createRequire(path.join(app, 'package.json')).resolve('next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, command, ...rest], {
  cwd: app,
  stdio: 'inherit',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
