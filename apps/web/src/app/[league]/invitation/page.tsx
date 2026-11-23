// The invitation's accept page (step 2.97): drawn for each request, never kept by a cache
// (the page reads the session and a cookie, and the answer says no-store), and its address
// holds no secret: the emailed link's token is held in a cookie ([token]/route.ts).
import type { Metadata } from 'next';
import { InvitationPage } from '../../../features/access-area/index.ts';
import { t } from '../../../server/messages.ts';

export const metadata: Metadata = { title: t('invitation.title') };

export default async function Page() {
  return <InvitationPage />;
}
