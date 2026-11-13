// What the leagues module needs from storage. packages/database supplies it, bound
// to one transaction for one league, so none of these take a league id: they can
// only ever reach the league the transaction is for (T-28).
import type { CommandTx } from '../../command/index.ts';

export type LeagueRecord = {
  readonly id: string;
  readonly name: string;
  readonly ownerAccountId: string;
  readonly version: number;
};

export type LeaguesStore = {
  /** The transaction's league, or undefined if it is in the bin or out of sight. */
  readonly currentLeague: () => Promise<LeagueRecord | undefined>;
  /** Sets its name if it is still at `version` (T-46): the new version, or undefined. */
  readonly setName: (name: string, version: number) => Promise<number | undefined>;
};

export type LeaguesTx = CommandTx & { readonly leagues: LeaguesStore };
