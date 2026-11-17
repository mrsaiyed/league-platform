// A statistic kept in fewer games than the GP beside it (the lead's review of step 2.195,
// item 2), from games played through the product: on the made-up database with its season
// under way, one game of the Herons against the Otters scored live in the tracker (its
// lines carry points, 3-pointers, free throws and fouls) and one typed as a box score with
// points only. The Herons' numbers now come from two more games, their 3-pointers from one
// more: the teams' table counts the games any statistic was kept in (the largest count, not
// the smallest), and the page says, above both tables, that a statistic not recorded in
// every game is averaged over the games where it was. Nothing is counted by hand.
import { applyTrackerCommands, openScoringSession, setBoxScore } from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gamesWorld, type GamesWorld } from '../../server/database-games.test-helper.ts';
import { loadStatsPage, type StatsPageData } from './build-stats.ts';

let w: GamesWorld;

beforeAll(async () => {
  w = await gamesWorld({ byHand: 1, live: 1 });
}, 300_000);

afterAll(async () => {
  await w.close();
});

const averaged = 'A statistic not recorded in every game is averaged over the games where it was.';

/** The statistics page of Lakeside's season, per game, as a visitor reads it. */
async function page(): Promise<StatsPageData> {
  const data = await w.ports.publicStats.statisticsOf(w.leagueId, ({ store, settings }) =>
    loadStatsPage(store, settings, { leagueId: w.leagueId, seasonId: w.seasonId, by: 'average' }),
  );
  if ('code' in data) throw new Error(data.code);
  return data;
}

const herons = (data: StatsPageData) => {
  const row = data.teamRows.find((r) => r.cells['team'] === 'Lakeside Herons');
  if (row === undefined) throw new Error('no Herons row');
  return row;
};

let tapNumber = 0;
/** A tap with a fresh id, a moment before the server's now. */
const tap = (input: unknown) => {
  tapNumber += 1;
  return { commandId: randomUUID(), at: w.clock.at - 60_000 + tapNumber, input };
};

describe('a statistic kept in fewer games than the GP beside it', () => {
  it('counts the games any statistic was kept in, and says the average is over its own', async () => {
    const before = await page();
    const gamesBefore = Number(herons(before).cells['games'] ?? 0);
    expect(before.tableNotes).not.toContain(averaged);

    // The live game: the Herons' first player scores a 3-pointer; the tracker's lines keep
    // points, 3-pointers, free throws and fouls for everyone who played.
    const live = w.take(w.live);
    const scorer = w.contextOf('scorekeeper');
    const opened = await openScoringSession(
      scorer,
      { gameId: live, deviceId: 'tablet' },
      w.ports.tracker.deps,
    );
    if (!opened.ok || opened.value.status !== 'held-by-you') throw new Error('not opened');
    const played = await applyTrackerCommands(
      scorer,
      {
        gameId: live,
        protocolVersion: 1,
        sessionId: opened.value.sessionId,
        commands: [
          tap({ type: 'lineup', side: 'home', playerIds: w.players.herons }),
          tap({ type: 'lineup', side: 'away', playerIds: w.players.otters }),
          tap({ type: 'start' }),
          tap({ type: 'score', side: 'home', playerId: w.players.herons[0], points: 3 }),
          tap({ type: 'end' }),
        ],
      },
      w.ports.tracker.deps,
    );
    expect(played).toMatchObject({ ok: true });

    // The typed game: a box score with points only.
    const typed = w.take(w.byHand);
    const line = (teamId: string, personId: string, points: number) => ({
      teamId,
      personId,
      played: true,
      secondsPlayed: null,
      stats: { points },
    });
    const saved = await setBoxScore(
      w.contextOf('scheduler'),
      {
        gameId: typed,
        version: await w.versionOf(typed),
        homeScore: 10,
        awayScore: 8,
        lines: [
          ...w.players.herons.map((id, n) => line(w.herons, id, n === 0 ? 10 : 0)),
          ...w.players.otters.map((id, n) => line(w.otters, id, n === 0 ? 8 : 0)),
        ],
      },
      w.ports.games.deps,
    );
    expect(saved).toMatchObject({ ok: true });

    const after = await page();
    // Points were kept in both games, 3-pointers in the live one only: the count is the
    // largest, two more games; the smallest would give one.
    expect(Number(herons(after).cells['games'])).toBe(gamesBefore + 2);
    expect(after.tableNotes).toEqual([
      'Statistics count the games that were scored live or entered as a box score. A game with only a final score counts in the standings, not here.',
      averaged,
    ]);
    // Season totals are not averages: the sentence is not said there.
    const totals = await w.ports.publicStats.statisticsOf(w.leagueId, ({ store, settings }) =>
      loadStatsPage(store, settings, { leagueId: w.leagueId, seasonId: w.seasonId, by: 'total' }),
    );
    expect('code' in totals ? [] : totals.tableNotes).not.toContain(averaged);
  });
});
