// Step 2.58's done test, on made-up data only (T-201): a made-up tracker backup of ten
// recorded games, made the way the tracker's server makes its rows (the engine applies
// each action, then the state, the event and every line are saved), is transferred into
// a made-up league in a local database. Every box score line matches; a second run
// changes nothing; a game that differs stops the run with a plain report; and a dry run
// changes nothing at all.
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { seasonRulesPreset } from '@srleagues/contracts';
import { describeTransferPlan, describeTransferReport } from '@srleagues/core';
import { basketball } from '@srleagues/sports';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  freshSchema,
  newAccount,
  newGame,
  newLeague,
  newPerson,
  newRosterEntry,
  newSeason,
  newStage,
  newTeam,
} from '../schema/schema.test-helper.ts';
import { transferTrackerGames, type TransferTrackerGamesOptions } from './index.ts';

const schemaFile = fileURLToPath(new URL('../live-stats/001-schema.sql', import.meta.url));

type Input = Parameters<typeof basketball.apply>[1];
type TeamKey = 'owls' | 'foxes' | 'herons' | 'elks';

const teamNames: Record<TeamKey, string> = {
  owls: 'Riverside Owls',
  foxes: 'Hillcrest Foxes',
  herons: 'Lakeside Herons',
  elks: 'Pine Valley Elks',
};
const teamIds = Object.fromEntries(
  (Object.keys(teamNames) as TeamKey[]).map((key) => [key, randomUUID()]),
) as Record<TeamKey, string>;

type Player = { id: string; team: TeamKey; name: string; jersey: string; active: boolean };
const made = (team: TeamKey, names: readonly string[], first: number): Player[] =>
  names.map((name, i) => ({
    id: randomUUID(),
    team,
    name,
    jersey: String(first + i),
    active: true,
  }));
const players: Player[] = [
  ...made('owls', ['Sam Example', 'Kai Sample', 'Jo Testing', 'Ari Madeup', 'Lee Pretend'], 4),
  ...made('owls', ['Max Fiction', 'Ray Invented'], 20),
  ...made('foxes', ['Fox One', 'Fox Two', 'Fox Three', 'Fox Four', 'Fox Five'], 30),
  ...made('herons', ['Heron One', 'Heron Two', 'Heron Three', 'Heron Four', 'Heron Five'], 40),
  ...made('elks', ['Elk One', 'Elk Two', 'Elk Three', 'Elk Four', 'Elk Five'], 50),
];
// One who has left the tracker's lineups; their games keep their lines.
players[6] = { ...players[6]!, active: false };
const of = (team: TeamKey) => players.filter((p) => p.team === team).map((p) => p.id);

/** Ten fixtures between the owls and three opponents, the last two without a game number. */
const fixtures = Array.from({ length: 10 }, (_, g) => {
  const opponent: TeamKey = (['foxes', 'herons', 'elks'] as const)[g % 3]!;
  const home: TeamKey = g % 2 === 0 ? 'owls' : opponent;
  const away: TeamKey = home === 'owls' ? opponent : 'owls';
  const day = String(5 + g * 2).padStart(2, '0');
  return {
    id: randomUUID(),
    home,
    away,
    // 18:30 in Chicago: past midnight in UTC, so the day is judged in the league's zone.
    startsAt: `2026-01-${day}T00:30:00Z`,
    number: g < 8 ? 101 + g : null,
  };
});

