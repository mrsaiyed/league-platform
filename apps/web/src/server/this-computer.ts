// Which requests were made on this computer (step 2.152, review 2 M1; step 2.96). The
// made-up world answers only these, and so do ports that carry the local tools (the kept
// emails' page and "be this made-up person"), whichever data they run on: the stand-in's
// (stand-in-ports.ts) and the made-up database's (database-ports.ts). The local tools ask
// it again themselves (local-tools.ts), so they refuse even where ports forget.
// What keeps other computers out is that made-up data listens on the loopback address only
// (scripts/web-listen.mjs); this check keeps out what can still arrive on this computer.

/** A Host header that is only a name or an address, and a port: nothing a URL reads otherwise. */
const plainHost =
  /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:]+\]|\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?$/i;

/**
 * The loopback address as the server's own socket gives it. Next.js writes it into
 * X-Forwarded-For when a request carries none, so it alone says nothing was passed on.
 */
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** A URL's host name in small letters, or '' when it is not a URL. */
function hostnameOf(address: string): string {
  try {
    return new URL(address).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** This computer's own names: they reach only the loopback address. */
function isThisComputer(host: string): boolean {
  return (
    host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')
  );
}

/** Whether `address` is on this computer, or on a name kept for tests (`.test`). */
export function isLocalOrTestHost(address: string): boolean {
  const host = hostnameOf(address);
  return isThisComputer(host) || host.endsWith('.test');
}

/**
 * Which requests are answered on made-up data (step 2.152, review 2 M1). Only one
 * addressed by its Host header to this computer's own names, or to the one `.test` name
 * PUBLIC_BASE_URL gives (review 2 L1), and carrying no sign of having been passed on by
 * another server: no Forwarded or Via header, no X-Forwarded-Host other than its own Host,
 * no X-Forwarded-For other than the loopback address Next.js itself writes. A program on
 * this computer that passes requests on and removes those headers is not told apart: the
 * loopback address is what keeps other computers out.
 */
export function answersOnlyHere(publicBaseUrl: string): (headers: Headers) => boolean {
  const ownTestName = hostnameOf(publicBaseUrl);
  return (headers) => {
    const host = headers.get('host') ?? '';
    if (!plainHost.test(host)) return false;
    const name = hostnameOf(`http://${host}`);
    if (!isThisComputer(name) && !(name.endsWith('.test') && name === ownTestName)) return false;
    if (headers.has('forwarded') || headers.has('via')) return false;
    const forwardedHost = headers.get('x-forwarded-host');
    if (forwardedHost !== null && forwardedHost !== host) return false;
    const forwardedFor = headers.get('x-forwarded-for');
    return forwardedFor === null || loopbackAddresses.has(forwardedFor.trim());
  };
}
