// The seed's demo-shaped league (step 2.59; P9 §3, F-6, T-195): its data and fixtures file
// hold together and read as a real school season, no real name is in them, and once loaded
// through the fixture import, the schedule builder's rounds and the transfer it is what the
// demo shows: one program and its 2025–26 season in ten weeks, every district's table, every
// team's games final, one team's whole season tracked live and reading as a real team's, and
// every other team's players' statistics hidden from the public. A second load changes
// nothing; a partly loaded league is refused; a load on a later day writes the same pages.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import {
  defaultNamePolicy,
  publicViewer,
  readStandings,
  readStatisticsTable,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { listPublicSchedule, listPublicSeasons } from '../queries/index.ts';
import { gamesStore, liveGamesStore, standingsReadStore } from '../stores/index.ts';
import { demoLeague } from './demo-league-data.ts';
import { realNames, realNamesIn } from './real-names.test-helper.ts';
import { seedLeagues } from './seed-data.ts';
import { fixturesOf, loadedAt, seedDemoLeagueInto } from './seed-demo-league.ts';
import { seedLeaguesInto } from './seed-leagues.ts';
import { SeedPartlyLoaded } from './seed-partly-loaded.ts';
import { seedVenues } from './seed-tracked-games-data.ts';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const teams = demoLeague.divisions.flatMap((d) => d.teams);
const tracked = teams.find((t) => t.shortName === demoLeague.trackedTeam)!;
const strengthOf = (name: string) => teams.find((t) => t.name === name)!.strength;
const fileText = readFileSync(`${repository}${demoLeague.fixturesFile}`, 'utf8');
const fixtures = fixturesOf(demoLeague, fileText);
const ofTracked = fixtures.filter(
  (f) => f.homeTeamId === tracked.name || f.awayTeamId === tracked.name,
);
const trackedRoster = demoLeague.trackerPlayers[tracked.shortName]!;

const fresh = async () => {
  const db = new PGlite();
  const run = await applyMigrations(pgliteDriver(db));
  if (!run.ok) throw new Error(run.error.message);
  return db;
};