/** A game's actions, much as a scorer taps them, with an end, and some twists. */
function actionsOf(g: number, home: string[], away: string[]): Input[] {
  const [h0, h1, h2, h3, h4, h5] = home as [string, string, string, string, string, string?];
  const [a0, a1, a2, a3, a4] = away as [string, string, string, string, string];
  const p = ((g % 3) + 1) as 1 | 2 | 3;
  const list: Input[] = [];
  // Game 5 sets its format first and is marked not started once before it begins again.
  if (g === 5) {
    list.push({ type: 'rules', rules: basketball.QUARTERS });
    list.push({ type: 'lineup', side: 'home', playerIds: [h0, h1, h2, h3, h4] });
    list.push({ type: 'start' }, { type: 'score', side: 'home', playerId: h0, points: 3 });
    list.push({ type: 'reset' });
  }
  list.push(
    { type: 'lineup', side: 'home', playerIds: [h0, h1, h2, h3, h4] },
    { type: 'lineup', side: 'away', playerIds: [a0, a1, a2, a3, a4] },
    { type: 'start' },
    { type: 'score', side: 'home', playerId: h0, points: 2 },
    { type: 'score', side: 'away', playerId: a1, points: 3 },
    { type: 'foul', side: 'home', playerId: h2 },
    { type: 'start' },
    { type: 'turnover', side: 'away', playerId: a0 },
    { type: 'score', side: 'home', playerId: h1, points: p },
    { type: 'timeout', side: 'away', seconds: 60 },
    { type: 'start' },
    { type: 'score', side: 'home', playerId: h4, points: 3 },
    { type: 'pause' },
    { type: 'period', period: 2 },
    ...(h5 === undefined ? [] : [{ type: 'sub', side: 'home', inId: h5, outId: h3 } as const]),
    { type: 'start' },
    { type: 'score', side: 'away', playerId: a2, points: 2 },
    { type: 'foul', side: 'away', playerId: a3 },
    { type: 'start' },
    { type: 'score', side: 'home', playerId: h0, points: 2 },
    { type: 'undo' },
    { type: 'score', side: 'home', playerId: h1, points: 2 },
    { type: 'pause' },
    { type: 'period', period: 3 },
    { type: 'start' },
    { type: 'score', side: 'away', playerId: a4, points: 1 },
    { type: 'turnover', side: 'home', playerId: h2 },
    { type: 'score', side: 'home', playerId: h2, points: 2 },
    { type: 'pause' },
    { type: 'period', period: 4 },
    { type: 'start' },
    { type: 'score', side: 'away', playerId: a0, points: 2 },
    { type: 'score', side: 'home', playerId: h4, points: 1 },
    { type: 'pause' },
    { type: 'end' },
  );
  // Game 3 is reopened in the tracker, plays an overtime period with the clock running
  // (time on court after the reopen counts), and is ended again.
  if (g === 3) {
    list.push(
      { type: 'reopen' },
      { type: 'period', period: 5 },
      { type: 'start' },
      { type: 'score', side: 'home', playerId: h1, points: 3 },
      { type: 'pause' },
      { type: 'end' },
    );
  }
  // Game 7's colors are swapped after it ended.
  if (g === 7) list.push({ type: 'colors', swapped: true });
  return list;
}

/** A made-up backup, written as the tracker's server writes its rows. */
async function makeBackup(dir: string) {
  const db = new PGlite(dir);
  await db.exec(await readFile(schemaFile, 'utf8'));
  for (const key of Object.keys(teamNames) as TeamKey[]) {
    await db.query(
      `INSERT INTO live_stats.teams(id, slug, name, school, tracked) VALUES ($1, $2, $3, '', $4)`,
      [teamIds[key], key, teamNames[key], key === 'owls'],
    );
  }
  for (const p of players) {
    await db.query(
      'INSERT INTO live_stats.players(id, team_id, name, jersey, active) VALUES ($1, $2, $3, $4, $5)',
      [p.id, teamIds[p.team], p.name, p.jersey, p.active],
    );
  }
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const [g, fixture] of fixtures.entries()) {
    // Owls' lineups: game 0 and 1 have the player who later left, on the bench.
    const owls = of('owls').filter((id) => g < 2 || id !== players[6]!.id);
    const home = fixture.home === 'owls' ? owls : of(fixture.home);
    const away = fixture.away === 'owls' ? owls : of(fixture.away);
    const created = Date.parse(fixture.startsAt) - 3_600_000;
    let state = basketball.newGame(basketball.DEFAULT_RULES, created);
    let at = Date.parse(fixture.startsAt);
    const events: unknown[][] = [];
    for (const [k, input] of actionsOf(g, home, away).entries()) {
      at += 20_000;
      const accepted = at + 150;
      const commandId = randomUUID();
      state = basketball.apply(state, input, { id: commandId, now: Math.min(accepted, at) });
      events.push([
        k + 1,
        commandId,
        JSON.stringify({ at, input }),
        new Date(accepted).toISOString(),
      ]);
    }
    const derived = basketball.derive(state);
    await db.query(
      `INSERT INTO live_stats.games(id, season, home_team_id, away_team_id, starts_at, source,
         source_ref, status, home_score, away_score, revision, state)
       VALUES ($1, '2025-26', $2, $3, $4, 'Made-up league', $5, $6, $7, $8, $9, $10)`,
      [
        fixture.id,
        teamIds[fixture.home],
        teamIds[fixture.away],
        fixture.startsAt,
        fixture.number === null ? null : `made-up:${fixture.number}`,
        state.status,
        derived.teams.home.score,
        derived.teams.away.score,
        events.length,
        JSON.stringify(state),
      ],
    );
    for (const event of events) {
      await db.query(
        `INSERT INTO live_stats.game_events(game_id, sequence, command_id, command, accepted_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [fixture.id, ...event],
      );
    }
    for (const [playerId, line] of Object.entries(derived.players)) {
      const p = byId.get(playerId)!;
      await db.query(
        `INSERT INTO live_stats.player_game_lines(game_id, player_id, team_id, name, jersey,
           appeared, points, fg1, fg2, fg3, fouls, turnovers, ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          fixture.id,
          playerId,
          teamIds[p.team],
          p.name,
          p.jersey,
          line.appeared,
          line.points,
          line.fg1,
          line.fg2,
          line.fg3,
          line.fouls,
          line.turnovers,
          Math.round(line.ms),
        ],
      );
    }
  }
  // A fixture not played yet: nothing to transfer.
  await db.query(
    `INSERT INTO live_stats.games(id, season, home_team_id, away_team_id, starts_at, status, state)
     VALUES ($1, '2025-26', $2, $3, '2026-02-20T00:30:00Z', 'scheduled', '{}')`,
    [randomUUID(), teamIds.owls, teamIds.foxes],
  );
  await db.close();
}

