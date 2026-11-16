// Publishes a site release for the scope's league (T3 §10, T5 §5, step 2.187, record
// 073): writes release `number` with its design, then points the league's site at it,
// making the site if the league has none, its draft set to the same design. In the
// caller's transaction, so both are written or neither. A number another publish took
// first comes back as 'number-taken' (site_releases_number_key, 0020), and the
// transaction is then unusable: the caller rolls it back. The menu and pages are left
// empty for the design editor of a later step.
import type { JsonObject } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export type NewSiteReleaseRow = {
  readonly number: number;
  readonly startingDesign: string;
  /** A design already checked against the written schema (packages/contracts). */
  readonly design: JsonObject;
  readonly publishedByAccountId: string;
};

/** The release's id, or 'number-taken'. */
export async function insertSiteRelease(
  scope: LeagueScope,
  release: NewSiteReleaseRow,
): Promise<string | 'number-taken'> {
  const tx = transactionOf(scope);
  let id: string;
  try {
    ({ id } = await tx
      .insertInto('site_releases')
      .values({
        league_id: scope.leagueId,
        number: release.number,
        starting_design: release.startingDesign,
        design: release.design,
        published_by_account_id: release.publishedByAccountId,
      })
      .returning('id')
      .executeTakeFirstOrThrow());
  } catch (error) {
    if (constraintOf(error)?.constraint === 'site_releases_number_key') return 'number-taken';
    throw error;
  }
  await tx
    .insertInto('sites')
    .values({
      league_id: scope.leagueId,
      starting_design: release.startingDesign,
      design_draft: release.design,
      published_release_id: id,
    })
    .onConflict((conflict) =>
      conflict.constraint('sites_one_per_league').doUpdateSet({
        starting_design: release.startingDesign,
        design_draft: release.design,
        published_release_id: id,
      }),
    )
    .execute();
  return id;
}
