// The banner that always tells the truth (T6 §4): "All saved", or how many taps are
// still waiting to send. Taps the server refused are not saved either, and say so.
// The words are in the message files (T-187); this only picks which and the count.
import type { Translate } from '@srleagues/site';
import type { QueueStatus } from './tracker-queue.ts';

export type SavedBanner =
  | { readonly key: 'tracker.queue.allSaved' }
  | { readonly key: 'tracker.queue.waiting' | 'tracker.queue.notSaved'; readonly count: number };

/** Waiting taps come first: they may still be saved. Refused ones are shown once none wait. */
export function savedBanner(status: Pick<QueueStatus, 'waiting' | 'refused'>): SavedBanner {
  if (status.waiting > 0) return { key: 'tracker.queue.waiting', count: status.waiting };
  if (status.refused.length > 0) {
    return { key: 'tracker.queue.notSaved', count: status.refused.length };
  }
  return { key: 'tracker.queue.allSaved' };
}

export function savedBannerText(banner: SavedBanner, t: Translate): string {
  return banner.key === 'tracker.queue.allSaved'
    ? t(banner.key)
    : t.plural(banner.key, banner.count);
}
