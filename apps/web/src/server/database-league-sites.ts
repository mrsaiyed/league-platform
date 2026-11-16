// Each league's name and design on the database (step 2.93 part 3, record 070; step
// 2.187, record 073): the name its owner gave it, read from the league's own row
// (findLeagueName reads the name and nothing else), and the design of its latest
// published site release (findPublishedDesign, T3 §10), both in one snapshot set to that
// league. A league with no release is drawn in the neutral starting design
// (league-site.ts), as every league was before its design was kept.
//
// What is drawn is checked here again against the design's written schema, whatever the
// command checked when it was published: a stored document that no longer passes (an
// older shape, or one written past the command) is drawn in the neutral design and
// reported in the server's log with the league's id and the release's number only,
// never a broken page and never a value the schema does not allow. Asked only for a
// league the gate has already let the person see (U-9).
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import { parseDesignDocument } from '@srleagues/site';
import { isDatabaseId as isId } from './database-id.ts';
import type { LeagueSiteLookup } from './league-site.ts';

/** What this source uses of packages/database. */
export type LeagueSitesQueries = Pick<
  typeof DatabaseModule,
  'withTransaction' | 'findLeagueName' | 'findPublishedDesign'
>;

/** Where a design that cannot be drawn is reported: a fixed message, ids and a number. */
export type DesignReport = (
  message: string,
  fields: { readonly leagueId: string; readonly release: string },
) => void;

export type LeagueSitesOptions = {
  readonly report?: DesignReport;
  readonly now?: () => number;
};

export const designNotDrawn =
  "A league's published design does not pass the design's schema, so its pages are drawn in the neutral design until a design is published again (record 073).";

/** How often one release that cannot be drawn is reported again: once an hour. */
const reportEveryMs = 60 * 60 * 1000;
/** The most releases remembered as reported; past it, the memory starts again. */
const mostReported = 10_000;

export function databaseLeagueSites(
  database: LeagueSitesQueries,
  db: DatabaseHandle,
  { report = () => {}, now = () => Date.now() }: LeagueSitesOptions = {},
): LeagueSiteLookup {
  const reported = new Map<string, number>();
  const reportOnce = (leagueId: string, release: number) => {
    const key = `${leagueId}\n${release}`;
    const at = now();
    const last = reported.get(key);
    if (last !== undefined && at - last < reportEveryMs) return;
    if (reported.size >= mostReported) reported.clear();
    reported.set(key, at);
    report(designNotDrawn, { leagueId, release: String(release) });
  };
  return async (leagueId) => {
    if (!isId(leagueId)) return undefined;
    const id = leagueId.toLowerCase();
    // A page's read: one snapshot that writes nothing (record 070).
    const found = await database.withTransaction(
      db,
      { leagueId: id },
      async (scope) => ({
        name: await database.findLeagueName(scope),
        published: await database.findPublishedDesign(scope),
      }),
      { snapshot: 'page' },
    );
    if (found.name === undefined) return undefined;
    if (found.published === undefined) return { name: found.name };
    const checked = parseDesignDocument(found.published.design);
    if (checked.ok) return { name: found.name, design: checked.design };
    reportOnce(id, found.published.number);
    return { name: found.name };
  };
}
