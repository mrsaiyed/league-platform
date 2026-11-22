// Development-only (T-195, T-201): loads the seed's demo-shaped league (demo-league-data.ts;
// P9 §3, F-6) into a PGlite database that has every migration applied. Made-up data only:
// it takes a PGlite, never an address, and reads its files from this repository.
//
// Everything goes through the product's own commands and the product's own two doors for
// bringing results in, as a league's admin would use them:
// 1. Our own staff creates the league with its 2025–26 season; its owner publishes the
//    league's starting design, makes it live, opens the season on the high-school rules,
//    and adds the districts, the schools' teams and each school's gym. Every team's
//    players' statistics are for staff only (S-22), except the tracked team's, whose
//    school shows them. Role grants are written through the access store, as the seed
//    leagues' are.
// 2. The fixtures file (supabase/seed/demo-league) is uploaded through the fixture import,
//    read as the worker reads it, and applied to the schedule draft. The import keeps no
//    round (step 2.166), so the file's weeks are made rounds with the schedule builder's
//    own commands (scheduling.add_draft_round, scheduling.move_draft_game) and each game
//    put in its week; then the schedule is published and the file's final scores recorded.
//    The tracked team's rows carry no score: the tracker has them.
// 3. A made-up backup of the live tracker (demo-tracker-backup.ts) holding the tracked
//    team's games is written to a folder and brought in by the transfer (step 2.58), with
//    the other teams' players its games name, as the league's admin.
//
// The season is a past one, on the file's own dates, and the whole load acts at one fixed
// moment, the day after its last game (`loadedAt`): every command, scoring session and the
// transfer read that moment, never the system clock, so a load on any day writes the same
// league and shows the same pages. A rerun finds a whole league and leaves it alone; a
// partly loaded one stops with a plain message (SeedPartlyLoaded).
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { seasonRulesPreset, startingDesign } from '@srleagues/contracts';
import {
  applyFixtureImport,
  createDivision,
  createLeague,
  createTeam,
  createVenue,
  addDraftRound,
  eventHandlers,
  getFixtureImport,
  getScheduleDraft,
  moveDraftGame,
  leagueScope,
  publishSchedule,
  publishSiteDesign,
  readFixtureImport,
  readFixtureSheet,
  recordImportedScores,
  setLeagueStatus,
  setSeasonRules,
  startFixtureImport,
  updateSeason,
  type AccessTx,
  type CommandContext,
  type CommandDeps,
  type DraftFixture,
  type ImportScoresTx,
  type LeaguesTx,
  type SchedulingTx,
  type StandingsTx,
  type TeamsTx,
} from '@srleagues/core';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  accessStore,
  activityLogStore,
  divisionsStore,
  gamesStore,
  importsStore,
  jobsStore,
  leaguesStore,
  schedulingStore,
  standingsStore,
  teamsStore,
} from '../stores/index.ts';
import { transferTrackerGames } from '../transfers/index.ts';
import { demoLeague, type DemoLeague } from './demo-league-data.ts';
import { writeMadeUpTrackerBackup, type MadeUpBackup } from './demo-tracker-backup.ts';
import type { SeedLoad } from './seed-all-leagues.ts';
import { seedStaff } from './seed-data.ts';
import { SeedPartlyLoaded } from './seed-partly-loaded.ts';

/** This repository's root, where the data's files are named from. */
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));

type DemoTx = LeaguesTx & TeamsTx & AccessTx & SchedulingTx & ImportScoresTx & StandingsTx;

function must<T>(what: string, result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`Seeding failed at ${what}: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function accountId(pglite: PGlite, email: string, displayName: string): Promise<string> {
  const found = await pglite.query<{ id: string }>(
    'select id from accounts where lower(email) = lower($1)',
    [email],
  );
  if (found.rows[0] !== undefined) return found.rows[0].id;
  const made = await pglite.query<{ id: string }>(
    'insert into accounts (email, display_name) values ($1, $2) returning id',
    [email, displayName],
  );
  return made.rows[0]!.id;
}

/** The fixtures file as the loader imports it, as the repository has it. */
export function demoFixturesText(league: DemoLeague = demoLeague): Promise<string> {
  return readFile(path.join(repositoryRoot, league.fixturesFile), 'utf8');
}

/**
 * The one moment the whole load acts at: 6 pm (UTC) on the day after the season's last
 * game. Commands, scoring sessions and the transfer read it in place of the system clock.
 */
export function loadedAt(fixtures: readonly DraftFixture[]): number {
  const last =
    fixtures
      .map((f) => f.date)
      .sort()
      .at(-1) ?? '2000-01-01';
  return Date.parse(`${last}T18:00:00Z`) + 86_400_000;
}

/** The file's games, read by the product's own reader with the teams named by their names. */
export function fixturesOf(league: DemoLeague, fileText: string): DraftFixture[] {
  const teams = league.divisions.flatMap((d) => d.teams.map((t) => ({ id: t.name, name: t.name })));
  const venues = league.divisions.flatMap((d) =>
    d.teams.map((t) => ({ id: t.venue.name, name: t.venue.name })),
  );
  const report = readFixtureSheet(fileText, { teams, venues });
  if (report.fileProblem !== null || report.problems.length > 0) {
    throw new Error(`The seed's fixtures file cannot be read: ${JSON.stringify(report.problems)}`);
  }
  return report.fixtures;
}

