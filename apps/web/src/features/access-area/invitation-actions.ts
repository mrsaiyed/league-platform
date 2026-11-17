'use server';
// The accept page's two buttons (step 2.97, P4 §4). The token is never in the form: it is
// read from the cookie the emailed link set (invitation-request.ts), so it is in no page
// either. Who is accepting comes from the session, never the form.
import { acceptInvitation, leagueUrl, platformUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import {
  contextOfRequest,
  forgetHeldToken,
  heldInvitationPath,
  heldToken,
  invitationRequest,
} from '../../server/invitation-request.ts';
import { signOut } from '../../server/sign-in/flows.ts';
import { flowDeps, nextVisit } from '../../server/sign-in/next-visit.ts';
import { screenUrl } from '../../server/sign-in/problems.ts';

/**
 * Accepts the invitation held for this browser, as the signed-in account, and goes to the
 * league's home, where the league's own header shows them in. Refused (used meanwhile,
 * cancelled, run out), the accept page is drawn again and says so.
 */
export async function acceptHeldInvitationAction(): Promise<never> {
  const request = await invitationRequest();
  if (request.kind !== 'league') return redirect(platformUrl('home'));
  const league = request.context.league;
  const back = heldInvitationPath(league.slug) ?? platformUrl('home');
  const token = await heldToken();
  if (token === undefined || request.context.account === null) return redirect(back);
  const { deps } = (await webPorts()).adminAccess;
  const accepted = await acceptInvitation(contextOfRequest(request), { token }, deps);
  if (!accepted.ok) return redirect(back);
  await forgetHeldToken(league.slug);
  return redirect(leagueUrl(league, 'home'));
}

/**
 * "Use another account": signs this browser out and opens sign-in, which brings the person
 * back to the accept page; the invitation stays held for this browser.
 */
export async function useAnotherAccountAction(form: FormData): Promise<never> {
  const league = form.get('league');
  const back = typeof league === 'string' ? heldInvitationPath(league) : undefined;
  await signOut(await nextVisit(), await flowDeps());
  return redirect(screenUrl('signin', { next: back ?? null }));
}
