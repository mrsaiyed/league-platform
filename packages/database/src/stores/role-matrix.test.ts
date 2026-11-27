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
// who holds what, so the expected outcomes follow with nothing more to write. Its row
// goes beside the rows of its own area (in that area's list, such as gameCommandRows,
// next to the commands it is like), never at the end of a list or of `rows`, so two
// steps that each add a command rarely touch the same lines (step 2.188, record 072);
// the order of rows changes nothing that is checked.
//
// The people tried (step 2.228): the owner, admins, each lesser role for the whole
// league and limited to one program, a coach and a captain of a team (since 0008 a
// role can be given for one team, and theirs is moved onto the team the call is
// about, so "their own team" is tried), someone with no role or a removed one, our
// staff and a visitor. A club admin is not here only because the database still
// refuses a club scope until the clubs table exists (0008); a test below proves that
// refusal, so the day a club can be given this file fails until the club admin joins.
//
// Each row is also run in an archived and in a suspended league (U-9: read-only,
// with R-26's and T-226's exceptions, written out here by hand), and each scoring
// row in a league that scores assigned games only (P4 §4), by a scorekeeper assigned
// to the game and one who is not (T-500, T-501, T-502).
//
// Every read is checked for what it gives each of them, field by field (T-76), against
// role-matrix-fields.test-helper.ts: a field a person's permission does not cover fails.
import { defaultSeasonRules, formatOfRules, startingDesign } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { createHash, randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
// In alphabetical order, a new name in its place, never at the end (step 2.188).
import {
  type AccessTx,
  type RestoreGameTx,
  type CommandContext,
  type CommandDeps,
  type CommandRequirement,
  type ScorekeepersTx,
  type ImportScoresTx,
  type Job,
  type LeagueRemovalTx,
  type LeaguesTx,
  type PeopleTx,
  type Permission,
  type SchedulingTx,
  type ScoringTx,
  type SettingRegistry,
  type StandingsTx,
  type TeamsTx,
  type TrackerTx,
  acceptInvitation,
  addAdjustment,
  awardGame,
  overturnResult,
  addDraftGame,
  addDraftRound,
  addToRoster,
  applyFixtureImport,
  applyTrackerCommands,
  assignScorekeeper,
  cancelGame,
  cancelInvitation,
  changeDraftRoundDate,
  changeRosterEntry,
  clearGameFormat,
  clearSettingFor,
  commands,
  countPlaceGames,
  countTeamGames,
  createCourt,
  correctTrackedBoxScore,
  createDivision,
  createLeague,
  createPerson,
  createSeason,
  createTeam,
  createVenue,
  declaredSettings,
  defineSetting,
  discardFixtureImport,
  discardScheduleDraft,
  endTrackedGame,
  engineRulesOf,
  getBoxScoreSheet,
  getFixtureImport,
  getPerson,
  getScheduleDraft,
  getSeason,
  giveGameFormat,
  invite,
  listAccess,
  listActivity,
  listAdjustments,
  listBin,
  listBinPart,
  listDivisions,
  listEarlierGames,
  listGamesNeedingResult,
  listLaterGames,
  listMyGames,
  listPeople,
  listPostponedGames,
  listRoster,
  listScorekeepers,
  listScoringOffers,
  listVenues,
  markLeft,
  markNotStarted,
  moveDraftGame,
  myAccess,
  openScoringSession,
  postponeGame,
  previewSchedulePublish,
  previewSeasonRules,
  publishSchedule,
  publishSiteDesign,
  putBackDraftGame,
  putBackOnRoster,
  readGameFormat,
  readInvitation,
  readLeagueSettings,
  putGameBack,
  readReopenOffer,
  readTrackedBoxScore,
  readTrackerRosters,
  readTrackerState,
  rebuildStandings,
  recordFinalScore,
  recordForfeit,
  recordImportedScores,
  releaseScoringSession,
  recordCoinFlip,
  removeAdjustment,
  removeCoinFlip,
  removeCourt,
  removeDivision,
  removeDraftGame,
  removeDraftLeague,
  removeDraftRound,
  removePerson,
  removeTeam,
  removeVenue,
  renameDraftRound,
  renameShortName,
  renewScoringSession,
  readOwnResultOffer,
  readOwnResultOffers,
  reopenGame,
  putSheetBack,
  readSheetPutBackOffer,
  reopenOwnResult,
  reopenTrackedGame,
  reorderDivisions,
  reorderRoster,
  resendInvitation,
  restoreCourt,
  restoreDivision,
  restoreGame,
  restorePerson,
  restoreTeam,
  restoreVenue,
  revokeGrant,
  searchActivity,
  setBoxScore,
  setCurrentSeason,
  startSeason,
  archiveSeason,
  setDraftRecording,
  setLeagueAudience,
  setLeagueName,
  setLeagueProfile,
  setLeagueStatus,
  setNameRequest,
  setSeasonRosterSettings,
  setSeasonRules,
  setSettingFor,
  setTeamStatsVisibility,
  settingRegistry,
  startFixtureImport,
  swapDraftGames,
  takeOverScoring,
  unassignScorekeeper,
  undoFixtureImport,
  updateCourt,
  updateDivision,
  updatePerson,
  updateSeason,
  markTeamLeft,
  undoTeamLeft,
  updateTeam,
  updateVenue,
} from '@srleagues/core';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { removalTransaction } from '../league-making/removal-transaction.ts';
import { pgliteDriver } from '../migrations/index.ts';
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
import { binStore } from './bin-store.ts';
import { divisionsStore } from './divisions-store.ts';
import { gamesStore } from './games-store.ts';
import { importsStore } from './imports-store.ts';
import { leaguesStore } from './leagues-store.ts';
import { liveGamesStore } from './live-games-store.ts';
import { peopleStore } from './people-store.ts';
import { schedulingStore } from './scheduling-store.ts';
import { scoringSessionsStore } from './scoring-sessions-store.ts';
import { readFields } from './role-matrix-fields.test-helper.ts';
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
  'program_registrar',
  'program_scheduler',
  'program_editor',
  'program_scorekeeper',
  'coach',
  'captain',
  'no_role',
  'revoked_admin',
  'staff',
  'visitor',
] as const;
type Actor = (typeof actors)[number];
const signedIn = actors.filter((a) => a !== 'visitor');

type League = MadeLeague & { programId: string; accountOf: (actor: Actor) => string | null };
type Outcome = {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: { readonly code: string };
};
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
let gamesDeps: CommandDeps<ScorekeepersTx>;
let scoringDeps: CommandDeps<ScoringTx>;
let trackerDeps: CommandDeps<TrackerTx>;
let peopleDeps: CommandDeps<PeopleTx>;
let teamsDeps: CommandDeps<TeamsTx>;
let binDeps: CommandDeps<RestoreGameTx>;
let standingsDeps: CommandDeps<StandingsTx>;
let importsDeps: CommandDeps<ImportScoresTx>;
let removalDeps: CommandDeps<LeagueRemovalTx>;
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
    bin: binStore(scope),
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
  binDeps = { transaction, events: [], ...rest };
  importsDeps = { transaction, events: [], ...rest };
  removalDeps = {
    transaction: removalTransaction(pgliteDriver(pglite), [staffId]),
    events: [],
    ...rest,
  };
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

/** A coach or captain grant for one team (0008). */
async function grantForTeam(leagueId: string, role: 'coach' | 'captain', teamId: string) {
  const accountId = await newAccount(pglite);
  await pglite.query(
    `insert into role_grants (league_id, account_id, role, scope_type, scope_id)
     values ($1, $2, $3, 'team', $4)`,
    [leagueId, accountId, role, teamId],
  );
  return accountId;
}

/**
 * The team a call is about, if any: its `teamId`, the team of its `rosterEntryId`, or
 * the home team of its `gameId`. The coach and the captain are moved onto it, so a row
 * tries them on their own team (P4 §4).
 */
async function teamOfInput(input: unknown): Promise<string | null> {
  if (typeof input !== 'object' || input === null) return null;
  const fields = input as Record<string, unknown>;
  if (typeof fields['teamId'] === 'string') return fields['teamId'];
  const lookups: readonly [string, string][] = [
    ['rosterEntryId', 'select team_id as id from roster_entries where id = $1'],
    ['gameId', 'select home_team_id as id from games where id = $1'],
  ];
  for (const [field, sql] of lookups) {
    const value = fields[field];
    if (typeof value !== 'string') continue;
    const found = await pglite.query<{ id: string | null }>(sql, [value]);
    if (found.rows[0]?.id) return found.rows[0].id;
  }
  return null;
}

/** A grant's scope never changes (0004): the old grant is removed and a new one given. */
async function moveTeamGrantsTo(league: League, teamId: string) {
  await pglite.query(
    `with old as (
       update role_grants set revoked_at = now()
        where league_id = $1 and role in ('coach', 'captain') and revoked_at is null
          and scope_id <> $2
       returning account_id, role)
     insert into role_grants (league_id, account_id, role, scope_type, scope_id)
     select $1, account_id, role, 'team', $2 from old`,
    [league.leagueId, teamId],
  );
}

