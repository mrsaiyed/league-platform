// Whether a "Left the team" line offers "Put back on the roster (marked by mistake)"
// (step 2.161): only where it can work. Not for a person already on the team again (a
// later entry), and not for one taken off the league list (in the bin, or merged away),
// which the line says in words instead. Whether someone is off the list is known only
// when the whole list was read, so a long list never makes a present person look removed.
export type PutBackOffer = 'offer' | 'back' | 'off-the-list';

export function putBackOffer(
  personId: string,
  onRosterNow: ReadonlySet<string>,
  leagueList: { readonly ids: ReadonlySet<string>; readonly complete: boolean } | undefined,
): PutBackOffer {
  if (onRosterNow.has(personId)) return 'back';
  if (leagueList !== undefined && leagueList.complete && !leagueList.ids.has(personId)) {
    return 'off-the-list';
  }
  return 'offer';
}
