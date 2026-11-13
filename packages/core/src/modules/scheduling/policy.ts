// Who may run the scheduling commands that change venues and courts (T-74), read from
// the database on every call (T-75). Venues belong to the league, so they are checked
// league-wide: a role limited to one program does not manage them.
import type { CommandContext } from '../../command/index.ts';
import {
  hasPermission,
  hasPermissionAnywhere,
  leagueScope,
  readOnlyLeagueStatuses,
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

/** The scope of a season's program (league-wide if the season is not there). */
export async function seasonScope(tx: SchedulingTx, seasonId: string): Promise<Scope> {
  const season = await tx.scheduling.findSeason(seasonId);
  return season === undefined ? leagueScope : { type: 'program', id: season.programId };
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
