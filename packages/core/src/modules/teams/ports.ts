// What the teams module needs from storage. packages/database supplies it, bound to
// one transaction for one league, so none of these take a league id (T-28).
import type { CommandTx } from '../../command/index.ts';
import type { AccessReader, ActivityLog } from '../access/index.ts';

/** A team of a season, in or out of the bin (T3 §7). */
export type TeamRecord = {
  readonly id: string;
  readonly seasonId: string;
  /** A division of the same season, or null. */
  readonly divisionId: string | null;
  /** The short name its address is built from, unique in the season. */
  readonly slug: string;
  readonly name: string;
  /** Lower-case #rrggbb, or null for the league's own colors. */
  readonly color: string | null;
  /** S-22: 'everyone', 'members', 'team' or 'staff' (the database knows all four). */
  readonly statsVisibility: string;
  /** The same team across seasons (a new team gets its own). */
  readonly lineageId: string;
  readonly binned: boolean;
  readonly version: number;
};

export type NewTeam = {
  readonly seasonId: string;
  readonly divisionId: string | null;
  readonly slug: string;
  readonly name: string;
  readonly color: string | null;
  readonly statsVisibility: string;
};

/** What a team change sets; a field left out stays as it is, null clears a division or color. */
export type TeamChange = {
  divisionId?: string | null;
  slug?: string;
  name?: string;
  color?: string | null;
  statsVisibility?: string;
};

/** Which of a team's unique fields a save hit. */
export type TeamTaken = 'slug-taken' | 'name-taken';

export type TeamsStore = {
  /** The team with this id, in the bin or not, or undefined if it is not in this league. */
  readonly find: (teamId: string) => Promise<TeamRecord | undefined>;
  /**
   * Adds a team with a lineage of its own: its id, or which of its short name and
   * name a team of the season not in the bin already has (a name in any capitals).
   */
  readonly create: (team: NewTeam) => Promise<string | TeamTaken>;
  /**
   * Changes a team not in the bin if it is still at `version` (T-46): the new
   * version, which field is taken, or undefined if it is not there or moved on.
   */
  readonly update: (
    teamId: string,
    change: TeamChange,
    version: number,
  ) => Promise<number | TeamTaken | undefined>;
  /** Moves a team to the bin or brings it back: false if it is not in this league. */
  readonly setBinned: (teamId: string, binned: boolean) => Promise<boolean | TeamTaken>;
  /** The program a season belongs to (where a team's permission is checked), or undefined. */
  readonly seasonProgramId: (seasonId: string) => Promise<string | undefined>;
  /** The season a division belongs to and whether it is in the bin, or undefined if not found. */
  readonly findDivision: (
    divisionId: string,
  ) => Promise<{ readonly seasonId: string; readonly binned: boolean } | undefined>;
};

/** A teams command's transaction: its store, the access reader and the activity log (A-6). */
export type TeamsTx = CommandTx & {
  readonly teams: TeamsStore;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};
