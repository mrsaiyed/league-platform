import { notFound } from 'next/navigation';
import { loadLeaguePage } from '../../../../server/load-league-page.ts';

/**
 * Any address under the admin that is no page of it. It is refused exactly as any other
 * address of the league that is no page (`(site)/[...missing]`): the league's own gate
 * first, so a league that may not be shown stays the plain "not found" (U-9), then "not
 * found". It has a page of its own here so that the refusal is drawn inside the admin's
 * frame for someone the admin is open to (`admin/not-found.tsx`, step 2.103).
 */
export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly league: string; readonly missing: readonly string[] }>;
}) {
  await loadLeaguePage((await params).league, 'site');
  return notFound();
}
