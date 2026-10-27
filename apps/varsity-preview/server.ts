import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { z, ZodError } from 'zod';
import { VarsityStore, StoreError } from '../../packages/database/src/varsity/store.ts';
import { ScoringError } from '../../packages/sports/src/basketball/scorer.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dataDir = path.resolve(process.env.VARSITY_DATA_DIR ?? path.join(root, '.local/varsity'));
const port = Number(process.env.VARSITY_PORT ?? 4174);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Choose a valid local port.');
const origin = `http://127.0.0.1:${port}`;
await mkdir(path.dirname(dataDir), { recursive: true });
const lockPath = `${dataDir}.lock`;
let lock: FileHandle;
try {
  lock = await open(lockPath, 'wx');
  await lock.writeFile(String(process.pid));
} catch {
  throw new Error(
    `The local database may already be open. Stop the other preview process. If it crashed, verify that process is gone before removing ${lockPath}.`,
  );
}
const db = new PGlite(dataDir);
const store = new VarsityStore(db);
try {
  await store.initialize();
} catch (error) {
  await db.close().catch(() => {});
  await lock.close();
  await unlink(lockPath);
  throw error;
}

const assets = new Map([
  ['/', ['apps/varsity-preview/public/index.html', 'text/html']],
  ['/app.js', ['apps/varsity-preview/public/app.js', 'text/javascript']],
  ['/views.js', ['apps/varsity-preview/public/views.js', 'text/javascript']],
  ['/style.css', ['apps/varsity-preview/public/style.css', 'text/css']],
  ['/logo.png', ['examples/alhadi-school/assets/ahs-lions.png', 'image/png']],
  ['/team.png', ['examples/alhadi-school/assets/ahs-team-latest.png', 'image/png']],
]);
function json(res: http.ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
async function body(req: http.IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  if (req.headers['content-type'] !== 'application/json')
    throw new StoreError('Use application/json.', 415);
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
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  try {
    // Deliberately local-only; reject DNS rebinding and cross-origin browser access.
    if (req.headers.host !== `127.0.0.1:${port}`)
      throw new StoreError('Use the printed loopback URL.', 403);
    if (req.headers.origin && req.headers.origin !== origin)
      throw new StoreError('Cross-origin access denied.', 403);
    if (req.headers['sec-fetch-site'] === 'cross-site')
      throw new StoreError('Cross-site access denied.', 403);
    const url = new URL(req.url ?? '/', origin);
    if (req.method === 'GET' && assets.has(url.pathname)) {
      const [file, type] = assets.get(url.pathname)!;
      if (!file || !type) throw new StoreError('Asset unavailable.', 404);
      res.writeHead(200, { 'Content-Type': type });
      res.end(await readFile(path.join(root, file)));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      json(res, 200, { ok: true, mode: 'local-rehearsal' });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/dashboard') {
      json(res, 200, await store.dashboard());
      return;
    }
    if (req.method !== 'GET' && req.headers.origin !== origin)
      throw new StoreError('Same-origin browser request required.', 403);
    if (req.method === 'PUT' && url.pathname === '/api/roster') {
      json(res, 200, await store.saveRoster(await body(req)));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/games') {
      json(res, 201, await store.create(await body(req)));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/practice') {
      const input = z.strictObject({ commandId: z.uuid() }).parse(await body(req));
      json(
        res,
        201,
        await store.create(
          {
            commandId: input.commandId,
            opponent: 'Practice opponent',
            trackedSide: 'home',
            scheduledAt: null,
            venue: 'Rehearsal · not a scheduled fixture',
            sourceUrl: '',
            rules: { periods: 4, periodSeconds: 480, overtimeSeconds: 240 },
            rulesConfirmed: false,
            opponents: Array.from({ length: 6 }, (_, i) => ({ jersey: String(i + 11), name: '' })),
          },
          true,
        ),
      );
      return;
    }
    const match = /^\/api\/games\/([0-9a-f-]+)(?:\/(commands|export))?$/.exec(url.pathname);
    if (match?.[1]) {
      const id = z.uuid().parse(match[1]);
      if (req.method === 'GET' && !match[2]) {
        json(res, 200, await store.game(id));
        return;
      }
      if (req.method === 'GET' && match[2] === 'export') {
        res.setHeader('Content-Disposition', `attachment; filename="game-${id}.json"`);
        json(res, 200, await store.exportGame(id));
        return;
      }
      if (req.method === 'POST' && match[2] === 'commands') {
        json(res, 200, await store.command(id, await body(req)));
        return;
      }
    }
    throw new StoreError('Not found.', 404);
  } catch (error) {
    const requestId = randomUUID();
    const status =
      error instanceof StoreError
        ? error.code
        : error instanceof ZodError || error instanceof ScoringError
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
          : 'The local database request failed. Keep this window open and retry.';
    if (status === 500)
      console.error(`Preview request failed (${requestId}); no input data logged.`);
    if (!res.headersSent) json(res, status, { error: message, requestId });
    else res.end();
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, '127.0.0.1', () =>
  console.log(
    `Local: ${origin}\nPersistent rehearsal database: ${dataDir}\nLocal access only. Hosted game-day security is not enabled.`,
  ),
);
server.on('error', (error) => {
  console.error(error.message);
  void stop().then(() => process.exit(1));
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
  await lock.close();
  await unlink(lockPath);
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void stop().then(() => process.exit(0));
  });
