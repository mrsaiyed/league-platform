// The upload page of a copy of a game (step 2.70, S-5, T-129), without React: what the
// page posts to the copy's route, and how it reads the answer. The server reads and
// checks the file itself (game-copy-upload-endpoint.ts); the page only hands it over.
import {
  GameCopyUploadReply,
  maxGameCopyLength,
  type GameCopyNotKept,
  type GameCopyUpload,
  type GameCopyUploadRefusal,
} from '@srleagues/contracts';
import type { Translate } from '@srleagues/site';

/** Who holds the game, as the upload's answer names them. */
export type UploadHolder = Extract<GameCopyUploadReply, { status: 'held-by-other' }>['holder'];

/** What the upload page shows. */
export type UploadView =
  | { readonly kind: 'ready' }
  | { readonly kind: 'no-file' }
  | { readonly kind: 'unreadable' }
  /** Too large to be a copy: said before it is read, or by the server (413). */
  | { readonly kind: 'too-large' }
  | { readonly kind: 'sending' }
  | {
      readonly kind: 'uploaded';
      readonly added: number;
      readonly alreadyThere: number;
      readonly notTaken: number;
      /** Plays of a statistic the season does not keep, by statistic (T-395). */
      readonly notKept?: readonly GameCopyNotKept[];
    }
  /** Another device holds the game: the takeover question, with what to send if agreed. */
  | {
      readonly kind: 'held-by-other';
      readonly holder: UploadHolder;
      readonly sentAt: number;
      readonly copy: string;
    }
  /** "Not now": nothing was sent and the game stays with the other device. */
  | { readonly kind: 'not-now' }
  | { readonly kind: 'refused'; readonly code: GameCopyUploadRefusal }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'failed' };

/**
 * Whether a file of `bytes` is too large to be a copy, before it is read: a copy's text
 * has at most `maxGameCopyLength` characters, each at most 3 bytes as UTF-8.
 */
export const fileTooLarge = (bytes: number): boolean => bytes > maxGameCopyLength * 3;

/** The body of one upload: the file's text and, once agreed, whom the game is taken from. */
export function uploadBody(copy: string, takeOverFrom?: { readonly since: number }): string {
  const body: GameCopyUpload =
    takeOverFrom === undefined
      ? { copy }
      : { copy, takeOver: { expectedHolderSince: takeOverFrom.since } };
  return JSON.stringify(body);
}

/** The page's view of the server's answer: its status and its body as JSON (null if none). */
export function uploadViewOf(status: number, body: unknown, copy: string): UploadView {
  const reply = GameCopyUploadReply.safeParse(body);
  if (reply.success) {
    const r = reply.data;
    if (r.status === 'uploaded') {
      return {
        kind: 'uploaded',
        added: r.added,
        alreadyThere: r.alreadyThere,
        notTaken: r.notTaken,
        ...(r.notKept === undefined ? {} : { notKept: r.notKept }),
      };
    }
    if (r.status === 'held-by-other') {
      return { kind: 'held-by-other', holder: r.holder, sentAt: r.sentAt, copy };
    }
    return { kind: 'refused', code: r.code };
  }
  // The league's own refusals, before the upload is read (league-api.ts).
  if (status === 401) return { kind: 'signed-out' };
  if (status === 413) return { kind: 'too-large' };
  if (status === 403) return { kind: 'refused', code: 'not-allowed' };
  if (status === 404) return { kind: 'refused', code: 'unknown-game' };
  return { kind: 'failed' };
}

/** The result's lines: done, then what was new, what the server had, what was not taken. */
export function uploadedLines(
  view: Extract<UploadView, { kind: 'uploaded' }>,
  t: Translate,
): string[] {
  const { added, alreadyThere, notTaken, notKept = [] } = view;
  const notKeptCount = notKept.reduce((sum, n) => sum + n.count, 0);
  if (added + alreadyThere + notTaken + notKeptCount === 0) return [t('tracker.upload.empty')];
  return [
    t('tracker.upload.done'),
    added === 0 ? t('tracker.upload.addedNone') : t.plural('tracker.upload.added', added),
    ...(alreadyThere === 0 ? [] : [t.plural('tracker.upload.alreadyThere', alreadyThere)]),
    ...(notTaken === 0 ? [] : [t.plural('tracker.upload.notTaken', notTaken)]),
    ...notKept.map((n) =>
      n.statistic === 'turnovers'
        ? t.plural('tracker.upload.notKept.turnovers', n.count)
        : t.plural('tracker.upload.notKept.other', n.count),
    ),
  ];
}
