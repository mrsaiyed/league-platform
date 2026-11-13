// Both ways of reaching PostgreSQL read rows the same way, and the pg pool, like
// PGlite, hands the next transaction a connection with no league left on it (T-61).
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  freshSchema,
  newLeague,
  newSeason,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { createDatabase } from './create-database.ts';
import { kyselyOf, type DatabaseHandle } from './database-handle.ts';
import { transactionOf } from './transaction-scope.ts';
import { withTransaction } from './with-transaction.ts';

let pglite: PGlite;
let server: PGLiteSocketServer;
let league: MadeLeague;
type Kind = 'pglite' | 'postgres';
const handles = new Map<Kind, DatabaseHandle>();
const handle = (kind: Kind) => {
  const found = handles.get(kind);
  if (found === undefined) throw new Error(`no ${kind} handle`);
  return found;
};

beforeAll(async () => {
  pglite = await freshSchema();
  league = await newLeague(pglite);
  const seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId);
  await pglite.query(
    `update seasons set starts_on = '2026-09-01', stat_keys = '{points,fouls}' where id = $1`,
    [seasonId],
  );
  server = new PGLiteSocketServer({ db: pglite, port: 0, host: '127.0.0.1' });
  await server.start();
  handles.set('pglite', createDatabase({ kind: 'pglite', pglite }));
  const url = `postgres://postgres:postgres@${server.getServerConn()}/postgres?sslmode=require`;
  // One connection, so the second transaction surely reuses the first one's. The
  // sslmode in the address is ignored: `ssl` decides.
  handles.set('postgres', createDatabase({ kind: 'postgres', url, ssl: 'off', maxConnections: 1 }));
});
afterAll(async () => {
  for (const open of handles.values()) await open.close();
  await server.stop();
  await pglite.close();
});

describe.each(['pglite', 'postgres'] as const)('createDatabase (%s)', (kind) => {
  it('reads dates as text, times as Dates, jsonb as JSON and arrays as arrays', async () => {
    const season = await withTransaction(handle(kind), { leagueId: league.leagueId }, (scope) =>
      transactionOf(scope)
        .selectFrom('seasons')
        .select(['starts_on', 'created_at', 'rules', 'stat_keys'])
        .where('league_id', '=', league.leagueId)
        .executeTakeFirstOrThrow(),
    );
    expect(season.starts_on).toBe('2026-09-01');
    expect(season.created_at).toBeInstanceOf(Date);
    expect(season.rules).toEqual({ version: 1 });
    expect(season.stat_keys).toEqual(['points', 'fouls']);
  });

  it('writes a jsonb object', async () => {
    const config = { version: 1, colors: ['navy', 'gold'] };
    const written = await withTransaction(handle(kind), { leagueId: league.leagueId }, (scope) =>
      transactionOf(scope)
        .insertInto('league_features')
        .values({ league_id: league.leagueId, feature_key: `colors_${kind}`, config })
        .returning('config')
        .executeTakeFirstOrThrow(),
    );
    expect(written.config).toEqual(config);
  });

  // The same connection by construction: PGlite has one, and the pool here has one.
  it('starts the next transaction on the same connection with no league', async () => {
    const readLeague = sql<{
      league: string | null;
    }>`select current_setting('app.league_id', true) as league`;
    const inside = await withTransaction(handle(kind), { leagueId: league.leagueId }, (scope) =>
      readLeague.execute(transactionOf(scope)),
    );
    const next = await kyselyOf(handle(kind))
      .transaction()
      .execute((trx) => readLeague.execute(trx));
    expect(inside.rows[0]?.league).toBe(league.leagueId);
    expect(next.rows[0]?.league ?? '').toBe('');
  });
});

describe('createDatabase (pglite)', () => {
  it('leaves the PGlite it was given open when closed', async () => {
    const handle = createDatabase({ kind: 'pglite', pglite });
    await handle.close();
    expect((await pglite.query('select 1 as one')).rows).toEqual([{ one: 1 }]);
  });
});
