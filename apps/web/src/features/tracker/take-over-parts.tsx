// The takeover question and "Send these plays" as they are drawn (step 2.148): who was
// scoring and when their device was last heard from (S-42), "you, on another device"
// told by the server's mark, never by names; and on a device that lost the game, its
// plays listed as not saved sent by the scorekeeper's own tap (S-43, T-335).
import type { Translate } from '@srleagues/site';
import type { SendNotSavedOffer } from './tracker-controller.ts';

/** Whole minutes since `lastHeardAt`, both on the server's clock; never below nought. */
export const minutesSince = (lastHeardAt: number, now: number): number =>
  Math.max(0, Math.floor((now - lastHeardAt) / 60_000));

/** "That device was last heard from 10 minutes ago", or nothing when it is not known. */
export function LastHeard({
  lastHeardAt,
  now,
  t,
}: {
  readonly lastHeardAt: number | undefined;
  readonly now: number;
  readonly t: Translate;
}) {
  if (lastHeardAt === undefined) return null;
  const minutes = minutesSince(lastHeardAt, now);
  return (
    <p data-last-heard={minutes}>
      {minutes === 0 ? t('tracker.lastHeardNow') : t.plural('tracker.lastHeard', minutes)}
    </p>
  );
}

/** The question itself: from whom, and what taking over does. */
export function takeOverQuestionText(
  holder: { readonly name: string; readonly sameAccount: boolean },
  t: Translate,
): string {
  return holder.sameAccount
    ? t('tracker.takeOverQuestionSelf')
    : t('tracker.takeOverQuestion', { name: holder.name });
}

/**
 * "Send these plays" under the list of plays not saved: offered only while the server's
 * game has not moved since they were made, "Sending…" while they go, and once the server
 * refused them (`game-moved`) a plain line that each is entered again.
 */
export function SendNotSaved({
  offer,
  busy,
  onSend,
  t,
  cannotTell = false,
}: {
  readonly offer: SendNotSavedOffer;
  readonly busy: boolean;
  readonly onSend: () => void;
  readonly t: Translate;
  /** Listed because the device could not tell whether somebody else scored (step 2.242). */
  readonly cannotTell?: boolean;
}) {
  if (!cannotTell) return <SendNotSavedOffered offer={offer} busy={busy} onSend={onSend} t={t} />;
  return (
    <>
      <p className="court-notice" data-cannot-tell="">
        {t('tracker.sendNotSaved.cannotTell')}
      </p>
      <SendNotSavedOffered offer={offer} busy={busy} onSend={onSend} t={t} />
    </>
  );
}

function SendNotSavedOffered({
  offer,
  busy,
  onSend,
  t,
}: {
  readonly offer: SendNotSavedOffer;
  readonly busy: boolean;
  readonly onSend: () => void;
  readonly t: Translate;
}) {
  if (offer === 'none') return null;
  if (offer === 'game-moved') {
    return (
      <p className="court-notice" data-send-not-saved="game-moved">
        {t('tracker.sendNotSaved.gameMoved')}
      </p>
    );
  }
  const sending = offer === 'sending';
  return (
    <p data-send-not-saved={offer}>
      <button
        type="button"
        className="court-button"
        data-kind="main"
        data-send-plays=""
        onClick={onSend}
        disabled={busy || sending}
        aria-busy={sending}
      >
        {t(sending ? 'tracker.sendNotSaved.sending' : 'tracker.sendNotSaved.send')}
      </button>
    </p>
  );
}