describe('the demo-shaped league: its data', () => {
  it('is a large league: several districts of six schools, dozens of teams, one tracked', () => {
    expect(demoLeague.divisions.length).toBeGreaterThanOrEqual(4);
    for (const division of demoLeague.divisions) expect(division.teams).toHaveLength(6);
    expect(teams.length).toBeGreaterThanOrEqual(24);
    expect(new Set(teams.map((t) => t.name)).size).toBe(teams.length);
    expect(new Set(teams.map((t) => t.shortName)).size).toBe(teams.length);
    expect(demoLeague.season.name).toBe('2025–26');
    expect(demoLeague.audience).toBe('youth');
    for (const team of teams) expect(Math.abs(team.strength)).toBeLessThanOrEqual(1);
    for (const email of [demoLeague.owner.email, ...demoLeague.members.map((m) => m.email)]) {
      expect(email).toMatch(/@[a-z.]*example\.test$/);
    }
    expect(demoLeague.members.some((m) => m.role === 'admin')).toBe(true);
  });

  it('is not laid out in order: districts, school endings and rosters are mixed', () => {
    const initials = (names: readonly string[]) => names.map((n) => n[0]).join('');
    const runs = (letters: string) =>
      [...letters].every((c, i) => i === 0 || c.charCodeAt(0) === letters.charCodeAt(i - 1) + 1);
    for (const division of demoLeague.divisions) {
      const letters = initials(division.teams.map((t) => t.name));
      expect(runs(letters), letters).toBe(false);
      expect(runs([...letters].sort().join('')), letters).toBe(false);
    }
    const endings = teams.map((t) => t.name.split(' ').slice(1).join(' '));
    const kinds = [...new Set(endings)];
    expect(kinds.length).toBeGreaterThanOrEqual(4);
    expect(endings.every((ending, i) => ending === kinds[i % kinds.length])).toBe(false);
    for (const players of Object.values(demoLeague.trackerPlayers)) {
      const first = players.map(([, name]) => name.split(' ')[0]!);
      expect(first).not.toEqual([...first].sort());
    }
  });

  it("has a fixtures file every row of which the product's reader takes", () => {
    expect(fixtures).toHaveLength(fileText.trim().split('\n').length - 1);
    expect(fixtures).toHaveLength(teams.length * 5);
  });

  it('plays each district as a double round robin, each school at home in its own gym', () => {
    for (const division of demoLeague.divisions) {
      const names = division.teams.map((t) => t.name);
      for (const team of division.teams) {
        const home = fixtures.filter((f) => f.homeTeamId === team.name);
        const away = fixtures.filter((f) => f.awayTeamId === team.name);
        expect(home).toHaveLength(5);
        expect(away).toHaveLength(5);
        for (const game of home) expect(game.venueId).toBe(team.venue.name);
        const others = names.filter((n) => n !== team.name).sort();
        expect(home.map((f) => f.awayTeamId).sort()).toEqual(others);
        expect(away.map((f) => f.homeTeamId).sort()).toEqual(others);
      }
    }
  });

  it('is a past season of ten Fridays, November to January, with a Thanksgiving and a winter break', () => {
    const days = [...new Set(fixtures.map((f) => f.date))].sort();
    expect(days).toHaveLength(10);
    expect(days[0]! >= '2025-11-01' && days[0]! <= '2025-11-10').toBe(true);
    expect(days.at(-1)! >= '2026-01-20' && days.at(-1)! <= '2026-01-31').toBe(true);
    for (const day of days) expect(new Date(`${day}T12:00:00Z`).getUTCDay()).toBe(5);
    for (const skipped of ['2025-11-28', '2025-12-26', '2026-01-02']) {
      expect(days).not.toContain(skipped);
    }
    // Each week of the file is one round on one day, Week 1 to Week 10.
    const weeks = new Map<string, Set<string>>();
    for (const f of fixtures) weeks.set(f.round!, (weeks.get(f.round!) ?? new Set()).add(f.date));
    expect([...weeks.keys()]).toEqual(Array.from({ length: 10 }, (_, n) => `Week ${n + 1}`));
    for (const dates of weeks.values()) expect(dates.size).toBe(1);
    for (const game of fixtures) expect(game.time).not.toBeNull();
  });

  it("gives every game a believable final score but the tracked team's, which the tracker holds", () => {
    expect(ofTracked).toHaveLength(10);
    for (const game of ofTracked) expect(game.finalScore).toBeNull();
    for (const game of fixtures.filter((f) => !ofTracked.includes(f))) {
      const { home, away } = game.finalScore!;
      expect(home).not.toBe(away);
      for (const points of [home, away]) expect(points >= 30 && points <= 85).toBe(true);
      expect(Math.abs(home - away)).toBeLessThanOrEqual(30);
    }
  });

  it('holds tracker rosters for the tracked team and the teams it played only', () => {
    const played = new Set(ofTracked.flatMap((f) => [f.homeTeamId, f.awayTeamId]));
    expect(Object.keys(demoLeague.trackerPlayers).sort()).toEqual(
      teams
        .filter((t) => played.has(t.name))
        .map((t) => t.shortName)
        .sort(),
    );
    expect(trackedRoster).toHaveLength(12);
    const everyone = Object.values(demoLeague.trackerPlayers).flat();
    expect(new Set(everyone.map(([, name]) => name)).size).toBe(everyone.length);
    for (const players of Object.values(demoLeague.trackerPlayers)) {
      expect(players.length).toBeGreaterThanOrEqual(9);
      expect(new Set(players.map(([jersey]) => jersey)).size).toBe(players.length);
      expect(new Set(players.map(([, name]) => name.split(' ')[1])).size).toBe(players.length);
    }
  });
});

describe('the demo-shaped league: no real name', () => {
  it('names every player with one of the coined surnames', () => {
    const coined = new Set(demoLeague.madeUpSurnames);
    expect(coined.size).toBe(demoLeague.madeUpSurnames.length);
    for (const [, name] of Object.values(demoLeague.trackerPlayers).flat()) {
      const [first, last, ...more] = name.split(' ');
      expect(more, name).toEqual([]);
      expect(first, name).toMatch(/^[A-Z][a-z]+$/);
      expect(coined.has(last!), name).toBe(true);
    }
  });

  it("holds no real league's, school's, venue's or place's name, whole or word by word", () => {
    const real = realNames(repository);
    expect(real.values.length).toBeGreaterThan(0);
    expect(real.words.length).toBeGreaterThan(0);
    const seed = [
      JSON.stringify(demoLeague),
      fileText,
      JSON.stringify(seedLeagues),
      JSON.stringify(seedVenues),
    ].join('\n');
    // Counted, not listed: a failure here must not print the real names.
    expect(realNamesIn(seed, real)).toBe(0);
  });

  it('finds a real word inside a made-up name, and a real slug', () => {
    const real = realNames(repository);
    // Made from the real names themselves, so this test names none of them.
    const word = real.words[0]!;
    expect(realNamesIn(`Ironvale ${word} Academy`, real)).toBeGreaterThan(0);
    expect(realNamesIn('Ironvale Academy, 12 Lantern Road', real)).toBe(0);
  });
});

