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
import { useRef, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { forgetOpenedGamesOnDevice } from './indexeddb-opened-game-storage.ts';
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
  if (plan.go && plan.clearKeptGames) await atMost(forgetOpenedGamesOnDevice(), clearingWaitMs);
  return plan.go;
}

export function SignOutForm({
  action,
  waitingQuestion,
  children,
}: {
  /** The server's sign-out action. */
  readonly action: () => Promise<void>;
  readonly waitingQuestion: WaitingQuestion;
  readonly children: ReactNode;
}) {
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
  href,
  className,
  children,
}: {
  readonly action: () => Promise<void>;
  readonly waitingQuestion: WaitingQuestion;
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
      <form ref={form} action={action} hidden />
      <a className={className} href={href} onClick={onClick}>
        {children}
      </a>
    </>
  );
}
