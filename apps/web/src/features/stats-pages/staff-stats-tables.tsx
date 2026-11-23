'use client';
// The statistics page's leaders and tables as the person signed in here may see them (step
// 2.46): as everyone gets them, drawn on the server, until the signed-in request says this
// person may see more (a staff-only team's coach or captain, or the league's admin); then the
// note that these are not public and the same tables read for them, drawn by the same piece.
import type { ReactNode } from 'react';
import { StaffNumbersNote, useStaffNumbers } from '../staff-numbers/index.ts';
import { StatsTablesDrawn } from './stats-tables-drawn.tsx';
import type { StatsTablesView } from './stats-tables-view.ts';

export function StaffStatsTables({
  address,
  children,
}: {
  /** The signed-in request's address (staffNumbersAddress). */
  readonly address: string;
  /** The tables as everyone gets them. */
  readonly children: ReactNode;
}) {
  const more = useStaffNumbers(address, 'stats');
  if (more === null || more.page !== 'stats') return children;
  // The server's own view, from this site only, checked for its kind (staff-numbers-reply.ts).
  const view = more.view as unknown as StatsTablesView;
  return (
    <>
      <StaffNumbersNote notice={more.notice} />
      <StatsTablesDrawn view={view} />
    </>
  );
}
