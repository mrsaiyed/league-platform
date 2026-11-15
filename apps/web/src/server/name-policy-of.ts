// How a league shows names on its public pages, read from its own privacy settings
// (step 2.126, T-81): the one place the web app turns the settings the admin saves on
// League settings → Privacy into the display policy the public pages, the live messages
// and the statistics hand to the one name function. Reads run as no one (a public page
// has no permission to check) on the settings' own transaction, bound to one league.
// The league's start depends on who plays in it (record 065), so the audience is given.
import {
  readNamePolicy,
  type Audience,
  type CommandDeps,
  type LeaguesTx,
  type NamePolicy,
} from '@srleagues/core';

/** Gives the league's display policy, by league id and who plays in it. */
export type NamePolicyOf = (leagueId: string, audience: Audience) => Promise<NamePolicy>;

/** Who plays in a league (adult, youth or mixed), or undefined where it is not known. */
export type AudienceOf = (leagueId: string) => Audience | undefined;

/** What the name function needs of a league: who plays in it, and its display policy. */
export type NamesShown = { readonly audience: Audience; readonly policy: NamePolicy };
export type NamesShownOf = (leagueId: string) => Promise<NamesShown>;

export function namePolicyOf(deps: CommandDeps<LeaguesTx>): NamePolicyOf {
  return (leagueId, audience) =>
    deps.transaction({ leagueId, accountId: null, requestId: 'name-policy' }, (tx) =>
      readNamePolicy(tx.leagues, audience),
    );
}

/** The policy of a league that has set nothing: our starting values (R-14, R-15, R-29). */
export const startingNamePolicy: NamePolicyOf = (_leagueId, audience) =>
  readNamePolicy({ settingRows: async () => [] }, audience);

/**
 * A league's audience and policy together. A league whose audience is not known counts
 * as youth, so a person of unknown age in it is shown as a child (R-15) and the league
 * starts on first name and last initial: the careful reading, never the adult one.
 */
export function namesShownOf(policyOf: NamePolicyOf, audienceOf: AudienceOf): NamesShownOf {
  return async (leagueId) => {
    const audience = audienceOf(leagueId) ?? 'youth';
    return { audience, policy: await policyOf(leagueId, audience) };
  };
}
