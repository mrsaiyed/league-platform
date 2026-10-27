import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { mkdir, open, readFile, readdir, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { z, ZodError } from 'zod';
import { LiveStatsStore, StoreError } from '../../packages/database/src/live-stats/store.ts';
import type { ScheduleSeed } from '../../packages/database/src/live-stats/store.ts';
import { TrackerError } from '../../packages/sports/src/basketball/live.ts';

// Live stat tracking: the schedule, a courtside tracker that saves every tap to
// PostgreSQL, and live game pages that update as the game is scored.
const root = fileURLToPath(new URL('../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
const dataDir = path.resolve(
  process.env.LIVE_STATS_DATA_DIR ?? path.join(root, '.local/live-stats'),
);
const port = Number(process.env.LIVE_STATS_PORT ?? 4180);
// LIVE_STATS_LAN=1 lets phones on the same network watch; scoring stays on this computer
// unless LIVE_STATS_REMOTE_SCORING=1. There are no accounts yet, so only use a trusted network.
const lan = process.env.LIVE_STATS_LAN === '1';
const remoteScoring = lan && process.env.LIVE_STATS_REMOTE_SCORING === '1';
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Choose a valid local port.');

const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a!.address);
const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
if (lan) for (const a of lanAddresses) hosts.add(`${a}:${port}`);

// One server per database. The lock holds this process id, so a lock left by a server
// that was killed or crashed (a laptop that died mid-game) is cleared on the next start.
await mkdir(path.dirname(dataDir), { recursive: true });
const lockPath = `${dataDir}.lock`;
const running = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};
async function takeLock(): Promise<FileHandle> {
  try {
    const handle = await open(lockPath, 'wx');
    await handle.writeFile(String(process.pid));
    return handle;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const pid = Number(await readFile(lockPath, 'utf8').catch(() => ''));
    if (Number.isInteger(pid) && pid > 0 && running(pid))
      throw new Error(
        `The stats server is already running (process ${pid}). Use that one, or stop it first.`,
      );
    await unlink(lockPath);
    return takeLock();
  }
}
const lock = await takeLock();
const db = new PGlite(dataDir);
const store = new LiveStatsStore(db);
try {
  await store.initialize();
  const seed = JSON.parse(
    await readFile(path.join(here, 'data/tcsaal-alhadi-varsity-boys-2026-27.json'), 'utf8'),
  ) as ScheduleSeed;
  await store.seed(seed);
} catch (error) {
  await db.close().catch(() => {});
  await lock.close();
  await unlink(lockPath);
  throw error;
}

// The tracker engine runs in the scorer's browser too, so a tap shows before the server answers.
const engine = stripTypeScriptTypes(
  await readFile(path.join(root, 'packages/sports/src/basketball/live.ts'), 'utf8'),
);
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};
const files = new Map<string, string>([
  ['/img/lions.png', path.join(root, 'examples/alhadi-school/assets/ahs-lions.png')],
  ['/img/alhadi-logo.png', path.join(root, 'examples/alhadi-school/assets/alhadi-logo.png')],
]);
for (const dir of ['css', 'js'])
  for (const name of await readdir(path.join(here, 'public', dir)))
    files.set(`/${dir}/${name}`, path.join(here, 'public', dir, name));
const page = (name: string) => path.join(here, 'public', name);
const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const pages: [RegExp, string][] = [
  [/^\/$/, page('index.html')],
  [new RegExp(`^/game/${ID}$`), page('game.html')],
  [new RegExp(`^/game/${ID}/track$`), page('track.html')],
  [new RegExp(`^/team/${ID}$`), page('team.html')],
];

