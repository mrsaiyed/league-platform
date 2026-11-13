// Writing the activity log (A-6): who changed what and when. Every command that
// changes a league's settings or who has access records one entry, in its own
// transaction, so an entry exists exactly when the change does. The entry holds
// ids and fixed words only (history keeps no copies of personal details, 0004);
// its summary is a message key the page turns into words (T-187).
import type { CommandContext } from '../../command/index.ts';
import type { ActivityEntry, ActivityTx } from './ports.ts';

/** The message key of an action's summary: `activity.` and the command's name. */
export const activitySummaryKey = (action: string) => `activity.${action}`;

export type ActivityChange = {
  readonly action: string;
  readonly target?: { readonly type: string; readonly id: string };
  readonly details?: ActivityEntry['details'];
};

export async function recordActivity(
  tx: ActivityTx,
  context: CommandContext,
  change: ActivityChange,
): Promise<void> {
  await tx.activity.record({
    actorAccountId: context.accountId,
    action: change.action,
    targetType: change.target?.type ?? null,
    targetId: change.target?.id ?? null,
    summary: activitySummaryKey(change.action),
    details: change.details ?? {},
  });
}
