'use client';
// A team's statistics as the person signed in here may see them (step 2.46): as everyone
// gets them, drawn on the server, until the signed-in request says this person may see the
// team's players (its coach or captain, or the league's admin); then the note that these are
// not public and the team's numbers read for them, drawn by the same piece.
import type { ReactNode } from 'react';
import { StaffNumbersNote, useStaffNumbers } from '../staff-numbers/index.ts';
import { TeamStatsDrawn } from './team-stats-drawn.tsx';
import type { TeamStatsDrawnView } from './team-stats-view.ts';

export function StaffTeamStats({
  address,
  children,
}: {
  /** The signed-in request's address (staffNumbersAddress). */
  readonly address: string;
  /** The team's statistics as everyone gets them. */
  readonly children: ReactNode;
}) {
  const more = useStaffNumbers(address, 'team');
  if (more === null || more.page !== 'team') return children;
  // The server's own view, from this site only, checked for its kind (staff-numbers-reply.ts).
  const view = more.view as unknown as TeamStatsDrawnView;
  return (
    <>
      <StaffNumbersNote notice={more.notice} />
      <TeamStatsDrawn view={view} />
    </>
  );
}
