// Removes a league made by mistake (step 2.150, record 063, T-266): one still in
// draft that is exactly what the internal tool makes (its default program, at most
// its first season, and the maker's two activity-log entries) and nothing else. For
// our own staff, through that tool only, as making a league is (P3 §8). The league
// is the context's, never one named in the input; the input is only the short name
// the person typed, which must be the league's own, exactly.
//
// The checks are made by the database under a lock on the league, inside this
// command's transaction (remove_draft_league, 0017), so nothing can be added between
// the check and the delete. A published or used league is refused: handing over,
// deleting and leaving is step 2.133's. The league's own activity log goes with it;
// the platform's own log keeps the entry about it (record 063). This command writes
// no league activity entry: there is no league left to hold one.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayActAsPlatform } from '../policy.ts';
import type { LeagueRemovalFinding, LeagueRemovalTx } from '../ports.ts';

export type RemoveDraftLeagueError =
  | { readonly code: 'league-not-found' }
  | { readonly code: 'short-name-differs' }
  | { readonly code: 'league-in-use'; readonly found: readonly LeagueRemovalFinding[] };

export type RemovedDraftLeague = {
  readonly leagueId: string;
  readonly slug: string;
  readonly name: string;
  readonly ownerAccountId: string;
  readonly logEntryId: string;
};

export const removeDraftLeague = defineCommand({
  name: 'leagues.remove_draft',
  permission: 'platform-staff',
  input: z.object({
    /**
     * The short name as typed. The tool takes off only the spaces the terminal leaves
     * around the line; this command and the database trim nothing more and compare it
     * with the league's own exactly, capitals included.
     */
    typedSlug: z.string().min(1).max(100),
  }),
  allowed: (context, _input, tx: LeagueRemovalTx) => mayActAsPlatform(context, tx),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<RemovedDraftLeague, RemoveDraftLeagueError>> => {
    const outcome = await tx.leagueRemoval.removeDraftLeague(input.typedSlug);
    if (outcome.removed) {
      return ok({
        leagueId: context.leagueId,
        slug: outcome.slug,
        name: outcome.name,
        ownerAccountId: outcome.ownerAccountId,
        logEntryId: outcome.logEntryId,
      });
    }
    if (outcome.why === 'in-use') return fail({ code: 'league-in-use', found: outcome.found });
    return fail({ code: outcome.why === 'not-found' ? 'league-not-found' : 'short-name-differs' });
  },
});
