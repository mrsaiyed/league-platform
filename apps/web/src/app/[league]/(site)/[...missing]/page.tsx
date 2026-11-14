import { notFound } from 'next/navigation';
import { loadLeaguePage } from '../../../../server/load-league-page.ts';

/**
 * Any address under a league that is no page of it. Without this, Next.js answers such an
 * address itself, outside the league layout, and the visitor loses the league's header and
 * menu. Here it is refused like any other page of the league: the league's own gate first
 * (so a league that may not be shown stays the plain "not found", U-9), then "not found"
 * inside the league's frame (`[league]/not-found.tsx`).
 */
export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly league: string; readonly missing: readonly string[] }>;
}) {
  await loadLeaguePage((await params).league, 'site');
  return notFound();
}
