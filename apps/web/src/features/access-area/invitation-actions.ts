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
import { turnedBackTo } from './turned-back-to.ts';

/**
 * Accepts the invitation held for this browser, as the signed-in account, and goes to the
 * league's home, where the league's own header shows them in. Refused (used meanwhile,
 * cancelled, run out), the accept page is drawn again and says so.
 */
export async function acceptHeldInvitationAction(): Promise<never> {
  const request = await invitationRequest();
  if (request.kind !== 'league') return redirect(platformUrl('home'));
  const league = request.context.league;
  const token = await heldToken();
  const ports = await webPorts();
  const signedIn = request.context.account !== null;
  const holder = signedIn ? await ports.accessOf(contextOfRequest(request)) : undefined;
  // A visitor at a hidden league goes where a missing league sends them (T-453).
  const back = turnedBackTo({
    status: league.status,
    holder,
    signedIn,
    invitationHeld: token !== undefined,
    back: heldInvitationPath(league.slug) ?? null,
  });
  if (token === undefined || !signedIn) return redirect(back);
  const { deps } = ports.adminAccess;
  const accepted = await acceptInvitation(contextOfRequest(request), { token }, deps);
  if (!accepted.ok) return redirect(back);
  await forgetHeldToken(league.slug);
  return redirect(leagueUrl(league, 'home'));
}

/**
 * "Use another account": signs this browser out and opens sign-in, which brings the person
 * back to the accept page; the invitation stays held for this browser. Since step 2.163 a
 * plain sign-out leaves the person on the page they were on, so the accept page is named as
 * a page that asks for sign-in (`staff`): the sign-in screen, saying "You are signed out",
 * with the way back to the invitation.
 */
export async function useAnotherAccountAction(form: FormData): Promise<never> {
  const league = form.get('league');
  const back = typeof league === 'string' ? heldInvitationPath(league) : undefined;
  if (back === undefined) {
    await signOut({}, await nextVisit(), await flowDeps());
    return redirect(screenUrl('signin', { next: null }));
  }
  const answer = await signOut({ next: back, staff: 'yes' }, await nextVisit(), await flowDeps());
  return redirect(answer.to);
}
