// The seed's demo-shaped league (step 2.59; P9 §3, F-6, T-195): its data and fixtures
// file hold together, no real name is in them, and once loaded through the fixture import
// and the transfer it is what the demo shows: one program and its 2026–27 season, every
// district's table, every team's games final, one team's whole season tracked live, and
// every other team's players' statistics hidden from the public. A second load changes
// nothing.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
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
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { listPublicSchedule, listPublicSeasons } from '../queries/index.ts';
import { gamesStore, standingsReadStore } from '../stores/index.ts';
import { demoLeague } from './demo-league-data.ts';
import { seedLeagues } from './seed-data.ts';
import {
  daysMovedBack,
  demoFixturesText,
  fixturesOf,
  movedBack,
  seedDemoLeagueInto,
} from './seed-demo-league.ts';
import { seedVenues } from './seed-tracked-games-data.ts';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const teams = demoLeague.divisions.flatMap((d) => d.teams);
const tracked = teams.find((t) => t.shortName === demoLeague.trackedTeam)!;
const fileText = readFileSync(`${repository}${demoLeague.fixturesFile}`, 'utf8');
const fixtures = fixturesOf(demoLeague, fileText);
const ofTracked = fixtures.filter(
  (f) => f.homeTeamId === tracked.name || f.awayTeamId === tracked.name,
);

describe('the demo-shaped league: its data', () => {
  it('is a large league: several districts of six schools, dozens of teams, one tracked', () => {
    expect(demoLeague.divisions.length).toBeGreaterThanOrEqual(4);
    for (const division of demoLeague.divisions) expect(division.teams).toHaveLength(6);
    expect(teams.length).toBeGreaterThanOrEqual(24);
    expect(new Set(teams.map((t) => t.name)).size).toBe(teams.length);
    expect(new Set(teams.map((t) => t.shortName)).size).toBe(teams.length);
    expect(demoLeague.season.name).toBe('2026–27');
    expect(demoLeague.audience).toBe('youth');
    expect(tracked).toBeDefined();
    for (const email of [demoLeague.owner.email, ...demoLeague.members.map((m) => m.email)]) {
      expect(email).toMatch(/@[a-z.]*example\.test$/);
    }
    expect(demoLeague.members.some((m) => m.role === 'admin')).toBe(true);
  });

  it("has a fixtures file every row of which the product's reader takes", () => {
    // fixturesOf throws on any problem; every row is a game.
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
        // Every other school of its district, once at home and once away.
        expect(home.map((f) => f.awayTeamId).sort()).toEqual(
          names.filter((n) => n !== team.name).sort(),
        );
        expect(away.map((f) => f.homeTeamId).sort()).toEqual(
          names.filter((n) => n !== team.name).sort(),
        );
      }
    }
    for (const game of fixtures) expect(game.time).not.toBeNull();
  });

  it("gives every game a final score but the tracked team's, which the tracker holds", () => {
    expect(ofTracked).toHaveLength(10);
    for (const game of ofTracked) expect(game.finalScore).toBeNull();
    for (const game of fixtures.filter((f) => !ofTracked.includes(f))) {
      expect(game.finalScore).not.toBeNull();
      expect(game.finalScore!.home).not.toBe(game.finalScore!.away);
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
    const everyone = Object.values(demoLeague.trackerPlayers).flat();
    expect(new Set(everyone.map(([, name]) => name)).size).toBe(everyone.length);
    for (const players of Object.values(demoLeague.trackerPlayers)) {
      expect(players.length).toBeGreaterThanOrEqual(8);
      expect(new Set(players.map(([jersey]) => jersey)).size).toBe(players.length);
    }
  });
});

describe('the demo-shaped league: no real name', () => {
  it('names every player with a made-up word for a surname', () => {
    for (const [, name] of Object.values(demoLeague.trackerPlayers).flat()) {
      const [first, last, ...more] = name.split(' ');
      expect(more, name).toEqual([]);
      expect(first, name).toMatch(/^[A-Z][a-z]+$/);
      expect(demoLeague.madeUpSurnames, name).toContain(last);
    }
  });

  it("holds none of the real league's names: no school, team, venue or league", () => {
    // The live tracker's own fixtures (apps/live-stats/data) are the real names we hold.
    const folder = `${repository}apps/live-stats/data/`;
    const real = new Set<string>();
    const collect = (value: unknown, key = '') => {
      if (typeof value === 'string') {
        if (['name', 'school', 'venue', 'address', 'source', 'division'].includes(key)) {
          if (value.trim().length > 3) real.add(value.trim().toLowerCase());
        }
      } else if (Array.isArray(value)) for (const item of value) collect(item, key);
      else if (value !== null && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) collect(v, k);
      }
    };
    const files = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.json')) : [];
    for (const file of files) collect(JSON.parse(readFileSync(`${folder}${file}`, 'utf8')));
    expect(real.size).toBeGreaterThan(0);
    const seed = [
      JSON.stringify(demoLeague),
      fileText,
      JSON.stringify(seedLeagues),
      JSON.stringify(seedVenues),
    ]
      .join('\n')
      .toLowerCase();
    // Counted, not listed: a failure here must not print the real names.
    expect([...real].filter((name) => seed.includes(name)).length).toBe(0);
  });
});

describe('moving the file’s dates back', () => {
  it('leaves a season already played as it is', () => {
    expect(daysMovedBack('2026-11-06,x\n2027-01-15,y', '2027-01-16')).toBe(0);
  });

  it('moves a season still to come back by whole weeks, to before today', () => {
    const days = daysMovedBack('2026-11-06,x\n2027-01-15,y', '2027-01-15');
    expect(days).toBe(7);
    expect(movedBack('a,2027-01-15,b', days)).toBe('a,2027-01-08,b');
    const far = daysMovedBack('2027-01-15', '2026-11-17');
    expect(far % 7).toBe(0);
    expect(movedBack('2027-01-15', far) < '2026-11-17').toBe(true);
    expect(movedBack('2027-01-15', far) >= '2026-11-10').toBe(true);
  });
});

