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

/** A person on a team (T3 §7). A person who left keeps the entry, with a leaving date (R-17, T-52). */
export type RosterEntryRecord = {
  readonly id: string;
  readonly teamId: string;
  readonly personId: string;
  /** '0' to '99' or '00', or null for no number yet. */
  readonly jerseyNumber: string | null;
  /** 'player', 'captain' or 'coach': a label only (a sign-in role is an invitation). */
  readonly role: string;
  /** A date as yyyy-mm-dd, or null. */
  readonly joinedOn: string | null;
  readonly leftOn: string | null;
  readonly sort: number;
  readonly version: number;
};

/** A roster entry with the name of its person, for the roster list. */
export type RosterLine = RosterEntryRecord & {
  readonly firstName: string;
  readonly lastName: string;
  readonly publicName: string | null;
};

export type NewRosterEntry = {
  readonly teamId: string;
  readonly personId: string;
  readonly jerseyNumber: string | null;
  readonly role: string;
  readonly joinedOn: string | null;
};

/** What a roster change sets; a field left out stays as it is, null clears a number. */
export type RosterEntryChange = {
  jerseyNumber?: string | null;
  role?: string;
  leftOn?: string;
  sort?: number;
};

/** Why a roster write was refused by the database. */
export type RosterTaken = 'already-on-team' | 'jersey-taken';

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
  /** The person (not merged into another) and whether they are in the bin, or undefined. */
  readonly findPerson: (
    personId: string,
  ) => Promise<{ readonly id: string; readonly binned: boolean } | undefined>;
  readonly findRosterEntry: (entryId: string) => Promise<RosterEntryRecord | undefined>;
  /** Every entry of the team, those who left too, in roster order. */
  readonly listRoster: (teamId: string) => Promise<readonly RosterLine[]>;
  /**
   * Adds a person to the end of a team's roster: the entry's id, or why the database
   * refused (the person is already on the team; the number is worn, where the season
   * asks for unique numbers, 0008).
   */
  readonly addRosterEntry: (entry: NewRosterEntry) => Promise<string | RosterTaken>;
  /**
   * Changes an entry: the new version, why it was refused, or undefined if it is not
   * there or, when `version` is given, has moved on (T-46).
   */
  readonly updateRosterEntry: (
    entryId: string,
    change: RosterEntryChange,
    version?: number,
  ) => Promise<number | RosterTaken | undefined>;
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
