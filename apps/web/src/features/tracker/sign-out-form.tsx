'use client';
// A sign-out form that also clears the games the tracker kept on this device (T-115),
// so players' names do not stay for the next person to use it. The form waits for the
// clearing before it is sent, but never longer than `clearingWaitMs`: signing out is
// never held up (forgetOpenedGamesOnDevice never fails either). Before the page has
// loaded its script the form is sent straight away, and the next opening of the
// tracker lets go of another account's games.
import { useRef, type FormEvent, type ReactNode } from 'react';
import { forgetOpenedGamesOnDevice } from './indexeddb-opened-game-storage.ts';

/** The longest signing out waits for the device's games to be cleared. */
const clearingWaitMs = 1500;

const atMost = (work: Promise<void>, ms: number): Promise<void> =>
  Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, ms))]);

export function SignOutForm({
  action,
  children,
}: {
  /** The server's sign-out action. */
  readonly action: () => Promise<void>;
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
    void atMost(forgetOpenedGamesOnDevice(), clearingWaitMs).then(() => {
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