/** A made-up league with the season, its four teams and its published games. */
async function makeLeague(pglite: PGlite, slug: string) {
  const l = await newLeague(pglite, slug);
  const seasonId = await newSeason(pglite, l.leagueId, l.defaultProgramId, { slug: '2025-26' });
  await pglite.query(`update seasons set status = 'active', rules = $2 where id = $1`, [
    seasonId,
    JSON.stringify(seasonRulesPreset('high-school')),
  ]);
  const stageId = await newStage(pglite, l.leagueId, seasonId);
  const teams = {} as Record<TeamKey, string>;
  for (const key of Object.keys(teamNames) as TeamKey[]) {
    teams[key] = await newTeam(pglite, l.leagueId, seasonId, { slug: key, name: teamNames[key] });
  }
  const games: string[] = [];
  for (const fixture of fixtures) {
    games.push(
      await newGame(pglite, {
        leagueId: l.leagueId,
        seasonId,
        stageId,
        homeTeamId: teams[fixture.home],
        awayTeamId: teams[fixture.away],
        columns: {
          capture_mode: 'live',
          starts_at: fixture.startsAt,
          game_number: fixture.number,
        },
      }),
    );
  }
  // One of the owls is on the roster already, under the same name and number.
  const jo = players.find((p) => p.name === 'Jo Testing')!;
  const joId = await newPerson(pglite, l.leagueId, { firstName: 'Jo', lastName: 'Testing' });
  await newRosterEntry(pglite, l.leagueId, teams.owls, joId, { jersey: jo.jersey });
  const email = `${slug}-admin@example.test`;
  const adminId = await newAccount(pglite, email);
  await pglite.query(
    `insert into role_grants (league_id, account_id, role, scope_type) values ($1, $2, 'admin', 'league')`,
    [l.leagueId, adminId],
  );
  return { ...l, seasonId, teams, games, email };
}

/** Everything a run could change in a league, counted, with every game's version. */
async function fingerprint(pglite: PGlite, leagueId: string) {
  const out: Record<string, unknown> = {};
  for (const table of [
    'people',
    'roster_entries',
    'game_events',
    'game_states',
    'player_game_stats',
    'game_corrections',
    'activity_log',
    'scoring_sessions',
    'standings_rows',
    'jobs',
  ]) {
    out[table] = (
      await pglite.query<{ n: number }>(
        `select count(*)::int as n from ${table} where league_id = $1`,
        [leagueId],
      )
    ).rows[0]!.n;
  }
  out.games = (
    await pglite.query(
      'select id, status, version, home_score, away_score from games where league_id = $1 order by id',
      [leagueId],
    )
  ).rows;
  return out;
}

let root: string;
let backup: string;
let pglite: PGlite;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'tracker-transfer-test-'));
  backup = path.join(root, 'backup');
  await makeBackup(backup);
  pglite = await freshSchema();
});
afterAll(async () => {
  await pglite.close();
  await rm(root, { recursive: true, force: true });
});