/** A league with one account per actor. */
async function leagueWithActors(): Promise<League> {
  const made = await newLeague(pglite);
  const programId = await newProgram(pglite, made.leagueId);
  // A team of its own for the coach and the captain until a row's team is known.
  const teamId = await newTeam(
    pglite,
    made.leagueId,
    await newSeason(pglite, made.leagueId, made.defaultProgramId),
  );
  const ids = new Map<Actor, string>([
    ['owner', made.ownerId],
    ['admin', await grant(made.leagueId, 'admin')],
    ['program_admin', await grant(made.leagueId, 'admin', programId)],
    ['registrar', await grant(made.leagueId, 'registrar')],
    ['scheduler', await grant(made.leagueId, 'scheduler')],
    ['editor', await grant(made.leagueId, 'editor')],
    ['scorekeeper', await grant(made.leagueId, 'scorekeeper')],
    ['program_registrar', await grant(made.leagueId, 'registrar', programId)],
    ['program_scheduler', await grant(made.leagueId, 'scheduler', programId)],
    ['program_editor', await grant(made.leagueId, 'editor', programId)],
    ['program_scorekeeper', await grant(made.leagueId, 'scorekeeper', programId)],
    ['coach', await grantForTeam(made.leagueId, 'coach', teamId)],
    ['captain', await grantForTeam(made.leagueId, 'captain', teamId)],
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
  // "Score games", and see the list of their games and nothing else: not the schedule's
  // draft, its venues or its postponed games (step 2.227, T-472)
  scorekeeper: ['games.score'],
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
  // A role limited to one program holds its permissions there only (P4 §4).
  if (scope === 'program') {
    for (const [actor, role] of programLimited) {
      if (heldBy[role].includes(needs)) allowed.push(actor);
    }
  }
  // A coach or captain holds nothing any command of stage 2 needs: see teamRolesHold.
  for (const actor of ['coach', 'captain'] as const) {
    if (teamRolesHold.includes(needs)) allowed.push(actor);
  }
  return allowed;
}

/** The lesser roles limited to the league's other program, and the role each one is. */
const programLimited: readonly (readonly [Actor, LesserRole])[] = [
  ['program_registrar', 'registrar'],
  ['program_scheduler', 'scheduler'],
  ['program_editor', 'editor'],
  ['program_scorekeeper', 'scorekeeper'],
];

/**
 * P4 §4, by hand: a coach or captain has "their own team: roster changes the league
 * allows, lineup, messaging the team". No league can yet allow a coach a roster change
 * (no setting for it exists), and lineups and team messages are not commands of stage
 * 2, so on their own team as anywhere else they may do nothing but what any signed-in
 * person may (T-500).
 */
const teamRolesHold: readonly Permission[] = [];

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
    'teams.mark_team_left',
    'mark a team as having left the league',
    async (league, program) => ({ teamId: await teamIn(league, program), version: 1 }),
    (c, i) => markTeamLeft(c, i, teamsDeps),
  ),
  ...teamRows(
    'teams.undo_team_left',
    'take off the mark of a team having left',
    async (league, program) => ({ teamId: await teamIn(league, program), version: 1 }),
    (c, i) => undoTeamLeft(c, i, teamsDeps),
  ),
  ...teamRows(
    'teams.count_team_games',
    "count a team's games before removing it",
    async (league, program) => ({ teamId: await teamIn(league, program) }),
    (c, i) => countTeamGames(c, i, teamsDeps),
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
      // Not after the league's today, whenever the matrix runs (step 2.161).
      leftOn: '2026-11-01',
    }),
    (c, i) => markLeft(c, i, teamsDeps),
  ),
  ...rosterRows(
    'teams.put_back_on_roster',
    'put a player marked as left by mistake back on the roster',
    async (teamId, league) => {
      const rosterEntryId = await newRosterEntry(
        pglite,
        league.leagueId,
        teamId,
        await newPerson(pglite, league.leagueId),
      );
      await pglite.query(`update roster_entries set left_on = '2026-11-01' where id = $1`, [
        rosterEntryId,
      ]);
      // Setting the date moved the entry's version on: the command names the one it is at.
      const { version } = await one<{ version: number }>(
        pglite,
        'select version from roster_entries where id = $1',
        [rosterEntryId],
      );
      return { teamId, rosterEntryId, version };
    },
    (c, i) => putBackOnRoster(c, i, teamsDeps),
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

/** A draft on the season (before any publication) that removes its first game; its id. */
async function draftRemovingFirstGame(
  s: Awaited<ReturnType<typeof scheduleIn>>,
  league: League,
): Promise<string> {
  const changes = { version: 1, changes: [{ kind: 'remove-game', gameId: s.first }] };
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
    'scheduling.put_back_draft_game',
    'put a removed game back in the draft',
    'schedule.edit',
    async (s, league) => ({
      ...firstEdit(s),
      draftId: await draftRemovingFirstGame(s, league),
      version: 1,
      gameId: s.first,
    }),
    (c, i) => putBackDraftGame(c, i, schedulingDeps),
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
    'scheduling.add_draft_round',
    'add a round to the draft',
    'schedule.edit',
    (s) => ({ ...firstEdit(s), roundId: randomUUID(), label: 'Week 9', date: '2026-12-27' }),
    (c, i) => addDraftRound(c, i, schedulingDeps),
  ),
  ...scheduleRows(
    'scheduling.remove_draft_round',
    'remove a round whose only game is in the bin, in the draft',
    'schedule.edit',
    async (s, league) => {
      const roundId = await newRound(pglite, league.leagueId, s.seasonId, 2);
      // A game in the bin does not hold its round (S-60, step 2.181).
      await pglite.query('update games set round_id = $1, deleted_at = now() where id = $2', [
        roundId,
        s.second,
      ]);
      return { ...firstEdit(s), roundId };
    },
    (c, i) => removeDraftRound(c, i, schedulingDeps),
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
  // Whoever may cancel a game may put it back (S-51).
  ...gameRows(
    'games.put_game_back',
    'put a cancelled game back',
    'games.results',
    async (league, program) => ({
      gameId: (await gameIn(league, program, { status: 'cancelled' })).gameId,
      version: 1,
      reason: 'cancelledByMistake',
    }),
    (c, i) => putGameBack(c, i, gamesDeps),
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
  // Step 2.65 (T-122): correcting a tracked game in its grid is a correction, so it needs
  // what reopening does; the game was ended from the tracker and reopened by the owner. No
  // lines here (the matrix is about who): nothing changed is a save that adds no plays.
  ...gameRows(
    'games.correct_tracked_box_score',
    'correct a tracked game in its box score grid',
    'games.correct',
    async (league, program) => {
      const gameId = await trackedGameReopenedIn(league, program);
      const last = await pglite.query<{ seq: number }>(
        'select max(seq) as seq from game_events where game_id = $1',
        [gameId],
      );
      return { gameId, sequence: last.rows[0]?.seq ?? 0, lines: [] };
    },
    (c, i) => correctTrackedBoxScore(c, i, trackerDeps),
  ),
  // What that grid shows: whoever may correct the game. A read.
  ...gameRows(
    'games.read_tracked_box_score',
    'read the box score grid of a tracked game',
    'games.correct',
    async (league, program) => ({ gameId: await trackedGameEndedIn(league, program) }),
    (c, i) => readTrackedBoxScore(c, i, trackerDeps),
  ),
  // Step 2.229 (T-366): putting a box score back as its game's newest correction kept it
  // is a correction, so it needs what reopening does. The game is final again, saved
  // after a reopen whose correction kept its sheet (no lines here: the matrix is about who).
  ...gameRows(
    'games.put_sheet_back',
    'put a box score back as it was',
    'games.correct',
    async (league, program) => {
      const { gameId } = await gameIn(league, program, {
        status: 'final',
        home_score: 50,
        away_score: 40,
        finalized_at: '2026-12-06T19:30:00Z',
      });
      const sheet = { captureMode: 'box', overtimePeriods: null, lines: [] };
      await pglite.query(
        `insert into game_corrections (league_id, game_id, account_id, reason, before, after)
         values ($1, $2, $3, 'Reopened', $4, $5)`,
        [
          league.leagueId,
          gameId,
          league.ownerId,
          JSON.stringify({ version: 1, status: 'final', homeScore: 41, awayScore: 45, sheet }),
          JSON.stringify({ version: 1, status: 'scheduled', homeScore: null, awayScore: null }),
        ],
      );
      return { gameId, version: 1, reason: 'Saved the wrong thing' };
    },
    (c, i) => putSheetBack(c, i, trackerDeps),
  ),
  // Whether "Put the sheet back as it was" is offered, before the tap (step 2.229): whoever
  // may correct games, as the put back itself. A read.
  ...gameRows(
    'games.read_sheet_put_back_offer',
    'see whether a box score can be put back as it was',
    'games.correct',
    async (league, program) => {
      const { gameId } = await gameIn(league, program, {
        status: 'final',
        home_score: 50,
        away_score: 40,
        finalized_at: '2026-12-06T19:30:00Z',
      });
      return { gameId };
    },
    (c, i) => readSheetPutBackOffer(c, i, trackerDeps),
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
  // Step 2.56: Admin → Games → Scorekeepers, a season's open games and who may score them.
  ...gameRows(
    'games.list_scorekeepers',
    "see who scores a season's games",
    'games.manage',
    async (league, program) => ({ seasonId: await seasonIn(league, program) }),
    (c, i) => listScorekeepers(c, i, gamesDeps),
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
  // Step 2.153: which of a public page's games the person may score.
  {
    command: 'games.list_scoring_offers',
    name: "ask which of a page's games I may score",
    needs: 'games.score',
    // Anyone who scores somewhere may ask; the answer holds only what they may score.
    scope: 'program',
    // A game of today that has started, so it is offered (offeredOnItsDay).
    prepare: async (league) => ({
      input: { gameIds: [(await gameIn(league, true, { starts_at: inDays(-1 / 24) })).gameId] },
    }),
    run: (c, i) => listScoringOffers(c, i, gamesDeps),
  },
  // Step 2.156: the top of the games list, and its earlier games by round.
  {
    command: 'games.list_games_needing_result',
    name: 'see the games that still need a result',
    needs: 'games.score',
    // Anyone who scores somewhere may look; the list itself holds what they may score.
    scope: 'program',
    prepare: async () => ({ input: {} }),
    run: (c, i) => listGamesNeedingResult(c, i, gamesDeps),
  },
  // Step 2.56: every scheduled game after this week.
  {
    command: 'games.list_later_games',
    name: 'see the games after this week',
    needs: 'games.score',
    scope: 'program',
    prepare: async () => ({ input: {} }),
    run: (c, i) => listLaterGames(c, i, gamesDeps),
  },
  {
    command: 'games.list_earlier_games',
    name: 'see the earlier games, a round at a time',
    needs: 'games.score',
    scope: 'program',
    prepare: async () => ({ input: {} }),
    run: (c, i) => listEarlierGames(c, i, gamesDeps),
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
  // The players at the scorer's table (record 058) travel in the same batch: whoever may
  // score the game. With no session held, each is answered refused and nothing changes.
  ...gameRows(
    'games.apply_tracker_commands',
    'add and renumber players at the scorer’s table',
    'games.score',
    async (league, program) => ({
      gameId: (await gameIn(league, program)).gameId,
      protocolVersion: 2,
      sessionId: randomUUID(),
      commands: [
        {
          commandId: randomUUID(),
          at: matrixNow,
          input: {
            type: 'add-player',
            side: 'away',
            playerId: randomUUID(),
            jersey: '12',
            name: '',
          },
        },
        {
          commandId: randomUUID(),
          at: matrixNow,
          input: { type: 'change-player', side: 'away', playerId: randomUUID(), jersey: '5' },
        },
      ],
    }),
    (c, i) => applyTrackerCommands(c, i, trackerDeps),
  ),
  // The strongest takeover (review of step 2.117, item 10): with a session held, an add
  // whose device-made id is a person of ANOTHER league (a random id, as a device makes,
  // so the database itself must refuse it). Allowed callers get the batch answered,
  // with the add refused as taken; nothing is written in either league.
  ...gameRows(
    'games.apply_tracker_commands',
    'add a player whose id is another league’s person, with a session held',
    'games.score',
    async (league, program) => {
      const other = await newLeague(pglite);
      const stranger = randomUUID();
      await pglite.query(
        `insert into people (id, league_id, first_name, last_name) values ($1, $2, 'Other', 'League')`,
        [stranger, other.leagueId],
      );
      return { gameId: (await gameIn(league, program)).gameId, stranger };
    },
    async (c, i) => {
      const { gameId, stranger } = i as { gameId: string; stranger: string };
      const opened = await openScoringSession(c, { gameId, deviceId: 'matrix' }, scoringDeps);
      if (!opened.ok) return opened;
      const { sessionId } = opened.value as { sessionId?: string };
      const before = await pglite.query('select id from roster_entries');
      const result = await applyTrackerCommands(
        c,
        {
          gameId,
          protocolVersion: 2,
          sessionId: sessionId ?? randomUUID(),
          commands: [
            {
              commandId: randomUUID(),
              at: matrixNow,
              input: {
                type: 'add-player',
                side: 'away',
                playerId: stranger,
                jersey: '9',
                name: '',
              },
            },
          ],
        },
        trackerDeps,
      );
      if (!result.ok) return result;
      const [answer] = result.value.results;
      const after = await pglite.query('select id from roster_entries');
      const person = await pglite.query<{ league_id: string }>(
        'select league_id from people where id = $1',
        [stranger],
      );
      if (
        answer?.status !== 'refused' ||
        answer.reason.problem !== 'player-id-taken' ||
        after.rows.length !== before.rows.length ||
        person.rows.length !== 1 ||
        person.rows[0]?.league_id === c.leagueId
      ) {
        throw new Error(`the stranger's id was not refused cleanly: ${JSON.stringify(answer)}`);
      }
      return result;
    },
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
  // Marking a game not started (S-40): whoever may score it while only lineups and
  // clock taps are recorded; once a basket is, only those who may correct games, with
  // a reason. Each game is live, scored by its tracker, with no session holding it.
  ...gameRows(
    'games.mark_not_started',
    'mark a game not started with only clock taps',
    'games.score',
    async (league, program) => ({
      gameId: await trackedLiveGame(league, program, [{ type: 'start' }]),
      sequence: 1,
    }),
    (c, i) => markNotStarted(c, i, trackerDeps),
  ),
  ...gameRows(
    'games.mark_not_started',
    'mark a game not started once a basket is recorded',
    'games.correct',
    async (league, program) => ({
      gameId: await trackedLiveGame(league, program, [
        { type: 'start' },
        {
          type: 'score',
          side: 'home',
          playerId: await newPerson(pglite, league.leagueId),
          points: 2,
        },
      ]),
      sequence: 2,
      reason: 'startedByMistake',
    }),
    // Someone who may score the game but not correct it is refused here by S-40's line,
    // in its own words (plays-recorded: undo them first); for this row that is the
    // refusal of a permission not held, so it is read as not-allowed. Any other code
    // still fails the row.
    async (c, i) => {
      const result = await markNotStarted(c, i, trackerDeps);
      return !result.ok && result.error.code === 'plays-recorded'
        ? { ok: false, error: { code: 'not-allowed' } }
        : result;
    },
  ),
  // One game's own format (step 2.119, S-35, T-341): an admin of its games (`games.manage`:
  // owner, admin, scheduler) before it is under way, or whoever may score it before the
  // first play while the league lets scorekeepers (on to begin with). Each game is
  // scheduled and never opened at the table, so every one of them may.
  ...gameRows(
    'games.give_game_format',
    'give one game its own format',
    'games.score',
    async (league, program) => ({
      gameId: (await gameIn(league, program)).gameId,
      version: 1,
      format: formatOfRules(defaultSeasonRules()),
    }),
    (c, i) => giveGameFormat(c, i, trackerDeps),
  ),
  ...gameRows(
    'games.clear_game_format',
    'take back the format one game was given',
    'games.score',
    async (league, program) => ({ gameId: (await gameIn(league, program)).gameId, version: 1 }),
    (c, i) => clearGameFormat(c, i, trackerDeps),
  ),
  // The format screens' read: the same people; nothing changes.
  ...gameRows(
    'games.read_game_format',
    'read the format of one game',
    'games.score',
    async (league, program) => ({ gameId: (await gameIn(league, program)).gameId }),
    (c, i) => readGameFormat(c, i, trackerDeps),
  ),
  // The scorekeeper's reopening of a game they ended (step 2.120, S-36): whoever may
  // score it. The game was ended from the tracker five minutes ago, by the database's
  // clock, by the matrix's scorekeeper, so the scorekeeper may within the league's 30
  // minutes; everyone else who scores here may also correct games, which reopens it
  // at any time.
  ...gameRows(
    'games.reopen_tracked_game',
    'reopen a game ended from the tracker',
    'games.score',
    async (league, program) => ({
      gameId: await trackedGameEndedIn(league, program),
      requestId: randomUUID(),
      reason: 'End game was tapped too soon',
    }),
    (c, i) => reopenTrackedGame(c, i, trackerDeps),
  ),
  // Whether Reopen is offered, before the tap: whoever may score the game. A read.
  ...gameRows(
    'games.read_reopen_offer',
    'see whether a game ended from the tracker can be reopened',
    'games.score',
    async (league, program) => ({ gameId: await trackedGameEndedIn(league, program) }),
    (c, i) => readReopenOffer(c, i, trackerDeps),
  ),
  // The scorekeeper's reopening of a result they typed (step 2.177, S-52): whoever may
  // score it. The matrix's scorekeeper recorded it by hand five minutes ago, by the
  // database's clock, so they may within the league's 30 minutes; everyone else who
  // scores here may also correct games, which reopens it at any time.
  ...gameRows(
    'games.reopen_own_result',
    'reopen a result recorded by hand',
    'games.score',
    async (league, program) => ({
      gameId: await handResultRecordedIn(league, program),
      version: 1,
      reason: 'Typed into the wrong card',
    }),
    (c, i) => reopenOwnResult(c, i, trackerDeps),
  ),
  // Whether "Correct this result" is offered, before the tap: whoever may score it. A read.
  ...gameRows(
    'games.read_own_result_offer',
    'see whether a result recorded by hand can be reopened',
    'games.score',
    async (league, program) => ({ gameId: await handResultRecordedIn(league, program) }),
    (c, i) => readOwnResultOffer(c, i, trackerDeps),
  ),
  // The same for a whole list, in one read (T-349).
  // Anyone who scores somewhere may ask, as for games.list_my_games: it says only what is theirs.
  {
    command: 'games.read_own_result_offers',
    name: 'see which results recorded by hand on a list can be reopened',
    needs: 'games.score',
    scope: 'program',
    prepare: async (league) => ({ input: { gameIds: [await handResultRecordedIn(league, true)] } }),
    run: (c, i) => readOwnResultOffers(c, i, trackerDeps),
  },
];

/** A final score the matrix's scorekeeper typed in five minutes ago (step 2.177, 0028). */
async function handResultRecordedIn(league: League, program: boolean): Promise<string> {
  const { gameId } = await gameIn(league, program, {
    status: 'final',
    home_score: 50,
    away_score: 40,
    finalized_at: new Date(Date.now() - 300_000).toISOString(),
    finalized_by: league.accountOf('scorekeeper'),
  });
  return gameId;
}

/**
 * A live game of the league's season whose tracker has taken these taps, one event
 * each, with its saved state and its score: what marking it not started clears.
 */
async function trackedLiveGame(
  league: League,
  program: boolean,
  commands: readonly basketball.Command[],
): Promise<string> {
  const { gameId } = await gameIn(league, program, { capture_mode: 'live' });
  const rules = defaultSeasonRules();
  let state = basketball.newGame(engineRulesOf(rules), 0);
  for (const [i, command] of commands.entries()) {
    const commandId = randomUUID();
    state = basketball.apply(state, command, { id: commandId, now: matrixNow });
    const { type, ...payload } = command;
    await pglite.query(
      `insert into game_events (league_id, game_id, seq, command_id, type, payload, tapped_at, account_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        league.leagueId,
        gameId,
        i + 1,
        commandId,
        type,
        JSON.stringify(payload),
        new Date(matrixNow).toISOString(),
        league.ownerId,
      ],
    );
  }
  await pglite.query(
    'insert into game_states (league_id, game_id, seq, state) values ($1, $2, $3, $4)',
    [league.leagueId, gameId, commands.length, JSON.stringify(state)],
  );
  const { home, away } = basketball.derive(state).teams;
  await pglite.query(
    `update games set status = 'live', home_score = $2, away_score = $3, format = $4 where id = $1`,
    [gameId, home.score, away.score, JSON.stringify(rules)],
  );
  return gameId;
}

/** A game ended from the tracker (trackedGameEndedIn), then reopened by the owner with a reason. */
async function trackedGameReopenedIn(league: League, program: boolean): Promise<string> {
  const gameId = await trackedGameEndedIn(league, program);
  const context = {
    leagueId: league.leagueId,
    accountId: league.accountOf('owner'),
    requestId: 'matrix',
  };
  const reopened = await reopenGame(
    context,
    { gameId, version: 1, reason: 'A foul on the wrong player' },
    trackerDeps,
  );
  if (!reopened.ok) throw new Error(`reopen refused: ${reopened.error.code}`);
  return gameId;
}

/** A game the matrix's scorekeeper ended from the tracker five minutes ago: a basket, then the end. */
async function trackedGameEndedIn(league: League, program: boolean): Promise<string> {
  const { gameId } = await gameIn(league, program, {
    capture_mode: 'live',
    status: 'final',
    home_score: 2,
    away_score: 0,
    finalized_at: new Date(Date.now() - 300_000).toISOString(),
  });
  const personId = await newPerson(pglite, league.leagueId);
  const basket = { type: 'score', side: 'home', playerId: personId, points: 2 } as const;
  let state = basketball.newGame(engineRulesOf(defaultSeasonRules()), 0);
  const taps = [basket, { type: 'end' } as const];
  for (const [i, command] of taps.entries()) {
    const commandId = randomUUID();
    state = basketball.apply(state, command, { id: commandId, now: matrixNow - 300_000 });
    const { type, ...payload } = command;
    await pglite.query(
      `insert into game_events (league_id, game_id, seq, command_id, type, payload, tapped_at, account_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        league.leagueId,
        gameId,
        i + 1,
        commandId,
        type,
        JSON.stringify(payload),
        new Date(matrixNow - 300_000).toISOString(),
        league.accountOf('scorekeeper'),
      ],
    );
  }
  await pglite.query(
    'insert into game_states (league_id, game_id, seq, state) values ($1, $2, 2, $3)',
    [league.leagueId, gameId, JSON.stringify(state)],
  );
  return gameId;
}

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
    'leagues.restore_team',
    'restore a team',
    // A-5: what removing a team needs.
    'teams.manage',
    async (league, program) => {
      const seasonId = await seasonIn(league, program);
      const teamId = await newTeam(pglite, league.leagueId, seasonId);
      await pglite.query('update teams set deleted_at = now() where id = $1', [teamId]);
      return { teamId };
    },
    (c, i) => restoreTeam(c, i, binDeps),
  ),
  ...divisionRows(
    'leagues.restore_game',
    'restore a game',
    // A-5: what removing a game needs (only publishing removes one).
    'schedule.publish',
    async (league, program) => {
      const { gameId } = await gameIn(league, program, { deleted_at: new Date() });
      return { gameId };
    },
    (c, i) => restoreGame(c, i, binDeps),
  ),
  {
    command: 'leagues.restore_person',
    name: 'restore a person',
    // A-5: what removing a person needs.
    needs: 'people.manage',
    prepare: async (league) => {
      const personId = await newPerson(pglite, league.leagueId);
      await pglite.query('update people set deleted_at = now() where id = $1', [personId]);
      return { input: { personId } };
    },
    run: (c, i) => restorePerson(c, i, binDeps),
  },
  {
    command: 'leagues.list_bin',
    name: 'see the bin',
    needs: 'bin.restore',
    prepare: async () => ({ input: {} }),
    run: (c, i) => listBin(c, i, binDeps),
  },
  {
    command: 'leagues.list_bin_part',
    name: 'see the part of the bin one may bring back (T-308)',
    // Anyone signed in; each sees only what their own restores allow (none: nothing).
    needs: 'signed-in',
    prepare: async () => ({ input: {} }),
    run: (c, i) => listBinPart(c, i, binDeps),
  },
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
    needs: 'venues.manage',
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
    needs: 'venues.manage',
    prepare: async (league) => {
      const venueId = await newVenue(pglite, league.leagueId);
      const courtId = await newCourt(pglite, league.leagueId, venueId);
      return { input: { courtId: await binned('courts', courtId) } };
    },
    run: (c, i) => restoreCourt(c, i, schedulingDeps),
  },
  // Reading the schedule: the scheduler (program-limited too), the owner and admins; not a
  // scorekeeper (step 2.227, T-472).
  {
    command: 'scheduling.list_venues',
    name: 'see the venues and courts',
    needs: 'schedule.read',
    // Venues are league-shared: a grant at any scope reads them, so program roles too.
    scope: 'program',
    prepare: async () => ({ input: {} }),
    run: (c, i) => listVenues(c, i, schedulingDeps),
  },
  {
    command: 'scheduling.count_place_games',
    name: 'see how many games each venue and court has',
    needs: 'venues.manage',
    // As the venues it counts: league-shared, so a program-limited scheduler reads it too.
    scope: 'program',
    prepare: async () => ({ input: {} }),
    run: (c, i) => countPlaceGames(c, i, schedulingDeps),
  },
];

/**
 * One row per declared setting and level it allows: the permission is the setting's
 * own (T-98), checked at the league, or at the program of a program or a season (P4 §4).
 */
/**
 * M2, by hand from the spec: the permission each setting needs (T-98: every setting
 * names one). The league's settings (P4 §3, "Settings": the owner and admins; T5 §4's
 * `league.settings`): who may score, the start page, reopening, formats, stats levels,
 * privacy, ranking and the site's notice. The matrix's own banner is the site's (an editor).
 */
const settingNeeds: Readonly<Record<string, Permission>> = {
  'games.scorekeeperReopenMinutes': 'league.settings',
  'games.scorekeepersMayChangeFormat': 'league.settings',
  'games.whoMayScore': 'league.settings',
  'members.startPage': 'league.settings',
  'privacy.childrenInFullConfirmed': 'league.settings',
  'privacy.playersMayAskForInitials': 'league.settings',
  'privacy.publicNames': 'league.settings',
  'privacy.scorekeepersSeeFullNames': 'league.settings',
  'site.banner': 'site.edit',
  'site.doNotIndex': 'league.settings',
  'site.notice': 'league.settings',
  'statistics.minimumGamesToRank': 'league.settings',
  'teams.mayChooseStatsLevel': 'league.settings',
  'teams.startingStatsLevel': 'league.settings',
};

/** The permission written above for a setting; one not written fails the file. */
function needsOfSetting(key: string): Permission {
  const needs = settingNeeds[key];
  if (needs === undefined) throw new Error(`no permission written by hand for ${key} (M2)`);
  return needs;
}

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
          needs: needsOfSetting(setting.key),
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
          needs: needsOfSetting(setting.key),
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
    command: 'people.get_person',
    name: "read one person's record",
    needs: 'people.read',
    prepare: async (league) => ({
      input: { personId: await newPerson(pglite, league.leagueId) },
    }),
    run: (c, i) => getPerson(c, i, peopleDeps),
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
    command: 'people.set_name_request',
    name: "take a person's name off the public pages (R-23)",
    needs: 'people.manage',
    prepare: async (league) => ({
      input: {
        personId: await newPerson(pglite, league.leagueId),
        version: 1,
        showAs: 'removed',
        reason: 'personAsked',
      },
    }),
    run: (c, i) => setNameRequest(c, i, peopleDeps),
  },
  {
    command: 'people.set_name_request',
    name: "show a child's name as initials, as a guardian asked (R-25)",
    needs: 'people.manage',
    prepare: async (league) => {
      const personId = await newPerson(pglite, league.leagueId);
      // The database counts the change itself (0002), so the version is read back.
      const changed = await pglite.query<{ version: number }>(
        'update people set is_minor = true where id = $1 returning version',
        [personId],
      );
      const version = changed.rows[0]?.version ?? 1;
      return { input: { personId, version, showAs: 'initials', reason: 'guardianAsked' } };
    },
    run: (c, i) => setNameRequest(c, i, peopleDeps),
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
    'standings.list_adjustments',
    "list a season's adjustments",
    'standings.adjust',
    async (league, program) => ({ seasonId: await seasonIn(league, program) }),
    (c, i) => listAdjustments(c, i, standingsDeps),
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
  ...gameRows(
    'standings.record_coin_flip',
    'record a coin flip',
    'standings.adjust',
    async (league, program) => {
      const seasonId = await seasonIn(league, program);
      // Two teams with no games: level after every tiebreaker.
      const teamIds = [
        await newTeam(pglite, league.leagueId, seasonId),
        await newTeam(pglite, league.leagueId, seasonId),
      ];
      return { seasonId, teamIds, method: 'by-hand' };
    },
    (c, i) => recordCoinFlip(c, i, standingsDeps),
  ),
  ...gameRows(
    'standings.remove_coin_flip',
    'take a coin flip off',
    'standings.adjust',
    async (league, program) => {
      const seasonId = await seasonIn(league, program);
      const one = await newTeam(pglite, league.leagueId, seasonId);
      const two = await newTeam(pglite, league.leagueId, seasonId);
      const added = await pglite.query<{ id: string }>(
        `insert into standings_coin_flips (league_id, season_id, team_ids, method, account_id)
         values ($1, $2, array[$3::uuid, $4::uuid], 'by-hand', $5) returning id`,
        [league.leagueId, seasonId, one, two, league.ownerId],
      );
      return { seasonId, flipId: added.rows[0]?.id };
    },
    (c, i) => removeCoinFlip(c, i, standingsDeps),
  ),
  ...gameRows(
    'standings.overturn_result',
    'overturn a result',
    'standings.adjust',
    async (league, program) => {
      const game = await gameIn(league, program, {
        status: 'final',
        home_score: 50,
        away_score: 40,
        finalized_at: '2026-12-06T19:30:00Z',
      });
      return { seasonId: game.seasonId, gameId: game.gameId, reason: 'Ineligible player' };
    },
    (c, i) => overturnResult(c, i, standingsDeps),
  ),
  ...gameRows(
    'standings.award_game',
    'award a game not played',
    'standings.adjust',
    async (league, program) => {
      const seasonId = await seasonIn(league, program);
      return {
        seasonId,
        winnerTeamId: await newTeam(pglite, league.leagueId, seasonId),
        loserTeamId: await newTeam(pglite, league.leagueId, seasonId),
        reason: 'Not played: awarded',
      };
    },
    (c, i) => awardGame(c, i, standingsDeps),
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
  // League settings → Profile (step 2.125): the owner and admins (U-14).
  {
    command: 'leagues.set_profile',
    name: "change the league's contact email, city, time zone and listing",
    needs: 'league.settings',
    prepare: async () => ({
      input: {
        contactEmail: 'matrix@example.org',
        city: 'Matrix town',
        timeZone: 'UTC',
        listed: true,
        version: 1,
      },
    }),
    run: (c, i) => setLeagueProfile(c, i, leaguesDeps),
  },
  {
    command: 'leagues.set_audience',
    name: 'change who plays in the league',
    needs: 'league.settings',
    prepare: async () => ({ input: { audience: 'adult', confirmed: true, version: 1 } }),
    run: (c, i) => setLeagueAudience(c, i, leaguesDeps),
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
  // The league's site (P5 §2, step 2.187): publishing its design is the Site area's
  // `site.publish`, which the owner, admins and editors hold (P4 §4).
  {
    command: 'leagues.publish_site_design',
    name: "publish a design for the league's site",
    needs: 'site.publish',
    prepare: async () => ({
      input: {
        startingDesign: 'midnight-gold',
        design: startingDesign('midnight-gold'),
        sinceRelease: 0,
      },
    }),
    run: (c, i) => publishSiteDesign(c, i, leaguesDeps),
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
    command: 'leagues.start_season',
    name: 'start a new season of the default program (step 2.130)',
    needs: 'season.settings',
    prepare: async () => ({ input: { slug: 'next', name: 'Next', carry: 'teams' } }),
    run: (c, i) => startSeason(c, i, leaguesDeps),
  },
  {
    command: 'leagues.archive_season',
    name: 'archive a season of the default program (step 2.130)',
    needs: 'season.settings',
    prepare: async (league) => {
      const seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId);
      // Shown to visitors: a hidden season cannot be archived (T-388).
      const shown = await pglite.query<{ version: number }>(
        `update seasons set status = 'active' where id = $1 returning version`,
        [seasonId],
      );
      return { input: { seasonId, version: shown.rows[0]?.version ?? 1 } };
    },
    run: (c, i) => archiveSeason(c, i, leaguesDeps),
  },
  // What Admin → League settings draws (step 2.227, T-474): the league's own settings, so
  // the whole league's `league.settings`; an admin limited to one program is refused.
  {
    command: 'leagues.read_league_settings',
    name: 'read the league settings',
    needs: 'league.settings',
    prepare: async () => ({ input: {} }),
    run: (c, i) => readLeagueSettings(c, i, leaguesDeps),
  },
  // The same read in an archived league (T-474: in any state of the league), so the holders
  // still read it where nothing may be edited.
  {
    command: 'leagues.read_league_settings',
    name: 'read the league settings of an archived league',
    needs: 'league.settings',
    prepare: async (league) => {
      await pglite.query("update leagues set status = 'archived' where id = $1", [league.leagueId]);
      return { input: {} };
    },
    run: (c, i) => readLeagueSettings(c, i, leaguesDeps),
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
        firstSeason: { slug: 'first', name: 'First season' },
      },
    }),
    run: (c, i) => createLeague(c, i, leaguesDeps),
  },
  // Removing a league made by mistake (step 2.150): our staff only, in a fresh draft
  // league made by createLeague as the tool makes it. It runs as the tool runs it, in
  // a transaction of the tables' owner set to that league and account (record 063),
  // not as app_user, which may not delete a league.
  {
    command: 'leagues.remove_draft',
    name: 'remove a draft league made by mistake (our staff only)',
    needs: 'platform-staff',
    prepare: async (league) => {
      const leagueId = randomUUID();
      const slug = unique('mistake');
      const created = await createLeague(
        { leagueId, accountId: staffId, requestId: 'matrix' },
        {
          slug,
          name: 'Made by mistake',
          timeZone: 'UTC',
          audience: 'adult',
          ownerAccountId: league.ownerId,
          sportKey: 'basketball',
          firstSeason: { slug: 'first', name: 'First season' },
        },
        leaguesDeps,
      );
      if (!created.ok) throw new Error(`the league to remove was not made: ${created.error.code}`);
      const shown = await one<{ version: number; created_at: string }>(
        pglite,
        'select version, created_at::text as created_at from leagues where id = $1',
        [leagueId],
      );
      return {
        leagueId,
        input: {
          typedSlug: slug,
          shownVersion: shown.version,
          shownCreatedAt: shown.created_at,
          typedOwnerEmail: null,
        },
      };
    },
    run: (c, i) => removeDraftLeague(c, i, removalDeps),
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
  // The log's own screen (step 2.77): the whole league's, by person, kind and time.
  {
    command: 'access.search_activity',
    name: "search the league's activity log",
    needs: 'activity.read',
    prepare: async () => ({ input: { kind: 'teams' } }),
    run: (c, i) => searchActivity(c, i, accessDeps),
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
  // What a link offers, read before accepting it (step 2.97): anyone signed in who holds it.
  {
    command: 'access.read_invitation',
    name: 'read what an invitation link offers',
    needs: 'signed-in',
    prepare: async (league) => {
      const token = 'b'.repeat(22) + randomUUID().replace(/-/g, '').slice(0, 21);
      await invitationIn(league, { token });
      return { input: { token } };
    },
    run: (c, i) => readInvitation(c, i, accessDeps),
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
  // Names `games.score`, for a game with only lineups and clock taps; once a basket,
  // foul or turnover is recorded it takes `games.correct` (S-40), which its own check decides.
  'games.mark_not_started': ['games.correct'],
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
            (r) => r.command === command && r.needs === needsOfSetting(setting.key) && r.declared,
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

  it("writes each setting's permission by hand, and core declares the same (M2, T-98)", () => {
    const declared = [...declaredSettings.all(), bannerSetting];
    expect(Object.keys(settingNeeds).sort()).toEqual(declared.map((s) => s.key).sort());
    for (const setting of declared) {
      expect(setting.permission, setting.key).toBe(settingNeeds[setting.key]);
    }
  });

  it('cannot yet give anyone a club admin role: a club scope is refused until clubs exist (0008)', async () => {
    const made = await newLeague(pglite);
    const accountId = await newAccount(pglite);
    await expect(
      pglite.query(
        `insert into role_grants (league_id, account_id, role, scope_type, scope_id)
         values ($1, $2, 'club_admin', 'club', $3)`,
        [made.leagueId, accountId, randomUUID()],
      ),
    ).rejects.toThrow(/role_grants_scope_available/);
  });

  for (const row of rows) {
    it(`${row.command}: ${row.name} (${row.needs})`, async () => {
      const outcomes: Partial<Record<Actor, string>> = {};
      const given: Partial<Record<Actor, readonly string[]>> = {};
      const shown: Partial<Record<Actor, readonly string[]>> = {};
      let ownersValue: unknown = undefined;
      for (const actor of actors) {
        const reads = readsGiven.has(row.command);
        const run = await runRowFor(row, actor, reads ? withOneOfEach : undefined);
        outcomes[actor] = run.code;
        if (actor === 'owner') ownersValue = run.value;
        if (run.code === 'ok' && readsGiven.has(row.command)) given[actor] = fieldsOf(run.value);
        if (run.code === 'ok' && gameListsShow[row.command] !== undefined) {
          shown[actor] = labelsIn(run.value, run.leagueId);
        }
      }
      const allowed = expectedActors(row.needs, row.scope ?? 'league');
      const expected = Object.fromEntries(
        actors.map((actor) => [
          actor,
          !allowed.includes(actor)
            ? 'not-allowed'
            : notTheirs[row.command]?.actors.includes(actor)
              ? notTheirs[row.command]?.code
              : 'ok',
        ]),
      );
      expect(outcomes).toEqual(expected);
      // H2: the owner is given every list withOneOfEach fills with something in it.
      const stillEmpty = filledLists[row.command];
      if (stillEmpty !== undefined) {
        expect(emptyListsIn(ownersValue), 'the lists left empty (H2)').toEqual(stillEmpty);
      }
      // T-76: what each one who may read it is given, field by field.
      if (readsGiven.has(row.command)) {
        const fields = Object.fromEntries(
          Object.keys(given).map((actor) => [actor, fieldsFor(row, actor as Actor)]),
        );
        expect(given, 'the fields each person is given (T-76)').toEqual(fields);
      }
      // M1: which games, not only which fields: one limited to a program sees its games only.
      if (gameListsShow[row.command] !== undefined) {
        const games = Object.fromEntries(
          Object.keys(shown).map((actor) => [
            actor,
            gamesShown(
              row.command,
              otherProgramOnly.includes(actor as Actor) ? ['other'] : ['default', 'other'],
            ),
          ]),
        );
        expect(shown, 'the games each person is given (M1)').toEqual(games);
      }
    });
  }

  it('writes the fields of every read, and of reads only (T-76)', () => {
    expect([...readsGiven].filter((command) => readFields[command] === undefined)).toEqual([]);
    expect(Object.keys(readFields).filter((command) => !readsGiven.has(command))).toEqual([]);
    const named = Object.values(readFields).flatMap((read) => Object.keys(read.byActor ?? {}));
    expect(named.filter((actor) => !(actors as readonly string[]).includes(actor))).toEqual([]);
  });
});

/**
 * T-76: the fields `actor` should be given by a read, from role-matrix-fields: its own
 * list, and each private field whose permission it holds where the row applies.
 */
function fieldsFor(row: Row, actor: Actor): string[] {
  const read = readFields[row.command];
  if (read === undefined) return ['(no fields written for this read)'];
  const own = read.byActor?.[actor] ?? read.all;
  const guarded = (read.guarded ?? []).flatMap((guard) =>
    expectedActors(guard.permission, row.scope ?? 'league').includes(actor) ? guard.fields : [],
  );
  return [...new Set([...own, ...guarded])].sort();
}

/**
 * Reopening one's own result (S-38, step 2.177): the result these rows reopen was
 * recorded by the matrix's scorekeeper, so another scorekeeper, the one limited to the
 * program, holds the permission but is refused: the result is not theirs.
 */
const notTheirs: Readonly<Record<string, { actors: readonly Actor[]; code: string }>> = {
  'games.reopen_own_result': { actors: ['program_scorekeeper'], code: 'not-recorded-by-you' },
  'games.reopen_tracked_game': { actors: ['program_scorekeeper'], code: 'not-ended-by-you' },
};

/**
 * What runs after a row's input is made: the matrix's league, the input, and the id of
 * the league the call is about (the row's own, such as a league it removes, or the matrix's).
 */
type Before = (league: League, input: unknown, about: string) => Promise<void>;

/** One row as one actor, in a league of its own; `before` runs after the input is made. */
async function runRow(
  row: Row,
  actor: Actor,
  before: Before = async () => {},
  accountOf: (league: League) => string | null = (league) => league.accountOf(actor),
): Promise<string> {
  return (await runRowFor(row, actor, before, accountOf)).code;
}

/** As `runRow`, with what a call that worked handed back (T-76). */
async function runRowFor(
  row: Row,
  actor: Actor,
  before: Before = async () => {},
  accountOf: (league: League) => string | null = (league) => league.accountOf(actor),
): Promise<{ readonly code: string; readonly value: unknown; readonly leagueId: string }> {
  const league = await leagueWithActors();
  const { input, leagueId } = await row.prepare(league);
  const team = await teamOfInput(input);
  if (team !== null) await moveTeamGrantsTo(league, team);
  const about = leagueId ?? league.leagueId;
  await before(league, input, about);
  const context = { leagueId: about, accountId: accountOf(league), requestId: 'matrix' };
  const result = await row.run(context, input);
  return result.ok
    ? { code: 'ok', value: result.value, leagueId: league.leagueId }
    : { code: result.error?.code ?? 'failed', value: undefined, leagueId: league.leagueId };
}

/**
 * For a read (T-76): a person with every private field R-16 names that the league holds
 * (a contact email, a birth date, under 18), on the roster of the team the call is about,
 * and the person a call reads made the same; so a read that hands one out is seen to.
 */
async function withPrivatePerson(league: League, input: unknown) {
  const privateFields = `contact_email = 'private@example.test', birth_date = '2012-04-01', is_minor = true`;
  const person = await one<{ id: string }>(
    pglite,
    `insert into people (league_id, first_name, last_name) values ($1, 'Made-up', 'Private')
     returning id`,
    [league.leagueId],
  );
  const fields =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const read = typeof fields['personId'] === 'string' ? fields['personId'] : null;
  await pglite.query(`update people set ${privateFields} where id = $1 or id = $2`, [
    person.id,
    read,
  ]);
  const team = await teamOfInput(input);
  if (team !== null) await newRosterEntry(pglite, league.leagueId, team, person.id);
}

/** What withOneOfEach made, by league: each game's and team's id with a label (M1). */
const madeIn = new Map<string, ReadonlyMap<string, string>>();

/** A time `days` from now (a fraction of a day is fine), as the games table holds it. */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/** A season's stage: its own if it has one (one regular stage a season), else a new one. */
async function stageOf(seasonId: string, leagueId: string) {
  const found = await pglite.query<{ id: string }>(
    'select id from stages where season_id = $1 order by id limit 1',
    [seasonId],
  );
  return found.rows[0]?.id ?? newStage(pglite, leagueId, seasonId);
}

/** The id of the first row a query finds. */
async function idOf(sql: string, params: unknown[]) {
  return (await one<{ id: string }>(pglite, sql, params)).id;
}

/**
 * For a read (T-76, T-503, the step 2.228 review's H2): one of each thing a read lists,
 * so the fields of every list's items are checked, never only an empty list. Besides
 * withPrivatePerson's person: in each program a season whose two teams have a game
 * tomorrow, one a month ahead, one past with no result, one decided in a round and one
 * postponed, all at one court; an invitation to the league and one to the program; an
 * activity entry about the program; a binned venue and division; and for the season,
 * team or game the read is about, a division, an adjustment, a coin flip no level set
 * uses, two teams level with each other, a decided game, a game to play and a line of a
 * saved box score. The games and teams are labelled `default:` or `other:` (M1).
 */
async function withOneOfEach(league: League, input: unknown) {
  await withPrivatePerson(league, input);
  const leagueId = league.leagueId;
  const labels = new Map<string, string>();
  const venueId = await newVenue(pglite, leagueId);
  const courtId = await newCourt(pglite, leagueId, venueId);
  const decided = (days: number) => ({
    starts_at: inDays(days),
    status: 'final',
    home_score: 50,
    away_score: 40,
    finalized_at: inDays(days),
  });
  for (const program of [false, true]) {
    const side = program ? 'other' : 'default';
    const seasonId = await seasonIn(league, program);
    const stageId = await newStage(pglite, leagueId, seasonId);
    const homeTeamId = await newTeam(pglite, leagueId, seasonId);
    const awayTeamId = await newTeam(pglite, leagueId, seasonId);
    labels.set(homeTeamId, `${side}:team`).set(awayTeamId, `${side}:team`);
    const roundId = await newRound(pglite, leagueId, seasonId, 1);
    labels.set(roundId, `${side}:round`);
    const kinds: Record<string, Record<string, unknown>> = {
      tomorrow: { starts_at: inDays(1) },
      later: { starts_at: inDays(30) },
      unrecorded: { starts_at: inDays(-2) },
      decided: { ...decided(-10), round_id: roundId },
      postponed: { starts_at: inDays(-3), status: 'postponed' },
    };
    for (const [kind, columns] of Object.entries(kinds)) {
      const gameId = await newGame(pglite, {
        leagueId,
        seasonId,
        stageId,
        homeTeamId,
        awayTeamId,
        columns: { venue_id: venueId, court_id: courtId, ...columns },
      });
      labels.set(gameId, `${side}:${kind}`);
    }
  }
  await invitationIn(league);
  await invitationIn(league, { program: true });
  await pglite.query(
    `insert into activity_log (league_id, actor_account_id, action, summary, details)
     values ($1, $2, 'teams.create_team', 'Added a team', $3::jsonb)`,
    [leagueId, league.ownerId, JSON.stringify({ scopeType: 'program', scopeId: league.programId })],
  );
  await binned('venues', await newVenue(pglite, leagueId));
  await binned('divisions', await divisionIn(league, false));
  const about =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const season = about['seasonId'];
  if (typeof season === 'string') {
    await newDivision(pglite, leagueId, season);
    const stageId = await stageOf(season, leagueId);
    const [won, lost] = [
      await newTeam(pglite, leagueId, season),
      await newTeam(pglite, leagueId, season),
    ];
    const [one, two] = [
      await newTeam(pglite, leagueId, season),
      await newTeam(pglite, leagueId, season),
    ];
    const game = { leagueId, seasonId: season, stageId };
    await newGame(pglite, { ...game, homeTeamId: won, awayTeamId: lost, columns: decided(-5) });
    const toPlay = await newGame(pglite, {
      ...game,
      homeTeamId: one,
      awayTeamId: two,
      columns: { starts_at: inDays(2) },
    });
    await pglite.query(
      'insert into game_assignments (league_id, game_id, account_id) values ($1, $2, $3)',
      [leagueId, toPlay, league.accountOf('scorekeeper')],
    );
    await pglite.query(
      `insert into standings_adjustments (league_id, season_id, team_id, wins, reason, account_id)
       values ($1, $2, $3, 1, 'Won by ruling', $4)`,
      [leagueId, season, won, league.ownerId],
    );
    await pglite.query(
      `insert into standings_coin_flips (league_id, season_id, team_ids, method, account_id)
       values ($1, $2, array[$3::uuid, $4::uuid], 'by-hand', $5)`,
      [leagueId, season, won, lost, league.ownerId],
    );
  }
  const team = about['teamId'];
  if (typeof team === 'string') {
    const seasonId = await idOf('select season_id as id from teams where id = $1', [team]);
    const stageId = await stageOf(seasonId, leagueId);
    const game = { leagueId, seasonId, stageId, homeTeamId: team };
    await newGame(pglite, {
      ...game,
      awayTeamId: await newTeam(pglite, leagueId, seasonId),
      columns: { starts_at: inDays(2) },
    });
    await newGame(pglite, {
      ...game,
      awayTeamId: await newTeam(pglite, leagueId, seasonId),
      columns: decided(-5),
    });
  }
  const gameId = about['gameId'];
  if (typeof gameId === 'string') {
    const home = await idOf('select home_team_id as id from games where id = $1', [gameId]);
    const personId = await newPerson(pglite, leagueId);
    await newRosterEntry(pglite, leagueId, home, personId);
    await pglite.query(
      `insert into player_game_stats (league_id, game_id, team_id, person_id, played, stats)
       values ($1, $2, $3, $4, true, '{"points": 2}')`,
      [leagueId, gameId, home, personId],
    );
  }
  madeIn.set(leagueId, labels);
}

/** H2: the paths of the empty lists in a value (`games[].assigned[]`), ids as `*`. */
function emptyListsIn(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${path}[]`];
    return [...new Set(value.flatMap((item) => emptyListsIn(item, `${path}[]`)))].sort();
  }
  if (typeof value !== 'object' || value === null || value instanceof Date) return [];
  const idKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  return [
    ...new Set(
      Object.entries(value).flatMap(([key, item]) =>
        emptyListsIn(item, `${path === '' ? '' : `${path}.`}${idKey.test(key) ? '*' : key}`),
      ),
    ),
  ].sort();
}

/**
 * H2, by hand: the reads whose lists were empty in the matrix until withOneOfEach (the
 * step 2.228 review), and the lists of each that the owner is still given empty, each
 * with its reason. Any other empty list fails, so its items' fields are checked again.
 */
const filledLists: Readonly<Record<string, readonly string[]>> = {
  'access.list_access': [],
  'access.list_activity': [],
  'access.search_activity': [],
  'games.get_box_score_sheet': [],
  'games.list_earlier_games': [],
  'games.list_games_needing_result': [],
  'games.list_later_games': [],
  'games.list_my_games': [],
  'games.list_postponed_games': [],
  'games.list_scorekeepers': [],
  'games.list_scoring_offers': [],
  'leagues.list_bin': [],
  'leagues.list_bin_part': [],
  'leagues.list_divisions': [],
  'scheduling.count_place_games': [],
  'scheduling.list_venues': [],
  'standings.list_adjustments': [],
  'teams.count_team_games': [],
};

/** M1: the labels of what withOneOfEach made that a value names, as a sorted list. */
function labelsIn(value: unknown, leagueId: string): string[] {
  const labels = madeIn.get(leagueId) ?? new Map<string, string>();
  const found = new Set<string>();
  const walk = (item: unknown): void => {
    if (typeof item === 'string') {
      const label = labels.get(item);
      if (label !== undefined) found.add(label);
    } else if (Array.isArray(item)) {
      item.forEach(walk);
    } else if (typeof item === 'object' && item !== null) {
      for (const [key, inner] of Object.entries(item)) {
        walk(key);
        walk(inner);
      }
    }
  };
  walk(value);
  return [...found].sort();
}

/**
 * M1, by hand from the spec: which of withOneOfEach's games each list shows to someone
 * who scores (or, for postponed games, reads the schedule) in the whole league. Its teams
 * come with them. Someone limited to the other program is given only that program's
 * (P4 §4); in a league that scores assigned games only, a scorekeeper only the games
 * assigned to them (P4 §4, A-13).
 */
const gameListsShow: Readonly<Record<string, readonly string[]>> = {
  // "Today and the week ahead" (P4 §4), with each game's teams.
  'games.list_my_games': ['team', 'tomorrow'],
  // Past its start, with no result.
  'games.list_games_needing_result': ['team', 'unrecorded'],
  // Scheduled after this week, and the teams offered to choose from.
  'games.list_later_games': ['later', 'team'],
  // Before today, decided or called off: by round, a round's games shown when asked for.
  'games.list_earlier_games': ['round'],
  // Waiting to be rescheduled.
  'games.list_postponed_games': ['postponed', 'team'],
};

/** The labels a list should name for one who sees `sides` of the league (M1). */
function gamesShown(command: string, sides: readonly ('default' | 'other')[]): string[] {
  const kinds = gameListsShow[command] ?? [];
  return sides.flatMap((side) => kinds.map((kind) => `${side}:${kind}`)).sort();
}

/** M1: the people limited to the league's other program. */
const otherProgramOnly: readonly Actor[] = [
  'program_admin',
  ...programLimited.map(([actor]) => actor),
];

/**
 * Every field a value carries, as paths: `games[].homeTeam.name`. An empty list is
 * `name[]`; a key that is an id (a map by id) is `*`, so the paths never depend on ids.
 */
function fieldsOf(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${path}[]`];
    return [...new Set(value.flatMap((item) => fieldsOf(item, `${path}[]`)))].sort();
  }
  if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return [path === '' ? '{}' : `${path}{}`];
    const idKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    return [
      ...new Set(
        entries.flatMap(([key, item]) =>
          fieldsOf(item, `${path === '' ? '' : `${path}.`}${idKey.test(key) ? '*' : key}`),
        ),
      ),
    ].sort();
  }
  return [path === '' ? '.' : path];
}

