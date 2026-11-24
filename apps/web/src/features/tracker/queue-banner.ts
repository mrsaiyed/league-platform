// The banner that always tells the truth (T6 §4): "All saved", or how many plays are
// still waiting to send and how many the server refused (not saved), both at once, and
// that there is no connection whenever the device knows it (step 2.37).
// A device whose storage is failing says that, not that it is offline (record 024).
// The words are in the message files (T-187); this only picks which and the counts.
import type { Translate } from '@srleagues/site';
import { playerChangesIn } from './roster-changes.ts';
import type { QueueStatus } from './tracker-queue.ts';

export type SavedBannerLine =
  | {
      readonly key:
        | 'tracker.queue.allSaved'
        | 'tracker.queue.storageFailed'
        | 'tracker.queue.offline';
    }
  | {
      readonly key:
        | 'tracker.queue.waiting'
        | 'tracker.queue.waitingChanges'
        | 'tracker.queue.kept'
        | 'tracker.queue.keptChanges'
        | 'tracker.queue.notSaved';
      readonly count: number;
    };

/** The banner's lines, most urgent first; never empty. */
export type SavedBanner = readonly [SavedBannerLine, ...SavedBannerLine[]];

/**
 * Whether the device knows it has no connection (step 2.37): the browser says so, or
 * what the queue sends is going unanswered. Either is enough: the banner then says "No
 * connection" and never "All saved", whether or not plays are waiting.
 */
export function isOffline(
  queue: Pick<QueueStatus, 'unansweredSince'>,
  browserOnline: boolean,
): boolean {
  return !browserOnline || queue.unansweredSince !== null;
}

/**
 * `keptOnly`: the device is signed out or no longer allowed to score (step 2.37, part 2),
 * so nothing it holds is on its way: its plays are "kept on this device", never "waiting
 * to send" (finding M2).
 */
export function savedBanner(
  status: Pick<QueueStatus, 'waiting' | 'refused' | 'storageFailure'> &
    Partial<Pick<QueueStatus, 'waitingTaps'>>,
  offline = false,
  keptOnly = false,
): SavedBanner {
  const lines: SavedBannerLine[] = [];
  if (status.storageFailure !== null) lines.push({ key: 'tracker.queue.storageFailed' });
  if (offline) lines.push({ key: 'tracker.queue.offline' });
  // Changes of players are said as changes, plays as plays, both counts when both wait
  // (step 2.118): "5 plays waiting" after four adds and a take-off was not true.
  const changes = Math.min(status.waiting, playerChangesIn(status.waitingTaps ?? []).length);
  const plays = status.waiting - changes;
  if (plays > 0) {
    lines.push({ key: keptOnly ? 'tracker.queue.kept' : 'tracker.queue.waiting', count: plays });
  }
  if (changes > 0) {
    lines.push({
      key: keptOnly ? 'tracker.queue.keptChanges' : 'tracker.queue.waitingChanges',
      count: changes,
    });
  }
  if (status.refused.length > 0) {
    lines.push({ key: 'tracker.queue.notSaved', count: status.refused.length });
  }
  const [first, ...rest] = lines;
  return first === undefined ? [{ key: 'tracker.queue.allSaved' }] : [first, ...rest];
}

export function savedBannerLineText(line: SavedBannerLine, t: Translate): string {
  return 'count' in line ? t.plural(line.key, line.count) : t(line.key);
}

/** The banner as one line of text, its parts joined as the message files say. */
export function savedBannerText(banner: SavedBanner, t: Translate): string {
  return banner.map((line) => savedBannerLineText(line, t)).join(t('tracker.queue.separator'));
}

/**
 * The same lines said shorter, one each: what a phone's scoreboard shows where it has no
 * room for the long ones ("12 to send" for "12 actions waiting to send"). They say no
 * less: which line it is, and how many.
 */
export function savedBannerShortLines(banner: SavedBanner, t: Translate): readonly string[] {
  return banner.map((line) => {
    switch (line.key) {
      case 'tracker.queue.allSaved':
        return t('tracker.queue.allSaved');
      case 'tracker.queue.storageFailed':
        return t('tracker.queue.storageFailedShort');
      case 'tracker.queue.offline':
        return t('tracker.queue.offlineShort');
      case 'tracker.queue.waiting':
        return t.plural('tracker.queue.waitingShort', line.count);
      case 'tracker.queue.waitingChanges':
        return t.plural('tracker.queue.waitingChangesShort', line.count);
      case 'tracker.queue.kept':
        return t.plural('tracker.queue.keptShort', line.count);
      case 'tracker.queue.keptChanges':
        return t.plural('tracker.queue.keptChangesShort', line.count);
      case 'tracker.queue.notSaved':
        return t.plural('tracker.queue.notSavedShort', line.count);
    }
  });
}