const optionsFor = (
  league: { email: string },
  slug: string,
  more: Partial<TransferTrackerGamesOptions> = {},
): TransferTrackerGamesOptions => ({
  pglite,
  backupFolder: backup,
  workDir: path.join(root, 'work'),
  league: slug,
  season: '2025-26',
  actorEmail: league.email,
  dryRun: false,
  withOpponents: true,
  ...more,
});

async function run(options: TransferTrackerGamesOptions) {
  const outcome = await transferTrackerGames(options);
  if (!outcome.ok) throw new Error(`setup: ${outcome.problem.kind}`);
  const words = {
    data: outcome.backup,
    timeZone: outcome.timeZone,
    withOpponents: options.withOpponents,
  };
  return {
    ...outcome,
    planText: describeTransferPlan(words, outcome.plan).join('\n'),
    reportText:
      outcome.report === null ? '' : describeTransferReport(words, outcome.report).join('\n'),
  };
}

describe('the tracker transfer (step 2.58)', () => {
  it('transfers ten games with every line matching, and a second run changes nothing', async () => {
    const league = await makeLeague(pglite, 'made-up-transfer');
    // An earlier run was cut off after making Sam a person, before putting them on the
    // team: this run finds them in the league's list and does not add them twice.
    const orphan = await newPerson(pglite, league.leagueId, {
      firstName: 'Sam',
      lastName: 'Example',
    });
    const start = await fingerprint(pglite, league.leagueId);

    // A dry run shows the plan and changes nothing.
    const dry = await run(optionsFor(league, 'made-up-transfer', { dryRun: true }));
    expect(dry.plan.ready).toBe(true);
    expect(dry.plan.games.map((g) => g.outcome.kind)).toEqual([
      ...Array<string>(10).fill('transfer'),
      'skip',
    ]);
    expect(
      dry.plan.games.slice(8, 10).map((g) => g.match.kind === 'matched' && g.match.by),
    ).toEqual(['date', 'date']);
    expect(dry.planText).toContain('10 games to transfer, 0 already here, 1 not transferred');
    expect(dry.planText).toContain('Jo Testing (#6): on the roster already');
    expect(dry.planText).toContain(
      'Sam Example (#4): in the league’s list as Sam Example but on no team: to be put on the roster, number 4',
    );
    expect(dry.planText).toContain('Kai Sample (#5): to be added as Kai Sample, number 5');
    expect(dry.report).toBeNull();
    expect(await fingerprint(pglite, league.leagueId)).toEqual(start);

    // The real run.
    const first = await run(optionsFor(league, 'made-up-transfer'));
    expect(first.report?.stopped, first.reportText).toBeNull();
    expect(first.report?.transferred).toHaveLength(10);
    expect(first.reportText).toContain('Done: every box score line of 10 games matches');
    // 6 owls added (Jo was there) and 15 opponents' players.
    expect(first.report?.added).toHaveLength(6 + 15);
    // Sam is the one person they were, now on the team with their number.
    const sams = await pglite.query<{ id: string; jersey_number: string | null }>(
      `select p.id, r.jersey_number from people p
       left join roster_entries r on r.league_id = p.league_id and r.person_id = p.id
       where p.league_id = $1 and p.first_name = 'Sam' and p.last_name = 'Example'`,
      [league.leagueId],
    );
    expect(sams.rows).toEqual([{ id: orphan, jersey_number: '4' }]);
    // Every person the run made is on a roster: none is left behind.
    const orphans = await pglite.query(
      `select id from people p where league_id = $1 and not exists (
         select 1 from roster_entries r where r.league_id = p.league_id and r.person_id = p.id)`,
      [league.leagueId],
    );
    expect(orphans.rows).toEqual([]);
    // Every game's scoring session was let go: none is held.
    const held = await pglite.query('select id from scoring_sessions where league_id = $1', [
      league.leagueId,
    ]);
    expect(held.rows).toEqual([]);
    for (const [g, gameId] of league.games.entries()) {
      const row = (
        await pglite.query<{ status: string; home_score: number; away_score: number }>(
          'select status, home_score, away_score from games where id = $1',
          [gameId],
        )
      ).rows[0]!;
      const tracked = first.backup.games.find((game) => game.id === fixtures[g]!.id)!;
      expect(row).toEqual({
        status: 'final',
        home_score: tracked.homeScore,
        away_score: tracked.awayScore,
      });
    }
    // Lines carry ids and numbers, never a name (T-220).
    const columns = (
      await pglite.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_name = 'player_game_stats'`,
      )
    ).rows.map((r) => r.column_name);
    expect(columns.some((c) => c.includes('name'))).toBe(false);
    // The reopened game was reopened here with a reason, as the tracker did.
    const corrections = await pglite.query(
      'select reason from game_corrections where league_id = $1',
      [league.leagueId],
    );
    expect(corrections.rows).toHaveLength(1);

    // A second run changes nothing.
    const after = await fingerprint(pglite, league.leagueId);
    const second = await run(optionsFor(league, 'made-up-transfer'));
    expect(second.report?.stopped, second.reportText).toBeNull();
    expect(second.report?.transferred).toEqual([]);
    expect(second.report?.added).toEqual([]);
    expect(second.report?.checked).toHaveLength(10);
    expect(second.reportText).toContain('Nothing to change');
    expect(await fingerprint(pglite, league.leagueId)).toEqual(after);

    // A line changed here afterwards: the next run stops at that game and says so.
    await pglite.query(
      `update player_game_stats set stats = jsonb_set(stats, '{fouls}', '7')
       where game_id = $1 and (stats ->> 'fouls')::int = 1 and played`,
      [league.games[2]],
    );
    const third = await run(optionsFor(league, 'made-up-transfer'));
    expect(third.report?.stopped?.trackerGameId).toBe(fixtures[2]!.id);
    expect(third.report?.stopped?.stop.kind).toBe('lines-differ');
    expect(third.reportText).toContain('Stopped at 2026-01-08 Riverside Owls v Pine Valley Elks');
    expect(third.reportText).toMatch(/fouls 1 in the tracker, 7 here\./u);
  });

  it('brings in only the tracked team unless asked, and changes nothing while a game is blocked', async () => {
    const league = await makeLeague(pglite, 'made-up-owls-only');
    // The season asks for unique numbers, and someone on the owls wears Kai's.
    await pglite.query(
      `update seasons set rules = jsonb_set(rules, '{rosters,uniqueJerseys}', 'true') where id = $1`,
      [league.seasonId],
    );
    const pat = await newPerson(pglite, league.leagueId, { firstName: 'Pat', lastName: 'Other' });
    await newRosterEntry(pglite, league.leagueId, league.teams.owls, pat, { jersey: '5' });
    const start = await fingerprint(pglite, league.leagueId);
    const outcome = await run(optionsFor(league, 'made-up-owls-only', { withOpponents: false }));
    expect(outcome.planText).toContain(
      'Kai Sample (#5): cannot be added: this season asks for unique jersey numbers',
    );
    expect(outcome.plan.ready).toBe(false);
    expect(outcome.plan.games.slice(0, 10).every((g) => g.outcome.kind === 'blocked')).toBe(true);
    // Kai cannot be added at all, so only the opponents are left to --with-opponents.
    expect(outcome.planText).toContain(
      '--with-opponents brings in 5 of them; put the others on their team’s roster here by hand first',
    );
    expect(outcome.report?.stopped?.stop.kind).toBe('not-ready');
    expect(outcome.reportText).toContain('Nothing was changed');
    expect(await fingerprint(pglite, league.leagueId)).toEqual(start);
  });

  it('stops before changing anything when a game would differ, with a plain report', async () => {
    const league = await makeLeague(pglite, 'made-up-differs');
    // The season plays 7-minute quarters, so every recorded game's minutes would differ.
    await pglite.query(
      `update seasons set rules = jsonb_set(rules, '{gameFormat,periodSeconds}', '420') where id = $1`,
      [league.seasonId],
    );
    const start = await fingerprint(pglite, league.leagueId);
    const outcome = await run(optionsFor(league, 'made-up-differs'));
    expect(outcome.plan.ready).toBe(false);
    expect(outcome.planText).toContain(
      'The tracker played it as 4 periods of 8 minutes (overtime 4); here it is 4 of 7 (overtime 4).',
    );
    expect(outcome.report?.stopped?.stop.kind).toBe('not-ready');
    expect(await fingerprint(pglite, league.leagueId)).toEqual(start);
  });

  it('says so when the league, the season or the account is not there', async () => {
    const league = { email: 'nobody@example.test' };
    const missing = await transferTrackerGames(optionsFor(league, 'no-such-league'));
    expect(missing).toEqual({ ok: false, problem: { kind: 'league-not-found' } });
  });
});
