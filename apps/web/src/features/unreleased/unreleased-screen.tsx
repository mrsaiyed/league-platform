import type { ReactNode } from 'react';
import { shownHere } from '../../server/releases.ts';
import { LeagueSitePage, NotBuilt } from '../shell/index.ts';
import { AdminArea } from '../staff/index.ts';
import { unreleasedPageAt } from './unreleased-page.ts';

/**
 * The placeholder of a page not built yet at this address (step 2.140), drawn only where
 * pages not built yet are shown (local work and tests, server/releases.ts); null anywhere
 * else and for any other address, before the address is even looked at. The caller then
 * answers as for any unknown address, which it is in staging and production.
 */
export function unreleasedScreen(address: readonly string[]): ReactNode | null {
  if (!shownHere().unreleased) return null;
  const page = unreleasedPageAt(address);
  if (page === null) return null;
  const [league = ''] = address;
  switch (page.kind) {
    case 'platform':
      return <NotBuilt title={page.title} />;
    case 'league':
      return <LeagueSitePage league={league} title={page.title} />;
    case 'admin':
      return <AdminArea league={league} area={page.area} />;
  }
}
