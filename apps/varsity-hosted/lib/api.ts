import { env } from 'cloudflare:workers';
import { z, ZodError } from 'zod';
import { ScoringError } from '../shared/sports/src/basketball/scorer.ts';
import { HostedStore, StoreError } from './store';

const headers = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
export async function handle(request: Request) {
  try {
    // The deployment is owner-private. Sites verifies visitor identity or owner service access
    // before dispatch; the service bypass deliberately has no visitor identity header.
    if (!env.DB) throw new Error('Database binding missing.');
    const url = new URL(request.url),
      origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site')
      throw new StoreError('Cross-origin request denied.', 403);
    if (request.method !== 'GET' && origin !== url.origin)
      throw new StoreError('Same-origin request required.', 403);
    const store = new HostedStore(
      env.DB,
      request.headers.get('oai-authenticated-user-id') ?? 'sites-owner-service',
    );
    const body = async () => {
      if (request.headers.get('content-type') !== 'application/json')
        throw new StoreError('Use application/json.', 415);
      if (Number(request.headers.get('content-length') ?? 0) > 65536)
        throw new StoreError('Request too large.', 413);
      const reader = request.body?.getReader();
      if (!reader) throw new StoreError('JSON body required.', 400);
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 65536) {
          await reader.cancel();
          throw new StoreError('Request too large.', 413);
        }
        chunks.push(value);
      }
      const data = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.byteLength;
      }
      try {
        return JSON.parse(new TextDecoder().decode(data));
      } catch {
        throw new StoreError('Invalid JSON.', 400);
      }
    };
    await store.initialize();
    let result: unknown;
    if (request.method === 'GET' && url.pathname === '/api/health')
      result = { ok: true, mode: 'hosted-sql-pilot' };
    else if (request.method === 'GET' && url.pathname === '/api/dashboard')
      result = await store.dashboard();
    else if (request.method === 'PUT' && url.pathname === '/api/roster')
      result = await store.saveRoster(await body());
    else if (request.method === 'POST' && url.pathname === '/api/games')
      result = await store.create(await body());
    else if (request.method === 'POST' && url.pathname === '/api/practice') {
      const input = z.strictObject({ commandId: z.uuid() }).parse(await body());
      result = await store.create(
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
      );
    } else {
      const match = /^\/api\/games\/([0-9a-f-]+)(?:\/(commands|export))?$/.exec(url.pathname);
      if (!match?.[1]) throw new StoreError('Not found.', 404);
      const id = z.uuid().parse(match[1]);
      if (request.method === 'GET' && !match[2]) result = await store.game(id);
      else if (request.method === 'GET' && match[2] === 'export')
        return Response.json(await store.exportGame(id), {
          headers: { ...headers, 'Content-Disposition': `attachment; filename="game-${id}.json"` },
        });
      else if (request.method === 'POST' && match[2] === 'commands')
        result = await store.command(id, await body());
      else throw new StoreError('Not found.', 404);
    }
    return Response.json(result, { headers });
  } catch (error) {
    const status =
      error instanceof StoreError
        ? error.code
        : error instanceof ZodError || error instanceof ScoringError
          ? 422
          : 500;
    const requestId = crypto.randomUUID();
    if (status === 500)
      console.error(`Database request failed (${requestId}); no player data logged.`);
    return Response.json(
      {
        error:
          status < 500 && error instanceof Error
            ? error.message
            : 'Database save failed. Keep the pending action and retry.',
        requestId,
      },
      { status, headers },
    );
  }
}
