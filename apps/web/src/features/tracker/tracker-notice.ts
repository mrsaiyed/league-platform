// What the tracker tells the scorekeeper about holding the game and about taps that did
// not go in (T6 §5, T-113): read-only and why, who holds the game, taps the server
// refused, and taps that will not be sent. The words are in the message files (T-187);
// this picks which, from the controller's status. The saved banner is queue-banner.ts.
import type { Translate } from '@srleagues/site';
import type { ReadOnlyReason, TrackerControllerStatus } from './tracker-controller.ts';

export type TrackerNotice =
  | { readonly key: `tracker.readOnly.${ReadOnlyReason}` }
  | { readonly key: 'tracker.heldByOther'; readonly name: string }
  | { readonly key: 'tracker.notApplied' | 'tracker.notSaved'; readonly count: number };

/** The notices to show, most important first; empty while there is nothing to say. */
export function trackerNotices(
  status: Pick<TrackerControllerStatus, 'mode' | 'notApplied' | 'notSaved'>,
): readonly TrackerNotice[] {
  const notices: TrackerNotice[] = [];
  const { mode } = status;
  if (mode.kind === 'read-only') notices.push({ key: `tracker.readOnly.${mode.reason}` });
  if (mode.kind === 'held-by-other') {
    notices.push({ key: 'tracker.heldByOther', name: mode.holder.displayName });
  }
  if (status.notSaved.length > 0) {
    notices.push({ key: 'tracker.notSaved', count: status.notSaved.length });
  }
  if (status.notApplied.length > 0) {
    notices.push({ key: 'tracker.notApplied', count: status.notApplied.length });
  }
  return notices;
}

export function trackerNoticeText(notice: TrackerNotice, t: Translate): string {
  if ('count' in notice) return t.plural(notice.key, notice.count);
  if ('name' in notice) return t(notice.key, { name: notice.name });
  return t(notice.key);
}
