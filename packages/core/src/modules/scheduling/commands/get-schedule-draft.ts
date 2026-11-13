// The season's schedule as the admin is editing it (P7 §4.3, §4.4): the published schedule
// with the draft's changes on top, the clashes left in it, the changes that no longer fit
// and what publishing would change. It changes nothing, but runs in the same shape as a
// command (record 014). `draft` is null while there is none; `latestRevision` is what a
// new edit must name as its basis.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { parseDraftDocument } from '../draft-document.ts';
import { maySeeSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';
import { applyDraft, type ApplyDraftResult } from '../rules/apply-draft.ts';
import { summarizePublish, type PublishSummary } from '../rules/summarize-publish.ts';

export type ScheduleDraftView = {
  readonly latestRevision: number | null;
  readonly draft: {
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
              version: draft.version,
              basedOnRevision: draft.basedOnRevision,
              outOfDate: draft.basedOnRevision !== latestRevision,
              changeCount: document.changes.length,
            },
      published,
      result: applied.state,
      rejected: applied.rejected,
      clashes: applied.clashes,
      summary: summarizePublish(published, applied.state),
    });
  },
});
