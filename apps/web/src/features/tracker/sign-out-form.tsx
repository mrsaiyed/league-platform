'use client';
// A sign-out form that also clears the games the tracker kept on this device (T-115),
// so players' names do not stay for the next person to use it. The form waits for the
// clearing before it is sent, but never longer than `clearingWaitMs`: signing out is
// never held up (forgetOpenedGamesOnDevice never fails either). Before the page has
// loaded its script the form is sent straight away, and the next opening of the
// tracker lets go of another account's games.
//
// With a game open on the page (the scoring page, step 2.127), signing out leaves the
// game first as the tracker's own ways out do (tracker-sign-out.ts): it asks when plays
// are waiting to be sent, releases the scoring session, and keeps the games on the device
// while plays wait.
import { useEffect, useRef, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { clearDeviceAccount, markSignedInHere } from './device-account.ts';
import { forgetOpenedGamesOnDevice } from './indexeddb-opened-game-storage.ts';
import { forgetTrackerPagesOnDevice } from './tracker-worker-registration.ts';
import {
  beforeSignOut,
  trackerSignOutHold,
  waitingQuestionText,
  type WaitingQuestion,
} from './tracker-sign-out.ts';

/** The longest signing out waits for the device's games to be cleared. */
const clearingWaitMs = 1500;

const atMost = (work: Promise<void>, ms: number): Promise<void> =>
  Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, ms))]);

/** Leaves an open game if there is one, clears what may be cleared; false: do not sign out. */
async function readyToSignOut(question: WaitingQuestion): Promise<boolean> {
  const plan = await beforeSignOut(trackerSignOutHold(), (waiting) =>
    window.confirm(waitingQuestionText(question, waiting)),
  );
  // Signing out also deletes the tracker pages the device kept (step 2.38, T-115).
  if (plan.go) {
    // Nobody is signed in here once this is sent (T-323).
    const clearing = [forgetTrackerPagesOnDevice(), clearDeviceAccount()];
    if (plan.clearKeptGames) clearing.push(forgetOpenedGamesOnDevice());
    await atMost(
      Promise.all(clearing).then(() => undefined),
      clearingWaitMs,
    );
  }
  return plan.go;
}

/**
 * Writes `accountId` on the device as the one signed in here, once this page has loaded
 * (T-323). A page with this form came from the network: the tracker's own scoring page,
 * which may be a kept copy, uses SignOutLink and marks the device once the server
 * answers its opening (open-tracker-game.ts). When the mark was another person's, their
 * kept pages and kept games are forgotten; their plays waiting to be sent stay, hidden.
 */
function useDeviceAccountMark(accountId: string | undefined): void {
  useEffect(() => {
    if (accountId === undefined) return;
    void markSignedInHere(accountId, async () => {
      await Promise.all([forgetTrackerPagesOnDevice(), forgetOpenedGamesOnDevice()]);
    });
  }, [accountId]);
}

export function SignOutForm({
  action,
  waitingQuestion,
  accountId,
  children,
}: {
  /** The server's sign-out action: the form's fields say where the person is (step 2.163). */
  readonly action: (form: FormData) => Promise<void>;
  readonly waitingQuestion: WaitingQuestion;
  /** The signed-in account, marked on the device as the one signed in here (T-323). */
  readonly accountId?: string;
  readonly children: ReactNode;
}) {
  useDeviceAccountMark(accountId);
  // 'clearing' while the games are cleared; 'cleared' for the one sending that follows.
  const stage = useRef<'idle' | 'clearing' | 'cleared'>('idle');
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (stage.current === 'cleared') {
      stage.current = 'idle';
      return; // React sends the form to the action.
    }
    event.preventDefault();
    if (stage.current === 'clearing') return; // a second tap while clearing
    stage.current = 'clearing';
    const form = event.currentTarget;
    const native = event.nativeEvent;
    const submitter =
      'submitter' in native && native.submitter instanceof HTMLElement ? native.submitter : null;
    void readyToSignOut(waitingQuestion).then((go) => {
      if (!go) {
        stage.current = 'idle';
        return;
      }
      stage.current = 'cleared';
      form.requestSubmit(submitter);
    });
  };
  return (
    <form action={action} onSubmit={onSubmit}>
      {children}
    </form>
  );
}

/**
 * "Sign out" on the scoring page: a link to the page where a shared device is signed out
 * (the account page), as the tracker's own way out is, so with scripts off it does what
 * that link does. With scripts on it leaves the game (asking first when plays are waiting)
 * and signs out here, through the same action as the form.
 */
export function SignOutLink({
  action,
  waitingQuestion,
  fields = {},
  href,
  className,
  children,
}: {
  readonly action: (form: FormData) => Promise<void>;
  readonly waitingQuestion: WaitingQuestion;
  /** What the form tells the action: where the person is, and that it is a staff page. */
  readonly fields?: Readonly<Record<string, string>>;
  /** The account page: where the link leads with scripts off. */
  readonly href: string;
  readonly className: string;
  readonly children: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // A link opened in a new tab or window leaves this page as it is.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    void readyToSignOut(waitingQuestion).then((go) => {
      busy.current = false;
      if (go) form.current?.requestSubmit();
    });
  };
  return (
    <>
      <form ref={form} action={action} hidden>
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </form>
      <a className={className} href={href} onClick={onClick}>
        {children}
      </a>
    </>
  );
}
