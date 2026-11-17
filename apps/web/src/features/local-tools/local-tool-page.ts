// Which of the two local-only pages an address under `[league]` is (step 2.96), if any.
// Neither has a route of its own: `/signin/kept-emails` and `/signin/made-up-people` are
// answered by the route every unknown `/signin/<name>` address is answered by
// (`app/[league]/(site)/[...missing]`), which draws the page only with the local tools the
// gate gives (local-tool-screen.tsx) and otherwise goes on exactly as for any unknown
// address. So in staging and production both answer as an address that does not exist:
// the same route, layouts, "not found" screen and headers, by construction.
import { platformPages } from '@srleagues/core';

export type LocalToolPage = 'keptEmails' | 'madeUpPeople';

const localToolPages: readonly LocalToolPage[] = ['keptEmails', 'madeUpPeople'];

/** The local-only page at the route's `[league]` and `[...missing]` values, or null. */
export function localToolPageOf(league: string, missing: readonly string[]): LocalToolPage | null {
  const address = [league, ...missing];
  return (
    localToolPages.find((page) => {
      const parts = platformPages[page];
      return parts.length === address.length && parts.every((part, at) => part === address[at]);
    }) ?? null
  );
}
