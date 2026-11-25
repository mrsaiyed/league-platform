// listGameEventsAfter against the real database (T-408): the mark a correction's play keeps
// in its event's payload comes back through PostgreSQL's document (`payload jsonb`) as
// `source: "correction"`; an event without it, as every play of the scoring screen and
// every play recorded before the mark existed, reads with no `source` at all.
import type { PGlite } from '@electric-sql/pglite';
import { correctionPlaySource, playSourceKey } from '@srleagues/contracts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newAccount,
  newGame,
  newLeague,
  newSeason,
  newStage,
  newTeam,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { insertGameEvents } from './insert-game-events.ts';
import { listGameEventsAfter } from './list-game-events-after.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let account: string;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  a = await newLeague(pglite);
  account = await newAccount(pglite);
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

async function liveGame(league: MadeLeague): Promise<string> {
  const seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId);
  return newGame(pglite, {
    leagueId: league.leagueId,
    seasonId,
    stageId: await newStage(pglite, league.leagueId, seasonId),
    homeTeamId: await newTeam(pglite, league.leagueId, seasonId),
    awayTeamId: await newTeam(pglite, league.leagueId, seasonId),
    columns: { status: 'live', capture_mode: 'live', home_score: 0, away_score: 0 },
  });
}

describe('listGameEventsAfter', () => {
  it('reads a correction’s mark from the payload, and no mark where there is none', async () => {
    const gameId = await liveGame(a);
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const at = Date.UTC(2026, 10, 25, 18, 0, 0);
    await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
      insertGameEvents(scope, [
        // A tap of the scoring screen, as every play was written before the mark existed.
        {
          gameId,
          seq: 1,
          commandId: ids[0] ?? '',
          type: 'foul',
          payload: { type: 'foul', side: 'home' },
          tappedAt: at,
          accountId: account,
        },
        // A play a grid correction wrote.
        {
          gameId,
          seq: 2,
          commandId: ids[1] ?? '',
          type: 'unfoul',
          payload: { type: 'unfoul', side: 'home', [playSourceKey]: correctionPlaySource },
          tappedAt: at,
          accountId: account,
        },
        // A value the tracker does not know is read as no mark, never passed on.
        {
          gameId,
          seq: 3,
          commandId: ids[2] ?? '',
          type: 'foul',
          payload: { type: 'foul', side: 'home', [playSourceKey]: 'something-else' },
          tappedAt: at,
          accountId: account,
        },
      ]),
    );
    const events = await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
      listGameEventsAfter(scope, gameId, 0, 10),
    );
    expect(events).toEqual([
      { seq: 1, commandId: ids[0], type: 'foul', accountId: account },
      {
        seq: 2,
        commandId: ids[1],
        type: 'unfoul',
        accountId: account,
        source: correctionPlaySource,
      },
      { seq: 3, commandId: ids[2], type: 'foul', accountId: account },
    ]);
    expect(events[0]).not.toHaveProperty('source');
    // After a sequence number, only the events after it.
    const later = await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
      listGameEventsAfter(scope, gameId, 1, 1),
    );
    expect(later).toEqual([
      {
        seq: 2,
        commandId: ids[1],
        type: 'unfoul',
        accountId: account,
        source: correctionPlaySource,
      },
    ]);
  });
});
