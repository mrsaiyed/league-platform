// Each seed league's venue and its one game scored live through the tracker (step 2.59),
// on top of the season under way: read back as a visitor and as the scorer's lines.
import {
  dayIn,
  defaultNamePolicy,
  publicViewer,
  readStandings,
  readStatisticsTable,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { listPublicSchedule, listPublicSeasons } from '../queries/index.ts';
import { gamesStore, liveGamesStore, standingsReadStore } from '../stores/index.ts';
import { madeUpDatabase, type MadeUpDatabase } from './made-up-database.ts';
import { seedLeagues } from './seed-data.ts';
import { seedVenues, trackedGameDaysAgo } from './seed-tracked-games-data.ts';
import { trackedGamePlays } from './seed-tracked-games.ts';

let made: MadeUpDatabase;
let db: DatabaseHandle;
let startedAt = 0;
beforeAll(async () => {
  startedAt = Date.now();
  made = await madeUpDatabase({ underWay: true, tracked: true });
  db = createDatabase(made.source);
}, 120_000);
afterAll(async () => {
  await db.close();
  await made.close();
});

/** yyyy-mm-dd, `days` days on from `day` (or back, when negative). */
const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** What the tracked game's plays give each side: points, fouls and turnovers. */
const tally = (side: 'home' | 'away') => {
  const plays = trackedGamePlays('h', 'a').filter((p) => 'side' in p && p.side === side);
  const count = (type: string) => plays.filter((p) => p.type === type).length;
  const points = plays.reduce((sum, p) => sum + (p.type === 'score' ? p.points : 0), 0);
  return { points, fouls: count('foul'), turnovers: count('turnover') };
};

describe('addSeedTrackedGames', () => {
  it('has data for every seed league, with made-up places only', () => {
    expect(Object.keys(seedVenues).sort()).toEqual(seedLeagues.map((l) => l.slug).sort());
    expect(tally('home').points).not.toBe(tally('away').points);
  });

  for (const seed of seedLeagues) {
    it(`gives ${seed.slug} its venue and one game scored live, final, at the venue`, async () => {
      const league = made.leagues.find((l) => l.slug === seed.slug);
      if (league === undefined) throw new Error(`no ${seed.slug} league`);
      const venue = seedVenues[seed.slug]!;
      const today = dayIn(seed.timeZone, startedAt);
      const read = <T>(work: (scope: LeagueScope) => Promise<T>) =>
        withTransaction(db, { leagueId: league.leagueId }, work);
      const [season] = await read((scope) => listPublicSeasons(scope));
      const seasonId = season?.id ?? '';
      const schedule = await read((scope) => listPublicSchedule(scope, seasonId, today));
      const games = [
        ...(schedule?.unplacedGames ?? []),
        ...(schedule?.rounds.flatMap((r) => r.games) ?? []),
      ];
      // The season under way's two games in each division, and the tracked one.
      expect(games).toHaveLength(seed.divisions.length * 2 + 1);
      const atVenue = games.filter((g) => g.venue !== null);
      expect(atVenue).toHaveLength(1);
      const tracked = atVenue[0]!;
      expect(tracked).toMatchObject({
        status: 'final',
        localDate: addDays(today, -trackedGameDaysAgo),
        venue: { name: venue.name, address: venue.address },
        courtName: venue.courts[0],
        homeScore: tally('home').points,
        awayScore: tally('away').points,
        divisionName: seed.divisions[0]!.name,
      });
      // A rematch of the first division's game a week ago.
      const earlier = games.find(
        (g) =>
          g.id !== tracked.id && g.status === 'final' && g.divisionName === tracked.divisionName,
      );
      expect([earlier?.homeTeam.name, earlier?.awayTeam.name]).toEqual([
        tracked.homeTeam.name,
        tracked.awayTeam.name,
      ]);

      // Scored through the tracker: its plays are kept, and its lines are the tracker's.
      expect(await read((scope) => gamesStore(scope).hasPlays(tracked.id))).toBe(true);
      const lines = await read((scope) => liveGamesStore(scope).lines(tracked.id));
      const played = lines.filter((line) => line.played);
      expect(played).toHaveLength(2);
      const byTeam = (teamId: string) => played.find((line) => line.teamId === teamId);
      for (const [side, teamId] of [
        ['home', tracked.homeTeam.id],
        ['away', tracked.awayTeam.id],
      ] as const) {
        const line = byTeam(teamId);
        expect(line?.stats['points']).toBe(tally(side).points);
        expect(line?.stats['fouls']).toBe(tally(side).fouls);
        expect(line?.secondsPlayed ?? 0).toBeGreaterThan(0);
      }

      // The standings count it: one more win than the season under way's.
      const standings = await read((scope) =>
        readStandings(standingsReadStore(scope), { seasonId }),
      );
      if (!standings.ok) throw new Error(`no standings: ${standings.error.code}`);
      const lineList = standings.value.tables.flatMap((t) => t.lines);
      expect(lineList.reduce((sum, line) => sum + line.wins, 0)).toBe(seed.divisions.length + 1);

      // And the season's statistics: its two players have two games each.
      const table = await read((scope) =>
        readStatisticsTable(standingsReadStore(scope), {
          seasonId,
          viewing: {
            leagueId: league.leagueId,
            viewer: publicViewer(league.leagueId),
            audience: seed.audience,
            policy: { ...defaultNamePolicy, childrenInFull: true },
          },
        }),
      );
      if (!table.ok) throw new Error(`no statistics: ${table.error.code}`);
      expect(table.value.players.filter((p) => p.gamesPlayed === 2)).toHaveLength(2);
    });
  }
});
