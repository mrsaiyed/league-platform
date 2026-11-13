// What the leagues module needs from storage. packages/database supplies it, bound
// to one transaction for one league, so none of these take a league id: they can
// only ever reach the league the transaction is for (T-28).
import type { CommandTx } from '../../command/index.ts';
import type { AccessReader, ActivityLog } from '../access/index.ts';
import type { Audience, LeagueStatus } from './league-values.ts';

export type LeagueRecord = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: LeagueStatus;
  readonly ownerAccountId: string;
  readonly version: number;
};

/** A league to create. Its id is the transaction's league id (chosen first, record 008). */
export type NewLeague = {
  readonly slug: string;
  readonly name: string;
  readonly timeZone: string;
  readonly audience: Audience;
  readonly listed: boolean;
  readonly ownerAccountId: string;
  /** The hidden default program that is created with it (U-3, U-12). */
  readonly defaultProgram: {
    readonly slug: string;
    readonly name: string;
    readonly sportKey: string;
  };
};

export type NewSeason = {
  readonly programId: string;
  readonly slug: string;
  readonly name: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
};

export type LeaguesStore = {
  /** The transaction's league, or undefined if it is in the bin or out of sight. */
  readonly currentLeague: () => Promise<LeagueRecord | undefined>;
  /** Sets its name if it is still at `version` (T-46): the new version, or undefined. */
  readonly setName: (name: string, version: number) => Promise<number | undefined>;
  /** Whether the acting account is one of our own staff (named in the app settings; not a league role). */
  readonly isPlatformStaff: () => Promise<boolean>;
  /** Creates the transaction's league and its default program together. */
  readonly createLeague: (
    league: NewLeague,
  ) => Promise<LeagueRecord | 'short-name-taken' | 'league-exists' | 'owner-not-found'>;
  /**
   * Gives the league a new short name at `version` and keeps the old one forwarding
   * for `forwardMonths`: the new version, 'taken', or undefined if the version moved.
   */
  readonly renameShortName: (
    slug: string,
    version: number,
    forwardMonths: number,
  ) => Promise<number | 'taken' | undefined>;
  /** Sets the state at `version`: the new version, or undefined. */
  readonly setStatus: (status: LeagueStatus, version: number) => Promise<number | undefined>;
  /** The program with this id, or the default program when none is given. */
  readonly findProgram: (
    programId: string | undefined,
  ) => Promise<{ readonly id: string } | undefined>;
  readonly createSeason: (season: NewSeason) => Promise<string | 'slug-taken'>;
  /** The program the season belongs to, or undefined if it is not found. */
  readonly seasonProgramId: (seasonId: string) => Promise<string | undefined>;
  /** Makes the season the current one of its program, and no other: false if it is not found. */
  readonly setCurrentSeason: (seasonId: string) => Promise<boolean>;
};

/** A division of a season, in or out of the bin (T3 §4, U-12). */
export type DivisionRecord = {
  readonly id: string;
  readonly seasonId: string;
  /** The division it sits under (a region, later), or null at the top. */
  readonly parentDivisionId: string | null;
  readonly name: string;
  /** Lower-case #rrggbb, or null for the league's own colors. */
  readonly color: string | null;
  readonly sort: number;
  /** In the bin (A-5, T-45). */
  readonly binned: boolean;
  readonly version: number;
};

export type NewDivision = {
  readonly seasonId: string;
  readonly parentDivisionId: string | null;
  readonly name: string;
  readonly color: string | null;
  readonly sort: number;
};

/** What a division change sets; a field left out stays as it is. */
export type DivisionChange = {
  readonly name?: string;
  readonly color?: string | null;
  readonly sort?: number;
};

/** Divisions, bound like the rest to the transaction's one league (T-28). */
export type DivisionsStore = {
  /** The division with this id, in the bin or not, or undefined if it is not in this league. */
  readonly find: (divisionId: string) => Promise<DivisionRecord | undefined>;
  /** The season's divisions not in the bin, in order: by sort, then name. */
  readonly list: (seasonId: string) => Promise<readonly DivisionRecord[]>;
  /** Adds one: its id, or 'name-taken' (a sibling not in the bin has the name, in any capitals). */
  readonly create: (division: NewDivision) => Promise<string | 'name-taken'>;
  /**
   * Changes a division not in the bin, only if it is still at `version` when one is
   * given (T-46): the new version, 'name-taken', or undefined if it is not there or moved on.
   */
  readonly update: (
    divisionId: string,
    change: DivisionChange,
    version?: number,
  ) => Promise<number | 'name-taken' | undefined>;
  /**
   * Moves a division to the bin or brings it back. Bringing it back can hit a name
   * a sibling took meanwhile: 'name-taken'. False if it is not there.
   */
  readonly setBinned: (divisionId: string, binned: boolean) => Promise<boolean | 'name-taken'>;
  /** Whether any division not in the bin sits under this one. */
  readonly hasLiveSubdivisions: (divisionId: string) => Promise<boolean>;
};

/**
 * A leagues command's transaction: its own store, the access reader its policy
 * checks permissions with (T-74, T-75), and the activity log it writes (A-6).
 */
export type LeaguesTx = CommandTx & {
  readonly leagues: LeaguesStore;
  readonly divisions: DivisionsStore;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};
