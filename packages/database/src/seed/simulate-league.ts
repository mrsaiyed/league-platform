// Development-only (T-195, T-201), step 2.236: plays a made-up league of any size
// (simulate-league-plan.ts) from empty to its final tables in a PGlite database that has
// every migration applied. Made-up data only: it takes a PGlite, never an address.
//
// Everything goes through the product's own commands, in the order a league's admin would
// work, as step 2.59's demo league is loaded (seed-demo-league.ts):
// 1. Our own staff creates the league with its season; its owner publishes the starting
//    design, makes it live, opens the season on the high-school rules, and adds the
//    divisions, the teams, each team's gym, and its people put on its roster.
// 2. The schedule: the plan's games are written as a fixtures file and brought in through
//    the fixture import, which puts them all in the schedule draft in one go (the draft's
//    own commands take one game at a time); the games are put in their rounds and the
//    tracked ones set to be recorded live, each with the schedule builder's own commands;
//    then the schedule is published.
// 3. The results, game day by game day: a tracked game is opened to score on one device
//    and its plays sent through the tracker's door (games.apply_tracker_commands), which
//    ends it with the real engine's End game; any other game gets its final score
//    (games.record_final_score). Standings follow each result through the event handlers.
//    The games a real season loses or changes (part 2) go through `callOff` below: postponed
//    (games.postpone_game), cancelled (games.cancel_game), put back (games.put_game_back),
//    forfeited (games.record_forfeit), reopened with a reason (games.reopen_game) and typed
//    in again; one tracked game is level after regulation and won in overtime.
//
// The season is a past one, on the plan's own dates, and the whole play acts at one fixed
// moment, the day after its last game: no command reads the system clock.
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import {
  maxCommandsPerBatch,
  seasonRulesPreset,
  startingDesign,
  trackerProtocolVersion,
} from '@srleagues/contracts';
import {
  addToRoster,
  applyFixtureImport,
  applyTrackerCommands,
  cancelGame,
  createDivision,
  createLeague,
  createPerson,
  createTeam,
  createVenue,
  eventHandlers,
  getFixtureImport,
  getScheduleDraft,
  openScoringSession,
  postponeGame,
  publishSchedule,
  publishSiteDesign,
  putGameBack,
  readFixtureImport,
  rebuildStandings,
  readFixtureSheet,
  recordFinalScore,
  recordForfeit,
  releaseScoringSession,
  reopenGame,
  setDraftRecording,
  setLeagueStatus,
  setSeasonRules,
  startFixtureImport,
  updateSeason,
  type AccessTx,
  type CommandContext,
  type CommandDeps,
  type GamesTx,
  type ImportScoresTx,
  type LeaguesTx,
  type PeopleTx,
  type SchedulingTx,
  type StandingsTx,
  type TeamsTx,
  type TrackerTx,
} from '@srleagues/core';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  accessStore,
  activityLogStore,
  divisionsStore,
  gamesStore,
  importsStore,
  jobsStore,
  leaguesStore,
  liveGamesStore,
  peopleStore,
  schedulingStore,
  scoringSessionsStore,
  standingsStore,
  teamsStore,
} from '../stores/index.ts';
import { seedStaff } from './seed-data.ts';
import { putInRounds } from './seed-demo-league.ts';
import {
  fixturesFileOf,
  planSimulation,
  type CallOff,
  type PlannedGame,
  simulatedOwner,
  type PlannedPlay,
  type SimulationOptions,
  type SimulationPlan,
} from './simulate-league-plan.ts';

type SimulationTx = LeaguesTx &
  TeamsTx &
  PeopleTx &
  AccessTx &
  SchedulingTx &
  ImportScoresTx &
  StandingsTx &
  GamesTx &
  TrackerTx;

/** What the play made, for the self-check (simulate-league-check.ts) to read back. */
export type PlayedLeague = {
  readonly plan: SimulationPlan;
  readonly leagueId: string;
  readonly seasonId: string;
  /** The database's game ids of the plan's games, by game number. */
  readonly gameIds: ReadonlyMap<number, string>;
  /** Seconds each part took, in the order they ran. */
  readonly timings: readonly { readonly part: string; readonly seconds: number }[];
  /**
   * What one schedule-draft command took while the games were put in rounds: the first
   * tenth of them and the last tenth, in milliseconds each. Every draft edit replays the
   * draft's changes so far (packages/core, draft-edit.ts), so the last cost more.
   */
  readonly moves: { readonly count: number; readonly firstMs: number; readonly lastMs: number };
};

