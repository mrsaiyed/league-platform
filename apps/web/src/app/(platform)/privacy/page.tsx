import { LegalNote } from '../../../features/shell/index.ts';
import type { SearchProps } from '../../../features/sign-in/index.ts';
import { getConfig } from '../../../server/config.ts';
import { safeReturnPath } from '../../../server/sign-in/device.ts';
import { returnLeagueOf } from '../../../server/sign-in/return-league.ts';

// The short plain note until the lawyer's versions exist (B-14, step 2.135), open to
// everyone, signed in or not, with scripts on or off. Opened from a league's page (its
// footer carries the page as `from`), it leads back there, for a league the reader may
// see (return-league.ts; the using-it audit, M22).
export default async function Page({ searchParams }: SearchProps) {
  const from = safeReturnPath((await searchParams)['from']);
  return (
    <LegalNote
      page="privacy"
      back={await returnLeagueOf(from)}
      from={from}
      contactEmail={getConfig().CONTACT_EMAIL}
    />
  );
}
