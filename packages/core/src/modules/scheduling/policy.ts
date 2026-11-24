// Who may run the scheduling commands that change venues and courts (T-74), read from
// the database on every call (T-75). Venues belong to the league, so they are checked
// league-wide: a role limited to one program does not manage them.
import type { CommandContext } from '../../command/index.ts';
import {
  allows,
  hasPermission,
  hasPermissionAnywhere,
  leagueScope,
  readOnlyLeagueStatuses,
  type AccessHolder,
  type Permission,
  type Scope,
} from '../access/index.ts';
import type { SchedulingTx } from './ports.ts';

/**
 * Reading: the permission held at any scope, in any state of the league. Venues are
 * the league's shared data, so a scheduler or scorekeeper limited to one program may
 * read them too.
 */
export async function mayReadSchedule(
  context: CommandContext,
  tx: SchedulingTx,
  permission: Permission,
): Promise<boolean> {
  return hasPermissionAnywhere(context, tx, permission);
}

/** Changing: the permission, and not while the league is archived or suspended (U-9). */
export async function mayChangeSchedule(
  context: CommandContext,
  tx: SchedulingTx,
  permission: Permission,
): Promise<boolean> {
  if (!(await hasPermission(context, tx, permission))) return false;
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}

/** The scope a season's schedule is checked at: its program (P4 §3). */
export function programScopeOf(programId: string): Scope {
  return { type: 'program', id: programId };
}

/** The scope of a season's program (league-wide if the season is not there). */
export async function seasonScope(tx: SchedulingTx, seasonId: string): Promise<Scope> {
  const season = await tx.scheduling.findSeason(seasonId);
  return season === undefined ? leagueScope : programScopeOf(season.programId);
}

/**
 * The schedule permission at a season's program, for a holder already read: the check the
 * commands below make (`hasPermission` at `seasonScope`), so a screen shows exactly the
 * controls the commands would allow. Nobody signed in holds nothing.
 */
export function mayAtSeason(
  holder: AccessHolder | undefined,
  permission: 'schedule.read' | 'schedule.edit' | 'schedule.publish',
  season: { readonly programId: string },
): boolean {
  return holder !== undefined && allows(holder, permission, programScopeOf(season.programId));
}

/**
 * May a season be named to this holder in the schedule admin (P4 §4): a public season to
 * anyone; one not public yet only to someone who may see its draft (`maySeeSchedule`:
 * `schedule.read` at its program). The one rule every list of seasons for staff applies.
 */
export function mayListSeason(
  holder: AccessHolder | undefined,
  season: { readonly isPublic: boolean; readonly programId: string },
): boolean {
  return season.isPublic || mayAtSeason(holder, 'schedule.read', season);
}

/**
 * Editing a season's schedule draft (P4 §3 `schedule.edit`): at the season's program, so a
 * scheduler limited to one program edits only its seasons; not while the league is
 * archived or suspended (U-9). A season that is not there is checked league-wide.
 */
export async function mayEditSchedule(
  context: CommandContext,
  tx: SchedulingTx,
  seasonId: string,
): Promise<boolean> {
  const scope = await seasonScope(tx, seasonId);
  if (!(await hasPermission(context, tx, 'schedule.edit', scope))) return false;
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}

/**
 * Taking back a drafted new date after "Put it back on its date" (step 2.53 fix round):
 * whoever may put a game back may (`games.results` at the season's program, the put-back's
 * own rule), as may a schedule editor; not while the league is archived or suspended.
 */
export async function mayTakeBackPutBack(
  context: CommandContext,
  tx: SchedulingTx,
  seasonId: string,
): Promise<boolean> {
  if (await mayEditSchedule(context, tx, seasonId)) return true;
  const scope = await seasonScope(tx, seasonId);
  if (!(await hasPermission(context, tx, 'games.results', scope))) return false;
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}

/**
 * Publishing a season's schedule (P4 §3 `schedule.publish`): at the season's program; not
 * while the league is archived or suspended (U-9).
 */
export async function mayPublishSchedule(
  context: CommandContext,
  tx: SchedulingTx,
  seasonId: string,
): Promise<boolean> {
  const scope = await seasonScope(tx, seasonId);
  if (!(await hasPermission(context, tx, 'schedule.publish', scope))) return false;
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}

/** Seeing what publishing would change: the publish permission at the season's program, in any state of the league. */
export async function mayPreviewPublish(
  context: CommandContext,
  tx: SchedulingTx,
  seasonId: string,
): Promise<boolean> {
  return hasPermission(context, tx, 'schedule.publish', await seasonScope(tx, seasonId));
}

/** Seeing a season's draft: the read permission at its program, in any state of the league. */
export async function maySeeSchedule(
  context: CommandContext,
  tx: SchedulingTx,
  seasonId: string,
): Promise<boolean> {
  return hasPermission(context, tx, 'schedule.read', await seasonScope(tx, seasonId));
}