let pglite: PGlite;
let db: DatabaseHandle;
let leagueId = '';
let startedAt = 0;
beforeAll(async () => {
  pglite = new PGlite();
  const run = await applyMigrations(pgliteDriver(pglite));
  if (!run.ok) throw new Error(run.error.message);
  startedAt = Date.now();
  const loaded = await seedDemoLeagueInto(pglite, new Date(startedAt));
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

describe('the demo-shaped league, loaded', () => {
  it('has one program and its 2026–27 season, open and current', async () => {
    expect(await count('select count(*)::int as n from programs where league_id = $1')).toBe(1);
    const seasons = await read((scope) => listPublicSeasons(scope));
    expect(seasons.map((s) => [s.slug, s.name, s.status, s.isCurrent])).toEqual([
      [demoLeague.season.slug, demoLeague.season.name, 'active', true],
    ]);
  });

  it('shows every game, final, at the home school’s gym, all played before today', async () => {
    const [season] = await read((scope) => listPublicSeasons(scope));
    const today = dayIn(demoLeague.timeZone, startedAt);
    const schedule = await read((scope) => listPublicSchedule(scope, season!.id, today));
    const games = [
      ...(schedule?.unplacedGames ?? []),
      ...(schedule?.rounds.flatMap((r) => r.games) ?? []),
    ];
    expect(games).toHaveLength(fixtures.length);
    for (const game of games) {
      expect(game.status).toBe('final');
      expect(game.venue?.name).toBe(`${game.homeTeam.name} Gym`);
      expect(game.localDate !== null && game.localDate < today).toBe(true);
    }
    // The file's scores, as the import recorded them, on the file's days moved back.
    const moved = fixturesOf(demoLeague, await demoFixturesText(demoLeague, new Date(startedAt)));
    for (const row of moved.filter((f) => f.finalScore !== null)) {
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

  it("has every district's table, each school with its ten games", async () => {
    const [season] = await read((scope) => listPublicSeasons(scope));
    const standings = await read((scope) =>
      readStandings(standingsReadStore(scope), { seasonId: season!.id }),
    );
    if (!standings.ok) throw new Error(`no standings: ${standings.error.code}`);
    expect(standings.value.tables.map((t) => t.division?.name)).toEqual(
      demoLeague.divisions.map((d) => d.name),
    );
    for (const [n, table] of standings.value.tables.entries()) {
      expect(table.lines.map((l) => l.team.name).sort()).toEqual(
        demoLeague.divisions[n]!.teams.map((t) => t.name).sort(),
      );
      for (const line of table.lines) expect(line.wins + line.losses).toBe(10);
    }
    const lines = standings.value.tables.flatMap((t) => t.lines);
    expect(lines.reduce((sum, line) => sum + line.wins, 0)).toBe(fixtures.length);
  });

  it("holds the tracked team's whole season as tracked live, with its players' numbers", async () => {
    const { rows } = await pglite.query<{ id: string }>(
      `select games.id from games join teams on teams.id in (games.home_team_id, games.away_team_id)
       where games.league_id = $1 and teams.slug = $2`,
      [leagueId, tracked.shortName],
    );
    expect(rows).toHaveLength(10);
    for (const { id } of rows) {
      expect(await read((scope) => gamesStore(scope).hasPlays(id))).toBe(true);
    }
    // Its roster: every player the tracker had, with their number.
    const roster = await pglite.query<{ name: string; jersey: string }>(
      `select people.first_name || ' ' || people.last_name as name, roster_entries.jersey_number as jersey
       from roster_entries join people on people.id = roster_entries.person_id
       join teams on teams.id = roster_entries.team_id
       where roster_entries.league_id = $1 and teams.slug = $2 order by 1`,
      [leagueId, tracked.shortName],
    );
    expect(roster.rows.map((r) => [r.jersey, r.name]).sort()).toEqual(
      [...demoLeague.trackerPlayers[tracked.shortName]!].map(([j, n]) => [j, n]).sort(),
    );
  });

  it("shows the public the tracked team's players only; staff see the others too", async () => {
    const [season] = await read((scope) => listPublicSeasons(scope));
    const statistics = (leagueAdmin: boolean) =>
      read((scope) =>
        readStatisticsTable(standingsReadStore(scope), {
          seasonId: season!.id,
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
    expect(shown.value.players).toHaveLength(demoLeague.trackerPlayers[tracked.shortName]!.length);
    for (const player of shown.value.players) expect(player.teamIds).toEqual([trackedId]);
    for (const player of shown.value.players) expect(player.gamesPlayed).toBeGreaterThan(0);
    for (const team of shown.value.teams) {
      expect(team.playerLinesShown).toBe(team.teamId === trackedId);
    }
    const staff = await statistics(true);
    if (!staff.ok) throw new Error(staff.error.code);
    const everyone = Object.values(demoLeague.trackerPlayers).flat();
    expect(staff.value.players).toHaveLength(everyone.length);
  });

  it('is left alone by a second load', async () => {
    const before = await count('select count(*)::int as n from activity_log where league_id = $1');
    expect(await seedDemoLeagueInto(pglite, new Date(startedAt))).toMatchObject({ created: false });
    expect(await count('select count(*)::int as n from activity_log where league_id = $1')).toBe(
      before,
    );
  });
});
