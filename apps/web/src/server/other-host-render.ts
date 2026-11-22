// A page of our site asked for under a host that is not our site's (step 2.239, T-298).
//
// When a form's action ends in redirect() to one of our own addresses, Next.js does not
// leave the browser to fetch the new page: the server fetches that page from itself, at
// its own listening address (`next start`'s origin: http://localhost:<port>, or the
// --hostname given), forwarding the browser's headers, and sends the page back with the
// action's answer. Node's fetch writes the Host of the address it calls and drops the one
// forwarded, so that fetch arrives with the server's own Host; the browser's Host rides
// along only as X-Forwarded-Host, which Next.js wrote on the action's request. Wherever
// the site's address (PUBLIC_BASE_URL) is not that origin, which is every hosted copy and
// the test copy as its test starts it, the gate (context.ts) rightly finds no league under
// that Host, and the browser was shown "Page not found" after a save that had worked; a
// reload showed the page.
//
// The gate is not widened. The proxy answers such a request itself, plainly and with no
// page in it (proxy.ts), and Next.js, given no page data, lets the browser go to the new
// address on its own, under the site's host, where the page is drawn as for any visit.
// What marks it: a Host that is not ours, and an X-Forwarded-Host that is. (The proxy
// cannot see Next.js's own page-data header, which Next.js removes before the proxy runs.)
// Anyone may send those two headers; all they get is an empty "not found", which is what
// the gate would have answered them under that Host anyway.
import { isOurHost } from './context.ts';

export function isPageAskedUnderOtherHost(headers: Headers, siteOrigin: string): boolean {
  const forwardedHost = headers.get('x-forwarded-host')?.split(',')[0]?.trim() ?? '';
  return isOurHost(forwardedHost, siteOrigin) && !isOurHost(headers.get('host') ?? '', siteOrigin);
}
