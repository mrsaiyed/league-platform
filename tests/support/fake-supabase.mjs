// A stand-in for a Supabase project's REST endpoint, for tests: POST /rest/v1/rpc/<fn>
// calls public.<fn> with the JSON body as named arguments, as Supabase's PostgREST
// does, running as the anon role in its own transaction, against real PostgreSQL
// (PGlite) set up exactly as setup.sql sets up Supabase. The API key is checked,
// CORS is answered, SQLSTATE PTxxx becomes HTTP xxx, and `offline` drops requests.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PostgresRepository } from '../../packages/database/src/live-stats/postgres.ts';

/**
 * `setup: true` sets the database up by running supabase/setup.sql, exactly as a new
 * project is set up (schedule included); otherwise only the tables and API.
 */
export async function fakeSupabase({
  key = 'test-anon-key',
  passcode = 'test-scorer-passcode',
  port = 0,
  setup = false,
} = {}) {
  const db = new PGlite();
  // As on Supabase: the API roles exist, and the API reaches the database as anon.
  await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;');
  if (setup)
    await db.exec(await readFile(new URL('../../supabase/setup.sql', import.meta.url), 'utf8'));
  else await new PostgresRepository(db).initialize();
  if (passcode) await db.query('SELECT live_stats.set_scorer_passcode($1)', [passcode]);
  const functions = new Map();
  for (const f of (
    await db.query(
      `SELECT p.proname AS name, p.proargnames AS names,
         array(SELECT format_type(t, NULL) FROM unnest(p.proargtypes) AS t) AS types
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'ls\\_%'`,
    )
  ).rows)
    functions.set(f.name, new Map((f.names ?? []).map((name, i) => [name, f.types[i]])));

  const state = { offline: false, calls: 0 };
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  const send = (res, status, body) => {
    res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    if (state.offline) return req.socket.destroy();
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    const fn = /^\/rest\/v1\/rpc\/(\w+)$/.exec(new URL(req.url, 'http://x').pathname)?.[1];
    if (req.method !== 'POST' || !fn) return send(res, 404, { message: 'Not found' });
    if (req.headers.apikey !== key || req.headers.authorization !== `Bearer ${key}`)
      return send(res, 401, { message: 'Invalid API key' });
    let body = '';
    for await (const chunk of req) body += chunk;
    const args = body ? JSON.parse(body) : {};
    const params = functions.get(fn);
    const names = Object.keys(args);
    if (!params || names.some((n) => !params.has(n)))
      return send(res, 404, {
        code: 'PGRST202',
        message: `Could not find the function public.${fn} in the schema cache`,
      });
    const values = names.map((n) => {
      const v = args[n];
      if (v === null || v === undefined) return null;
      return params.get(n) === 'jsonb' || typeof v === 'object' ? JSON.stringify(v) : v;
    });
    const sql = `SELECT public.${fn}(${names
      .map((n, i) => `${n} => $${i + 1}::${params.get(n)}`)
      .join(', ')}) AS result`;
    state.calls += 1;
    try {
      const out = await db.transaction(async (tx) => {
        await tx.query('SET LOCAL ROLE anon');
        return tx.query(sql, values);
      });
      send(res, 200, out.rows[0].result ?? null);
    } catch (e) {
      const code = e.code ?? '';
      const status = /^PT\d{3}$/.test(code)
        ? Number(code.slice(2))
        : code.startsWith('23')
          ? 409
          : code === '42501'
            ? 403
            : 400;
      send(res, status, { code, message: e.message, details: null, hint: null });
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    key,
    passcode,
    db,
    state,
    async stop() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
}
