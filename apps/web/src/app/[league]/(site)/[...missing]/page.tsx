import { notFound } from 'next/navigation';
import { localToolScreen } from '../../../../features/local-tools/index.ts';
import { unreleasedScreen } from '../../../../features/unreleased/index.ts';
import { loadLeaguePage } from '../../../../server/load-league-page.ts';

// Drawn for each request, never once when the site is built (step 2.96): the two local-only
// pages answered here show this computer's kept emails and made-up people at the moment
// they are asked for, and are drawn only when the gate allows this request. Being a route
// of dynamic segments, Next.js would not draw it at build time anyway; this says so.
export const dynamic = 'force-dynamic';

/**
 * Any address under a league that is no page of it. Without this, Next.js answers such an
 * address itself, outside the league layout, and the visitor loses the league's header and
 * menu. Here it is refused like any other page of the league: the league's own gate first
 * (so a league that may not be shown stays the plain "not found", U-9), then "not found"
 * inside the league's frame (`[league]/not-found.tsx`).
 *
 * In local work and tests two such addresses are pages: `/signin/kept-emails` and
 * `/signin/made-up-people` (step 2.96, features/local-tools), drawn only when the gate
 * gives the local tools. Anywhere else they go on below as every unknown `/signin/<name>`
 * does, through this same route, so they answer exactly as an address that does not exist.
 *
 * The pages not built yet below a league or one of our words (`/{league}/register`,
 * `/account/inbox`; step 2.140, server/releases.ts) are drawn here too, only where pages not
 * built yet are shown (local work and tests); in staging and production they go on below,
 * as the addresses that do not exist that they are there.
 */
export default async function Page({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly league: string; readonly missing: readonly string[] }>;
  readonly searchParams?: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { league, missing } = await params;
  const local = await localToolScreen(league, missing, (await searchParams) ?? {});
  if (local !== null) return local;
  const unreleased = unreleasedScreen([league, ...missing]);
  if (unreleased !== null) return unreleased;
  await loadLeaguePage(league, 'site');
  return notFound();
}
