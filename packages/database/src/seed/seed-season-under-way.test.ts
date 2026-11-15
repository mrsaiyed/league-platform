// The seed leagues' seasons put under way (step 2.93): each league's season open, its
// schedule published with a game a week ago (final) and one a week on in each division,
// and the standings rebuilt from the result, all read back as a visitor reads them.
import { dayIn, readStandings } from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { listPublicSchedule, listPublicSeasons } from '../queries/index.ts';
import { standingsReadStore } from '../stores/index.ts';
import { madeUpDatabase, type MadeUpDatabase } from './made-up-database.ts';
import { seedLeagues } from './seed-data.ts';

let made: MadeUpDatabase;
let db: DatabaseHandle;
// The moment the seed is made, worked out once: every league's today is read from it, so
// a run that crosses midnight checks every league against the same day.
let startedAt = 0;
beforeAll(async () => {
  startedAt = Date.now();
  made = await madeUpDatabase({ underWay: true });
  db = createDatabase(made.source);
}, 120_000);
afterAll(async () => {
  await db.close();
  await made.close();
});

describe('putSeedSeasonsUnderWay', () => {
  for (const seed of seedLeagues) {
    it(`opens ${seed.slug}'s season with a published schedule and standings`, async () => {
      const league = made.leagues.find((l) => l.slug === seed.slug);
      if (league === undefined) throw new Error(`no ${seed.slug} league`);
      const today = dayIn(seed.timeZone, startedAt);
      const read = <T>(work: (scope: LeagueScope) => Promise<T>) =>
        withTransaction(db, { leagueId: league.leagueId }, work);
      const seasons = await read((scope) => listPublicSeasons(scope));
      expect(seasons.map((s) => [s.slug, s.status, s.isCurrent])).toEqual([
        [seed.season.slug, 'active', true],
      ]);
      const seasonId = seasons[0]?.id ?? '';
      const schedule = await read((scope) => listPublicSchedule(scope, seasonId, today));
      const games = [
        ...(schedule?.unplacedGames ?? []),
        ...(schedule?.rounds.flatMap((r) => r.games) ?? []),
      ];
      const divisions = seed.divisions.length;
      expect(games).toHaveLength(divisions * 2);
      const finals = games.filter((g) => g.status === 'final');
      expect(finals).toHaveLength(divisions);
      for (const game of finals) {
        expect(game.localDate !== null && game.localDate < today).toBe(true);
        expect(game.homeScore).not.toBeNull();
      }
      for (const game of games.filter((g) => g.status !== 'final')) {
        expect(game.localDate !== null && game.localDate > today).toBe(true);
      }
      const teamNames = new Set(seed.divisions.flatMap((d) => d.teams.map((t) => t.name)));
      for (const game of games) expect(teamNames.has(game.homeTeam.name)).toBe(true);

      const standings = await read((scope) =>
        readStandings(standingsReadStore(scope), { seasonId }),
      );
      if (!standings.ok) throw new Error(`no standings: ${standings.error.code}`);
      expect(standings.value.tables.map((t) => t.division?.name)).toEqual(
        seed.divisions.map((d) => d.name),
      );
      const lines = standings.value.tables.flatMap((t) => t.lines);
      expect(lines.reduce((sum, line) => sum + line.wins, 0)).toBe(divisions);
    });
  }

  it('leaves the season being set up when not asked', async () => {
    const plain = await madeUpDatabase();
    const plainDb = createDatabase(plain.source);
    try {
      for (const league of plain.leagues) {
        expect(
          await withTransaction(plainDb, { leagueId: league.leagueId }, (scope) =>
            listPublicSeasons(scope),
          ),
        ).toEqual([]);
      }
    } finally {
      await plainDb.close();
      await plain.close();
    }
  }, 120_000);
});
