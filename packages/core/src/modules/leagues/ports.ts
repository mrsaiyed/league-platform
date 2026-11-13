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
  /** Makes the season the current one of its program, and no other: false if it is not found. */
  readonly setCurrentSeason: (seasonId: string) => Promise<boolean>;
};

/**
 * A leagues command's transaction: its own store, the access reader its policy
 * checks permissions with (T-74, T-75), and the activity log it writes (A-6).
 */
export type LeaguesTx = CommandTx & {
  readonly leagues: LeaguesStore;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};
