// Step 2.236, part 2: the simulated league's public pages, read the way each page reads them
// (home, schedule, standings, statistics, every team, three finished games), through the
// web app's own ports on the made-up database the simulator played the league into. No
// app is started: each page's server component also needs Next.js's request, so this calls
// what the component calls (its ports and builders) with the same arguments, in order.
// A season with games postponed, cancelled, forfeited and corrected and one in overtime
// (packages/database/src/seed/simulate-league.ts). Made-up data only, in memory.
// Fix round: what the pages show is held against the plan (the simulator's own working-out,
// simulate-league-expected.ts): the standings' every row and place, the schedule's every
// game in its round and on its day, five games' results (typed, tracked, corrected,
// forfeited, postponed), one team's results, each tracked game's box score, and each
// player's games and points on the statistics page.
import { publicViewer, readGamePage, readGameSnapshot } from '@srleagues/core';
import * as database from '@srleagues/database';
import { createLocalBotCheck, type SignInService } from '@srleagues/providers';
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
    botCheck: createLocalBotCheck({ appEnv: 'test' }),
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

/** A number as a page writes it ("1,234", "+12", "−3"), read back; NaN for anything else. */
function number(value: unknown): number {
  const text = String(value)
    .replace(/[,\s+]/g, '')
    .replace('−', '-');
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
}