/**
 * Puts the league in a state as our staff would, without counting a change of the
 * league's version (0002), so an input made for the league's first version still fits.
 */
async function putLeagueIn(leagueId: string, status: 'archived' | 'suspended') {
  await pglite.exec(`begin; set local session_replication_role = replica;
    update leagues set status = '${status}' where id = '${leagueId}'; commit;`);
}

/**
 * U-9, by hand: the commands that only read. In an archived or suspended league they
 * still work for whoever may use them (the league's pages stay, R-26's reason).
 */
const readCommands: ReadonlySet<string> = new Set([
  'access.list_access',
  'access.list_activity',
  'access.my_access',
  'access.search_activity',
  'games.list_earlier_games',
  'games.list_games_needing_result',
  'games.list_later_games',
  'games.list_my_games',
  'games.list_postponed_games',
  'games.list_scorekeepers',
  'games.list_scoring_offers',
  'imports.get_fixture_import',
  'leagues.get_season',
  'leagues.list_bin',
  'leagues.list_bin_part',
  'leagues.list_divisions',
  'leagues.read_league_settings',
  'people.get_person',
  'people.list_people',
  'scheduling.count_place_games',
  'scheduling.get_schedule_draft',
  'scheduling.list_venues',
  'scheduling.preview_schedule_publish',
  'teams.count_team_games',
  'teams.list_roster',
]);