/** The device the simulation scores on, as a scoring session names it. */
const simulatorDevice = 'simulator-tracker';

function must<T>(what: string, result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok)
    throw new Error(`The simulation failed at ${what}: ${JSON.stringify(result.error)}`);
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

/** The stores every simulation command runs on, at one fixed moment; no event handlers. */
function simulationDeps(
  db: ReturnType<typeof createDatabase>,
  staffId: string,
  at: number,
): CommandDeps<SimulationTx> {
  const transaction = commandTransaction(db, (scope: LeagueScope) => ({
    jobs: jobsStore(scope),
    leagues: leaguesStore(scope, { platformStaff: [staffId] }),
    divisions: divisionsStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
    teams: teamsStore(scope),
    people: peopleStore(scope),
    scheduling: schedulingStore(scope),
    imports: importsStore(scope),
    games: gamesStore(scope),
    scoringSessions: scoringSessionsStore(scope),
    liveGames: liveGamesStore(scope),
    clock: { now: () => at },
    standings: standingsStore(scope),
  }));
  return { transaction, events: [], log: () => {}, now: () => at };
}

/**
 * The standings worked out again by the product's own command (`rebuildStandings`), as the
 * league's owner: what the tests do after planting a fault in the stored games, so that the
 * check meets a table the product rebuilt from them, not a stale one.
 */
export async function rebuildSimulatedStandings(
  pglite: PGlite,
  played: Pick<PlayedLeague, 'leagueId' | 'seasonId'>,
): Promise<void> {
  const staffId = await accountId(pglite, seedStaff.email, seedStaff.displayName);
  const ownerId = await accountId(pglite, simulatedOwner.email, simulatedOwner.displayName);
  const db = createDatabase({ kind: 'pglite', pglite });
  try {
    must(
      'rebuilding the standings',
      await rebuildStandings(
        { leagueId: played.leagueId, accountId: ownerId, requestId: 'simulate-rebuild' },
        { seasonId: played.seasonId },
        simulationDeps(db, staffId, Date.now()),
      ),
    );
  } finally {
    await db.close();
  }
}

/** The game as the product holds it now: its version and its two teams. */
async function gameNow(
  context: CommandContext,
  gameId: string,
  deps: CommandDeps<SimulationTx>,
): Promise<{ version: number; homeTeamId: string; awayTeamId: string }> {
  const found = await deps.transaction(context, (tx) => tx.games.find(gameId));
  if (found === undefined) throw new Error(`The simulation failed: game ${gameId} is gone.`);
  return { version: found.version, homeTeamId: found.homeTeamId, awayTeamId: found.awayTeamId };
}

/** A final score typed in, as a scorer or the admin does after the game. */
async function finalScore(
  context: CommandContext,
  game: PlannedGame,
  gameId: string,
  score: { home: number; away: number },
  deps: CommandDeps<SimulationTx>,
): Promise<void> {
  const { version } = await gameNow(context, gameId, deps);
  must(
    `the final score of game ${game.number}`,
    await recordFinalScore(
      context,
      { gameId, version, homeScore: score.home, awayScore: score.away },
      deps,
    ),
  );
}

/**
 * A game the season loses or changes (simulate-league-plan.ts, `CallOff`), each step through
 * the product's own command, as the league's admin: the person whose role calls games off
 * (`games.results`) and corrects them (`games.correct`).
 */
