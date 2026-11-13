// Runs before every page. It writes the address exactly as it arrived (still
// percent-encoded, capitals kept) into a request header for the pages, overwriting
// any header of that name the browser sent, because the pages are given only the
// decoded parts and context.ts must see the address as it came (T-34, U-7).
//
// It also keeps a session going (T-69, T-70): when the browser sends the renewing
// token and no session cookie (it ran out), the session is renewed here, the page
// sees the new token, and the browser is given the new cookies (renew-session.ts).
import { NextResponse, type NextRequest } from 'next/server';
import { webPorts } from './server/container.ts';
import { pathHeader } from './server/request-facts-header.ts';
import { cookieNames, type CookieJar, type CookieOptions } from './server/sign-in/cookies.ts';
import { secureCookies } from './server/sign-in/next-visit.ts';
import { renewIfDue } from './server/sign-in/renew-session.ts';

type Change =
  | { readonly name: string; readonly value: string; readonly options: CookieOptions }
  | { readonly name: string; readonly value: null };

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const changes: Change[] = [];
  if (
    request.cookies.has(cookieNames.renew) &&
    (request.cookies.get(cookieNames.session)?.value ?? '') === ''
  ) {
    const jar: CookieJar = {
      get: (name) => request.cookies.get(name)?.value,
      set: (name, value, options) => {
        request.cookies.set(name, value);
        changes.push({ name, value, options });
      },
      delete: (name) => {
        request.cookies.delete(name);
        changes.push({ name, value: null });
      },
    };
    const ports = await webPorts();
    await renewIfDue(jar, ports.renewSession, secureCookies(), () => new Date());
  }

  const headers = new Headers(request.headers);
  headers.set(pathHeader, url.pathname + url.search);
  if (changes.length > 0) {
    const cookie = request.cookies.toString();
    if (cookie === '') headers.delete('cookie');
    else headers.set('cookie', cookie);
  }
  const response = NextResponse.next({ request: { headers } });
  for (const change of changes) {
    if (change.value === null) response.cookies.delete(change.name);
    else response.cookies.set(change.name, change.value, change.options);
  }
  return response;
}

// Every address but Next.js's own files and the icon, matched exactly: a looser
// pattern (`favicon.ico` unanchored) also skipped addresses such as `/faviconXico`,
// whose pages would then see whatever header the browser sent. The pages check too
// (league-gate.ts, addressMatchesRoute).
export const config = {
  matcher: ['/((?!_next/static/|_next/image|favicon\\.ico$).*)'],
};