// ---- live updates (server-sent events) -------------------------------------
type Listener = { res: http.ServerResponse; gameId: string | null };
const listeners = new Set<Listener>();
function send(res: http.ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
/** The game's own pages get the whole game; the schedule gets its summary. */
async function broadcastGame(gameId: string) {
  if (![...listeners].length) return;
  const game = await store.game(gameId);
  const { players: _players, state: _state, ...summary } = game;
  for (const l of listeners) {
    if (l.gameId === gameId) send(l.res, 'game', game);
    else if (l.gameId === null) send(l.res, 'summary', summary);
  }
}
/** A roster changed: every open game with that team reloads its players. */
async function broadcastTeam(teamId: string) {
  for (const l of listeners) {
    if (!l.gameId) continue;
    const game = await store.game(l.gameId).catch(() => null);
    if (game && (game.home.id === teamId || game.away.id === teamId)) send(l.res, 'game', game);
  }
}
setInterval(() => {
  for (const l of listeners) l.res.write(': keep-alive\n\n');
}, 20_000).unref();

// ---- HTTP ------------------------------------------------------------------
function json(res: http.ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
async function body(req: http.IncomingMessage) {
  if (req.headers['content-type'] !== 'application/json')
    throw new StoreError('Use application/json.', 415);
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new StoreError('Request exceeds 64 KiB.', 413);
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new StoreError('Invalid JSON.', 400);
  }
}
const isLoopback = (req: http.IncomingMessage) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
const canScore = (req: http.IncomingMessage) => isLoopback(req) || remoteScoring;

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  try {
    // Only the addresses printed at startup; refuses DNS rebinding and other sites' pages.
    const host = req.headers.host ?? '';
    if (!hosts.has(host))
      throw new StoreError('Use the address printed when the server started.', 403);
    const origin = `http://${host}`;
    if (req.headers.origin && req.headers.origin !== origin)
      throw new StoreError('Cross-origin access denied.', 403);
    if (req.headers['sec-fetch-site'] === 'cross-site')
      throw new StoreError('Cross-site access denied.', 403);
    const url = new URL(req.url ?? '/', origin);
    const p = url.pathname;

    if (req.method === 'GET') {
      if (p === '/js/engine.js') {
        res.writeHead(200, { 'Content-Type': types['.js']! });
        res.end(engine);
        return;
      }
      const file = files.get(p) ?? pages.find(([re]) => re.test(p))?.[1];
      if (file) {
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'text/plain' });
        res.end(await readFile(file));
        return;
      }
      if (p === '/api/session') {
        json(res, 200, {
          canScore: canScore(req),
          watchUrls: lan ? lanAddresses.map((a) => `http://${a}:${port}`) : [],
        });
        return;
      }
      if (p === '/api/schedule') {
        json(res, 200, await store.schedule());
        return;
      }
      if (p === '/api/stream') {
        const gameId = url.searchParams.get('game');
        if (gameId !== null) z.uuid().parse(gameId);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
        res.write('retry: 2000\n\n');
        const listener = { res, gameId };
        listeners.add(listener);
        req.on('close', () => listeners.delete(listener));
        if (gameId) send(res, 'game', await store.game(gameId));
        else send(res, 'schedule', await store.schedule());
        return;
      }
      const game = new RegExp(`^/api/games/(${ID})$`).exec(p);
      if (game?.[1]) {
        json(res, 200, await store.game(game[1]));
        return;
      }
      const team = new RegExp(`^/api/teams/(${ID})$`).exec(p);
      if (team?.[1]) {
        json(res, 200, await store.team(team[1]));
        return;
      }
      throw new StoreError('Not found.', 404);
    }

    // Changes: same-origin browser requests only, from a device allowed to score.
    if (req.headers.origin !== origin) throw new StoreError('Same-origin request required.', 403);
    if (!canScore(req))
      throw new StoreError('Scoring is only available on the computer running the stats.', 403);
    const command = new RegExp(`^/api/games/(${ID})/commands$`).exec(p);
    if (req.method === 'POST' && command?.[1]) {
      const result = await store.command(command[1], await body(req));
      json(res, 200, result.game);
      if (result.changed) void broadcastGame(command[1]).catch(() => {});
      return;
    }
    const players = new RegExp(`^/api/teams/(${ID})/players$`).exec(p);
    if (req.method === 'POST' && players?.[1]) {
      const player = await store.addPlayer(players[1], await body(req));
      json(res, 201, player);
      void broadcastTeam(player.teamId).catch(() => {});
      return;
    }
    const one = new RegExp(`^/api/players/(${ID})$`).exec(p);
    if (one?.[1] && (req.method === 'PUT' || req.method === 'DELETE')) {
      const player =
        req.method === 'PUT'
          ? await store.updatePlayer(one[1], await body(req))
          : await store.removePlayer(one[1]);
      json(res, 200, player);
      void broadcastTeam(player.teamId).catch(() => {});
      return;
    }
    throw new StoreError('Not found.', 404);
  } catch (error) {
    const status =
      error instanceof StoreError
        ? error.status
        : error instanceof ZodError || error instanceof TrackerError
          ? 422
          : 500;
    const message =
      error instanceof ZodError
        ? error.issues
            .map((i) => i.message)
            .slice(0, 3)
            .join(' ')
        : status < 500 && error instanceof Error
          ? error.message
          : 'The stats database request failed. Keep this window open and try again.';
    if (status === 500) console.error(`Request failed (${randomUUID()}):`, error);
    if (!res.headersSent) json(res, status, { error: message });
    else res.end();
  }
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`Live stats: http://127.0.0.1:${port}`);
  if (lan)
    for (const a of lanAddresses)
      console.log(
        `On this network: http://${a}:${port} (${remoteScoring ? 'watch and score' : 'watch only'})`,
      );
  console.log(`Database: ${dataDir}`);
});
server.on('error', (error) => {
  console.error(error.message);
  void stop().then(() => process.exit(1));
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const l of listeners) l.res.end();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
  await lock.close();
  await unlink(lockPath);
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void stop().then(() => process.exit(0));
  });
