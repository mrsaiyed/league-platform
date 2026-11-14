// Every role against every command (T4 §12): the ones allowed succeed, all others
// are refused with "not-allowed". Against the real database as the app's role, each
// run in a league of its own, so one run cannot change what the next one sees.
//
// Each row says which permission the spec gives the command (T4 §4) and where it
// applies. Who holds each permission is written out here from the spec (P4 §3 and
// §4, O-7, A-6, U-9), not read from the permission table in core, and who should
// succeed follows from those two. So a command that checks the wrong permission
// fails, and so does a role given the wrong permissions in core. A command in core's
// registry with no row here fails, and so does one whose own named permission is
// not what its rows say the spec needs, or that names none.
//
// A new command joins by adding its row: its name, the permission, the scope, and
// how to make a valid input. Every permission of stage 2 is already in the table of
// who holds what, so the expected outcomes follow with nothing more to write.
//
// Club admins, coaches and captains are not here: their scopes (a club, a team)
// cannot be granted until those tables exist (0004). Their permissions are tested
// in core (modules/access/policy.test.ts), and they join this matrix with the
// clubs and teams step.
import { defaultSeasonRules } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { createHash, randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import {
  acceptInvitation,
  assignScorekeeper,
  cancelInvitation,
  commands,
  listMyGames,
  unassignScorekeeper,
  createCourt,
  createDivision,
  cancelGame,
  createLeague,
  createPerson,
  clearSettingFor,
  createSeason,
  addDraftGame,
  addToRoster,
  applyFixtureImport,
  discardFixtureImport,
  getFixtureImport,
  recordImportedScores,
  startFixtureImport,
  undoFixtureImport,
  type ImportScoresTx,
  changeDraftRoundDate,
  discardScheduleDraft,
  getScheduleDraft,
  previewSchedulePublish,
  publishSchedule,
  moveDraftGame,
  removeDraftGame,
  renameDraftRound,
  setDraftRecording,
  swapDraftGames,
  changeRosterEntry,
  createTeam,
  listRoster,
  markLeft,
  reorderRoster,
  createVenue,
  invite,
  listDivisions,
  listPeople,
  listPostponedGames,
  postponeGame,
  recordFinalScore,
  setBoxScore,
  getBoxScoreSheet,
  recordForfeit,
  reopenGame,
  listVenues,
  removeCourt,
  removeDivision,
  removePerson,
  removeTeam,
  removeVenue,
  reorderDivisions,
  restoreCourt,
  restoreDivision,
  restoreVenue,
  updateCourt,
  updateDivision,
  updatePerson,
  setTeamStatsVisibility,
  updateTeam,
  updateVenue,
  declaredSettings,
  defineSetting,
  setSettingFor,
  settingRegistry,
  listAccess,
  listActivity,
  myAccess,
  openScoringSession,
  releaseScoringSession,
  renewScoringSession,
  takeOverScoring,
  applyTrackerCommands,
  readTrackerRosters,
  readTrackerState,
  endTrackedGame,
  engineRulesOf,
  renameShortName,
  resendInvitation,
  revokeGrant,
  setCurrentSeason,
  getSeason,
  updateSeason,
  setSeasonRules,
  previewSeasonRules,
  setSeasonRosterSettings,
  setLeagueName,
  setLeagueStatus,
  type AccessTx,
  type CommandContext,
  type CommandRequirement,
  type CommandDeps,
  type GamesTx,
  type Job,
  type LeaguesTx,
  type Permission,
  type PeopleTx,
  type SchedulingTx,
  type ScoringTx,
  type TrackerTx,
  type SettingRegistry,
  type StandingsTx,
  type TeamsTx,
  addAdjustment,
  rebuildStandings,
  removeAdjustment,
} from '@srleagues/core';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newAccount,
  newCourt,
  newDivision,
  newGame,
  newLeague,
  newPerson,
  newStage,
  newProgram,
  newRosterEntry,
  newRound,
  newSeason,
  newTeam,
  newVenue,
  one,
  unique,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { gamesStore } from './games-store.ts';
import { divisionsStore } from './divisions-store.ts';
import { leaguesStore } from './leagues-store.ts';
import { peopleStore } from './people-store.ts';
import { importsStore } from './imports-store.ts';
import { schedulingStore } from './scheduling-store.ts';
import { scoringSessionsStore } from './scoring-sessions-store.ts';
import { liveGamesStore } from './live-games-store.ts';
import { standingsStore } from './standings-store.ts';
import { teamsStore } from './teams-store.ts';

const actors = [
  'owner',
  'admin',
  'program_admin',
  'registrar',
  'scheduler',
  'editor',
  'scorekeeper',
  'program_scheduler',
  'no_role',
  'revoked_admin',
  'staff',
  'visitor',
] as const;
type Actor = (typeof actors)[number];
const signedIn = actors.filter((a) => a !== 'visitor');

type League = MadeLeague & { programId: string; accountOf: (actor: Actor) => string | null };
type Outcome = { readonly ok: boolean; readonly error?: { readonly code: string } };
type Row = {
  readonly command: string;
  readonly name: string;
  /** The permission the spec says this needs (T4 §4), written from the spec. */
  readonly needs: CommandRequirement;
  /** Where this call applies: the whole league (the default) or the league's program. */
  readonly scope?: 'league' | 'program';
  /** The row's permission is the setting's own, not the one the command names. */
  readonly declared?: true;
  /** The input, made valid for this league, and the league the call is for. */
  readonly prepare: (league: League) => Promise<{ input: unknown; leagueId?: string }>;
  readonly run: (context: CommandContext, input: unknown) => Promise<Outcome>;
};

/** The scoring session commands' clock (T-116): fixed, so leases never depend on the time of day. */
const matrixNow = Date.UTC(2026, 11, 6, 18, 0, 30);

let pglite: PGlite;
let db: DatabaseHandle;
let staffId: string;
let accessDeps: CommandDeps<AccessTx>;
let leaguesDeps: CommandDeps<LeaguesTx & StandingsTx>;
let schedulingDeps: CommandDeps<SchedulingTx>;
let gamesDeps: CommandDeps<GamesTx>;
let scoringDeps: CommandDeps<ScoringTx>;
let trackerDeps: CommandDeps<TrackerTx>;
let peopleDeps: CommandDeps<PeopleTx>;
let teamsDeps: CommandDeps<TeamsTx>;
let standingsDeps: CommandDeps<StandingsTx>;
let importsDeps: CommandDeps<ImportScoresTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  staffId = await newAccount(pglite);
  const transaction = commandTransaction(db, (scope) => ({
    jobs: { enqueue: async (_job: Job) => {} },
    leagues: leaguesStore(scope, { platformStaff: [staffId] }),
    divisions: divisionsStore(scope),
    scheduling: schedulingStore(scope),
    imports: importsStore(scope),
    games: gamesStore(scope),
    scoringSessions: scoringSessionsStore(scope),
    liveGames: liveGamesStore(scope),
    clock: { now: () => matrixNow },
    people: peopleStore(scope),
    teams: teamsStore(scope),
    standings: standingsStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  const rest = { log: () => {}, now: () => 0 };
  standingsDeps = { transaction, events: [], ...rest };
  accessDeps = { transaction, events: [], ...rest };
  leaguesDeps = { transaction, events: [], ...rest };
  schedulingDeps = { transaction, events: [], ...rest };
  gamesDeps = { transaction, events: [], ...rest };
  scoringDeps = { transaction, events: [], ...rest };
  trackerDeps = { transaction, events: [], ...rest };
  peopleDeps = { transaction, events: [], ...rest };
  teamsDeps = { transaction, events: [], ...rest };
  importsDeps = { transaction, events: [], ...rest };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

async function grant(leagueId: string, role: string, scope: string | null = null) {
  const accountId = await newAccount(pglite);
  await pglite.query(
    `insert into role_grants (league_id, account_id, role, scope_type, scope_id)
     values ($1, $2, $3, $4, $5)`,
    [leagueId, accountId, role, scope === null ? 'league' : 'program', scope],
  );
  return accountId;
}

/** A league with one account per actor. */
async function leagueWithActors(): Promise<League> {
  const made = await newLeague(pglite);
  const programId = await newProgram(pglite, made.leagueId);
  const ids = new Map<Actor, string>([
    ['owner', made.ownerId],
    ['admin', await grant(made.leagueId, 'admin')],
    ['program_admin', await grant(made.leagueId, 'admin', programId)],
    ['registrar', await grant(made.leagueId, 'registrar')],
    ['scheduler', await grant(made.leagueId, 'scheduler')],
    ['editor', await grant(made.leagueId, 'editor')],
    ['scorekeeper', await grant(made.leagueId, 'scorekeeper')],
    ['program_scheduler', await grant(made.leagueId, 'scheduler', programId)],
    ['no_role', await newAccount(pglite)],
    ['revoked_admin', await grant(made.leagueId, 'admin')],
    ['staff', staffId],
  ]);
  await pglite.query(
    `update role_grants set revoked_at = now() where league_id = $1 and account_id = $2`,
    [made.leagueId, ids.get('revoked_admin')],
  );
  return { ...made, programId, accountOf: (actor) => ids.get(actor) ?? null };
}

/** An open invitation sent by the owner, to the whole league or one program. */
async function invitationIn(
  league: League,
  { token = randomUUID(), program = false }: { token?: string; program?: boolean } = {},
) {
  const row = await one<{ id: string }>(
    pglite,
    `insert into invitations (league_id, email, role, scope_type, scope_id, token_hash,
                              invited_by_account_id, expires_at)
     values ($1, $2, 'scorekeeper', $3, $4, $5, $6, now() + interval '7 days') returning id`,
    [
      league.leagueId,
      `${unique('invitee')}@example.test`,
      program ? 'program' : 'league',
      program ? league.programId : null,
      sha256(token),
      league.ownerId,
    ],
  );
  return row.id;
}

/** A grant to a new account, by its id. */
async function grantId(leagueId: string, role: string, scope: string | null = null) {
  const accountId = await grant(leagueId, role, scope);
  const row = await one<{ id: string }>(
    pglite,
    'select id from role_grants where account_id = $1',
    [accountId],
  );
  return row.id;
}

/** O-7: what not even an admin may do. */
const ownerOnly: readonly Permission[] = [
  'league.payout',
  'league.transfer_ownership',
  'league.delete',
];

type LesserRole = 'registrar' | 'scheduler' | 'editor' | 'scorekeeper';

/**
 * P4 §4, for the roles below the admin that this matrix grants (the areas of P4 §3
 * as T4 §4 names their permissions). The owner holds everything; an admin all but
 * `ownerOnly`. Written again, by hand, from the spec: not read from core.
 */
const heldBy: Readonly<Record<LesserRole, readonly Permission[]>> = {
  // "Registration and People"
  registrar: [
    'registration.manage',
    'registration.read_answers',
    'people.read',
    'people.manage',
    'people.read_sensitive',
    'people.import',
  ],
  // "Schedule and Games": venues, the draft, publishing, importing; assigning
  // scorekeepers, scoring, forfeits and postponements, corrections.
  scheduler: [
    'schedule.read',
    'schedule.edit',
    'schedule.publish',
    'schedule.import',
    'venues.manage',
    'games.manage',
    'games.score',
    'games.results',
    'games.correct',
  ],
  // "Site, news, media, awards, sponsors"
  editor: ['site.edit', 'site.publish', 'content.edit'],
  // "Score games", and see the list of their games
  scorekeeper: ['games.score', 'schedule.read'],
};

/** Who should succeed at a command needing `needs` at `scope`, from the tables above. */
function expectedActors(needs: CommandRequirement, scope: 'league' | 'program'): Actor[] {
  if (needs === 'signed-in') return [...signedIn];
  if (needs === 'platform-staff') return ['staff'];
  const allowed: Actor[] = ['owner'];
  if (!ownerOnly.includes(needs)) {
    allowed.push('admin');
    if (scope === 'program') allowed.push('program_admin');
  }
  for (const role of ['registrar', 'scheduler', 'editor', 'scorekeeper'] as const) {
    if (heldBy[role].includes(needs)) allowed.push(role);
  }
  if (scope === 'program' && heldBy.scheduler.includes(needs)) allowed.push('program_scheduler');
  return allowed;
}

/** The binned stand-in: a row put in the bin, for the restore commands. */
async function binned(table: 'divisions' | 'venues' | 'courts', id: string) {
  await pglite.query(`update ${table} set deleted_at = now() where id = $1`, [id]);
  return id;
}

/** A season of the default program, or of the league's other program. */
const seasonIn = (league: League, program: boolean) =>
  newSeason(pglite, league.leagueId, program ? league.programId : league.defaultProgramId);

const divisionIn = async (league: League, program: boolean) =>
  newDivision(pglite, league.leagueId, await seasonIn(league, program));

/** A division command's two rows: a season of the default program, and of the other one. */
function divisionRows(
  command: string,
  name: string,
  needs: Permission,
  prepare: (league: League, program: boolean) => Promise<unknown>,
  run: Row['run'],
): Row[] {
  return [false, true].map((program) => ({
    command,
    name: `${name} ${program ? 'of one program' : 'of the default program'}`,
    needs,
    ...(program ? { scope: 'program' as const } : {}),
    prepare: async (league) => ({ input: await prepare(league, program) }),
    run,
  }));
}

/** A team command's two rows: a season of the default program, and of the other one. */
function teamRows(
  command: string,
  name: string,
  prepare: (league: League, program: boolean) => Promise<unknown>,
  run: Row['run'],
): Row[] {
  return [false, true].map((program) => ({
    command,
    name: `${name} ${program ? 'of one program' : 'of the default program'}`,
    needs: 'teams.manage',
    ...(program ? { scope: 'program' as const } : {}),
    prepare: async (league) => ({ input: await prepare(league, program) }),
    run,
  }));
}

const teamIn = async (league: League, program: boolean) =>
  newTeam(pglite, league.leagueId, await seasonIn(league, program));

// Teams are checked at their season's program (P4 §4): the owner and admins.
const teamCommandRows: readonly Row[] = [
  ...teamRows(
    'teams.create_team',
    'add a team',
    async (league, program) => ({
      seasonId: await seasonIn(league, program),
      name: 'Hawks',
      shortName: 'hawks',
      statsVisibility: 'everyone',
    }),
    (c, i) => createTeam(c, i, teamsDeps),
  ),
  ...teamRows(
    'teams.update_team',
    'rename a team',
    async (league, program) => ({
      teamId: await teamIn(league, program),
      version: 1,
      name: 'Renamed',
    }),
    (c, i) => updateTeam(c, i, teamsDeps),
  ),
  ...teamRows(
    'teams.remove_team',
    'remove a team',
    async (league, program) => ({ teamId: await teamIn(league, program) }),
    (c, i) => removeTeam(c, i, teamsDeps),
  ),
  ...teamRows(
    'teams.set_stats_visibility',
    "set who sees a team's numbers",
    async (league, program) => ({
      teamId: await teamIn(league, program),
      version: 1,
      statsVisibility: 'staff',
    }),
    (c, i) => setTeamStatsVisibility(c, i, teamsDeps),
  ),
];

/** A roster command's rows: a team of a season of the default program, and of the other one. */
function rosterRows(
  command: string,
  name: string,
  prepare: (team: string, league: League) => Promise<unknown>,
  run: Row['run'],
): Row[] {
  return [false, true].map((program) => ({
    command,
    name: `${name} ${program ? 'of one program' : 'of the default program'}`,
    needs: 'rosters.manage',
    ...(program ? { scope: 'program' as const } : {}),
    prepare: async (league) => ({ input: await prepare(await teamIn(league, program), league) }),
    run,
  }));
}

// Rosters are checked at their team's season's program (P4 §4): the owner and admins.
const rosterCommandRows: readonly Row[] = [
  ...rosterRows(
    'teams.add_to_roster',
    'put a person on a team',
    async (teamId, league) => ({ teamId, personId: await newPerson(pglite, league.leagueId) }),
    (c, i) => addToRoster(c, i, teamsDeps),
  ),
  ...rosterRows(
    'teams.change_roster_entry',
    "change a player's number",
    async (teamId, league) => ({
      rosterEntryId: await newRosterEntry(
        pglite,
        league.leagueId,
        teamId,
        await newPerson(pglite, league.leagueId),
      ),
      version: 1,
      jerseyNumber: '12',
    }),
    (c, i) => changeRosterEntry(c, i, teamsDeps),
  ),
  ...rosterRows(
    'teams.reorder_roster',
    'reorder a roster',
    async (teamId, league) => ({
      teamId,
      rosterEntryIds: [
        await newRosterEntry(
          pglite,
          league.leagueId,
          teamId,
          await newPerson(pglite, league.leagueId),
        ),
      ],
    }),
    (c, i) => reorderRoster(c, i, teamsDeps),
  ),
  ...rosterRows(
    'teams.mark_left',
    'mark a player as left',
    async (teamId, league) => ({
      rosterEntryId: await newRosterEntry(
        pglite,
        league.leagueId,
        teamId,
        await newPerson(pglite, league.leagueId),
      ),
      version: 1,
      leftOn: '2026-12-01',
    }),
    (c, i) => markLeft(c, i, teamsDeps),
  ),
  ...rosterRows(
    'teams.list_roster',
    'see a roster',
    async (teamId) => ({ teamId }),
    (c, i) => listRoster(c, i, teamsDeps),
  ),
];

/** A season with a round, two games and a venue, of the default program or of the other one. */
async function scheduleIn(league: League, program: boolean) {
  const seasonId = await seasonIn(league, program);
  const stageId = await newStage(pglite, league.leagueId, seasonId);
  const roundId = await newRound(pglite, league.leagueId, seasonId, 1);
  const teams = [
    await newTeam(pglite, league.leagueId, seasonId),
    await newTeam(pglite, league.leagueId, seasonId),
    await newTeam(pglite, league.leagueId, seasonId),
  ] as [string, string, string];
  const game = (home: string, away: string, startsAt: string) =>
    newGame(pglite, {
      leagueId: league.leagueId,
      seasonId,
      stageId,
      homeTeamId: home,
      awayTeamId: away,
      columns: { round_id: roundId, starts_at: startsAt },
    });
  return {
    seasonId,
    roundId,
    teams,
    first: await game(teams[0], teams[1], '2026-12-06T18:00:00Z'),
    second: await game(teams[1], teams[2], '2026-12-13T18:00:00Z'),
    venueId: await newVenue(pglite, league.leagueId),
  };
}

/** A schedule command's two rows: a season of the default program, and of the other one. */
function scheduleRows(
  command: string,
  name: string,
  needs: Permission,
  prepare: (
    s: Awaited<ReturnType<typeof scheduleIn>>,
    league: League,
  ) => Promise<unknown> | unknown,
  run: Row['run'],
): Row[] {
  return [false, true].map((program) => ({
    command,
    name: `${name} ${program ? 'of one program' : 'of the default program'}`,
    needs,
    ...(program ? { scope: 'program' as const } : {}),
    prepare: async (league) => ({
      input: await prepare(await scheduleIn(league, program), league),
    }),
    run,
  }));
}

/** A draft on the season (before any publication) that moves its first game; its id. */
async function draftMovingFirstGame(
  s: Awaited<ReturnType<typeof scheduleIn>>,
  league: League,
): Promise<string> {
  const changes = {
    version: 1,
    changes: [
      {
        kind: 'move-game',
        gameId: s.first,
        to: { roundId: s.roundId, date: '2026-12-20', time: '19:00', venueId: null, court: null },
      },
    ],
  };
  const draft = await one<{ id: string }>(
    pglite,
    'insert into schedule_drafts (league_id, season_id, changes) values ($1, $2, $3::jsonb) returning id',
    [league.leagueId, s.seasonId, JSON.stringify(changes)],
  );
  return draft.id;
}

const firstEdit = (s: { seasonId: string }) => ({
  seasonId: s.seasonId,
  basedOnRevision: null,
  version: null,
  draftId: null,
});

// The schedule draft is edited at its season's program (P4 §3 `schedule.edit`): the owner,
// admins and schedulers; a scheduler limited to one program edits only that program's.
const scheduleDraftRows: readonly Row[] = [
  ...scheduleRows(
    'scheduling.add_draft_game',
    'add a game to the draft',
    'schedule.edit',
    (s) => ({
      ...firstEdit(s),
      gameId: randomUUID(),
      homeTeamId: s.teams[0],
      awayTeamId: s.teams[2],
      roundId: s.roundId,
      date: '2026-12-20',
      time: '20:00',
      venueId: s.venueId,
      court: null,
    }),
    (c, i) => addDraftGame(c, i, schedulingDeps),
  ),
  ...scheduleRows(
    'scheduling.move_draft_game',
    'move a game in the draft',
    'schedule.edit',
    (s) => ({
      ...firstEdit(s),
      gameId: s.first,
      roundId: s.roundId,
      date: '2026-12-20',
      time: '20:00',
      venueId: s.venueId,
      court: null,
    }),
    (c, i) => moveDraftGame(c, i, schedulingDeps),
  ),
  ...scheduleRows(
    'scheduling.swap_draft_games',
    'swap two games in the draft',
    'schedule.edit',
    (s) => ({ ...firstEdit(s), gameId: s.first, otherGameId: s.second }),
    (c, i) => swapDraftGames(c, i, schedulingDeps),
  ),
  ...scheduleRows(
    'scheduling.remove_draft_game',
    'remove a game in the draft',
    'schedule.edit',
    (s) => ({ ...firstEdit(s), gameId: s.first }),
    (c, i) => removeDraftGame(c, i, schedulingDeps),
  ),
  ...scheduleRows(
    'scheduling.rename_draft_round',
    'rename a round in the draft',
    'schedule.edit',
    (s) => ({ ...firstEdit(s), roundId: s.roundId, label: 'Rivalry week' }),
    (c, i) => renameDraftRound(c, i, schedulingDeps),
  ),
  ...scheduleRows(
    'scheduling.change_draft_round_date',
    "change a round's date in the draft",
    'schedule.edit',
    (s) => ({ ...firstEdit(s), roundId: s.roundId, date: '2026-12-07' }),
    (c, i) => changeDraftRoundDate(c, i, schedulingDeps),
  ),
  ...scheduleRows(
    'scheduling.set_draft_recording',
    "set a game's recording mode in the draft",
    'schedule.edit',
    (s) => ({ ...firstEdit(s), gameId: s.first, recording: 'live' }),
    (c, i) => setDraftRecording(c, i, schedulingDeps),
  ),
  ...scheduleRows(
    'scheduling.discard_schedule_draft',
    'discard the draft',
    'schedule.edit',
    async (s, league) => {
      const draft = await one<{ id: string }>(
        pglite,
        'insert into schedule_drafts (league_id, season_id) values ($1, $2) returning id',
        [league.leagueId, s.seasonId],
      );
      return { seasonId: s.seasonId, draftId: draft.id, version: 1 };
    },
    (c, i) => discardScheduleDraft(c, i, schedulingDeps),
  ),
  ...scheduleRows(
    'scheduling.get_schedule_draft',
    'see the draft',
    'schedule.read',
    (s) => ({ seasonId: s.seasonId }),
    (c, i) => getScheduleDraft(c, i, schedulingDeps),
  ),
  ...scheduleRows(
    'scheduling.preview_schedule_publish',
    'see what publishing would change',
    'schedule.publish',
    async (s, league) => {
      await draftMovingFirstGame(s, league);
      return { seasonId: s.seasonId };
    },
    (c, i) => previewSchedulePublish(c, i, schedulingDeps),
  ),
  ...scheduleRows(
    'scheduling.publish_schedule',
    'publish the schedule',
    'schedule.publish',
    async (s, league) => ({
      seasonId: s.seasonId,
      basedOnRevision: null,
      draftId: await draftMovingFirstGame(s, league),
      version: 1,
    }),
    (c, i) => publishSchedule(c, i, schedulingDeps),
  ),
];

/** A game of a season of the default program, or of the league's other program. */
async function gameIn(league: League, program: boolean, columns: Record<string, unknown> = {}) {
  const seasonId = await seasonIn(league, program);
  return {
    seasonId,
    gameId: await newGame(pglite, {
      leagueId: league.leagueId,
      seasonId,
      stageId: await newStage(pglite, league.leagueId, seasonId),
      homeTeamId: await newTeam(pglite, league.leagueId, seasonId),
      awayTeamId: await newTeam(pglite, league.leagueId, seasonId),
      columns,
    }),
  };
}

/** A games command's two rows: a game of the default program, and of the other one. */
function gameRows(
  command: string,
  name: string,
  needs: Permission,
  prepare: (league: League, program: boolean) => Promise<unknown>,
  run: Row['run'],
): Row[] {
  return [false, true].map((program) => ({
    command,
    name: `${name} ${program ? 'of one program' : 'of the default program'}`,
    needs,
    ...(program ? { scope: 'program' as const } : {}),
    prepare: async (league) => ({ input: await prepare(league, program) }),
    run,
  }));
}

// Games are checked at their season's program (P4 �4): scores by scorekeepers and
// schedulers, outcomes no one played by schedulers, corrections by schedulers (P4 �3).
const gameCommandRows: readonly Row[] = [
  ...gameRows(
    'games.record_final_score',
    'record a final score',
    'games.score',
    async (league, program) => ({
      gameId: (await gameIn(league, program)).gameId,
      version: 1,
      homeScore: 52,
      awayScore: 48,
    }),
    (c, i) => recordFinalScore(c, i, gamesDeps),
  ),
  ...gameRows(
    'games.record_forfeit',
    'record a forfeit',
    'games.results',
    async (league, program) => {
      const game = await gameIn(league, program);
      const home = await pglite.query<{ home_team_id: string }>(
        'select home_team_id from games where id = $1',
        [game.gameId],
      );
      return { gameId: game.gameId, version: 1, forfeitingTeamId: home.rows[0]?.home_team_id };
    },
    (c, i) => recordForfeit(c, i, gamesDeps),
  ),
  ...gameRows(
    'games.set_box_score',
    'enter a box score afterwards',
    'games.score',
    async (league, program) => ({
      gameId: (await gameIn(league, program)).gameId,
      version: 1,
      homeScore: 52,
      awayScore: 48,
      lines: [],
    }),
    (c, i) => setBoxScore(c, i, gamesDeps),
  ),
  ...gameRows(
    'games.get_box_score_sheet',
    'read a box score sheet',
    'games.score',
    async (league, program) => ({ gameId: (await gameIn(league, program)).gameId }),
    (c, i) => getBoxScoreSheet(c, i, gamesDeps),
  ),
  ...gameRows(
    'games.postpone_game',
    'postpone a game',
    'games.results',
    async (league, program) => ({ gameId: (await gameIn(league, program)).gameId, version: 1 }),
    (c, i) => postponeGame(c, i, gamesDeps),
  ),
  ...gameRows(
    'games.cancel_game',
    'cancel a game',
    'games.results',
    async (league, program) => ({ gameId: (await gameIn(league, program)).gameId, version: 1 }),
    (c, i) => cancelGame(c, i, gamesDeps),
  ),
  ...gameRows(
    'games.reopen_game',
    'reopen a final game',
    'games.correct',
    async (league, program) => ({
      gameId: (
        await gameIn(league, program, {
          status: 'final',
          home_score: 50,
          away_score: 40,
          finalized_at: '2026-12-06T19:30:00Z',
        })
      ).gameId,
      version: 1,
      reason: 'The score was wrong',
    }),
    (c, i) => reopenGame(c, i, trackerDeps),
  ),
  // Assigning scorekeepers is part of running Games (P4 §3, P7 §5.1): schedulers too.
  ...gameRows(
    'games.assign_scorekeeper',
    'assign a scorekeeper to a game',
    'games.manage',
    async (league, program) => ({
      gameId: (await gameIn(league, program)).gameId,
      accountId: await grant(league.leagueId, 'scorekeeper'),
    }),
    (c, i) => assignScorekeeper(c, i, gamesDeps),
  ),
  ...gameRows(
    'games.unassign_scorekeeper',
    'take a scorekeeper off a game',
    'games.manage',
    async (league, program) => {
      const { gameId } = await gameIn(league, program);
      const accountId = await grant(league.leagueId, 'scorekeeper');
      await pglite.query(
        'insert into game_assignments (league_id, game_id, account_id) values ($1, $2, $3)',
        [league.leagueId, gameId, accountId],
      );
      return { gameId, accountId };
    },
    (c, i) => unassignScorekeeper(c, i, gamesDeps),
  ),
  {
    command: 'games.list_my_games',
    name: 'see my games to score this week',
    needs: 'games.score',
    // Anyone who scores somewhere may look; the list itself holds what they may score.
    scope: 'program',
    prepare: async () => ({ input: {} }),
    run: (c, i) => listMyGames(c, i, gamesDeps),
  },
  {
    command: 'games.list_postponed_games',
    name: 'see the games waiting to be rescheduled',
    needs: 'schedule.read',
    // Any grant that reads the schedule, at any scope, may look.
    scope: 'program',
    prepare: async () => ({ input: {} }),
    run: (c, i) => listPostponedGames(c, i, gamesDeps),
  },
  // Holding a game to score (T6 §5, T-116): whoever may score it.
  ...gameRows(
    'games.open_scoring_session',
    'open a game to score',
    'games.score',
    async (league, program) => ({
      gameId: (await gameIn(league, program)).gameId,
      deviceId: 'matrix-tablet',
    }),
    (c, i) => openScoringSession(c, i, scoringDeps),
  ),
  // A session no longer held is answered "ended": allowed, and nothing changes.
  ...gameRows(
    'games.renew_scoring_session',
    'renew a scoring session',
    'games.score',
    async (league, program) => ({
      gameId: (await gameIn(league, program)).gameId,
      sessionId: randomUUID(),
    }),
    (c, i) => renewScoringSession(c, i, scoringDeps),
  ),
  ...gameRows(
    'games.release_scoring_session',
    'leave a game being scored',
    'games.score',
    async (league, program) => ({
      gameId: (await gameIn(league, program)).gameId,
      sessionId: randomUUID(),
    }),
    (c, i) => releaseScoringSession(c, i, scoringDeps),
  ),
  ...gameRows(
    'games.take_over_scoring',
    'take over scoring a game from another device',
    'games.score',
    async (league, program) => {
      const { gameId } = await gameIn(league, program);
      // Begun half a minute before the matrix's fixed clock, so its lease still holds.
      const since = matrixNow - 30_000;
      await pglite.query(
        `insert into scoring_sessions (league_id, game_id, account_id, device_id, created_at, held_until)
         values ($1, $2, $3, 'matrix-phone', $4, $5)`,
        [
          league.leagueId,
          gameId,
          await grant(league.leagueId, 'scorekeeper'),
          new Date(since).toISOString(),
          new Date(since + 120_000).toISOString(),
        ],
      );
      return { gameId, deviceId: 'matrix-tablet', confirmed: true, expectedHolderSince: since };
    },
    (c, i) => takeOverScoring(c, i, scoringDeps),
  ),
  // The tracker's taps (T6 §3): whoever may score the game. With no session held, each
  // command is answered refused, which is an allowed call that changes nothing.
  ...gameRows(
    'games.apply_tracker_commands',
    'send the tracker’s taps',
    'games.score',
    async (league, program) => ({
      gameId: (await gameIn(league, program)).gameId,
      protocolVersion: 1,
      sessionId: randomUUID(),
      commands: [{ commandId: randomUUID(), at: matrixNow, input: { type: 'start' } }],
    }),
    (c, i) => applyTrackerCommands(c, i, trackerDeps),
  ),
  // The engine's state for the scorekeeper's device (T-113, T-253): whoever may score
  // the game. A game with no taps yet is read as a new one; nothing changes.
  ...gameRows(
    'games.read_tracker_state',
    'load the tracker’s game state',
    'games.score',
    async (league, program) => ({ gameId: (await gameIn(league, program)).gameId }),
    (c, i) => readTrackerState(c, i, trackerDeps),
  ),
  // The rosters stored on the scorekeeper's device (T-115, T-258): whoever may score
  // the game. Nothing changes.
  ...gameRows(
    'games.read_tracker_rosters',
    'read the rosters for the tracker',
    'games.score',
    async (league, program) => ({ gameId: (await gameIn(league, program)).gameId }),
    (c, i) => readTrackerRosters(c, i, gamesDeps),
  ),
  // Ending a tracked game (T6 §7): whoever may score it. The game is live with one
  // basket recorded by its tracker, so it can be ended.
  ...gameRows(
    'games.end_tracked_game',
    'end a tracked game',
    'games.score',
    async (league, program) => {
      const { gameId } = await gameIn(league, program, { capture_mode: 'live' });
      const personId = await newPerson(pglite, league.leagueId);
      const rules = defaultSeasonRules();
      const basket = { type: 'score', side: 'home', playerId: personId, points: 2 } as const;
      const state = basketball.apply(basketball.newGame(engineRulesOf(rules), 0), basket, {
        id: randomUUID(),
        now: matrixNow,
      });
      const { side, playerId, points } = basket;
      await pglite.query(
        `insert into game_events (league_id, game_id, seq, command_id, type, payload, tapped_at, account_id)
         values ($1, $2, 1, $3, 'score', $4, $5, $6)`,
        [
          league.leagueId,
          gameId,
          randomUUID(),
          JSON.stringify({ side, playerId, points }),
          new Date(matrixNow).toISOString(),
          league.ownerId,
        ],
      );
      await pglite.query(
        'insert into game_states (league_id, game_id, seq, state) values ($1, $2, 1, $3)',
        [league.leagueId, gameId, JSON.stringify(state)],
      );
      const live = await pglite.query<{ version: number }>(
        `update games set status = 'live', home_score = 2, away_score = 0, format = $2
         where id = $1 returning version`,
        [gameId, JSON.stringify(rules)],
      );
      return { gameId, version: live.rows[0]?.version };
    },
    (c, i) => endTrackedGame(c, i, trackerDeps),
  ),
];

const divisionAndVenueRows: readonly Row[] = [
  // Divisions are checked at their season's program (P4 §4): the owner and admins.
  ...divisionRows(
    'leagues.create_division',
    'add a division',
    'divisions.manage',
    async (league, program) => ({
      seasonId: await seasonIn(league, program),
      name: 'Gold',
    }),
    (c, i) => createDivision(c, i, leaguesDeps),
  ),
  ...divisionRows(
    'leagues.update_division',
    'rename a division',
    'divisions.manage',
    async (league, program) => ({
      divisionId: await divisionIn(league, program),
      version: 1,
      name: 'Renamed',
    }),
    (c, i) => updateDivision(c, i, leaguesDeps),
  ),
  ...divisionRows(
    'leagues.reorder_divisions',
    'order divisions',
    'divisions.manage',
    async (league, program) => {
      const seasonId = await seasonIn(league, program);
      return {
        seasonId,
        divisionIds: [await newDivision(pglite, league.leagueId, seasonId)],
      };
    },
    (c, i) => reorderDivisions(c, i, leaguesDeps),
  ),
  ...divisionRows(
    'leagues.remove_division',
    'remove a division',
    'divisions.manage',
    async (league, program) => ({ divisionId: await divisionIn(league, program) }),
    (c, i) => removeDivision(c, i, leaguesDeps),
  ),
  ...divisionRows(
    'leagues.restore_division',
    'restore a division',
    'bin.restore',
    async (league, program) => ({
      divisionId: await binned('divisions', await divisionIn(league, program)),
    }),
    (c, i) => restoreDivision(c, i, leaguesDeps),
  ),
  ...divisionRows(
    'leagues.list_divisions',
    'see the divisions',
    'divisions.manage',
    async (league, program) => ({ seasonId: await seasonIn(league, program) }),
    (c, i) => listDivisions(c, i, leaguesDeps),
  ),
  // Venues belong to the league, not to a program: league-wide, the scheduler's too.
  {
    command: 'scheduling.create_venue',
    name: 'add a venue',
    needs: 'venues.manage',
    prepare: async () => ({ input: { name: 'Main gym' } }),
    run: (c, i) => createVenue(c, i, schedulingDeps),
  },
  {
    command: 'scheduling.update_venue',
    name: 'edit a venue',
    needs: 'venues.manage',
    prepare: async (league) => ({
      input: { venueId: await newVenue(pglite, league.leagueId), version: 1, name: 'Renamed' },
    }),
    run: (c, i) => updateVenue(c, i, schedulingDeps),
  },
  {
    command: 'scheduling.remove_venue',
    name: 'remove a venue',
    needs: 'venues.manage',
    prepare: async (league) => ({
      input: { venueId: await newVenue(pglite, league.leagueId) },
    }),
    run: (c, i) => removeVenue(c, i, schedulingDeps),
  },
  {
    command: 'scheduling.restore_venue',
    name: 'restore a venue',
    needs: 'bin.restore',
    prepare: async (league) => ({
      input: { venueId: await binned('venues', await newVenue(pglite, league.leagueId)) },
    }),
    run: (c, i) => restoreVenue(c, i, schedulingDeps),
  },
  {
    command: 'scheduling.create_court',
    name: 'add a court',
    needs: 'venues.manage',
    prepare: async (league) => ({
      input: { venueId: await newVenue(pglite, league.leagueId), name: 'Court 1' },
    }),
    run: (c, i) => createCourt(c, i, schedulingDeps),
  },
  {
    command: 'scheduling.update_court',
    name: 'rename a court',
    needs: 'venues.manage',
    prepare: async (league) => {
      const venueId = await newVenue(pglite, league.leagueId);
      const courtId = await newCourt(pglite, league.leagueId, venueId);
      return { input: { courtId, version: 1, name: 'Renamed' } };
    },
    run: (c, i) => updateCourt(c, i, schedulingDeps),
  },
  {
    command: 'scheduling.remove_court',
    name: 'remove a court',
    needs: 'venues.manage',
    prepare: async (league) => {
      const venueId = await newVenue(pglite, league.leagueId);
      return { input: { courtId: await newCourt(pglite, league.leagueId, venueId) } };
    },
    run: (c, i) => removeCourt(c, i, schedulingDeps),
  },
  {
    command: 'scheduling.restore_court',
    name: 'restore a court',
    needs: 'bin.restore',
    prepare: async (league) => {
      const venueId = await newVenue(pglite, league.leagueId);
      const courtId = await newCourt(pglite, league.leagueId, venueId);
      return { input: { courtId: await binned('courts', courtId) } };
    },
    run: (c, i) => restoreCourt(c, i, schedulingDeps),
  },
  // Reading the schedule: the scheduler (program-limited too), scorekeepers, the owner and admins.
  {
    command: 'scheduling.list_venues',
    name: 'see the venues and courts',
    needs: 'schedule.read',
    // Venues are league-shared: a grant at any scope reads them, so program roles too.
    scope: 'program',
    prepare: async () => ({ input: {} }),
    run: (c, i) => listVenues(c, i, schedulingDeps),
  },
];

/**
 * One row per declared setting and level it allows: the permission is the setting's
 * own (T-98), checked at the league, or at the program of a program or a season (P4 §4).
 */
function settingRows(registry: SettingRegistry): Row[] {
  const set = setSettingFor(registry);
  const clear = clearSettingFor(registry);
  return registry.all().flatMap((setting) =>
    setting.levels.flatMap((level): Row[] => {
      const scope = level === 'league' ? 'league' : 'program';
      const place = async (league: League) =>
        level === 'league'
          ? { level }
          : level === 'program'
            ? { level, programId: league.programId }
            : {
                level,
                seasonId: await newSeason(pglite, league.leagueId, league.programId),
              };
      const at = level === 'league' ? 'the league' : `a ${level}`;
      return [
        {
          command: 'leagues.set_setting',
          name: `set ${setting.key} at ${at}`,
          needs: setting.permission,
          declared: true,
          scope,
          prepare: async (league) => ({
            input: {
              ...(await place(league)),
              key: setting.key,
              value: setting.default,
              version: null,
            },
          }),
          run: (c, i) => set(c, i, leaguesDeps),
        },
        {
          command: 'leagues.clear_setting',
          name: `clear ${setting.key} at ${at}`,
          needs: setting.permission,
          declared: true,
          scope,
          prepare: async (league) => {
            const where = await place(league);
            await pglite.query(
              `insert into setting_values (league_id, level, program_id, season_id, key, value)
               values ($1, $2, $3, $4, $5, $6::jsonb)`,
              [
                league.leagueId,
                level,
                'programId' in where ? where.programId : null,
                'seasonId' in where ? where.seasonId : null,
                setting.key,
                JSON.stringify({ version: 1, value: setting.default }),
              ],
            );
            return { input: { ...where, key: setting.key, version: 1 } };
          },
          run: (c, i) => clear(c, i, leaguesDeps),
        },
      ];
    }),
  );
}

/** A setting only the matrix declares, to try the program and season levels and a permission other than league.settings. */
const bannerSetting = defineSetting({
  key: 'site.banner',
  type: z.string().max(40),
  default: 'Welcome',
  levels: ['league', 'program', 'season'],
  permission: 'site.edit',
  label: 'setting.site.banner.label',
});

/** People belong to the league: checked league-wide (P4 §3, R-16). */
const peopleRows: readonly Row[] = [
  {
    command: 'people.create_person',
    name: 'add a person',
    needs: 'people.manage',
    prepare: async () => ({ input: { firstName: 'Sam', lastName: 'Ng' } }),
    run: (c, i) => createPerson(c, i, peopleDeps),
  },
  {
    command: 'people.update_person',
    name: 'fix a person',
    needs: 'people.manage',
    prepare: async (league) => ({
      input: {
        personId: await newPerson(pglite, league.leagueId),
        version: 1,
        firstName: 'Renamed',
      },
    }),
    run: (c, i) => updatePerson(c, i, peopleDeps),
  },
  {
    command: 'people.remove_person',
    name: 'remove a person',
    needs: 'people.manage',
    prepare: async (league) => ({
      input: { personId: await newPerson(pglite, league.leagueId) },
    }),
    run: (c, i) => removePerson(c, i, peopleDeps),
  },
  {
    command: 'people.list_people',
    name: 'see the people list',
    needs: 'people.read',
    prepare: async () => ({ input: {} }),
    run: (c, i) => listPeople(c, i, peopleDeps),
  },
];

// Standings are checked at their season's program (P4 §3 and §4, S-10): the owner
// and admins.
const standingsRows: readonly Row[] = gameRows(
  'standings.rebuild_season',
  "work out a season's standings again",
  'standings.adjust',
  async (league, program) => ({ seasonId: await seasonIn(league, program) }),
  (c, i) => rebuildStandings(c, i, standingsDeps),
);

// Adjustments are checked at their season's program too (S-10): the owner and admins.
const adjustmentRows: readonly Row[] = [
  ...gameRows(
    'standings.add_adjustment',
    'add an adjustment',
    'standings.adjust',
    async (league, program) => {
      const seasonId = await seasonIn(league, program);
      const teamId = await newTeam(pglite, league.leagueId, seasonId);
      return { seasonId, teamId, wins: 1, reason: 'Won by ruling' };
    },
    (c, i) => addAdjustment(c, i, standingsDeps),
  ),
  ...gameRows(
    'standings.remove_adjustment',
    'remove an adjustment',
    'standings.adjust',
    async (league, program) => {
      const seasonId = await seasonIn(league, program);
      const teamId = await newTeam(pglite, league.leagueId, seasonId);
      const added = await pglite.query<{ id: string }>(
        `insert into standings_adjustments (league_id, season_id, team_id, wins, reason, account_id)
         values ($1, $2, $3, 1, 'Won by ruling', $4) returning id`,
        [league.leagueId, seasonId, teamId, league.ownerId],
      );
      return { seasonId, adjustmentId: added.rows[0]?.id };
    },
    (c, i) => removeAdjustment(c, i, standingsDeps),
  ),
];

/** An import of a season, ready to apply or applied (with the empty draft it names). */
async function importIn(
  league: League,
  s: { seasonId: string },
  state: 'reading' | 'ready' | 'applied',
) {
  const created: Record<string, unknown> = { version: 1 };
  if (state === 'applied') {
    const draft = await one<{ id: string }>(
      pglite,
      'insert into schedule_drafts (league_id, season_id) values ($1, $2) returning id',
      [league.leagueId, s.seasonId],
    );
    Object.assign(created, {
      draftId: draft.id,
      draftStarted: true,
      changesBefore: 0,
      changesAdded: 0,
      draftVersion: 1,
      gameIds: [],
      scores: [],
    });
  }
  const report =
    state === 'reading'
      ? { version: 1, upload: 'Date,Home,Away' }
      : {
          version: 1,
          fileProblem: null,
          fixtures: [],
          problems: [],
          omittedProblems: 0,
          problemsNote: null,
          warnings: [],
          rowsRead: 0,
          columnsFound: [],
        };
  const row = await one<{ id: string }>(
    pglite,
    `insert into imports (league_id, season_id, kind, status, account_id, file_name, report, created, applied_at)
     values ($1, $2, 'fixtures', $3, $4, 'fixtures.csv', $5, $6, ${state === 'applied' ? 'now()' : 'null'})
     returning id`,
    [
      league.leagueId,
      s.seasonId,
      state,
      league.ownerId,
      JSON.stringify(report),
      JSON.stringify(created),
    ],
  );
  return row.id;
}

// A fixtures import is run at its season's program (P4 §3 `schedule.import`): the owner,
// admins and schedulers; a scheduler limited to one program only in its seasons. Its scores
// are recorded by those who may import and score games there (a scorekeeper alone may not).
const fixtureImportRows: readonly Row[] = [
  ...scheduleRows(
    'imports.start_fixture_import',
    'upload a fixtures file',
    'schedule.import',
    (s) => ({
      seasonId: s.seasonId,
      fileName: 'fixtures.csv',
      fileText: 'Date,Home,Away\n2027-01-02,A,B',
    }),
    (c, i) => startFixtureImport(c, i, importsDeps),
  ),
  ...scheduleRows(
    'imports.apply_fixture_import',
    'apply a previewed import',
    'schedule.import',
    async (s, league) => ({ importId: await importIn(league, s, 'ready'), version: 1 }),
    (c, i) => applyFixtureImport(c, i, importsDeps),
  ),
  ...scheduleRows(
    'imports.undo_fixture_import',
    'undo an applied import',
    'schedule.import',
    async (s, league) => ({ importId: await importIn(league, s, 'applied'), version: 1 }),
    (c, i) => undoFixtureImport(c, i, importsDeps),
  ),
  ...scheduleRows(
    'imports.record_imported_scores',
    'record the scores of an applied import',
    'schedule.import',
    async (s, league) => ({ importId: await importIn(league, s, 'applied') }),
    (c, i) => recordImportedScores(c, i, importsDeps),
  ),
  ...scheduleRows(
    'imports.discard_fixture_import',
    'give up on an unread import',
    'schedule.import',
    async (s, league) => ({ importId: await importIn(league, s, 'reading') }),
    (c, i) => discardFixtureImport(c, i, importsDeps),
  ),
  ...scheduleRows(
    'imports.get_fixture_import',
    'see an import',
    'schedule.import',
    async (s, league) => ({ importId: await importIn(league, s, 'ready') }),
    (c, i) => getFixtureImport(c, i, importsDeps),
  ),
];

const rows: readonly Row[] = [
  ...divisionAndVenueRows,
  ...peopleRows,
  ...gameCommandRows,
  ...standingsRows,
  ...adjustmentRows,
  ...teamCommandRows,
  ...rosterCommandRows,
  ...scheduleDraftRows,
  ...fixtureImportRows,
  ...settingRows(declaredSettings),
  ...settingRows(settingRegistry([bannerSetting])),
  // League settings (P4 §6) and seasons (P4 §3): the owner and admins (O-7).
  {
    command: 'leagues.set_name',
    name: "set the league's name",
    needs: 'league.settings',
    prepare: async () => ({ input: { name: 'Renamed', version: 1 } }),
    run: (c, i) => setLeagueName(c, i, leaguesDeps),
  },
  {
    command: 'leagues.rename_short_name',
    name: "change the league's short name",
    needs: 'league.settings',
    prepare: async () => ({ input: { slug: unique('renamed'), version: 1 } }),
    run: (c, i) => renameShortName(c, i, leaguesDeps),
  },
  {
    command: 'leagues.set_status',
    name: 'publish the league',
    needs: 'league.settings',
    prepare: async () => ({ input: { status: 'live', version: 1 } }),
    run: (c, i) => setLeagueStatus(c, i, leaguesDeps),
  },
  {
    command: 'leagues.set_status',
    name: 'suspend the league (our staff only, U-9)',
    needs: 'platform-staff',
    prepare: async () => ({ input: { status: 'suspended', version: 1 } }),
    run: (c, i) => setLeagueStatus(c, i, leaguesDeps),
  },
  // Seasons are checked at their program (P4 §4): the default program's rows refuse
  // the admin of another program; the program's rows let that program's admin in.
  {
    command: 'leagues.create_season',
    name: 'add a season to the default program',
    needs: 'season.settings',
    prepare: async () => ({ input: { slug: 'fall', name: 'Fall' } }),
    run: (c, i) => createSeason(c, i, leaguesDeps),
  },
  {
    command: 'leagues.create_season',
    name: 'add a season to one program',
    needs: 'season.settings',
    scope: 'program',
    prepare: async (league) => ({
      input: { programId: league.programId, slug: 'fall', name: 'Fall' },
    }),
    run: (c, i) => createSeason(c, i, leaguesDeps),
  },
  {
    command: 'leagues.set_current_season',
    name: 'make a season of the default program current',
    needs: 'season.settings',
    prepare: async (league) => ({
      input: {
        seasonId: await newSeason(pglite, league.leagueId, league.defaultProgramId),
        version: 1,
      },
    }),
    run: (c, i) => setCurrentSeason(c, i, leaguesDeps),
  },
  {
    command: 'leagues.set_current_season',
    name: 'make a season of one program current',
    needs: 'season.settings',
    scope: 'program',
    prepare: async (league) => ({
      input: {
        seasonId: await newSeason(pglite, league.leagueId, league.programId),
        version: 1,
      },
    }),
    run: (c, i) => setCurrentSeason(c, i, leaguesDeps),
  },
  {
    command: 'leagues.get_season',
    name: 'see a season of the default program',
    needs: 'season.settings',
    prepare: async (league) => {
      const seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId);
      return { input: { seasonId } };
    },
    run: (c, i) => getSeason(c, i, leaguesDeps),
  },
  {
    command: 'leagues.get_season',
    name: 'see a season of one program',
    needs: 'season.settings',
    scope: 'program',
    prepare: async (league) => {
      const seasonId = await newSeason(pglite, league.leagueId, league.programId);
      return { input: { seasonId } };
    },
    run: (c, i) => getSeason(c, i, leaguesDeps),
  },
  {
    command: 'leagues.update_season',
    name: 'rename a season of the default program',
    needs: 'season.settings',
    prepare: async (league) => {
      const seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId);
      return { input: { seasonId, version: 1, name: 'Renamed' } };
    },
    run: (c, i) => updateSeason(c, i, leaguesDeps),
  },
  {
    command: 'leagues.update_season',
    name: 'rename a season of one program',
    needs: 'season.settings',
    scope: 'program',
    prepare: async (league) => {
      const seasonId = await newSeason(pglite, league.leagueId, league.programId);
      return { input: { seasonId, version: 1, name: 'Renamed' } };
    },
    run: (c, i) => updateSeason(c, i, leaguesDeps),
  },
  {
    command: 'leagues.set_season_rules',
    name: 'set the rules of a season of the default program',
    needs: 'season.settings',
    prepare: async (league) => {
      const seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId);
      return { input: { seasonId, version: 1, rules: defaultSeasonRules() } };
    },
    run: (c, i) => setSeasonRules(c, i, leaguesDeps),
  },
  {
    command: 'leagues.set_season_rules',
    name: 'set the rules of a season of one program',
    needs: 'season.settings',
    scope: 'program',
    prepare: async (league) => {
      const seasonId = await newSeason(pglite, league.leagueId, league.programId);
      return { input: { seasonId, version: 1, rules: defaultSeasonRules() } };
    },
    run: (c, i) => setSeasonRules(c, i, leaguesDeps),
  },
  ...[false, true].map((program) => ({
    command: 'leagues.preview_season_rules',
    name: `see what new rules would move in a season of ${program ? 'one program' : 'the default program'}`,
    needs: 'season.settings' as const,
    ...(program ? { scope: 'program' as const } : {}),
    prepare: async (league: League) => {
      const seasonId = await seasonIn(league, program);
      return { input: { seasonId, rules: defaultSeasonRules() } };
    },
    run: (c: CommandContext, i: unknown) => previewSeasonRules(c, i, leaguesDeps),
  })),
  {
    command: 'leagues.set_season_roster_settings',
    name: 'set the roster settings of a season of the default program',
    needs: 'season.settings',
    prepare: async (league) => {
      const seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId);
      return { input: { seasonId, version: 1, uniqueJerseys: true } };
    },
    run: (c, i) => setSeasonRosterSettings(c, i, leaguesDeps),
  },
  {
    command: 'leagues.set_season_roster_settings',
    name: 'set the roster settings of a season of one program',
    needs: 'season.settings',
    scope: 'program',
    prepare: async (league) => {
      const seasonId = await newSeason(pglite, league.leagueId, league.programId);
      return { input: { seasonId, version: 1, uniqueJerseys: true } };
    },
    run: (c, i) => setSeasonRosterSettings(c, i, leaguesDeps),
  },
  {
    command: 'leagues.create',
    name: 'create a league (our staff only)',
    needs: 'platform-staff',
    prepare: async (league) => ({
      leagueId: randomUUID(),
      input: {
        slug: unique('new-league'),
        name: 'New league',
        timeZone: 'UTC',
        audience: 'adult',
        ownerAccountId: league.ownerId,
        sportKey: 'basketball',
      },
    }),
    run: (c, i) => createLeague(c, i, leaguesDeps),
  },
  // Who has access (P4 §4, §6): the owner and admins; a program's admin for it.
  {
    command: 'access.invite',
    name: 'invite someone to the whole league',
    needs: 'access.manage',
    prepare: async () => ({ input: { email: 'new@example.test', role: 'editor' } }),
    run: (c, i) => invite(c, i, accessDeps),
  },
  {
    command: 'access.invite',
    name: 'invite someone to one program',
    needs: 'access.manage',
    scope: 'program',
    prepare: async (league) => ({
      input: {
        email: 'new@example.test',
        role: 'scheduler',
        scope: { type: 'program', id: league.programId },
      },
    }),
    run: (c, i) => invite(c, i, accessDeps),
  },
  {
    command: 'access.resend_invitation',
    name: 're-send an invitation',
    needs: 'access.manage',
    prepare: async (league) => ({ input: { invitationId: await invitationIn(league) } }),
    run: (c, i) => resendInvitation(c, i, accessDeps),
  },
  {
    command: 'access.resend_invitation',
    name: 're-send an invitation to one program',
    needs: 'access.manage',
    scope: 'program',
    prepare: async (league) => ({
      input: { invitationId: await invitationIn(league, { program: true }) },
    }),
    run: (c, i) => resendInvitation(c, i, accessDeps),
  },
  {
    command: 'access.cancel_invitation',
    name: 'cancel an invitation',
    needs: 'access.manage',
    prepare: async (league) => ({ input: { invitationId: await invitationIn(league) } }),
    run: (c, i) => cancelInvitation(c, i, accessDeps),
  },
  {
    command: 'access.cancel_invitation',
    name: 'cancel an invitation to one program',
    needs: 'access.manage',
    scope: 'program',
    prepare: async (league) => ({
      input: { invitationId: await invitationIn(league, { program: true }) },
    }),
    run: (c, i) => cancelInvitation(c, i, accessDeps),
  },
  {
    command: 'access.revoke_grant',
    name: "remove someone's access",
    needs: 'access.manage',
    prepare: async (league) => ({ input: { grantId: await grantId(league.leagueId, 'editor') } }),
    run: (c, i) => revokeGrant(c, i, accessDeps),
  },
  {
    command: 'access.revoke_grant',
    name: "remove someone's access to one program",
    needs: 'access.manage',
    scope: 'program',
    prepare: async (league) => ({
      input: { grantId: await grantId(league.leagueId, 'editor', league.programId) },
    }),
    run: (c, i) => revokeGrant(c, i, accessDeps),
  },
  {
    command: 'access.list_access',
    name: 'see who has access',
    needs: 'access.manage',
    prepare: async () => ({ input: {} }),
    run: (c, i) => listAccess(c, i, accessDeps),
  },
  {
    command: 'access.list_access',
    name: 'see who has access to one program',
    needs: 'access.manage',
    scope: 'program',
    prepare: async (league) => ({ input: { scope: { type: 'program', id: league.programId } } }),
    run: (c, i) => listAccess(c, i, accessDeps),
  },
  // A-6: the activity log is the owner's and admins'.
  {
    command: 'access.list_activity',
    name: 'read the activity log',
    needs: 'activity.read',
    prepare: async () => ({ input: {} }),
    run: (c, i) => listActivity(c, i, accessDeps),
  },
  {
    command: 'access.list_activity',
    name: "read one program's activity",
    needs: 'activity.read',
    scope: 'program',
    prepare: async (league) => ({ input: { scope: { type: 'program', id: league.programId } } }),
    run: (c, i) => listActivity(c, i, accessDeps),
  },
  // Anyone signed in who holds the link (P4 §4: sign in, and they are in).
  {
    command: 'access.accept_invitation',
    name: 'accept an invitation with its link',
    needs: 'signed-in',
    prepare: async (league) => {
      const token = 'a'.repeat(22) + randomUUID().replace(/-/g, '').slice(0, 21);
      await invitationIn(league, { token });
      return { input: { token } };
    },
    run: (c, i) => acceptInvitation(c, i, accessDeps),
  },
  {
    command: 'access.my_access',
    name: "read one's own access",
    needs: 'signed-in',
    prepare: async () => ({ input: {} }),
    run: (c, i) => myAccess(c, i, accessDeps),
  },
];