/** What a visitor's pages hold, by names and numbers only (no ids), for comparing loads. */
async function pagesOf(db: DatabaseHandle, leagueId: string) {
  const read = <T>(work: (scope: LeagueScope) => Promise<T>) =>
    withTransaction(db, { leagueId }, work);
  const [season] = await read((scope) => listPublicSeasons(scope));
  const seasonId = season!.id;
  const schedule = await read((scope) => listPublicSchedule(scope, seasonId, '2030-01-01'));
  const standings = await read((scope) => readStandings(standingsReadStore(scope), { seasonId }));
  const statistics = await read((scope) =>
    readStatisticsTable(standingsReadStore(scope), {
      seasonId,
      viewing: {
        leagueId,
        viewer: publicViewer(leagueId),
        audience: demoLeague.audience,
        policy: defaultNamePolicy,
      },
    }),
  );
  if (!standings.ok || !statistics.ok) throw new Error('a page could not be read');
  const games = schedule?.rounds.flatMap((r) => r.games) ?? [];
  const lines = [];
  for (const game of games.filter((g) =>
    [g.homeTeam.name, g.awayTeam.name].includes(tracked.name),
  )) {
    const box = await read((scope) => liveGamesStore(scope).lines(game.id));
    lines.push(
      box
        .map((l) => [l.teamId === game.homeTeam.id ? 'home' : 'away', l.stats, l.secondsPlayed])
        .map((l) => JSON.stringify(l))
        .sort(),
    );
  }
  return {
    season: [season!.slug, season!.name, season!.status],
    rounds: schedule?.rounds.map((r) => [r.number, r.label, r.date, r.games.length]),
    unplaced: schedule?.unplacedGames.length,
    games: games
      .map((g) => [
        g.localDate,
        g.startsAt,
        g.homeTeam.name,
        g.awayTeam.name,
        g.status,
        g.homeScore,
        g.awayScore,
        g.venue?.name,
      ])
      // Games at the same hour come in their ids' order, which differs from load to load.
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    standings: standings.value.tables.map((t) => [
      t.division?.name,
      t.lines.map((l) => [l.team.name, l.wins, l.losses, l.pointsFor]),
    ]),
    statistics: statistics.value.players.map((p) => [p.name.text, p.gamesPlayed, p.stats]),
    lines,
  };
}

let pglite: PGlite;
let db: DatabaseHandle;
let leagueId = '';
beforeAll(async () => {
  pglite = await fresh();
  const loaded = await seedDemoLeagueInto(pglite);
  expect(loaded).toEqual({ slug: demoLeague.slug, name: demoLeague.name, created: true });
  leagueId = (
    await pglite.query<{ id: string }>('select id from leagues where slug = $1', [demoLeague.slug])
  ).rows[0]!.id;
  db = createDatabase({ kind: 'pglite', pglite });
}, 180_000);
afterAll(async () => {
  await db?.close();
  await pglite?.close();
});

const read = <T>(work: (scope: LeagueScope) => Promise<T>) =>
  withTransaction(db, { leagueId }, work);
const count = async (text: string) =>
  (await pglite.query<{ n: number }>(text, [leagueId])).rows[0]!.n;
const seasonIdOf = async () => (await read((scope) => listPublicSeasons(scope)))[0]!.id;
const scheduleOf = async () => {
  const seasonId = await seasonIdOf();
  return read((scope) => listPublicSchedule(scope, seasonId, '2030-01-01'));
};