/**
 * T-501, by hand: the reads that are the first step of a change and answer only someone
 * who may make it: the sheet a score is typed on, the tracker's state and rosters, a
 * game's format for the tracker, the grid a tracked game is corrected in, whether a
 * result or a sheet can be reopened or put back, the preview of new season rules and
 * the list adjustments are added on. In a read-only league no one may make the change
 * (U-9), so they are refused with it; the league's pages still show what they show.
 */
const changeToolReads: ReadonlySet<string> = new Set([
  'games.get_box_score_sheet',
  'games.read_game_format',
  'games.read_own_result_offer',
  'games.read_own_result_offers',
  'games.read_reopen_offer',
  'games.read_sheet_put_back_offer',
  'games.read_tracked_box_score',
  'games.read_tracker_rosters',
  'games.read_tracker_state',
  'leagues.preview_season_rules',
  'standings.list_adjustments',
]);

/** Every read: what each one gives each kind of person is checked (T-76). */
const readsGiven: ReadonlySet<string> = new Set([
  ...readCommands,
  ...changeToolReads,
  'access.read_invitation',
]);

/**
 * FINDING (for the lead, step 2.228): rows the sweep below cannot settle from the spec,
 * each named with what was seen; they show as "todo" until the lead decides.
 */
const stateFindings: Readonly<Record<string, string>> = {
  // None open: `leagues.remove_draft` was one, settled by S-132 (see stillWorksIn).
};

