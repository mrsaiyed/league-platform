// What publishing the season's draft would change, and how many teams and people it
// reaches, before the admin confirms (P7 §4.4, A-7). It changes nothing, but runs in the
// same shape as a command (record 014). It uses the same plan as publishing, so the two
// agree; `blockers` is everything that would make publishing refuse right now.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayPreviewPublish } from '../policy.ts';
import { planPublication, type PublishBlocker } from '../publish-plan.ts';
import type { SchedulingTx } from '../ports.ts';
import type { Clash } from '../rules/schedule-types.ts';
import type { PublishSummary } from '../rules/summarize-publish.ts';

export type SchedulePublishPreview = {
  /** What the draft names as its basis: the admin passes these back to publish. */
  readonly draftId: string;
  readonly version: number;
  readonly basedOnRevision: number | null;
  readonly summary: PublishSummary;
  readonly teamCount: number;
  readonly peopleCount: number;
  readonly clashes: readonly Clash[];
  readonly blockers: readonly PublishBlocker[];
  readonly canPublish: boolean;
};

export type PreviewSchedulePublishError = {
  readonly code: 'season-not-found' | 'draft-not-found' | 'draft-unreadable';
};

export const previewSchedulePublish = defineCommand({
  name: 'scheduling.preview_schedule_publish',
  permission: 'schedule.publish',
  input: z.object({ seasonId: z.uuid() }),
  allowed: (context, input, tx: SchedulingTx) => mayPreviewPublish(context, tx, input.seasonId),
  run: async ({
    input,
    tx,
  }): Promise<Result<SchedulePublishPreview, PreviewSchedulePublishError>> => {
    if ((await tx.scheduling.findSeason(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    const plan = await planPublication(tx, input.seasonId);
    if (plan === 'no-draft') return fail({ code: 'draft-not-found' });
    if ('unreadable' in plan) return fail({ code: 'draft-unreadable' });
    return ok({
      draftId: plan.draft.id,
      version: plan.draft.version,
      basedOnRevision: plan.draft.basedOnRevision,
      summary: plan.summary,
      teamCount: plan.summary.teamsAffected.length,
      peopleCount: plan.peopleAffected,
      clashes: plan.clashes,
      blockers: plan.blockers,
      canPublish: plan.blockers.length === 0,
    });
  },
});
