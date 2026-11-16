import type { ReactNode } from 'react';
import type { LeagueRouteProps } from '../../../features/shell/index.ts';
import { StaffFrame } from '../../../features/staff/index.ts';
import { leagueView } from '../../../server/load-league-page.ts';
// The staff area's own stylesheets: only the admin's pages carry them (step 2.103). The
// frame and the shared staff pieces first, then what each page needs beyond them.
import './staff.css';
import './staff-pages.css';

/**
 * The admin (P4): its own frame around every one of its pages (step 2.103), with the menu
 * trimmed to what this person can use. The league's layout leaves the public header, tabs
 * and footer off these addresses for anyone the admin is open to.
 */
export default async function AdminLayout({
  children,
  params,
}: LeagueRouteProps & { readonly children: ReactNode }) {
  // The frame only for someone the admin is open to; each area checks itself, and a page
  // that refuses replaces this (load-league-page.ts).
  const view = await leagueView((await params).league, 'admin');
  if (view === null) return children;
  return <StaffFrame view={view}>{children}</StaffFrame>;
}