describe('the demo-shaped league, loaded', () => {
  it('has one program and its 2025–26 season, open and current', async () => {
    expect(await count('select count(*)::int as n from programs where league_id = $1')).toBe(1);
    const seasons = await read((scope) => listPublicSeasons(scope));
    expect(seasons.map((s) => [s.slug, s.name, s.status, s.isCurrent])).toEqual([
      [demoLeague.season.slug, demoLeague.season.name, 'active', true],
    ]);
  });

  it('shows the season as its ten weeks, every game final at the home gym, on the file’s days', async () => {
    const schedule = await scheduleOf();
    expect(schedule?.unplacedGames).toEqual([]);
    expect(schedule?.rounds.map((r) => [r.label, r.games.length])).toEqual(
      Array.from({ length: 10 }, (_, n) => [`Week ${n + 1}`, 12]),
    );
    const games = schedule?.rounds.flatMap((r) => r.games) ?? [];
    expect(games).toHaveLength(fixtures.length);
    for (const round of schedule?.rounds ?? []) {
      for (const game of round.games) expect(game.localDate).toBe(round.date);
    }
    for (const game of games) {
      expect(game.status).toBe('final');
      expect(game.venue?.name).toBe(`${game.homeTeam.name} Gym`);
    }
    for (const row of fixtures.filter((f) => f.finalScore !== null)) {
      const game = games.find(
        (g) =>
          g.homeTeam.name === row.homeTeamId &&
          g.awayTeam.name === row.awayTeamId &&
          g.localDate === row.date,
      );
      expect([game?.homeScore, game?.awayScore]).toEqual([
        row.finalScore!.home,
        row.finalScore!.away,
      ]);
    }
  });

  it('reads as a real season: one school 9–1 or better, one 1–9, home sides winning 55 to 60%', async () => {
    const games = (await scheduleOf())?.rounds.flatMap((r) => r.games) ?? [];
    const homeWins = games.filter((g) => g.homeScore! > g.awayScore!).length / games.length;
    expect(homeWins >= 0.55 && homeWins <= 0.6, String(homeWins)).toBe(true);
    for (const g of games) {
      // An upset (the weaker school by strength winning) is never a rout.
      const margin = g.homeScore! - g.awayScore!;
      const favourite = strengthOf(g.homeTeam.name) + 0.2 >= strengthOf(g.awayTeam.name);
      if (margin > 0 !== favourite) expect(Math.abs(margin)).toBeLessThanOrEqual(12);
    }
    const seasonId = await seasonIdOf();
    const standings = await read((scope) => readStandings(standingsReadStore(scope), { seasonId }));
    if (!standings.ok) throw new Error(`no standings: ${standings.error.code}`);
    const wins = standings.value.tables
      .flatMap((t) => t.lines.map((l) => l.wins))
      .sort((a, b) => a - b);
    expect(wins.filter((w) => w >= 9)).toHaveLength(1);
    expect(wins.filter((w) => w <= 1)).toEqual([1]);
    expect(standings.value.tables.map((t) => t.division?.name)).toEqual(
      demoLeague.divisions.map((d) => d.name),
    );
    for (const [n, table] of standings.value.tables.entries()) {
      expect(table.lines.map((l) => l.team.name).sort()).toEqual(
        demoLeague.divisions[n]!.teams.map((t) => t.name).sort(),
      );
      for (const line of table.lines) expect(line.wins + line.losses).toBe(10);
    }
    expect(wins.reduce((sum, w) => sum + w, 0)).toBe(fixtures.length);
  });

  it("holds the tracked team's whole season as tracked live, with its players' numbers", async () => {
    const games = ((await scheduleOf())?.rounds.flatMap((r) => r.games) ?? []).filter((g) =>
      [g.homeTeam.name, g.awayTeam.name].includes(tracked.name),
    );
    expect(games).toHaveLength(10);
    for (const game of games) {
      expect(await read((scope) => gamesStore(scope).hasPlays(game.id))).toBe(true);
    }
    const roster = await pglite.query<{ name: string; jersey: string }>(
      `select people.first_name || ' ' || people.last_name as name, roster_entries.jersey_number as jersey
       from roster_entries join people on people.id = roster_entries.person_id
       join teams on teams.id = roster_entries.team_id
       where roster_entries.league_id = $1 and teams.slug = $2`,
      [leagueId, tracked.shortName],
    );
    expect(roster.rows.map((r) => [r.jersey, r.name]).sort()).toEqual(
      trackedRoster.map(([j, n]) => [j, n]).sort(),
    );
  });

  it("reads as a real team's season: starters, a top scorer, the bench, fouls, whole games", async () => {
    const games = ((await scheduleOf())?.rounds.flatMap((r) => r.games) ?? []).filter((g) =>
      [g.homeTeam.name, g.awayTeam.name].includes(tracked.name),
    );
    const names = await pglite.query<{ id: string; name: string }>(
      `select id, first_name || ' ' || last_name as name from people where league_id = $1`,
      [leagueId],
    );
    const nameOf = new Map(names.rows.map((r) => [r.id, r.name]));
    const points = new Map<string, number>();
    for (const game of games) {
      const lines = await read((scope) => liveGamesStore(scope).lines(game.id));
      for (const teamId of [game.homeTeam.id, game.awayTeam.id]) {
        const side = lines.filter((l) => l.teamId === teamId);
        const fouls = side.reduce((sum, l) => sum + (l.stats['fouls'] ?? 0), 0);
        expect(fouls >= 12 && fouls <= 18, `${fouls} fouls`).toBe(true);
        // The clock ran the whole game: five on the floor for 32 minutes.
        const seconds = side.reduce((sum, l) => sum + (l.secondsPlayed ?? 0), 0);
        expect(Math.abs(seconds - 5 * 32 * 60), `${seconds} seconds`).toBeLessThanOrEqual(5);
        const scored = side.reduce((sum, l) => sum + (l.stats['points'] ?? 0), 0);
        const final = teamId === game.homeTeam.id ? game.homeScore : game.awayScore;
        expect(scored).toBe(final);
      }
      for (const line of lines) {
        const name = nameOf.get(line.personId) ?? '';
        if (trackedRoster.some(([, n]) => n === name)) {
          points.set(name, (points.get(name) ?? 0) + (line.stats['points'] ?? 0));
        }
      }
    }
    const total = [...points.values()].reduce((a, b) => a + b, 0);
    const starters = trackedRoster.slice(0, 5).reduce((s, [, n]) => s + (points.get(n) ?? 0), 0);
    expect(starters / total >= 0.65 && starters / total <= 0.75, `${starters / total}`).toBe(true);
    const perGame = trackedRoster.map(([, n]) => (points.get(n) ?? 0) / 10);
    expect(Math.max(...perGame) >= 16 && Math.max(...perGame) <= 20, `${perGame}`).toBe(true);
    expect(perGame.filter((ppg) => ppg < 2).length).toBeGreaterThanOrEqual(2);
  });

  it("shows the public the tracked team's players only; staff see the others too", async () => {
    const seasonId = await seasonIdOf();
    const statistics = (leagueAdmin: boolean) =>
      read((scope) =>
        readStatisticsTable(standingsReadStore(scope), {
          seasonId,
          viewing: {
            leagueId,
            viewer: leagueAdmin
              ? { leagueId, leagueAdmin: true, staffOfTeamIds: [] }
              : publicViewer(leagueId),
            audience: demoLeague.audience,
            policy: { ...defaultNamePolicy, childrenInFull: true },
          },
        }),
      );
    const trackedId = (
      await pglite.query<{ id: string }>(
        'select id from teams where league_id = $1 and slug = $2',
        [leagueId, tracked.shortName],
      )
    ).rows[0]!.id;
    const shown = await statistics(false);
    if (!shown.ok) throw new Error(shown.error.code);
    expect(shown.value.players).toHaveLength(trackedRoster.length);
    for (const player of shown.value.players) expect(player.teamIds).toEqual([trackedId]);
    for (const team of shown.value.teams) {
      expect(team.playerLinesShown).toBe(team.teamId === trackedId);
    }
    const staff = await statistics(true);
    if (!staff.ok) throw new Error(staff.error.code);
    expect(staff.value.players).toHaveLength(
      Object.values(demoLeague.trackerPlayers).flat().length,
    );
  });

  it('acts at one moment, the day after the season, not at the computer’s clock', () => {
    expect(new Date(loadedAt(fixtures)).toISOString()).toBe('2026-01-31T18:00:00.000Z');
  });

  it('is left alone by a second load', async () => {
    const before = await count('select count(*)::int as n from activity_log where league_id = $1');
    expect(await seedDemoLeagueInto(pglite)).toMatchObject({ created: false });
    expect(await count('select count(*)::int as n from activity_log where league_id = $1')).toBe(
      before,
    );
  });
});

