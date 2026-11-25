import { signedInApiPath } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { createFetchSignedIn } from './fetch-signed-in.ts';

const answering =
  (status: number, body: unknown): typeof globalThis.fetch =>
  async (url) => {
    expect(url).toBe(signedInApiPath);
    return new Response(JSON.stringify(body), { status });
  };

describe('createFetchSignedIn (T-456)', () => {
  const signal = new AbortController().signal;

  it("reads the server's answer", async () => {
    expect(await createFetchSignedIn(answering(200, { signedIn: true }))(signal)).toBe(true);
    expect(await createFetchSignedIn(answering(200, { signedIn: false }))(signal)).toBe(false);
  });

  it('is no answer for another status, another body or no network', async () => {
    expect(await createFetchSignedIn(answering(500, { signedIn: true }))(signal)).toBeNull();
    expect(await createFetchSignedIn(answering(200, { yes: 1 }))(signal)).toBeNull();
    const offline: typeof globalThis.fetch = async () => {
      throw new TypeError('offline');
    };
    expect(await createFetchSignedIn(offline)(signal)).toBeNull();
  });
});
