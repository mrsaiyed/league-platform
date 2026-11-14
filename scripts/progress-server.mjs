// The build's progress page, fresh every time it is loaded, and free: no AI is involved.
//   node scripts/progress-server.mjs      then open http://127.0.0.1:3230
// or double-click "Open build progress.cmd" in the repository's folder.
//
// Each time the page is asked for, this runs scripts/build-dashboard.mjs (two seconds: it
// reads the plans, STATUS.md and git on this computer) and sends back what it wrote. The
// page reloads itself every minute, so it stays current for as long as this is running.
// It answers only this computer (127.0.0.1). It uses nothing from node_modules, so it holds
// no file the build's own installs need, and may run from the main folder.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.join(root, 'docs/build/dashboard.html');
const builder = path.join(root, 'scripts/build-dashboard.mjs');
const host = '127.0.0.1';
const port = Number(process.env.PROGRESS_PORT ?? 3230);
// Several tabs, or a reload straight after a load, share one rewrite.
const keepSeconds = 15;
let writtenAt = 0;
let lastProblem = '';

function rewrite() {
  if (Date.now() - writtenAt < keepSeconds * 1000) return;
  const result = spawnSync(process.execPath, [builder, '--quiet'], { cwd: root, encoding: 'utf8' });
  writtenAt = Date.now();
  lastProblem = result.status === 0 ? '' : (result.stderr || result.stdout || 'unknown').trim();
}

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' || new URL(request.url, `http://${host}`).pathname !== '/') {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Only the progress page lives here: open /');
    return;
  }
  rewrite();
  if (!fs.existsSync(page)) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`The progress page could not be written.\n${lastProblem}`);
    return;
  }
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(fs.readFileSync(page));
});
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Something already answers at http://${host}:${port}. It is probably this page, already open.`
      : String(error),
  );
  process.exit(1);
});
server.listen(port, host, () => {
  console.log(
    `Build progress: http://${host}:${port}  (fresh on every load; close this window to stop)`,
  );
});