type LeagueState = 'archived' | 'suspended';

/**
 * The changes that still work in an archived or suspended league, by hand from the
 * spec, each with its reason; every other change is refused there (U-9).
 */
function stillWorksIn(row: Row, state: LeagueState): boolean | string {
  switch (row.command) {
    // U-9, T-226: cancelling an invitation and removing someone always work; taking a
    // scorekeeper off a game is taking their access to it away.
    case 'access.cancel_invitation':
    case 'access.revoke_grant':
    case 'games.unassign_scorekeeper':
      return true;
    // T-226, T-288: no one joins a read-only league, and a link that does not work is
    // answered as every such link is.
    case 'access.read_invitation':
      return 'invitation-not-usable';
    // R-26: a person's request set to initials or removed shows less of them; both
    // rows ask for less than the full name a new person starts with.
    case 'people.set_name_request':
      return true;
    // Making a league changes no league that exists.
    case 'leagues.create':
      return true;
    // S-132: only a league still in draft can be removed (0020, "one still in draft");
    // an archived or suspended one is refused, never published or not, and the admin
    // un-archives it first. The row's own league is the one put in the state.
    case 'leagues.remove_draft':
      return 'league-in-use';
    // U-9: the owner or an admin un-archives ("publish" from archived goes back to
    // live); only our staff lift a suspension, and that returns the league to draft,
    // so publishing a suspended league is refused. Only we suspend, an archived league
    // too; a league already suspended has nothing to suspend (T-502).
    case 'leagues.set_status':
      if (state === 'archived') return true;
      return row.needs === 'platform-staff' ? false : 'illegal-transition';
    default:
      return false;
  }
}