async function callOff(
  admin: CommandContext,
  game: PlannedGame,
  gameId: string,
  off: CallOff,
  deps: CommandDeps<SimulationTx>,
): Promise<void> {
  const step = async (
    what: string,
    run: (version: number) => Promise<Parameters<typeof must>[1]>,
  ) => must(`${what} game ${game.number}`, await run((await gameNow(admin, gameId, deps)).version));
  const planned = { home: game.homeScore, away: game.awayScore };
  switch (off.kind) {
    case 'postponed-then-played':
    case 'postponed-waiting':
      await step('postponing', (version) => postponeGame(admin, { gameId, version }, deps));
      if (off.kind === 'postponed-waiting') return;
      await step('putting back', (version) =>
        putGameBack(admin, { gameId, version, reason: 'willBePlayed' }, deps),
      );
      return finalScore(admin, game, gameId, planned, deps);
    case 'cancelled':
    case 'cancelled-then-played':
      await step('cancelling', (version) => cancelGame(admin, { gameId, version }, deps));
      if (off.kind === 'cancelled') return;
      await step('putting back', (version) =>
        putGameBack(admin, { gameId, version, reason: 'cancelledByMistake' }, deps),
      );
      return finalScore(admin, game, gameId, planned, deps);
    case 'forfeit': {
      const now = await gameNow(admin, gameId, deps);
      const forfeitingTeamId = off.forfeiting === 'home' ? now.homeTeamId : now.awayTeamId;
      must(
        `the forfeit of game ${game.number}`,
        await recordForfeit(admin, { gameId, version: now.version, forfeitingTeamId }, deps),
      );
      return;
    }
    case 'corrected':
      await finalScore(admin, game, gameId, off.first, deps);
      await step('reopening', (version) =>
        reopenGame(
          admin,
          { gameId, version, reason: 'The score was entered the wrong way round.' },
          deps,
        ),
      );
      return finalScore(admin, game, gameId, planned, deps);
  }
}

/** Makes the plan's league and plays its season (above); `options` or a plan already made. */
export async function simulateLeagueInto(
  pglite: PGlite,
  options: SimulationOptions | SimulationPlan,
): Promise<PlayedLeague> {
  const plan = 'games' in options ? options : planSimulation(options);
  const timings: { part: string; seconds: number }[] = [];
  let mark = performance.now();
  const lap = (part: string) => {
    const now = performance.now();
    timings.push({ part, seconds: Math.round(now - mark) / 1000 });
    mark = now;
  };
  const lastDay =
    plan.games
      .map((g) => g.date)
      .sort()
      .at(-1) ?? '2025-11-07';
  const at = Date.parse(`${lastDay}T18:00:00Z`) + 86_400_000;
  const staffId = await accountId(pglite, seedStaff.email, seedStaff.displayName);
  const ownerId = await accountId(pglite, simulatedOwner.email, simulatedOwner.displayName);
  const leagueId = (await pglite.query<{ id: string }>('select uuid_v7() as id')).rows[0]!.id;
  const db = createDatabase({ kind: 'pglite', pglite });
  try {
    const setUp = simulationDeps(db, staffId, at);
    const deps: CommandDeps<SimulationTx> = { ...setUp, events: eventHandlers };
    const as = (actor: string | null): CommandContext => ({
      leagueId,
      accountId: actor,
      requestId: `simulate-${plan.options.seed}`,
    });
    const owner = as(ownerId);
    const seasonId = await setUpLeague(pglite, plan, as(staffId), owner, ownerId, setUp, deps);
    lap('league, divisions, teams and rosters');
    const { gameIds, moves } = await schedule(
      pglite,
      plan,
      owner,
      seasonId,
      as(null),
      setUp,
      deps,
      lap,
    );
    let tracked = 0;
    let finals = 0;
    let calledOff = 0;
    for (const game of plan.games) {
      const gameId = gameIds.get(game.number)!;
      const started = performance.now();
      if (game.plays !== null) {
        await scoreLive(pglite, plan, owner, game, gameId, deps);
        tracked += performance.now() - started;
      } else if (game.callOff === null) {
        await finalScore(owner, game, gameId, { home: game.homeScore, away: game.awayScore }, deps);
        finals += performance.now() - started;
      } else {
        await callOff(owner, game, gameId, game.callOff, deps);
        calledOff += performance.now() - started;
      }
    }
    lap('results');
    timings.pop();
    timings.push({ part: 'final scores', seconds: Math.round(finals) / 1000 });
    timings.push({ part: 'tracked games', seconds: Math.round(tracked) / 1000 });
    timings.push({ part: 'called-off games', seconds: Math.round(calledOff) / 1000 });
    return { plan, leagueId, seasonId, gameIds, timings, moves };
  } finally {
    await db.close();
  }
}

