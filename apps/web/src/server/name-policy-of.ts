// How a league shows names on its public pages, read from its own privacy settings
// (step 2.126, T-81): the one place the web app turns the settings the admin saves on
// League settings → Privacy into the display policy the public pages, the live messages
// and the statistics hand to the one name function. Reads run as no one (a public page
// has no permission to check) on the settings' own transaction, bound to one league.
import { readNamePolicy, type CommandDeps, type LeaguesTx, type NamePolicy } from '@srleagues/core';

/** Gives the league's display policy, by league id. */
export type NamePolicyOf = (leagueId: string) => Promise<NamePolicy>;

export function namePolicyOf(deps: CommandDeps<LeaguesTx>): NamePolicyOf {
  return (leagueId) =>
    deps.transaction({ leagueId, accountId: null, requestId: 'name-policy' }, (tx) =>
      readNamePolicy(tx.leagues),
    );
}

/** The policy of a league that has set nothing: our starting values (R-14, R-15). */
export const startingNamePolicy: NamePolicyOf = () =>
  readNamePolicy({ settingRows: async () => [] });