/**
 * Rows whose need is not the command's own named permission, each with its reason.
 * Every other row must need exactly what its command names.
 */
const namedExceptions: Readonly<Record<string, readonly CommandRequirement[]>> = {
  // Names `league.settings` for publishing and archiving; suspending and lifting a
  // suspension are our staff's (U-9), which its own check decides.
  'leagues.set_status': ['platform-staff'],
};

describe('every role against every command (T4 §12)', () => {
  it('has a row for every command in the registry', () => {
    const covered = new Set(rows.map((row) => row.command));
    expect([...commands.keys()].filter((name) => !covered.has(name))).toEqual([]);
    expect([...covered].filter((name) => !commands.has(name))).toEqual([]);
  });

  it('runs each command as the permission it names itself (T4 §4)', () => {
    const wrong = rows
      .filter((row) => {
        if (row.declared) return false;
        const named = commands.get(row.command)?.permission;
        if (named === row.needs) return false;
        return !(namedExceptions[row.command] ?? []).includes(row.needs);
      })
      .map((row) => `${row.command} (${row.name}) needs "${row.needs}"`);
    expect(wrong).toEqual([]);
    // Each exception still has its row, so none can outlive the case it was for.
    for (const [command, needs] of Object.entries(namedExceptions)) {
      for (const need of needs) {
        expect(rows.some((row) => row.command === command && row.needs === need)).toBe(true);
      }
    }
  });

  it('has a row at every level of every declared setting, for both commands', () => {
    for (const setting of declaredSettings.all()) {
      for (const level of setting.levels) {
        for (const command of ['leagues.set_setting', 'leagues.clear_setting']) {
          const found = rows.filter(
            (r) => r.command === command && r.needs === setting.permission && r.declared,
          );
          expect(
            found.some((r) => r.name.includes(setting.key)),
            `${command} ${level}`,
          ).toBe(true);
        }
      }
    }
    expect(rows.filter((r) => r.name.includes(bannerSetting.key))).toHaveLength(6);
  });

  for (const row of rows) {
    it(`${row.command}: ${row.name} (${row.needs})`, async () => {
      const outcomes: Partial<Record<Actor, string>> = {};
      for (const actor of actors) {
        const league = await leagueWithActors();
        const { input, leagueId } = await row.prepare(league);
        const context = {
          leagueId: leagueId ?? league.leagueId,
          accountId: league.accountOf(actor),
          requestId: 'matrix',
        };
        const result = await row.run(context, input);
        outcomes[actor] = result.ok ? 'ok' : (result.error?.code ?? 'failed');
      }
      const allowed = expectedActors(row.needs, row.scope ?? 'league');
      const expected = Object.fromEntries(
        actors.map((actor) => [actor, allowed.includes(actor) ? 'ok' : 'not-allowed']),
      );
      expect(outcomes).toEqual(expected);
    });
  }
});