/** Step 1: the league, its season, divisions, teams, gyms and rosters. The season's id. */
async function setUpLeague(
  pglite: PGlite,
  plan: SimulationPlan,
  staff: CommandContext,
  owner: CommandContext,
  ownerId: string,
  setUp: CommandDeps<SimulationTx>,
  deps: CommandDeps<SimulationTx>,
): Promise<string> {
  const created = must(
    'the league',
    await createLeague(
      staff,
      {
        slug: plan.slug,
        name: plan.name,
        timeZone: plan.timeZone,
        audience: 'adult',
        ownerAccountId: ownerId,
        sportKey: 'basketball',
        firstSeason: { ...plan.season },
      },
      setUp,
    ),
  );
  const seasonId = created.firstSeasonId;
  if (seasonId === null) throw new Error('The simulation failed at the season: there is none.');
  const design = 'clean-court';
  must(
    'the site design',
    await publishSiteDesign(
      owner,
      { startingDesign: design, design: startingDesign(design), sinceRelease: 0 },
      setUp,
    ),
  );
  must(
    'the league status',
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
  for (const division of plan.divisions) {
    const { divisionId } = must(
      'a division',
      await createDivision(owner, { seasonId, name: division.name }, setUp),
    );
    for (const team of division.teams) {
      const { teamId } = must(
        'a team',
        await createTeam(
          owner,
          {
            seasonId,
            divisionId,
            name: team.name,
            shortName: team.shortName,
            color: team.color,
            statsVisibility: 'everyone',
          },
          setUp,
        ),
      );
      must(
        'a gym',
        await createVenue(owner, { name: team.venue.name, address: team.venue.address }, setUp),
      );
      for (const player of team.players) {
        const { personId } = must(
          'a person',
          await createPerson(
            owner,
            { firstName: player.firstName, lastName: player.lastName },
            setUp,
          ),
        );
        must(
          'a roster place',
          await addToRoster(
            owner,
            { teamId, personId, jerseyNumber: player.jersey, role: 'player' },
            setUp,
          ),
        );
      }
    }
  }
  return seasonId;
}

/** Step 2: the fixtures import, the rounds, the tracked games set live, the publish. */
async function schedule(
  pglite: PGlite,
  plan: SimulationPlan,
  owner: CommandContext,
  seasonId: string,
  worker: CommandContext,
  setUp: CommandDeps<SimulationTx>,
  deps: CommandDeps<SimulationTx>,
  lap: (part: string) => void,
): Promise<{ gameIds: Map<number, string>; moves: PlayedLeague['moves'] }> {
  const fileText = fixturesFileOf(plan);
  const started = must(
    'starting the fixture import',
    await startFixtureImport(
      owner,
      { seasonId, fileName: 'simulated-fixtures.csv', fileText },
      setUp,
    ),
  );
  // Read as the worker reads it: in the league's transaction, acting for nobody.
  await setUp.transaction(worker, (tx) => readFixtureImport(tx, started.importId));
  const view = must(
    'the fixture import preview',
    await getFixtureImport(owner, { importId: started.importId }, setUp),
  );
  if (view.status !== 'ready' || view.problems.length > 0 || view.warnings.length > 0) {
    throw new Error(
      `The simulation failed at the fixture import: ${JSON.stringify([view.problems, view.warnings])}`,
    );
  }
  must(
    'applying the fixture import',
    await applyFixtureImport(owner, { importId: started.importId, version: view.version }, setUp),
  );
  const names = plan.divisions.flatMap((d) => d.teams.map((t) => ({ id: t.name, name: t.name })));
  const venues = plan.divisions.flatMap((d) =>
    d.teams.map((t) => ({ id: t.venue.name, name: t.venue.name })),
  );
  const fixtures = readFixtureSheet(fileText, { teams: names, venues }).fixtures;
  lap('schedule: the fixture import');
  // Each draft command timed as it runs (its whole transaction), to see where time goes.
  const took: number[] = [];
  const timed: CommandDeps<SimulationTx> = {
    ...setUp,
    transaction: async (context, work) => {
      const from = performance.now();
      try {
        return await setUp.transaction(context, work);
      } finally {
        took.push(performance.now() - from);
      }
    },
  };
  await putInRounds(pglite, owner, seasonId, fixtures, timed);
  lap('schedule: games put in rounds');
  const tenth = Math.max(1, Math.floor(took.length / 10));
  const average = (part: number[]) =>
    Math.round((10 * part.reduce((s, t) => s + t, 0)) / Math.max(1, part.length)) / 10;
  const moves = {
    count: took.length,
    firstMs: average(took.slice(0, tenth)),
    lastMs: average(took.slice(-tenth)),
  };

  // The draft's games, matched to the plan's by day and teams.
  const teamIds = new Map(
    (
      await pglite.query<{ id: string; name: string }>(
        'select id, name from teams where season_id = $1 and deleted_at is null',
        [seasonId],
      )
    ).rows.map((row) => [row.name, row.id]),
  );
  let draft = must('the schedule draft', await getScheduleDraft(owner, { seasonId }, setUp));
  const gameIds = new Map<number, string>();
  for (const game of plan.games) {
    const found = draft.result.games.find(
      (g) =>
        g.date === game.date &&
        g.homeTeamId === teamIds.get(game.home) &&
        g.awayTeamId === teamIds.get(game.away),
    );
    if (found === undefined)
      throw new Error(`The simulation failed: game ${game.number} is missing.`);
    gameIds.set(game.number, found.id);
  }
  let basis = {
    seasonId,
    basedOnRevision: draft.latestRevision,
    draftId: draft.draft?.id ?? null,
    version: draft.draft?.version ?? null,
  };
  for (const game of plan.games) {
    if (game.plays === null) continue;
    const set = must(
      'setting a game to be recorded live',
      await setDraftRecording(
        owner,
        { ...basis, gameId: gameIds.get(game.number)!, recording: 'live' },
        setUp,
      ),
    );
    basis = { ...basis, draftId: set.draftId, version: set.version };
  }
  draft = must('the schedule draft', await getScheduleDraft(owner, { seasonId }, setUp));
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
  lap('schedule: tracked games set live, published');
  return { gameIds, moves };
}

/** Step 3, a tracked game: opened on one device, its plays sent, then let go. */
async function scoreLive(
  pglite: PGlite,
  plan: SimulationPlan,
  owner: CommandContext,
  game: PlannedGame,
  gameId: string,
  deps: CommandDeps<SimulationTx>,
): Promise<void> {
  const roster = async (teamName: string) =>
    (
      await pglite.query<{ person_id: string }>(
        `select roster_entries.person_id from roster_entries
         join teams on teams.id = roster_entries.team_id
         where teams.league_id = $1 and teams.name = $2 and roster_entries.left_on is null
         order by roster_entries.jersey_number::int`,
        [owner.leagueId, teamName],
      )
    ).rows.map((row) => row.person_id);
  const players = { home: await roster(game.home), away: await roster(game.away) };
  const startsAt = (
    await pglite.query<{ at: number }>(
      'select (extract(epoch from starts_at) * 1000)::float8 as at from games where id = $1',
      [gameId],
    )
  ).rows[0]?.at;
  if (startsAt === undefined)
    throw new Error(`The simulation failed: game ${game.number} has no start.`);
  const opened = must(
    `opening game ${game.number} to score`,
    await openScoringSession(owner, { gameId, deviceId: simulatorDevice }, deps),
  );
  if (opened.status !== 'held-by-you') {
    throw new Error(`The simulation failed at opening game ${game.number}: ${opened.status}`);
  }
  const input = (play: PlannedPlay) => {
    switch (play.type) {
      case 'lineup':
        return {
          type: play.type,
          side: play.side,
          playerIds: play.players.map((p) => players[play.side][p]!),
        };
      case 'score':
        return {
          type: play.type,
          side: play.side,
          playerId: players[play.side][play.player]!,
          points: play.points,
        };
      case 'foul':
        return { type: play.type, side: play.side, playerId: players[play.side][play.player]! };
      default:
        return play;
    }
  };
  // Twenty seconds a play keeps every period well inside its eight minutes.
  const commands = (game.plays ?? []).map((play, k) => ({
    commandId: randomUUID(),
    at: startsAt + (k + 1) * 20_000,
    input: input(play),
  }));
  // Sent as the tracker sends them: in batches no larger than its protocol allows.
  for (let from = 0; from < commands.length; from += maxCommandsPerBatch) {
    const sent = must(
      `scoring game ${game.number}`,
      await applyTrackerCommands(
        owner,
        {
          gameId,
          protocolVersion: trackerProtocolVersion,
          sessionId: opened.sessionId,
          commands: commands.slice(from, from + maxCommandsPerBatch),
        },
        deps,
      ),
    );
    const refused = sent.results.find((answer) => answer.status !== 'accepted');
    if (refused !== undefined) {
      throw new Error(
        `The simulation failed at scoring game ${game.number}: ${JSON.stringify(refused)} (${JSON.stringify(
          commands.find((c) => c.commandId === refused.commandId)?.input,
        )}, play ${commands.findIndex((c) => c.commandId === refused.commandId) + 1} of ${commands.length})`,
      );
    }
  }
  must(
    `letting game ${game.number} go`,
    await releaseScoringSession(owner, { gameId, sessionId: opened.sessionId }, deps),
  );
}