/** The team the tracker scored, by name, and the teams its games were against. */
function trackerTeams(league: DemoLeague) {
  const all = league.divisions.flatMap((d) => d.teams);
  const tracked = all.find((t) => t.shortName === league.trackedTeam);
  if (tracked === undefined) throw new Error('The seed has no tracked team of that short name.');
  return { all, tracked };
}

/** Whether a league already there holds the whole load: every game final, the tracked ones live. */
async function holdsEverything(pglite: PGlite, leagueId: string, league: DemoLeague, text: string) {
  const fixtures = fixturesOf(league, text);
  const { tracked } = trackerTeams(league);
  const trackedGames = fixtures.filter(
    (f) => f.homeTeamId === tracked.name || f.awayTeamId === tracked.name,
  ).length;
  const { rows } = await pglite.query<{ finals: number; tracked: number }>(
    `select count(*) filter (where status = 'final')::int as finals,
       count(*) filter (where status = 'final' and exists (
         select 1 from game_events where game_events.game_id = games.id))::int as tracked
     from games where league_id = $1 and deleted_at is null`,
    [leagueId],
  );
  return rows[0]?.finals === fixtures.length && rows[0]?.tracked === trackedGames;
}

/** Loads the demo-shaped league unless it is there (above). */
export async function seedDemoLeagueInto(
  pglite: PGlite,
  league: DemoLeague = demoLeague,
): Promise<SeedLoad> {
  const fileText = await demoFixturesText(league);
  const fixtures = fixturesOf(league, fileText);
  const at = loadedAt(fixtures);
  const existing = (
    await pglite.query<{ id: string }>('select id from leagues where slug = $1', [league.slug])
  ).rows[0];
  if (existing !== undefined) {
    if (!(await holdsEverything(pglite, existing.id, league, fileText))) {
      throw new SeedPartlyLoaded(league.slug);
    }
    return { slug: league.slug, name: league.name, created: false };
  }

  const staffId = await accountId(pglite, seedStaff.email, seedStaff.displayName);
  const ownerId = await accountId(pglite, league.owner.email, league.owner.displayName);
  const leagueId = (await pglite.query<{ id: string }>('select uuid_v7() as id')).rows[0]!.id;
  const db = createDatabase({ kind: 'pglite', pglite });
  try {
    const transaction = commandTransaction(db, (scope: LeagueScope) => ({
      jobs: jobsStore(scope),
      leagues: leaguesStore(scope, { platformStaff: [staffId] }),
      divisions: divisionsStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
      teams: teamsStore(scope),
      scheduling: schedulingStore(scope),
      imports: importsStore(scope),
      games: gamesStore(scope),
      standings: standingsStore(scope),
    }));
    // Setting the league up emits nothing the seed needs handled; results update standings.
    const setUp: CommandDeps<DemoTx> = { transaction, events: [], log: () => {}, now: () => at };
    const deps: CommandDeps<DemoTx> = { ...setUp, events: eventHandlers };
    const as = (actor: string | null): CommandContext => ({
      leagueId,
      accountId: actor,
      requestId: `seed-${league.slug}`,
    });
    const owner = as(ownerId);

    // 1. The league, its season, districts, teams and venues.
    const created = must(
      'league',
      await createLeague(
        as(staffId),
        {
          slug: league.slug,
          name: league.name,
          timeZone: league.timeZone,
          audience: league.audience,
          ownerAccountId: ownerId,
          sportKey: 'basketball',
          firstSeason: { ...league.season },
        },
        setUp,
      ),
    );
    const seasonId = created.firstSeasonId;
    if (seasonId === null) throw new Error(`Seeding failed at season: ${league.slug} has none.`);
    must(
      'site design',
      await publishSiteDesign(
        owner,
        { startingDesign: league.design, design: startingDesign(league.design), sinceRelease: 0 },
        setUp,
      ),
    );
    must(
      'league status',
      await setLeagueStatus(owner, { status: 'live', version: created.version }, setUp),
    );
    const seasonVersion = async () =>
      (
        await pglite.query<{ version: number }>('select version from seasons where id = $1', [
          seasonId,
        ])
      ).rows[0]!.version;
    must(
      'the season rules',
      await setSeasonRules(
        owner,
        {
          seasonId,
          version: await seasonVersion(),
          rules: seasonRulesPreset('high-school'),
          confirmed: true,
        },
        deps,
      ),
    );
    must(
      'opening the season',
      await updateSeason(
        owner,
        { seasonId, version: await seasonVersion(), status: 'active', current: true },
        setUp,
      ),
    );
    for (const division of league.divisions) {
      const { divisionId } = must(
        'division',
        await createDivision(owner, { seasonId, name: division.name }, setUp),
      );
      for (const team of division.teams) {
        must(
          'team',
          await createTeam(
            owner,
            {
              seasonId,
              divisionId,
              name: team.name,
              shortName: team.shortName,
              color: team.color,
              statsVisibility: team.shortName === league.trackedTeam ? 'everyone' : 'staff',
            },
            setUp,
          ),
        );
        must(
          'venue',
          await createVenue(owner, { name: team.venue.name, address: team.venue.address }, setUp),
        );
      }
    }
    for (const member of league.members) {
      const memberId = await accountId(pglite, member.email, member.displayName);
      await withTransaction(db, { leagueId, accountId: ownerId }, (scope) =>
        accessStore(scope).createGrant({
          accountId: memberId,
          role: member.role,
          scope: leagueScope,
          grantedByAccountId: ownerId,
        }),
      );
    }

    // 2. The fixtures file, through the fixture import.
    const started = must(
      'starting the fixture import',
      await startFixtureImport(
        owner,
        { seasonId, fileName: path.basename(league.fixturesFile), fileText },
        setUp,
      ),
    );
    // Read as the worker reads it: in the league's transaction, acting for nobody.
    await transaction(as(null), (tx) => readFixtureImport(tx, started.importId));
    const view = must(
      'the fixture import preview',
      await getFixtureImport(owner, { importId: started.importId }, setUp),
    );
    if (view.status !== 'ready' || view.problems.length > 0 || view.warnings.length > 0) {
      throw new Error(`Seeding failed at the fixture import: ${JSON.stringify(view.problems)}`);
    }
    must(
      'applying the fixture import',
      await applyFixtureImport(owner, { importId: started.importId, version: view.version }, setUp),
    );
    await putInRounds(pglite, owner, seasonId, fixtures, setUp);
    const draft = must('the schedule draft', await getScheduleDraft(owner, { seasonId }, setUp));
    must(
      'publishing the schedule',
      await publishSchedule(
        owner,
        {
          seasonId,
          basedOnRevision: draft.latestRevision,
          draftId: draft.draft?.id ?? '',
          version: draft.draft?.version ?? 0,
        },
        deps,
      ),
    );
    const scores = must(
      'recording the imported scores',
      await recordImportedScores(owner, { importId: started.importId }, deps),
    );
    if (scores.recorded !== view.scoreCount) {
      throw new Error(`Seeding failed at the imported scores: ${JSON.stringify(scores)}`);
    }

    // 3. The tracked team's games, through the transfer from a made-up tracker backup.
    const backup = await madeUpBackup(pglite, league, fixtures);
    const work = await mkdtemp(path.join(tmpdir(), 'seed-tracker-'));
    try {
      const backupFolder = path.join(work, 'backup');
      await writeMadeUpTrackerBackup(backupFolder, backup);
      const admin = league.members.find((m) => m.role === 'admin');
      if (admin === undefined) throw new Error('The seed league has no admin to run the transfer.');
      const outcome = await transferTrackerGames({
        pglite,
        backupFolder,
        workDir: path.join(work, 'reading'),
        league: league.slug,
        season: league.season.slug,
        actorEmail: admin.email,
        dryRun: false,
        withOpponents: true,
        clock: { now: () => at },
      });
      if (
        !outcome.ok ||
        outcome.report === null ||
        outcome.report.stopped !== null ||
        !outcome.plan.ready ||
        outcome.plan.notBroughtOver.length > 0 ||
        outcome.report.transferred.length !== backup.games.length
      ) {
        const why = outcome.ok
          ? (outcome.report?.stopped ?? outcome.plan.problem)
          : outcome.problem;
        throw new Error(`Seeding failed at the tracker transfer: ${JSON.stringify(why)}`);
      }
    } finally {
      await rm(work, { recursive: true, force: true, maxRetries: 5 });
    }
  } finally {
    await db.close();
  }
  return { slug: league.slug, name: league.name, created: true };
}

