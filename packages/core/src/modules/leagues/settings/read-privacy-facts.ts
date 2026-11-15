// Who plays in the league, as its Privacy settings need to know it (record 065): adults,
// young players or both, and whether anyone in it is recorded as a child. The screen
// uses it to say what the names settings do in this league and to offer the parents'
// confirmation in an adult league only where it has someone it would cover. Not a
// command: it changes nothing. The screen is shown only to those who may change
// settings, and it says yes or no about children, nothing about who.
import type { Audience } from '../league-values.ts';
import type { LeaguesTx } from '../ports.ts';

export type PrivacyFacts = { readonly audience: Audience; readonly hasRecordedChild: boolean };

export async function readPrivacyFacts(tx: Pick<LeaguesTx, 'leagues'>): Promise<PrivacyFacts> {
  return {
    audience: await tx.leagues.leagueAudience(),
    hasRecordedChild: await tx.leagues.hasRecordedChild(),
  };
}