/** A game's page, as the public reads it. */
async function gamePage(gameId: string) {
  const page = await ports.tracker.gameReadsOf(played.leagueId, ({ store, audience, policy }) =>
    readGamePage(
      store,
      { gameId },
      { leagueId: played.leagueId, viewer: publicViewer(played.leagueId), audience, policy },
    ),
  );
  if (!page.ok) throw new Error(`no page for game ${gameId}`);
  return page.value;
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

  // The numbers people see, against the plan (the simulator's working-out of it, which uses
  // nothing of the product's standings or statistics), never against the stored games.
  it('shows the standings the plan gives: every row, in order, with its numbers', async () => {
    const { id } = await season();
    const standings = await ports.publicStats.standingsOf(played.leagueId, id);
    if (!standings.ok) throw new Error('no standings');
    const [table] = buildStandingsViews(standings.value);
    const [want] = database.expectedTables(played.plan, played.rules);
    if (table === undefined || want === undefined) throw new Error('no table');
    expect(table.rows).toHaveLength(want.rows.size);
    // Place by place: teams nothing separates may come in either order.
    let at = 0;
    for (const place of want.places) {
      const shown = table.rows.slice(at, at + place.length).map((r) => r.team);
      expect([...shown].sort(), `place ${at + 1}`).toEqual([...place].sort());
      at += place.length;
    }
    for (const row of table.rows) {
      const w = want.rows.get(row.team)!;
      const cell = (key: string) => number(row.cells[key]);
      expect(
        ['played', 'wins', 'losses', 'pointsFor', 'pointsAgainst', 'pointDifference'].map(cell),
        row.team,
      ).toEqual([
        w.gamesPlayed,
        w.wins,
        w.losses,
        w.pointsFor,
        w.pointsAgainst,
        w.pointsFor - w.pointsAgainst,
      ]);
    }
  });

  it('lists every planned game once on the schedule, in its planned round and on its day', async () => {
    const { id } = await season();
    const clock = await ports.publicSchedule.clockOf(played.leagueId);
    const schedule = await ports.publicSchedule.scheduleOf(played.leagueId, id, clock.today);
    if (schedule === undefined) throw new Error('no schedule');
    const placed = schedule.rounds.flatMap((r) => r.games.map((g) => ({ g, round: r.number })));
    expect(schedule.unplacedGames).toHaveLength(0);
    expect(placed).toHaveLength(played.plan.games.length);
    for (const game of played.plan.games) {
      const found = placed.filter((p) => p.g.id === played.gameIds.get(game.number));
      expect(found, `game ${game.number}`).toHaveLength(1);
      expect([found[0]?.round, found[0]?.g.localDate], `game ${game.number}`).toEqual([
        game.round,
        game.date,
      ]);
    }
  });

  it('shows the planned result on game pages: typed, tracked, corrected, forfeited, postponed', async () => {
    const { games } = played.plan;
    const picked = [
      games.find((g) => g.plays === null && g.callOff === null),
      games.find((g) => g.plays !== null),
      games.find((g) => g.callOff?.kind === 'corrected'),
      games.find((g) => g.callOff?.kind === 'forfeit'),
      games.find((g) => g.callOff?.kind === 'postponed-waiting'),
    ];
    for (const game of picked) {
      if (game === undefined) throw new Error('the simulated season lacks a kind of game');
      const want = database.expectedGame(game, played.rules);
      const page = await gamePage(played.gameIds.get(game.number)!);
      expect(
        [page.game.status, page.scoreboard.home.score, page.scoreboard.away.score],
        `game ${game.number} (${game.callOff?.kind ?? (game.plays ? 'tracked' : 'typed')})`,
      ).toEqual([want.status, want.home, want.away]);
    }
  });

  it('shows one team’s results as planned, a forfeit and a postponed game saying so', async () => {
    const { id } = await season();
    const clock = await ports.publicSchedule.clockOf(played.leagueId);
    const schedule = await ports.publicSchedule.scheduleOf(played.leagueId, id, clock.today);
    if (schedule === undefined) throw new Error('no schedule');
    const standings = await ports.publicStats.standingsOf(played.leagueId, id);
    if (!standings.ok) throw new Error('no standings');
    const forfeited = played.plan.games.find((g) => g.callOff?.kind === 'forfeit')!;
    const waiting = played.plan.games.find((g) => g.callOff?.kind === 'postponed-waiting')!;
    const lines = standings.value.tables.flatMap((t) => t.lines);
    for (const teamName of [forfeited.home, waiting.home]) {
      const slug = lines.find((l) => l.team.name === teamName)!.team.slug;
      const views = buildTeamGames(schedule, slug, clock, league());
      const all = [...views.results, ...views.upcoming];
      const said = (v: (typeof all)[number]) =>
        `${v.home.name} ${v.home.score ?? '-'}:${v.away.score ?? '-'} ${v.away.name} ${v.status}`;
      const results = views.results.filter((v) => v.status === 'final' || v.status === 'forfeit');
      const want = played.plan.games
        .filter((g) => g.home === teamName || g.away === teamName)
        .map((g) => ({ g, w: database.expectedGame(g, played.rules) }))
        .filter(({ w }) => w.home !== null)
        .map(({ g, w }) => `${g.home} ${w.home}:${w.away} ${g.away} ${w.status}`);
      expect(results.map(said).sort(), teamName).toEqual(want.sort());
      const kind = teamName === forfeited.home ? forfeited : waiting;
      const shown = all.find((v) => v.id === played.gameIds.get(kind.number));
      expect(shown?.status, `${teamName}, game ${kind.number}`).toBe(
        kind === forfeited ? 'forfeit' : 'postponed',
      );
    }
  });

  it('shows every tracked game’s box score and the season’s statistics as the plays give them', async () => {
    const teams = new Map(played.plan.divisions.flatMap((d) => d.teams.map((t) => [t.name, t])));
    for (const game of played.plan.games.filter((g) => g.plays !== null)) {
      const want = database.expectedBoxScore(game);
      const page = await gamePage(played.gameIds.get(game.number)!);
      for (const box of page.boxScores) {
        const team = teams.get(box.side === 'home' ? game.home : game.away)!;
        expect(box.players.length, `game ${game.number} ${box.side}`).toBe(team.players.length);
        for (const player of box.players) {
          const place = team.players.findIndex((p) => p.jersey === player.jersey);
          const line = want.get(`${box.side} ${place}`);
          expect(
            [player.stats['points'] ?? 0, player.stats['fouls'] ?? 0],
            `game ${game.number}, ${team.name} #${player.jersey}`,
          ).toEqual([line?.points, line?.fouls]);
        }
      }
    }
    const { id } = await season();
    const stats = await ports.publicStats.statisticsOf(played.leagueId, ({ store, settings }) =>
      loadStatsPage(store, settings, { leagueId: played.leagueId, seasonId: id, by: 'total' }),
    );
    if ('code' in stats) throw new Error('no statistics');
    const totals = database.expectedPlayerTotals(played.plan);
    expect(totals.size).toBeGreaterThan(0);
    for (const want of totals.values()) {
      const person = teams.get(want.team)!.players[want.place]!;
      const rows = stats.playerRows.filter(
        (r) =>
          r.cells['team'] === want.team &&
          String(r.cells['player']).startsWith(person.firstName) &&
          String(r.cells['player']).includes(person.lastName.slice(0, 1)),
      );
      expect(rows, `${want.team} ${person.firstName}`).toHaveLength(1);
      expect(
        [number(rows[0]?.cells['games']), number(rows[0]?.cells['points'])],
        `${want.team} ${person.firstName}`,
      ).toEqual([want.games, want.points]);
    }
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
