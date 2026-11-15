// The build's progress page, fresh every time it is loaded, and free: no AI is involved.
//   node scripts/progress-server.mjs      then open http://127.0.0.1:3230
// or double-click "Open build progress.cmd" in the repository's folder.
//
// Each time the page is asked for, this runs scripts/build-dashboard.mjs (two seconds: it
// reads the plans, STATUS.md and git on this computer) and sends back what it wrote.
// While the page is open it asks /live.json every few seconds: who is working this minute,
// read from the times of files on this computer (scripts/dashboard/live.mjs), which takes a
// few thousandths of a second. The page reloads itself only when the plans have changed.
// It answers only this computer (127.0.0.1). It uses nothing from node_modules, so it holds
// no file the build's own installs need, and may run from the main folder.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { liveReader, planStamp, sessionsFolder } from './dashboard/live.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(root, 'docs/build');
const page = path.join(buildDir, 'dashboard.html');
const builder = path.join(root, 'scripts/build-dashboard.mjs');
const host = '127.0.0.1';
const port = Number(process.env.PROGRESS_PORT ?? 3230);
// The main folder of this repository, also when this runs from a private copy of it.
const commonDir = (
  spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).stdout ?? ''
).trim();
const whoIsWorking = liveReader(
  sessionsFolder(path.dirname(path.resolve(root, commonDir || '.git'))),
);
// Several tabs, or a reload straight after a load, share one rewrite.
const keepSeconds = 15;
let writtenAt = 0;
let lastProblem = '';
// Several tabs asking at once share one look at the files.
const liveKeepMs = 2000;
let liveAt = 0;
let liveText = '';

function rewrite() {
  if (Date.now() - writtenAt < keepSeconds * 1000) return;
  const result = spawnSync(process.execPath, [builder, '--quiet'], { cwd: root, encoding: 'utf8' });
  writtenAt = Date.now();
  lastProblem = result.status === 0 ? '' : (result.stderr || result.stdout || 'unknown').trim();
}

function live() {
  if (Date.now() - liveAt >= liveKeepMs) {
    let lock = '';
    try {
      lock = fs.readFileSync(path.join(buildDir, '.lock'), 'utf8').trim();
    } catch {
      lock = '';
    }
    liveText = JSON.stringify({ ...whoIsWorking(), lock, stamp: planStamp(buildDir) });
    liveAt = Date.now();
  }
  return liveText;
}

const server = http.createServer((request, response) => {
  const where = new URL(request.url, `http://${host}`).pathname;
  if (request.method === 'GET' && where === '/live.json') {
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(live());
    return;
  }
  if (request.method !== 'GET' || where !== '/') {
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
