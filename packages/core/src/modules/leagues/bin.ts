// The bin (A-5, T-51): what the leagues module needs from storage to list what was
// removed, bring it back, and remove it for good once it is old enough. packages/database
// supplies it, bound to one transaction for one league (T-28).
import type { CommandTx } from '../../command/index.ts';
import type { AccessReader, ActivityLog } from '../access/index.ts';

/** How long a removed thing stays in the bin before the nightly job removes it for good (T-51). */
export const binKeepDays = 30;

const dayMs = 24 * 60 * 60 * 1000;

/** The kinds of thing the bin holds today. Final games are never among them (S-7). */
export const binKinds = ['team', 'division', 'venue', 'court', 'person', 'game'] as const;
export type BinKind = (typeof binKinds)[number];

/** Something in the bin, as the store lists it. */
export type BinnedItem = {
  readonly kind: BinKind;
  readonly id: string;
  /** Its name; a person's full name; a game's home team. Empty for a person whose name was erased. */
  readonly name: string;
  /** A game's away team; null for everything else. */
  readonly secondName: string | null;
  /** The season it belongs to, or null for what belongs to the league (a person, a venue, a court). */
  readonly seasonId: string | null;
  /** When it went to the bin (ISO 8601). */
  readonly binnedAt: string;
};

/** A binned item and the moment it goes for good. */
export type BinListing = BinnedItem & { readonly removedForGoodAt: string };

/** How many things of each kind one purge removed for good. */
export type BinCounts = {
  readonly courts: number;
  readonly venues: number;
  readonly teams: number;
  readonly divisions: number;
  readonly people: number;
};

export type TeamInBin = {
  readonly seasonId: string;
  readonly binned: boolean;
  /** Whether the team's division, if it has one, is in the bin. */
  readonly divisionInBin: boolean;
};

export type PersonInBin = { readonly binned: boolean };

export type GameInBin = {
  readonly seasonId: string;
  readonly binned: boolean;
  /** scheduled, live, final, postponed, cancelled or forfeit. */
  readonly status: string;
  /** Whether a team, the division, the venue or the court it names is in the bin. */
  readonly partInBin: boolean;
};

export type BinStore = {
  /** Everything in the bin, newest first. */
  readonly list: () => Promise<readonly BinnedItem[]>;
  /** The program a season belongs to (where a restore is checked), or undefined. */
  readonly seasonProgramId: (seasonId: string) => Promise<string | undefined>;
  readonly findTeam: (teamId: string) => Promise<TeamInBin | undefined>;
  readonly findPerson: (personId: string) => Promise<PersonInBin | undefined>;
  readonly findGame: (gameId: string) => Promise<GameInBin | undefined>;
  /**
   * Brings a team back, with its roster (nothing of it was touched): false if it is
   * not in this league, which of its short name and name another team took, or
   * 'lineage-taken': another team of its season now carries on the same team.
   */
  readonly restoreTeam: (
    teamId: string,
  ) => Promise<boolean | 'short-name-taken' | 'name-taken' | 'lineage-taken'>;
  /** Brings a person back: false if not in this league, or 'profile-taken' (the account is linked to another person). */
  readonly restorePerson: (personId: string) => Promise<boolean | 'profile-taken'>;
  /**
   * Brings a game that was never played back: false if it is not in this league, is
   * not in the bin or has been played, or which of its game number and outside
   * reference another game of the season took.
   */
  readonly restoreGame: (
    gameId: string,
  ) => Promise<boolean | 'game-number-taken' | 'external-ref-taken'>;
  /**
   * Removes for good what went to the bin at or before `cutoff`, children first, and
   * leaves anything something else still points at (a team with games, a person with
   * a history). How many of each went.
   */
  readonly purge: (cutoff: Date) => Promise<BinCounts>;
};

/** A bin command's transaction: its store, the access reader and the activity log (A-6). */
export type BinTx = CommandTx & {
  readonly bin: BinStore;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};

/** The moment a thing binned at `binnedAt` is removed for good. */
export function removedForGoodAt(binnedAt: string): string {
  return new Date(Date.parse(binnedAt) + binKeepDays * dayMs).toISOString();
}

/** The cutoff for a purge run at `now`: what went to the bin at or before it has had its days. */
export function binCutoff(now: Date): Date {
  return new Date(now.getTime() - binKeepDays * dayMs);
}
