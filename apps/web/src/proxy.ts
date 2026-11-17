// Runs before every page. It writes the address exactly as it arrived (still
// percent-encoded, capitals kept) into a request header for the pages, overwriting
// any header of that name the browser sent, because the pages are given only the
// decoded parts and context.ts must see the address as it came (T-34, U-7).
//
// First of all, on made-up data (local work and tests: the made-up world, and the made-up
// database, whose ports carry the local tools of step 2.96), a request gets a plain page
// and nothing else unless it is addressed to this computer's own names (or the app's own
// `.test` name) and carries no sign of having been passed on by another server (step
// 2.152; this-computer.ts, answersOnlyHere). The made-up people's cookies are in the code.
// What keeps other computers out is that the made-up world listens on the loopback address
// only (scripts/web-listen.mjs); this check keeps out what can still arrive here.
//
// It also keeps a session going (T-69, T-70): when the browser sends the renewing
// token and no session cookie (it ran out), the session is renewed here, the page
// sees the new token, and the browser is given the new cookies (renew-session.ts).
import { NextResponse, type NextRequest } from 'next/server';
import { isDevelopmentServer } from './server/config.ts';
import { webPorts } from './server/container.ts';
import { t } from './server/messages.ts';
import { pathHeader } from './server/request-facts-header.ts';
import {
  contentSecurityPolicy,
  fixedContentSecurityPolicy,
  newNonce,
} from './server/security-headers.ts';
import { cookieNames, type CookieJar, type CookieOptions } from './server/sign-in/cookies.ts';
import { secureCookies } from './server/sign-in/next-visit.ts';
import { renewIfDue } from './server/sign-in/renew-session.ts';

type Change =
  | { readonly name: string; readonly value: string; readonly options: CookieOptions }
  | { readonly name: string; readonly value: null };

/**
 * The plain page a request gets when the app does not answer it: the made-up world
 * answers only requests made on this computer, to its own names (step 2.152). No session
 * is read first.
 */
function notAnswered(): NextResponse {
  const escape = (text: string) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const title = escape(t('standIn.otherHost.title'));
  const body = escape(t('standIn.otherHost.body'));
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`,
    {
      status: 421,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        // No script on this page, so none may run (record 081).
        'content-security-policy': fixedContentSecurityPolicy,
      },
    },
  );
}

/** The app's ports, or undefined while it cannot start: the pages and /health say so. */
async function portsIfStarted() {
  try {
    return await webPorts();
  } catch {
    return undefined;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const ports = await portsIfStarted();
  if (ports?.answers(request.headers) === false) return notAnswered();
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
    // As before: a renewal needs the app, and its start-up failing is the page's to say.
    const started = ports ?? (await webPorts());
    await renewIfDue(jar, started.renewSession, secureCookies(), () => new Date());
  }

  const headers = new Headers(request.headers);
  headers.set(pathHeader, url.pathname + url.search);
  // This answer's script policy, with a nonce made for it alone (T-79, record 081). Written
  // into the request too, over any the browser sent: Next.js reads the nonce from there and
  // puts it on every script it draws, and so does the bot check's widget (nonceOf).
  const widget = ports?.botCheck.widget;
  const policy = contentSecurityPolicy({
    nonce: newNonce(),
    botCheckOrigin: widget?.kind === 'turnstile' ? widget.origin : undefined,
    development: isDevelopmentServer(),
  });
  headers.set('content-security-policy', policy);
  if (changes.length > 0) {
    const cookie = request.cookies.toString();
    if (cookie === '') headers.delete('cookie');
    else headers.set('cookie', cookie);
  }
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  // An answer that sets cookies is never kept by a shared cache (the snapshot endpoint
  // also answers private to any request carrying a sign-in cookie).
  if (changes.length > 0) response.headers.set('Cache-Control', 'private, no-store');
  for (const change of changes) {
    if (change.value === null) response.cookies.delete(change.name);
    else response.cookies.set(change.name, change.value, change.options);
  }
  return response;
}

// Every address but Next.js's own files, the icon and the two stylesheets we serve
// ourselves, matched exactly: a looser pattern (`favicon.ico` unanchored) also skipped
// addresses such as `/faviconXico`, whose pages would then see whatever header the
// browser sent. The pages check too (league-gate.ts, addressMatchesRoute).
// The stylesheets (`/display.css`, `/standalone.css`) are public and kept by browsers and
// shared caches: nothing of a person's session may ever ride on their answers, so a
// request for one never comes through here, where a session is renewed and its cookies set.
export const config = {
  matcher: ['/((?!_next/static/|_next/image|favicon\\.ico$|display\\.css$|standalone\\.css$).*)'],
};
