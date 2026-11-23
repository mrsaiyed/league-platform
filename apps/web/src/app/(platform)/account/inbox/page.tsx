import { platformUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import { NotBuilt } from '../../../../features/shell/index.ts';
import { screenUrl } from '../../../../server/sign-in/problems.ts';
import { signedInPerson } from '../../../../server/signed-in-leagues.ts';

// A person's inbox on the site (P6 §2), not built yet. It is a signed-in person's own, so
// a signed-out person is sent to sign in and brought back here (step 2.163, L10).
export default async function Page() {
  const person = await signedInPerson();
  if (person.kind === 'account-problem') redirect(platformUrl('account'));
  if (person.kind === 'visitor') redirect(screenUrl('signin', { next: platformUrl('inbox') }));
  return <NotBuilt title="page.inbox" />;
}
