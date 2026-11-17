// What every answer tells the browser about scripts, frames and HTTPS (T-79, T4 §5,
// record 081). One place for the words of both headers: next.config.ts sends the fixed
// ones with every answer, the static files included, and the proxy (src/proxy.ts) puts
// the policy with this request's own nonce on everything it handles, which is every
// page, every API answer, the live feed, every refusal and every error page.
//
// The script policy: a script runs only when it comes from our own address or carries
// the nonce made for this one answer, which only our server knows and writes into the
// scripts it draws itself (Next.js reads it from the request's own policy header and
// puts it on every script it writes). So a script that reached a page any other way (a
// name, a post, an address typed into a field that a page drew without escaping) does
// not run: it has no nonce, and inline code and `javascript:` addresses are refused.
// Nothing else is restricted here: styles, pictures, fonts and what a page may fetch are
// left to later steps, since our own pages draw styles inline (the design's variables).
//
// Frames: no other site may put our pages in a frame (frame-ancestors), and our pages show
// a frame only from the bot check's own origin (Cloudflare Turnstile, in staging and
// production). The embeds of C-9 (YouTube, maps and the rest) are added with the step that
// builds them, each origin by name.

/** How long a browser keeps to HTTPS for our address, and its subdomains: one year. */
export const strictTransportSecurity = 'max-age=31536000; includeSubDomains';

export type PolicyOptions = {
  /** This answer's nonce (newNonce); left out, no inline script runs at all. */
  readonly nonce?: string | undefined;
  /** Where the bot check's script and frame come from, if anywhere but our own address. */
  readonly botCheckOrigin?: string | undefined;
  /**
   * `next dev` only: React rebuilds the server's error stacks with `eval` there. Never in a
   * built server (`next start`), whatever else is set.
   */
  readonly development?: boolean;
};

/** The Content-Security-Policy header's value. */
export function contentSecurityPolicy(options: PolicyOptions = {}): string {
  const scripts = ["'self'"];
  if (options.nonce !== undefined) scripts.push(`'nonce-${options.nonce}'`);
  if (options.botCheckOrigin !== undefined) scripts.push(options.botCheckOrigin);
  if (options.development === true) scripts.push("'unsafe-eval'");
  const frames = options.botCheckOrigin === undefined ? ["'none'"] : [options.botCheckOrigin];
  return [
    `script-src ${scripts.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    `frame-src ${frames.join(' ')}`,
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * The policy sent with what the proxy does not see (the static files, Next.js's own early
 * answers): no nonce, so nothing inline runs. Those answers draw no page.
 */
export const fixedContentSecurityPolicy = contentSecurityPolicy();

/** A new nonce: 18 random bytes, base64 (CSP's own alphabet), made for one answer. */
export function newNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * This request's nonce, read from the policy the proxy wrote into the request (never one
 * the browser sent: the proxy replaces that header on every request it handles), for a
 * script a page draws itself (the bot check's). Undefined when there is none.
 */
export function nonceOf(requestPolicy: string | null): string | undefined {
  return /'nonce-([A-Za-z0-9+/]+={0,2})'/.exec(requestPolicy ?? '')?.[1];
}