/** What each allowed actor should get in a read-only league: "ok", "refused" or a code. */
function stateExpectation(row: Row, state: LeagueState): string {
  if (readCommands.has(row.command)) return 'ok';
  if (changeToolReads.has(row.command)) return 'refused';
  const works = stillWorksIn(row, state);
  return works === true ? 'ok' : works === false ? 'refused' : works;
}

/** A refusal for the league's state: "not-allowed", or the invitations' own "league-read-only" (T-501). */
const stateRefusals: readonly string[] = ['not-allowed', 'league-read-only'];

describe('every command in an archived or suspended league (U-9, R-26)', () => {
  for (const state of ['archived', 'suspended'] as const) {
    for (const row of rows) {
      const finding = stateFindings[row.command];
      if (finding !== undefined) {
        it.todo(`${state}: ${row.command}: ${row.name}: FINDING: ${finding}`);
        continue;
      }
      it(`${state}: ${row.command}: ${row.name}`, async () => {
        // Those who may use the command in a league that is not read-only.
        const allowed = expectedActors(row.needs, row.scope ?? 'league');
        const outcomes: Partial<Record<Actor, string>> = {};
        for (const actor of allowed) {
          // The league the call is about is the one put in the state (S-132).
          const code = await runRow(row, actor, (_league, _input, about) =>
            putLeagueIn(about, state),
          );
          outcomes[actor] = stateRefusals.includes(code) ? 'refused' : code;
        }
        const expected = Object.fromEntries(
          allowed.map((actor) => [actor, stateExpectation(row, state)]),
        );
        expect(outcomes).toEqual(expected);
      });
    }
  }

  it('names only commands that have rows among its findings and its lists', () => {
    expect(Object.keys(filledLists).filter((command) => !readsGiven.has(command))).toEqual([]);
    const named = [...Object.keys(stateFindings), ...readCommands, ...changeToolReads];
    expect(named.filter((command) => !rows.some((row) => row.command === command))).toEqual([]);
  });

  // R-26: "Names on public pages" moved toward less still works; toward more is refused.
  it('archived: names on public pages move toward less, never toward more (R-26)', async () => {
    const set = setSettingFor(declaredSettings);
    const league = await leagueWithActors();
    await putLeagueIn(league.leagueId, 'archived');
    const as = { leagueId: league.leagueId, accountId: league.ownerId, requestId: 'matrix' };
    const to = (value: string, version: number | null) =>
      set(as, { level: 'league', key: 'privacy.publicNames', value, version }, leaguesDeps);
    expect(await to('firstNameLastInitial', null)).toMatchObject({ ok: true });
    expect(await to('fullName', 1)).toMatchObject({ ok: false });
    expect(await to('hidden', 1)).toMatchObject({ ok: true });
  });
});