/**
 * The file's weeks as the schedule's rounds: one round for each, on its day, and every game
 * moved into its week, each a change to the schedule draft, as the schedule builder makes
 * them (the import itself keeps no round yet, step 2.166). The simulated league
 * (simulate-league.ts, step 2.236) puts its games in rounds the same way.
 */
export async function putInRounds<Tx extends SchedulingTx>(
  pglite: PGlite,
  as: CommandContext,
  seasonId: string,
  fixtures: readonly DraftFixture[],
  deps: CommandDeps<Tx>,
): Promise<void> {
  const teamIds = new Map(
    (
      await pglite.query<{ id: string; name: string }>(
        'select id, name from teams where season_id = $1 and deleted_at is null',
        [seasonId],
      )
    ).rows.map((row) => [row.name, row.id]),
  );
  let draft = must('the schedule draft', await getScheduleDraft(as, { seasonId }, deps));
  let basis = {
    seasonId,
    basedOnRevision: draft.latestRevision,
    draftId: draft.draft?.id ?? null,
    version: draft.draft?.version ?? null,
  };
  const weeks = new Map<string, { id: string; date: string }>();
  for (const fixture of fixtures) {
    const label = fixture.round ?? '';
    if (label === '' || weeks.has(label)) continue;
    const week = { id: randomUUID(), date: fixture.date };
    const added = must(
      'a round',
      await addDraftRound(as, { ...basis, roundId: week.id, label, date: week.date }, deps),
    );
    basis = { ...basis, draftId: added.draftId, version: added.version };
    weeks.set(label, week);
  }
  draft = must('the schedule draft', await getScheduleDraft(as, { seasonId }, deps));
  for (const fixture of fixtures) {
    const week = weeks.get(fixture.round ?? '');
    if (week === undefined) continue;
    const game = draft.result.games.find(
      (g) =>
        g.date === fixture.date &&
        g.homeTeamId === teamIds.get(fixture.homeTeamId) &&
        g.awayTeamId === teamIds.get(fixture.awayTeamId),
    );
    if (game === undefined) throw new Error('Seeding failed at the rounds: a game is missing.');
    const moved = must(
      'putting a game in its round',
      await moveDraftGame(
        as,
        {
          ...basis,
          gameId: game.id,
          roundId: week.id,
          date: game.date,
          time: game.time,
          venueId: game.venueId,
          court: game.court,
        },
        deps,
      ),
    );
    basis = { ...basis, draftId: moved.draftId, version: moved.version };
  }
}

