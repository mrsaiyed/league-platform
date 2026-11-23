import { describe, expect, it } from 'vitest';
import { isPageAskedUnderOtherHost } from './other-host-render.ts';

const site = 'https://staging.example.test';
const asked = (headers: Record<string, string>) =>
  isPageAskedUnderOtherHost(new Headers(headers), site);

describe('isPageAskedUnderOtherHost', () => {
  it('is the page the server fetches from itself after a form, under its own host', () => {
    // What Next.js sends after an action's redirect(): the browser's headers, X-Forwarded-Host
    // among them, and the Host of the server's own listening address.
    expect(asked({ host: 'localhost:3000', 'x-forwarded-host': 'staging.example.test' })).toBe(
      true,
    );
    expect(
      asked({ host: '127.0.0.1:8080', 'x-forwarded-host': 'staging.example.test, proxy.test' }),
    ).toBe(true);
    expect(
      isPageAskedUnderOtherHost(
        new Headers({ host: '127.0.0.1:4123', 'x-forwarded-host': 'localhost:4123' }),
        'http://localhost:4123',
      ),
    ).toBe(true);
  });

  it('is not a request under our own host, forwarded or not', () => {
    expect(asked({ host: 'staging.example.test' })).toBe(false);
    expect(
      asked({ host: 'staging.example.test:443', 'x-forwarded-host': 'staging.example.test' }),
    ).toBe(false);
    expect(
      isPageAskedUnderOtherHost(
        new Headers({ host: 'localhost:4123', 'x-forwarded-host': 'localhost:4123' }),
        'http://localhost:4123',
      ),
    ).toBe(false);
  });

  it('is not a request under another host that does not say it is for our site: the gate answers those', () => {
    expect(asked({ host: 'localhost:3000' })).toBe(false);
    expect(asked({ host: 'localhost:3000', 'x-forwarded-host': 'elsewhere.example.test' })).toBe(
      false,
    );
    expect(asked({ host: 'localhost:3000', 'x-forwarded-host': '' })).toBe(false);
  });
});
