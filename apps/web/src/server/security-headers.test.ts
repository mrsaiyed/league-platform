// The script policy's words and the nonce (T-79, record 081). That every answer carries them
// is scripts/check-web-shell.mjs, over HTTP; that pages run with them and an injected script
// does not is tests/browser/script-policy-test.mjs.
import { describe, expect, it } from 'vitest';
import {
  contentSecurityPolicy,
  fixedContentSecurityPolicy,
  newNonce,
  nonceOf,
  strictTransportSecurity,
} from './security-headers.ts';

describe('contentSecurityPolicy', () => {
  it('runs scripts only from our address or with the nonce, and nothing inline otherwise', () => {
    expect(contentSecurityPolicy({ nonce: 'bm9uY2Utb2YtdGhpcy1hbnN3ZXI=' })).toBe(
      "script-src 'self' 'nonce-bm9uY2Utb2YtdGhpcy1hbnN3ZXI='; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'",
    );
  });

  it('never lets inline code or eval run in a built server', () => {
    for (const policy of [
      fixedContentSecurityPolicy,
      contentSecurityPolicy({ nonce: 'abc' }),
      contentSecurityPolicy({ nonce: 'abc', botCheckOrigin: 'https://challenges.cloudflare.com' }),
    ]) {
      expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|\*|data:|http:/);
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("object-src 'none'");
    }
  });

  it('lets the bot check’s one origin draw its script and its frame, and nothing else', () => {
    const policy = contentSecurityPolicy({
      nonce: 'abc',
      botCheckOrigin: 'https://challenges.cloudflare.com',
    });
    expect(policy).toContain("script-src 'self' 'nonce-abc' https://challenges.cloudflare.com;");
    expect(policy).toContain('frame-src https://challenges.cloudflare.com;');
  });

  it('allows eval only for next dev', () => {
    expect(contentSecurityPolicy({ nonce: 'abc', development: true })).toContain(
      "script-src 'self' 'nonce-abc' 'unsafe-eval';",
    );
  });

  it('keeps nothing inline in the fixed policy for what the proxy does not see', () => {
    expect(fixedContentSecurityPolicy).toBe(
      "script-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'",
    );
  });
});

describe('the nonce', () => {
  it('is 24 characters of base64, new each time', () => {
    const made = new Set(Array.from({ length: 200 }, () => newNonce()));
    expect(made.size).toBe(200);
    for (const nonce of made) expect(nonce).toMatch(/^[A-Za-z0-9+/]{24}$/);
  });

  it('is read back from the request’s policy, and nothing else is taken for one', () => {
    const nonce = newNonce();
    expect(nonceOf(contentSecurityPolicy({ nonce }))).toBe(nonce);
    expect(nonceOf(null)).toBeUndefined();
    expect(nonceOf(fixedContentSecurityPolicy)).toBeUndefined();
    expect(nonceOf("script-src 'nonce-\"><script>'")).toBeUndefined();
  });
});

describe('Strict-Transport-Security', () => {
  it('keeps the browser on HTTPS for a year, subdomains too, without the preload list', () => {
    expect(strictTransportSecurity).toBe('max-age=31536000; includeSubDomains');
  });
});
