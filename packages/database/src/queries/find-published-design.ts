// The scope's league's published design (T3 §10, step 2.187, record 073): what its latest
// site release holds, its number and the starting design it began from. The public site
// is drawn from the latest release, never from a draft (A-9, C-3). Undefined for a league
// with no release, which is drawn in the neutral design. The design comes back as the
// database holds it: whoever draws it checks it against the written schema first, so a
// document of an older or a broken shape is never drawn.
import type { JsonValue } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type PublishedDesign = {
  readonly number: number;
  readonly startingDesign: string;
  readonly design: JsonValue;
};

export async function findPublishedDesign(
  scope: LeagueScope,
): Promise<PublishedDesign | undefined> {
  const release = await transactionOf(scope)
    .selectFrom('site_releases')
    .select(['number', 'starting_design', 'design'])
    .where('league_id', '=', scope.leagueId)
    .orderBy('number', 'desc')
    .limit(1)
    .executeTakeFirst();
  return release === undefined
    ? undefined
    : { number: release.number, startingDesign: release.starting_design, design: release.design };
}
