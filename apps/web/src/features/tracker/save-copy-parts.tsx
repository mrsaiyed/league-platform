'use client';
// "Save a copy" on the scoring screen (S-5, T-129, step 2.70): behind More at any time,
// and suggested beside the notices once plays have waited several minutes with no
// answer (T6 §4). The file is written from the device's own queue (game-copy-on-device.ts)
// and handed to the browser to keep as a download; nothing is sent anywhere.
import type { Translate } from '@srleagues/site';
import { useState } from 'react';
import { gameCopyFile } from './game-copy-on-device.ts';
import { openIndexedDbQueueStorage } from './indexeddb-queue-storage.ts';

export type SaveCopyProps = {
  readonly leagueId: string;
  readonly gameId: string;
  readonly accountId: string;
  /** The game's upload page, built by the address helper (step 2.70). */
  readonly uploadHref: string;
  readonly t: Translate;
};

type Saved = { readonly kind: 'saved'; readonly count: number } | { readonly kind: 'failed' };

/** Hands the text to the browser as a file to keep. */
function download(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Let the browser take the file before the address is let go.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function useSaveCopy({ leagueId, gameId, accountId }: Omit<SaveCopyProps, 't' | 'uploadHref'>) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const storage = await openIndexedDbQueueStorage();
      const file = gameCopyFile({
        leagueId,
        gameId,
        accountId,
        entries: await storage.list(gameId),
        savedAt: Date.now(),
      });
      download(file.text, file.fileName);
      setSaved({ kind: 'saved', count: file.count });
    } catch {
      setSaved({ kind: 'failed' });
    } finally {
      setBusy(false);
    }
  };
  return { saved, busy, save };
}

function SavedLine({ saved, t }: { readonly saved: Saved | null; readonly t: Translate }) {
  if (saved === null) return null;
  if (saved.kind === 'failed') {
    return (
      <p className="court-notice" data-kind="error" data-copy-saved="failed" role="status">
        {t('tracker.copy.failed')}
      </p>
    );
  }
  return (
    <p className="court-quiet" data-copy-saved={saved.count} role="status">
      {saved.count === 0
        ? t('tracker.copy.savedNone')
        : t.plural('tracker.copy.saved', saved.count)}
    </p>
  );
}

/** Behind More: the button, what it is for, and what was saved. */
export function SaveCopy(props: SaveCopyProps) {
  const { saved, busy, save } = useSaveCopy(props);
  return (
    <div className="court-stack" data-save-copy="">
      <p>
        <button
          type="button"
          className="court-button"
          data-save-copy-button=""
          disabled={busy}
          onClick={() => void save()}
        >
          {props.t('tracker.copy.save')}
        </button>
      </p>
      <p className="court-quiet">{props.t('tracker.copy.explain')}</p>
      <SavedLine saved={saved} t={props.t} />
      <WhereToUpload href={props.uploadHref} t={props.t} />
    </div>
  );
}

/** Beside the notices after several minutes offline with plays waiting (T-129). */
export function SaveCopySuggestion(props: SaveCopyProps) {
  const { saved, busy, save } = useSaveCopy(props);
  return (
    <div className="court-stack" data-save-copy-suggestion="">
      <p className="court-notice">{props.t('tracker.copy.suggest')}</p>
      <p>
        <button
          type="button"
          className="court-button"
          data-save-copy-button=""
          disabled={busy}
          onClick={() => void save()}
        >
          {props.t('tracker.copy.save')}
        </button>
      </p>
      <SavedLine saved={saved} t={props.t} />
      <WhereToUpload href={props.uploadHref} t={props.t} />
    </div>
  );
}

/**
 * Where the copy is uploaded, for the scorekeeper to open on another phone or computer. It
 * opens in a new tab, so a tap on it never leaves the game on this screen.
 */
function WhereToUpload({ href, t }: { readonly href: string; readonly t: Translate }) {
  return (
    <p className="court-quiet" data-copy-upload-where="">
      {t('tracker.copy.where')}{' '}
      <a href={href} target="_blank" rel="noopener" data-upload-copy-link="">
        {t('tracker.upload.link')}
      </a>
    </p>
  );
}
