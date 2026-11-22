// Step 2.236, part 2: the simulated league's public pages, read the way each page reads them
// (home, schedule, standings, statistics, every team, three finished games), through the
// web app's own ports on the made-up database the simulator played the league into. No
// app is started: each page's server component also needs Next.js's request, so this calls
// what the component calls (its ports and builders) with the same arguments, in order.
// A season with games postponed, cancelled, forfeited and corrected and one in overtime
// (packages/database/src/seed/simulate-league.ts). Made-up data only, in memory.
import { publicViewer, readGamePage, readGameSnapshot } from '@srleagues/core';
import * as database from '@srleagues/database';
import type { SignInService } from '@srleagues/providers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildHomeGames, buildScheduleView } from '../features/schedule-pages/index.ts';
import { buildStandingsViews, loadStatsPage } from '../features/stats-pages/index.ts';
import {
  buildRoster,
  buildTeamGames,
  loadTeamHead,
  loadTeamStats,
} from '../features/team-pages/index.ts';
import { databasePorts } from './database-ports.ts';
import type { WebPorts } from './ports.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let ports: WebPorts;
let played: database.PlayedLeague;

beforeAll(async () => {
  // The made-up database (every migration, the seed leagues), the simulated league added.
  made = await database.madeUpDatabase({
    simulate: { teams: 4, divisions: 1, rounds: 6, tracked: 2, seed: 3 },
  });
  if (made.simulated === undefined) throw new Error('no simulated league');
  played = made.simulated;
  db = database.createDatabase(made.source);
  ports = databasePorts({
    database,
    db,
    signIn: {} as SignInService,
    signInMail: {} as SignInMail,
    log: () => {},
    warn: () => {},
  });
}, 120_000);

afterAll(async () => {
  await db.close();
  await made.close();
});

const league = () => ({ id: played.leagueId, slug: played.plan.slug, customDomain: null }) as never;

async function season() {
  const seasons = await ports.publicStats.seasonsOf(played.leagueId);
  const found = seasons.find((s) => s.id === played.seasonId);
  if (found === undefined) throw new Error('the simulated season is not public');
  return found;
}

describe('the simulated league’s public pages (step 2.236)', () => {
  it('builds the home, schedule, standings and statistics pages with no error', async () => {
    const { id } = await season();
    const clock = await ports.publicSchedule.clockOf(played.leagueId);
    const schedule = await ports.publicSchedule.scheduleOf(played.leagueId, id, clock.today);
    if (schedule === undefined) throw new Error('no schedule');
    const standings = await ports.publicStats.standingsOf(played.leagueId, id);
    expect(standings.ok).toBe(true);
    if (!standings.ok) return;
    // Home: its games and its standings.
    const home = buildHomeGames(schedule, clock, league());
    expect(home).toBeDefined();
    const tables = buildStandingsViews(standings.value);
    expect(tables).toHaveLength(1);
    // Schedule: every planned game, called off or not, listed once.
    const view = buildScheduleView(schedule, clock, league(), {});
    expect(view).toBeDefined();
    const listed = [...schedule.rounds.flatMap((r) => r.games), ...schedule.unplacedGames];
    expect(listed).toHaveLength(played.plan.games.length);
    // Statistics.
    const stats = await ports.publicStats.statisticsOf(played.leagueId, ({ store, settings }) =>
      loadStatsPage(store, settings, { leagueId: played.leagueId, seasonId: id, by: 'average' }),
    );
    expect('code' in stats).toBe(false);
  });

  it('builds every team’s page with no error', async () => {
    const { id } = await season();
    const clock = await ports.publicSchedule.clockOf(played.leagueId);
    const schedule = await ports.publicSchedule.scheduleOf(played.leagueId, id, clock.today);
    // Every team, as the standings page lists them.
    const standings = await ports.publicStats.standingsOf(played.leagueId, id);
    if (!standings.ok) throw new Error('no standings');
    const slugs = standings.value.tables.flatMap((t) => t.lines.map((l) => l.team.slug));
    expect(slugs).toHaveLength(4);
    for (const slug of slugs) {
      const read = await ports.publicStats.statisticsOf(
        played.leagueId,
        async ({ store, settings, rosterOf }) => {
          const head = await loadTeamHead(store, played.leagueId, id, slug);
          if (head === undefined) return undefined;
          const stats = await loadTeamStats(store, settings, {
            leagueId: played.leagueId,
            seasonId: id,
            teamId: head.teamId,
          });
          const roster = await rosterOf(head.teamId, publicViewer(played.leagueId));
          return { head, stats, roster: buildRoster(roster) };
        },
      );
      expect(read, slug).toBeDefined();
      expect(read?.roster.current ?? [], slug).toHaveLength(5);
      const games = buildTeamGames(schedule, slug, clock, league());
      expect(games.results.length, slug).toBeGreaterThan(0);
    }
  });

  it('builds three finished games’ pages, a tracked one among them, with no error', async () => {
    const finished = played.plan.games
      .filter((g) => g.callOff === null)
      .sort((a, b) => Number(b.plays !== null) - Number(a.plays !== null))
      .slice(0, 3);
    for (const game of finished) {
      const gameId = played.gameIds.get(game.number)!;
      const read = await ports.tracker.gameReadsOf(
        played.leagueId,
        async ({ store, audience, policy }) => {
          const viewing = {
            leagueId: played.leagueId,
            viewer: publicViewer(played.leagueId),
            audience,
            policy,
          };
          const shown = await readGameSnapshot(store, { gameId }, viewing, Date.now());
          return { shown, page: await readGamePage(store, { gameId }, viewing) };
        },
      );
      expect(read.shown.ok, `game ${game.number}`).toBe(true);
      expect(read.page.ok, `game ${game.number}`).toBe(true);
      const facts = await ports.publicSchedule.gameFactsOf(
        played.leagueId,
        played.seasonId,
        gameId,
      );
      expect(facts?.number, `game ${game.number}`).toBeDefined();
    }
  });
});
