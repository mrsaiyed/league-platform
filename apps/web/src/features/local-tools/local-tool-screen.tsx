import type { ReactNode } from 'react';
import { localTools } from '../../server/local-only.ts';
import { KeptEmailsPage } from './kept-emails-page.tsx';
import { localToolPageOf } from './local-tool-page.ts';
import { MadeUpPeoplePage } from './made-up-people-page.tsx';

/**
 * The local-only page at this address, drawn with the local tools (step 2.96); null when
 * the address is no local-only page or the gate gives no tools (outside local work and
 * tests, a request not made on this computer, ports without them). The caller then answers
 * as for any unknown address, which it is everywhere but here.
 */
export async function localToolScreen(
  league: string,
  missing: readonly string[],
): Promise<ReactNode | null> {
  const page = localToolPageOf(league, missing);
  if (page === null) return null;
  const tools = await localTools();
  if (tools === undefined) return null;
  return page === 'keptEmails' ? (
    <KeptEmailsPage tools={tools} />
  ) : (
    <MadeUpPeoplePage tools={tools} />
  );
}
