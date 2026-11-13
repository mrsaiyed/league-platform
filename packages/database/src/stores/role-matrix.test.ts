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
import { createHash, randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import {
  acceptInvitation,
  cancelInvitation,
  commands,
  createCourt,
  createDivision,
  createLeague,
  clearSettingFor,
  createSeason,
  createTeam,
  createVenue,
  invite,
  listDivisions,
  listVenues,
  removeCourt,
  removeDivision,
  removeTeam,
  removeVenue,
  reorderDivisions,
  restoreCourt,
  restoreDivision,
  restoreVenue,
  updateCourt,
  updateDivision,
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
  renameShortName,
  resendInvitation,
  revokeGrant,
  setCurrentSeason,
  setLeagueName,
  setLeagueStatus,
  type AccessTx,
  type CommandContext,
  type CommandRequirement,
  type CommandDeps,
  type Job,
  type LeaguesTx,
  type Permission,
  type SchedulingTx,
  type SettingRegistry,
  type TeamsTx,
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
  newLeague,
  newProgram,
  newSeason,
  newTeam,
  newVenue,
  one,
  unique,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { divisionsStore } from './divisions-store.ts';
import { leaguesStore } from './leagues-store.ts';
import { schedulingStore } from './scheduling-store.ts';
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

let pglite: PGlite;
let db: DatabaseHandle;
let staffId: string;
let accessDeps: CommandDeps<AccessTx>;
let leaguesDeps: CommandDeps<LeaguesTx>;
let schedulingDeps: CommandDeps<SchedulingTx>;
let teamsDeps: CommandDeps<TeamsTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  staffId = await newAccount(pglite);
  const transaction = commandTransaction(db, (scope) => ({
    jobs: { enqueue: async (_job: Job) => {} },
    leagues: leaguesStore(scope, { platformStaff: [staffId] }),
    divisions: divisionsStore(scope),
    scheduling: schedulingStore(scope),
    teams: teamsStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  const rest = { log: () => {}, now: () => 0 };
  accessDeps = { transaction, events: [], ...rest };
  leaguesDeps = { transaction, events: [], ...rest };
  schedulingDeps = { transaction, events: [], ...rest };
  teamsDeps = { transaction, events: [], ...rest };
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

const rows: readonly Row[] = [
  ...divisionAndVenueRows,
  ...teamCommandRows,
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
      input: { seasonId: await newSeason(pglite, league.leagueId, league.defaultProgramId) },
    }),
    run: (c, i) => setCurrentSeason(c, i, leaguesDeps),
  },
  {
    command: 'leagues.set_current_season',
    name: 'make a season of one program current',
    needs: 'season.settings',
    scope: 'program',
    prepare: async (league) => ({
      input: { seasonId: await newSeason(pglite, league.leagueId, league.programId) },
    }),
    run: (c, i) => setCurrentSeason(c, i, leaguesDeps),
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
