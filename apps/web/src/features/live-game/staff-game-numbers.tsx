'use client';
// A game's box scores and play-by-play as the person signed in here may see them (step
// 2.46): as everyone gets them, drawn on the server, until the signed-in request says this
// person may see a hidden team's players (its coach or captain, or the league's admin); then
// the note that these are not public and the game's numbers read for them, drawn by the same
// piece. The live part above (the scoreboard and its players) is the live messages', the
// same for everyone (T-87, T-120).
import type { ReactNode } from 'react';
import { StaffNumbersNote, useStaffNumbers } from '../staff-numbers/index.ts';
import { GameNumbersDrawn } from './game-numbers-drawn.tsx';
import type { GameNumbersView } from './game-numbers-view.ts';

export function StaffGameNumbers({
  address,
  children,
}: {
  /** The signed-in request's address (staffNumbersAddress). */
  readonly address: string;
  /** The box scores and plays as everyone gets them. */
  readonly children: ReactNode;
}) {
  const more = useStaffNumbers(address, 'game');
  if (more === null || more.page !== 'game') return children;
  // The server's own view, from this site only, checked for its kind (staff-numbers-reply.ts).
  const view = more.view as unknown as GameNumbersView;
  return (
    <>
      <StaffNumbersNote notice={more.notice} />
      <GameNumbersDrawn view={view} />
    </>
  );
}
