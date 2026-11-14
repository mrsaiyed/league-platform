'use client';
// A sign-out form that also clears the games the tracker kept on this device (T-115),
// so players' names do not stay for the next person to use it. The clearing starts as
// the form is sent; it never holds up signing out (forgetOpenedGamesOnDevice).
import type { ReactNode } from 'react';
import { forgetOpenedGamesOnDevice } from './indexeddb-opened-game-storage.ts';

export function SignOutForm({
  action,
  children,
}: {
  /** The server's sign-out action. */
  readonly action: () => Promise<void>;
  readonly children: ReactNode;
}) {
  return (
    <form action={action} onSubmit={() => void forgetOpenedGamesOnDevice()}>
      {children}
    </form>
  );
}
