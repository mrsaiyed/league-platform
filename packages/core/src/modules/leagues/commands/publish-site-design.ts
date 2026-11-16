// Publishes a design for the league's site (T3 §10, T5 §1 and §5, P5 §2; step 2.187,
// record 073): a new site release holding the design, with the starting design it began
// from, and the site pointed at it, in one transaction. The public pages are drawn from
// the latest release (A-9, C-3). A release is never changed once written (T-96): a new
// design is a new release.
//
// The design is the whole design document, checked against its written schema
// (packages/contracts, the same one the site package draws by): a color only as #rrggbb,
// a font from the list, every other value a word from its list. Anything else is
// refused before anything is written, so nothing a page cannot draw safely is stored.
//
// The save names the release it started from (`sinceRelease`, 0 for a league with
// none) and is refused if another was published since (T-46, A-8), so two admins
// cannot each publish over the other unseen. Until the design editor exists (its
// drafts, preview and history are a later step) this is the one way a design is
// published after a league is made; a league made by our tools gets its first release
// from createLeague, in the same transaction as the league.
//
// Who: `site.publish`, which the owner, admins and editors hold (P4 §4). Not in an
// archived or suspended league, which are read-only (U-9).
import { designDocumentSchema, startingDesignKeys } from '@srleagues/contracts';
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayEditLeague } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';

export type PublishSiteDesignError = { readonly code: 'changed-since-read' };

/** The release written: its number, which the next save names as `sinceRelease`. */
export type PublishedSiteDesign = { readonly number: number };

const changedSinceRead: PublishSiteDesignError = { code: 'changed-since-read' };

export const publishSiteDesign = defineCommand({
  name: 'leagues.publish_site_design',
  permission: 'site.publish',
  input: z.object({
    startingDesign: z.enum(startingDesignKeys),
    design: designDocumentSchema,
    /** The number of the release the admin started from; 0 when the league had none. */
    sinceRelease: z.number().int().min(0).max(1_000_000),
  }),
  allowed: (context, _input, tx: LeaguesTx) => mayEditLeague(context, tx, 'site.publish'),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<PublishedSiteDesign, PublishSiteDesignError>> => {
    // `allowed` has proved a signed-in account holds the permission.
    if (context.accountId === null) throw new Error('leagues.publish_site_design: no account.');
    const latest = await tx.leagues.latestSiteReleaseNumber();
    if (latest !== input.sinceRelease) return fail(changedSinceRead);
    const number = latest + 1;
    const released = await tx.leagues.publishSiteRelease({
      number,
      startingDesign: input.startingDesign,
      design: input.design,
      publishedByAccountId: context.accountId,
    });
    if (released === 'number-taken') return fail(changedSinceRead);
    await recordActivity(tx, context, {
      action: 'leagues.publish_site_design',
      target: { type: 'site_release', id: released },
      details: { number, startingDesign: input.startingDesign },
    });
    return ok({ number });
  },
});
