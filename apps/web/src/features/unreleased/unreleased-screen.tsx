import { platformUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { shownHere } from '../../server/releases.ts';
import { screenUrl } from '../../server/sign-in/problems.ts';
import { signedInPerson } from '../../server/signed-in-leagues.ts';
import { LeagueSitePage, NotBuilt, StandalonePage } from '../shell/index.ts';
import { AdminArea } from '../staff/index.ts';
import { unreleasedPageAt } from './unreleased-page.ts';

/**
 * The placeholder of a page not built yet at this address (step 2.140), drawn only where
 * pages not built yet are shown (local work and tests, server/releases.ts); null anywhere
 * else and for any other address, before the address is even looked at. The caller then
 * answers as for any unknown address, which it is in staging and production.
 */
export async function unreleasedScreen(address: readonly string[]): Promise<ReactNode | null> {
  if (!shownHere().unreleased) return null;
  const page = unreleasedPageAt(address);
  if (page === null) return null;
  const [league = ''] = address;
  switch (page.kind) {
    case 'platform':
      // A person's inbox (P6 §2) is a signed-in person's own: a signed-out person is sent to
      // sign in and brought back here (step 2.163, L10), as the page will when it is built.
      if (page.page === 'inbox') {
        const person = await signedInPerson();
        if (person.kind === 'account-problem') redirect(platformUrl('account'));
        if (person.kind === 'visitor')
          redirect(screenUrl('signin', { next: platformUrl('inbox') }));
      }
      // SR Leagues' own plain frame, as its "not found" has: a page of no league.
      return (
        <StandalonePage>
          <NotBuilt title={page.title} />
        </StandalonePage>
      );
    case 'league':
      return <LeagueSitePage league={league} title={page.title} />;
    case 'admin':
      return <AdminArea league={league} area={page.area} />;
  }
}
