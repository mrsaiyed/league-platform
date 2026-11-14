// What the tracker tells the scorekeeper about holding the game and about taps that did
// not go in (T6 §5, T-113): read-only and why, who holds the game, signed out while
// scoring, taps the server refused, and taps that will not be sent. The words are in the
// message files (T-187); this picks which, from the controller's status. The saved
// banner is queue-banner.ts.
//
// Taps kept on the device that will not go by themselves are never called "waiting to
// send" here (finding M2): signed out, they go once the scorekeeper signs in again; no
// longer allowed to score, they stay on the device, not saved, until the game is given
// back and opened again (the lead's answer of 2026-11-14).
import type { Translate } from '@srleagues/site';
import type { ReadOnlyReason, TrackerControllerStatus } from './tracker-controller.ts';

export type TrackerNotice =
  | { readonly key: `tracker.readOnly.${ReadOnlyReason}` }
  | { readonly key: 'tracker.heldByOther'; readonly name: string }
  | { readonly key: 'tracker.signedOut' }
  | {
      readonly key:
        | 'tracker.notApplied'
        | 'tracker.notSaved'
        | 'tracker.signedOutKept'
        | 'tracker.notAllowedKept';
      readonly count: number;
    };

/** The notices to show, most important first; empty while there is nothing to say. */
export function trackerNotices(
  status: Pick<
    TrackerControllerStatus,
    'mode' | 'notApplied' | 'notSaved' | 'signedOut' | 'waiting'
  >,
): readonly TrackerNotice[] {
  const notices: TrackerNotice[] = [];
  const { mode } = status;
  const kept = status.waiting.length;
  if (mode.kind === 'read-only') {
    // Taken off the game with plays still on the device: they are kept, not saved.
    if (mode.reason === 'not-allowed' && kept > 0) {
      notices.push({ key: 'tracker.notAllowedKept', count: kept });
    } else {
      notices.push({ key: `tracker.readOnly.${mode.reason}` });
    }
  }
  if (mode.kind === 'held-by-other') {
    notices.push({ key: 'tracker.heldByOther', name: mode.holder.displayName });
  }
  if (mode.kind === 'scoring' && status.signedOut) {
    notices.push(
      kept > 0 ? { key: 'tracker.signedOutKept', count: kept } : { key: 'tracker.signedOut' },
    );
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
