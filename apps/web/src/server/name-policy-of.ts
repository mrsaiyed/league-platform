// How a league shows names on its public pages, read from its own privacy settings
// (step 2.126, T-81): the one place the web app turns the settings the admin saves on
// League settings → Privacy into the display policy the public pages, the live messages
// and the statistics hand to the one name function. Reads run as no one (a public page
// has no permission to check) on the settings' own transaction, bound to one league.
import {
  readNamePolicy,
  type Audience,
  type CommandDeps,
  type LeaguesTx,
  type NamePolicy,
} from '@srleagues/core';

/** Gives the league's display policy, by league id. */
export type NamePolicyOf = (leagueId: string) => Promise<NamePolicy>;

/** Who plays in a league (adult, youth or mixed), or undefined where it is not known. */
export type AudienceOf = (leagueId: string) => Audience | undefined;

/** What the name function needs of a league: who plays in it, and its display policy. */
export type NamesShown = { readonly audience: Audience; readonly policy: NamePolicy };
export type NamesShownOf = (leagueId: string) => Promise<NamesShown>;

export function namePolicyOf(deps: CommandDeps<LeaguesTx>): NamePolicyOf {
  return (leagueId) =>
    deps.transaction({ leagueId, accountId: null, requestId: 'name-policy' }, (tx) =>
      readNamePolicy(tx.leagues),
    );
}

/** The policy of a league that has set nothing: our starting values (R-14, R-15). */
export const startingNamePolicy: NamePolicyOf = () =>
  readNamePolicy({ settingRows: async () => [] });

/**
 * A league's audience and policy together. A league whose audience is not known counts
 * as youth, so a person of unknown age in it is shown as a child (R-15): the careful
 * reading, never the adult one.
 */
export function namesShownOf(policyOf: NamePolicyOf, audienceOf: AudienceOf): NamesShownOf {
  return async (leagueId) => ({
    audience: audienceOf(leagueId) ?? 'youth',
    policy: await policyOf(leagueId),
  });
}
