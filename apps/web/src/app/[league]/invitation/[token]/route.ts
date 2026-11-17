// The link in an invitation's email (P4 §4, T-226, record 023), `/{league}/invitation/{token}`.
// It draws nothing: it holds the token for this browser in a cookie sent only to the
// league's accept page, and forwards the browser there at once, to an address with no
// secret in it (record 086, invitation-request.ts). Every league address and every token
// is answered the same way, whether the league is there or not and the token right or
// not, so the answer tells nobody anything; the accept page then says what the token
// gives. The answer is never kept by a cache (no-store) and the address is never passed
// on (no-referrer, also in next.config.ts). Nothing here is logged.
import { NextResponse, type NextRequest } from 'next/server';
import { getConfig } from '../../../../server/config.ts';
import {
  heldInvitationCookie,
  heldInvitationOptions,
  heldInvitationPath,
  isTokenShaped,
} from '../../../../server/invitation-request.ts';
import { secureCookies } from '../../../../server/sign-in/next-visit.ts';

type Params = { readonly params: Promise<{ readonly league: string; readonly token: string }> };

export async function GET(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { league, token } = await params;
  const origin = getConfig().PUBLIC_BASE_URL;
  const held = heldInvitationPath(league);
  const response = NextResponse.redirect(new URL(held ?? '/', origin), 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  if (held !== undefined) {
    // A value of the wrong shape is held as nothing: the page then says the link does not
    // work, as for any other token that does not.
    response.cookies.set(
      heldInvitationCookie,
      isTokenShaped(token) ? token : '',
      heldInvitationOptions(held, secureCookies()),
    );
  }
  return response;
}
