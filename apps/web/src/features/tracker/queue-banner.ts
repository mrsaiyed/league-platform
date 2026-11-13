// The banner that always tells the truth (T6 §4): "All saved", or how many taps are
// still waiting to send and how many the server refused (not saved), both at once.
// A device whose storage is failing says that, not that it is offline (record 024).
// The words are in the message files (T-187); this only picks which and the counts.
import type { Translate } from '@srleagues/site';
import type { QueueStatus } from './tracker-queue.ts';

export type SavedBannerLine =
  | { readonly key: 'tracker.queue.allSaved' | 'tracker.queue.storageFailed' }
  | { readonly key: 'tracker.queue.waiting' | 'tracker.queue.notSaved'; readonly count: number };

/** The banner's lines, most urgent first; never empty. */
export type SavedBanner = readonly [SavedBannerLine, ...SavedBannerLine[]];

export function savedBanner(
  status: Pick<QueueStatus, 'waiting' | 'refused' | 'storageFailure'>,
): SavedBanner {
  const lines: SavedBannerLine[] = [];
  if (status.storageFailure !== null) lines.push({ key: 'tracker.queue.storageFailed' });
  if (status.waiting > 0) lines.push({ key: 'tracker.queue.waiting', count: status.waiting });
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
