'use client';
// The upload page's form (step 2.70, S-5, T-129): picks the file "Save a copy" wrote, reads
// it in the browser and posts it to the copy's route, as it is; the server checks it. It
// shows the result (what was new, what the server already had), each refusal in its own
// words, and, when another device holds the game, the tracker's own takeover question
// (S-42): only "Yes, take over" posts again, naming the holder agreed to. The words come
// from the page (T-187); the route is built by the one address helper.
import { leagueApiUrl } from '@srleagues/core';
import { translatorFrom, type Catalog } from '@srleagues/site';
import { useMemo, useRef, useState } from 'react';
import { LastHeard, takeOverQuestionText } from './take-over-parts.tsx';
import { uploadBody, uploadedLines, uploadViewOf, type UploadView } from './upload-copy.ts';

export type UploadCopyFormProps = {
  readonly leagueId: string;
  readonly gameId: string;
  readonly locale: string;
  /** The `tracker.` messages of the page's language. */
  readonly catalog: Catalog;
};

async function post(
  leagueId: string,
  gameId: string,
  copy: string,
  takeOverFrom?: { readonly since: number },
): Promise<UploadView> {
  try {
    const answer = await fetch(leagueApiUrl({ id: leagueId }, ['games', gameId, 'copy']), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: uploadBody(copy, takeOverFrom),
    });
    let body: unknown = null;
    try {
      body = await answer.json();
    } catch {
      // Not JSON: read by its status alone.
    }
    return uploadViewOf(answer.status, body, copy);
  } catch {
    return { kind: 'failed' };
  }
}

export function UploadCopyForm({ leagueId, gameId, locale, catalog }: UploadCopyFormProps) {
  const t = useMemo(() => translatorFrom(locale, { [locale]: catalog }), [locale, catalog]);
  const [view, setView] = useState<UploadView>({ kind: 'ready' });
  // How many answers the server has given on this page: each is its own, so the answer
  // shown is never mistaken for the one before (the browser test reads it).
  const [answers, setAnswers] = useState(0);
  const answered = (next: UploadView) => {
    setView(next);
    setAnswers((n) => n + 1);
  };
  const file = useRef<HTMLInputElement>(null);
  const sending = view.kind === 'sending';

  const upload = async () => {
    const picked = file.current?.files?.[0];
    if (picked === undefined) {
      setView({ kind: 'no-file' });
      return;
    }
    let copy: string;
    try {
      copy = await picked.text();
    } catch {
      setView({ kind: 'unreadable' });
      return;
    }
    setView({ kind: 'sending' });
    answered(await post(leagueId, gameId, copy));
  };
  const takeOver = async (held: Extract<UploadView, { kind: 'held-by-other' }>) => {
    setView({ kind: 'sending' });
    answered(await post(leagueId, gameId, held.copy, { since: held.holder.since }));
  };

  return (
    <div className="ui-stack" data-upload-copy="" data-upload-answers={answers}>
      <form
        className="ui-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void upload();
        }}
      >
        <label className="ui-field">
          <span>{t('tracker.upload.file')}</span>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            data-copy-file=""
            disabled={sending}
            onChange={() => setView({ kind: 'ready' })}
          />
        </label>
        <p>
          <button
            type="submit"
            className="ui-button"
            data-kind="main"
            data-upload-send=""
            disabled={sending || view.kind === 'held-by-other'}
            aria-busy={sending}
          >
            {t(sending ? 'tracker.upload.sending' : 'tracker.upload.send')}
          </button>
        </p>
      </form>
      <UploadAnswer
        view={view}
        t={t}
        onTakeOver={takeOver}
        onNotNow={() => setView({ kind: 'not-now' })}
      />
    </div>
  );
}

function UploadAnswer({
  view,
  t,
  onTakeOver,
  onNotNow,
}: {
  readonly view: UploadView;
  readonly t: ReturnType<typeof translatorFrom>;
  readonly onTakeOver: (held: Extract<UploadView, { kind: 'held-by-other' }>) => Promise<void>;
  readonly onNotNow: () => void;
}) {
  switch (view.kind) {
    case 'ready':
    case 'sending':
      return null;
    case 'uploaded':
      return (
        <div
          className="ui-notice"
          role="status"
          data-upload-result="uploaded"
          data-added={view.added}
          data-already-there={view.alreadyThere}
          data-not-taken={view.notTaken}
        >
          {uploadedLines(view, t).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      );
    case 'held-by-other': {
      const holder = {
        name: view.holder.displayName,
        sameAccount: view.holder.sameAccount === true,
      };
      return (
        <div className="ui-notice" role="alert" data-upload-result="held-by-other">
          <p>
            {holder.sameAccount
              ? t('tracker.heldBySelf')
              : t('tracker.heldByOther', { name: holder.name })}
          </p>
          <LastHeard lastHeardAt={view.holder.lastHeardAt} now={view.sentAt} t={t} />
          <p data-take-over="">{takeOverQuestionText(holder, t)}</p>
          <p className="ui-actions">
            <button
              type="button"
              className="ui-button"
              data-kind="main"
              data-upload-take-over=""
              onClick={() => void onTakeOver(view)}
            >
              {t('tracker.takeOverYes')}
            </button>{' '}
            <button type="button" className="ui-button" data-upload-not-now="" onClick={onNotNow}>
              {t('tracker.takeOverNo')}
            </button>
          </p>
        </div>
      );
    }
    case 'refused':
      return (
        <p
          className="ui-notice"
          data-kind="error"
          role="alert"
          data-upload-result="refused"
          data-code={view.code}
        >
          {t(`tracker.copy.refused.${view.code}`)}
        </p>
      );
    default:
      return (
        <p className="ui-notice" data-kind="error" role="alert" data-upload-result={view.kind}>
          {t(
            view.kind === 'no-file'
              ? 'tracker.upload.noFile'
              : view.kind === 'unreadable'
                ? 'tracker.upload.unreadable'
                : view.kind === 'not-now'
                  ? 'tracker.upload.notNow'
                  : view.kind === 'signed-out'
                    ? 'tracker.upload.signedOut'
                    : 'tracker.upload.failed',
          )}
        </p>
      );
  }
}
