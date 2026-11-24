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
  | { readonly key: 'tracker.signedOut' | 'tracker.reopen.doneElsewhere' | 'tracker.heldBySelf' }
  | {
      readonly key:
        | 'tracker.notApplied'
        | 'tracker.notSaved'
        | 'tracker.signedOutKept'
        | 'tracker.notAllowedKept'
        | 'tracker.offlineLong';
      readonly count: number;
    };

/**
 * Whether the page shows the final panel: the game loaded on this device is final, and
 * the device either still scores it (the End just tapped) or has been told by the league
 * that the game is over. The scoring screen stays, with the panel in the pad's place
 * (step 2.37), so nothing says "this game is over" a second time above it.
 */
export const showsFinalPanel = (status: Pick<TrackerControllerStatus, 'mode' | 'game'>): boolean =>
  status.game?.status === 'final' &&
  (status.mode.kind === 'scoring' ||
    (status.mode.kind === 'read-only' && status.mode.reason === 'game-not-live'));

/** Whether a tap the league refused is the End game tap: the scoring screen says that one itself. */
const isEnd = (refused: TrackerControllerStatus['notApplied'][number]): boolean =>
  'input' in refused.command && refused.command.input.type === 'end';

/** The notices to show, most important first; empty while there is nothing to say. */
export function trackerNotices(
  status: Pick<
    TrackerControllerStatus,
    'mode' | 'game' | 'notApplied' | 'notSaved' | 'signedOut' | 'waiting' | 'offlineLong'
  >,
): readonly TrackerNotice[] {
  const notices: TrackerNotice[] = [];
  const { mode } = status;
  const kept = status.waiting.length;
  if (mode.kind === 'read-only') {
    // Taken off the game with plays still on the device: they are kept, not saved.
    if (mode.reason === 'not-allowed' && kept > 0) {
      notices.push({ key: 'tracker.notAllowedKept', count: kept });
    } else if (!showsFinalPanel(status)) {
      // (A game this device shows final says so in its final panel, not here.)
      notices.push({ key: `tracker.readOnly.${mode.reason}` });
    }
  }
  if (mode.kind === 'held-by-other') {
    // Reopened from here: said first, in place of a final panel no longer shown (M3).
    if (mode.reopened === true) notices.push({ key: 'tracker.reopen.doneElsewhere' });
    // The same account on another device, by the server's mark (S-42), never by names.
    notices.push(
      mode.holder.sameAccount === true
        ? { key: 'tracker.heldBySelf' }
        : { key: 'tracker.heldByOther', name: mode.holder.displayName },
    );
  }
  if (mode.kind === 'scoring' && status.signedOut) {
    notices.push(
      kept > 0 ? { key: 'tracker.signedOutKept', count: kept } : { key: 'tracker.signedOut' },
    );
  }
  // Several minutes with no connection and plays waiting (T6 §4): they are only here.
  if (status.offlineLong && kept > 0) notices.push({ key: 'tracker.offlineLong', count: kept });
  if (status.notSaved.length > 0) {
    notices.push({ key: 'tracker.notSaved', count: status.notSaved.length });
  }
  // An End game the league did not take (a level score in a season with no ties) is said
  // by the scoring screen, in the pad, and dropped from the list there: it is not counted
  // here, so the header never grows for it (step 2.37).
  const notApplied = status.notApplied.filter((refused) => !isEnd(refused)).length;
  if (notApplied > 0) notices.push({ key: 'tracker.notApplied', count: notApplied });
  return notices;
}

export function trackerNoticeText(notice: TrackerNotice, t: Translate): string {
  if ('count' in notice) return t.plural(notice.key, notice.count);
  if ('name' in notice) return t(notice.key, { name: notice.name });
  return t(notice.key);
}
