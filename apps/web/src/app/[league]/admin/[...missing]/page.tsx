import { notFound } from 'next/navigation';
import { unreleasedScreen } from '../../../../features/unreleased/index.ts';
import { loadLeaguePage } from '../../../../server/load-league-page.ts';

/**
 * Any address under the admin that is no page of it. It is refused exactly as any other
 * address of the league that is no page (`(site)/[...missing]`): the league's own gate
 * first, so a league that may not be shown stays the plain "not found" (U-9), then "not
 * found". It has a page of its own here so that the refusal is drawn inside the admin's
 * frame for someone the admin is open to (`admin/not-found.tsx`, step 2.103).
 *
 * An area with no screen yet (step 2.140, server/releases.ts) has no route of its own: it
 * is drawn here, its calm panel, only where pages not built yet are shown (local work and
 * tests); in staging and production it is refused below, as an area that does not exist.
 */
export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly league: string; readonly missing: readonly string[] }>;
}) {
  const { league, missing } = await params;
  const unreleased = unreleasedScreen([league, 'admin', ...missing]);
  if (unreleased !== null) return unreleased;
  await loadLeaguePage(league, 'site');
  return notFound();
}