/**
 * P4 §4 and A-13, by hand: in a league that scores assigned games only, a scorekeeper
 * scores only a game assigned to them; the owner, admins and schedulers score any.
 * A command about no one game (a list across the league) works for both scorekeepers,
 * each game's own door checking again (T-349).
 */
describe('every scoring command where the league scores assigned games only (P4 §4)', () => {
  const scoringRows = rows.filter((row) => row.needs === 'games.score' && !row.declared);
  for (const row of scoringRows) {
    it(`${row.command}: ${row.name}`, async () => {
      const outcomes: Record<string, string> = {};
      const shown: Record<string, readonly string[]> = {};
      const lists = gameListsShow[row.command] !== undefined;
      let aboutOneGame = false;
      const assignedOnly = async (league: League, input: unknown) => {
        // M1: a list is tried with games in both programs, the scorekeeper assigned to the
        // default program's (by withOneOfEach's labels).
        if (lists) {
          await withOneOfEach(league, input);
          for (const [id, label] of madeIn.get(league.leagueId) ?? []) {
            if (!label.startsWith('default:') || /:(team|round)$/.test(label)) continue;
            await pglite.query(
              'insert into game_assignments (league_id, game_id, account_id) values ($1, $2, $3)',
              [league.leagueId, id, league.accountOf('scorekeeper')],
            );
          }
        }
        await pglite.query(
          `insert into setting_values (league_id, level, key, value)
           values ($1, 'league', 'games.whoMayScore', $2::jsonb)`,
          [league.leagueId, JSON.stringify({ version: 1, value: 'assignedOnly' })],
        );
        const gameId =
          typeof input === 'object' && input !== null
            ? (input as Record<string, unknown>)['gameId']
            : undefined;
        aboutOneGame = typeof gameId === 'string';
        if (typeof gameId === 'string') {
          await pglite.query(
            'insert into game_assignments (league_id, game_id, account_id) values ($1, $2, $3)',
            [league.leagueId, gameId, league.accountOf('scorekeeper')],
          );
        }
      };
      for (const actor of ['owner', 'scheduler', 'scorekeeper'] as const) {
        const run = await runRowFor(row, actor, assignedOnly);
        outcomes[actor] = run.code;
        shown[actor] = labelsIn(run.value, run.leagueId);
      }
      // A second scorekeeper of the whole league, with no assignment.
      let unassigned: string | null = null;
      const second = await runRowFor(
        row,
        'scorekeeper',
        async (league, input) => {
          await assignedOnly(league, input);
          unassigned = await grant(league.leagueId, 'scorekeeper');
        },
        () => unassigned,
      );
      outcomes['unassigned_scorekeeper'] = second.code;
      shown['unassigned_scorekeeper'] = labelsIn(second.value, second.leagueId);
      if (lists) {
        expect(shown, 'the games each one is given (M1)').toEqual({
          owner: gamesShown(row.command, ['default', 'other']),
          scheduler: gamesShown(row.command, ['default', 'other']),
          scorekeeper: gamesShown(row.command, ['default']),
          unassigned_scorekeeper: [],
        });
      }
      expect(outcomes).toEqual({
        owner: 'ok',
        scheduler: 'ok',
        scorekeeper: 'ok',
        unassigned_scorekeeper: aboutOneGame ? 'not-allowed' : 'ok',
      });
    });
  }
});