/**
 * The made-up backup: the tracked team and the teams it played, their players, and the
 * tracked team's games as the fixtures file has them, each starting at its local time in
 * the league's time zone.
 */
async function madeUpBackup(
  pglite: PGlite,
  league: DemoLeague,
  fixtures: readonly DraftFixture[],
): Promise<MadeUpBackup> {
  const { all, tracked } = trackerTeams(league);
  const games = fixtures.filter(
    (f) => f.homeTeamId === tracked.name || f.awayTeamId === tracked.name,
  );
  const names = new Set(games.flatMap((g) => [g.homeTeamId, g.awayTeamId]));
  const teams = all.filter((team) => names.has(team.name));
  const keyOf = (name: string) => teams.find((team) => team.name === name)!.shortName;
  const instants: number[] = [];
  for (const game of games) {
    const { rows } = await pglite.query<{ at: number }>(
      `select (extract(epoch from ($1::timestamp at time zone $2)) * 1000)::float8 as at`,
      [`${game.date} ${game.time ?? '00:00'}`, league.timeZone],
    );
    instants.push(rows[0]!.at);
  }
  return {
    season: league.season.slug,
    teams: teams.map((team) => ({
      key: team.shortName,
      name: team.name,
      tracked: team.shortName === tracked.shortName,
      strength: team.strength,
    })),
    players: teams.flatMap((team) =>
      (league.trackerPlayers[team.shortName] ?? []).map(([jersey, name]) => ({
        team: team.shortName,
        jersey,
        name,
      })),
    ),
    games: games.map((game, n) => ({
      number: game.gameNumber,
      home: keyOf(game.homeTeamId),
      away: keyOf(game.awayTeamId),
      startsAt: instants[n]!,
    })),
  };
}
