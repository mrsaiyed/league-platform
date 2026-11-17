// The season's schedule as the admin is editing it (P7 §4.3, §4.4): the published schedule
// with the draft's changes on top, the clashes left in it, the changes that no longer fit
// and what publishing would change. It changes nothing, but runs in the same shape as a
// command (record 014). `draft` is null while there is none; `latestRevision` is what a
// new edit must name as its basis.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { parseDraftDocument } from '../draft-document.ts';
import { maySeeSchedule } from '../policy.ts';
import type { GameInRound, SchedulingTx } from '../ports.ts';
import { undatedGamesIn } from '../round-use.ts';
import { applyDraft, type ApplyDraftResult } from '../rules/apply-draft.ts';
import { summarizePublish, type PublishSummary } from '../rules/summarize-publish.ts';

export type ScheduleDraftView = {
  readonly latestRevision: number | null;
  readonly draft: {
    readonly id: string;
    readonly version: number;
    readonly basedOnRevision: number | null;
    /** A revision was published since the draft was started: it must be discarded. */
    readonly outOfDate: boolean;
    readonly changeCount: number;
  } | null;
  readonly published: ApplyDraftResult['state'];
  /** The published schedule with the draft's changes applied (the published one if no draft). */
  readonly result: ApplyDraftResult['state'];
  readonly rejected: ApplyDraftResult['rejected'];
  readonly clashes: ApplyDraftResult['clashes'];
  /** Games the draft removes, as they were just before: what "Put it back" adds again. */
  readonly removed: ApplyDraftResult['removed'];
  /**
   * Games with no date yet, by the round they are in (step 2.181): the draft does not hold
   * them, but they keep their round, so the grid shows them in it.
   */
  readonly undated: readonly GameInRound[];
  readonly summary: PublishSummary;
};

export type GetScheduleDraftError = { readonly code: 'season-not-found' | 'draft-unreadable' };

export const getScheduleDraft = defineCommand({
  name: 'scheduling.get_schedule_draft',
  permission: 'schedule.read',
  input: z.object({ seasonId: z.uuid() }),
  allowed: (context, input, tx: SchedulingTx) => maySeeSchedule(context, tx, input.seasonId),
  run: async ({ input, tx }): Promise<Result<ScheduleDraftView, GetScheduleDraftError>> => {
    const store = tx.scheduling;
    if ((await store.findSeason(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    const latestRevision = await store.latestRevision(input.seasonId);
    const draft = await store.findDraft(input.seasonId);
    const published = await store.loadSchedule(input.seasonId);
    const document = draft === undefined ? undefined : parseDraftDocument(draft.changes);
    if (draft !== undefined && document === undefined) return fail({ code: 'draft-unreadable' });
    const applied = applyDraft(published, document?.changes ?? [], []);
    return ok({
      latestRevision,
      draft:
        draft === undefined || document === undefined
          ? null
          : {
              id: draft.id,
              version: draft.version,
              basedOnRevision: draft.basedOnRevision,
              outOfDate: draft.basedOnRevision !== latestRevision,
              changeCount: document.changes.length,
            },
      published,
      result: applied.state,
      rejected: applied.rejected,
      clashes: applied.clashes,
      removed: applied.removed,
      undated: await undatedGamesIn(
        tx,
        input.seasonId,
        applied.state.rounds.map((r) => r.id),
        published,
      ),
      summary: summarizePublish(published, applied.state),
    });
  },
});