describe('the demo-shaped league, loaded part-way or on another day', () => {
  it('refuses a league of its short name that is not whole, as only partly loaded', async () => {
    const partial = await fresh();
    try {
      // The league is there, made as a seed league is, with no import and no transfer.
      await seedLeaguesInto(partial, [{ ...seedLeagues[0]!, slug: demoLeague.slug }]);
      await expect(seedDemoLeagueInto(partial)).rejects.toThrow(SeedPartlyLoaded);
    } finally {
      await partial.close();
    }
  }, 120_000);

  it('writes the same pages when loaded a month and a year later', async () => {
    const here = await pagesOf(db, leagueId);
    for (const ahead of [31, 366]) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + ahead * 86_400_000);
      const later = await fresh();
      const laterDb = createDatabase({ kind: 'pglite', pglite: later });
      try {
        await seedDemoLeagueInto(later);
        const id = (
          await later.query<{ id: string }>('select id from leagues where slug = $1', [
            demoLeague.slug,
          ])
        ).rows[0]!.id;
        vi.useRealTimers();
        const there = await pagesOf(laterDb, id);
        for (const key of Object.keys(here) as (keyof typeof here)[]) {
          expect(there[key], `${key}, ${ahead} days later`).toEqual(here[key]);
        }
      } finally {
        vi.useRealTimers();
        await laterDb.close();
        await later.close();
      }
    }
  }, 300_000);
});
