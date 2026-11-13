import type { ReactNode } from 'react';
import { AdminNav, type LeagueRouteProps } from '../../../features/shell/index.ts';
import { leagueView } from '../../../server/load-league-page.ts';

/** The admin (P4): its navigation, trimmed to what this person can use, and the area. */
export default async function AdminLayout({
  children,
  params,
}: LeagueRouteProps & { readonly children: ReactNode }) {
  // The navigation only for someone the admin is open to; each area checks itself.
  const view = await leagueView((await params).league, 'admin');
  if (view === null) return children;
  return (
    <div>
      <AdminNav view={view} />
      {children}
    </div>
  );
}
