// Cloudflare's purge by tag, against made-up answers shaped like its own (never over the
// network): not verified against the live service.
import { describe, expect, it } from 'vitest';
import { createCloudflarePageCache } from './cloudflare-page-cache.ts';

const zoneId = '0123456789abcdef0123456789abcdef';
const apiToken = 'made-up-cloudflare-token';

type Sent = { url: string; init: RequestInit };

/** A fetch that answers each call with the next made-up answer and keeps what was sent. */
function madeUpCloudflare(...answers: (Response | Error)[]) {
  const sent: Sent[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init: init ?? {} });
    const next = answers.shift() ?? answers.at(-1) ?? new Error('no answer');
    if (next instanceof Error) throw next;
    return next;
  };
  return { sent, fetch: fetch as typeof globalThis.fetch };
}

/** Cloudflare's published shape of a purge it took. */
const taken = () =>
  Response.json({ success: true, errors: [], messages: [], result: { id: zoneId } });

const refused = (status: number, code: number) =>
  Response.json(
    { success: false, errors: [{ code, message: 'Made-up refusal' }], messages: [], result: null },
    { status },
  );

describe('Cloudflare page cache (not verified)', () => {
  it('purges the labels as tags of the zone, with the token, and nothing else', async () => {
    const cloudflare = madeUpCloudflare(taken());
    const cache = createCloudflarePageCache({ zoneId, apiToken, fetch: cloudflare.fetch });
    await cache.clear(['league:a:game:1', 'league:a:season:2:stats', 'league:a:game:1']);
    expect(cloudflare.sent).toHaveLength(1);
    const [{ url, init }] = cloudflare.sent as [Sent];
    expect(url).toBe(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${apiToken}`);
    expect(JSON.parse(String(init.body))).toEqual({
      tags: ['league:a:game:1', 'league:a:season:2:stats'],
    });
  });

  it('sends at most 30 tags a call', async () => {
    const cloudflare = madeUpCloudflare(taken(), taken(), taken());
    const cache = createCloudflarePageCache({ zoneId, apiToken, fetch: cloudflare.fetch });
    await cache.clear(Array.from({ length: 61 }, (_, n) => `league:a:game:${n}`));
    expect(
      cloudflare.sent.map((s) => (JSON.parse(String(s.init.body)) as { tags: [] }).tags.length),
    ).toEqual([30, 30, 1]);
  });

  it('turns each failure into a fixed code, never Cloudflare’s words or the token', async () => {
    const cases: [Response | Error, string, boolean][] = [
      [refused(403, 10000), 'not-authorized', false],
      [refused(401, 10000), 'not-authorized', false],
      [refused(429, 971), 'rate-limited', true],
      [refused(503, 1000), 'unavailable', true],
      [new TypeError('fetch failed'), 'unavailable', true],
      [refused(400, 1012), 'unexpected-answer', true],
      [Response.json({ success: false, errors: [] }), 'unexpected-answer', true],
      [new Response('<html>not json</html>'), 'unexpected-answer', true],
    ];
    for (const [answer, code, retryable] of cases) {
      const cloudflare = madeUpCloudflare(answer);
      const cache = createCloudflarePageCache({ zoneId, apiToken, fetch: cloudflare.fetch });
      const error: unknown = await cache.clear(['league:a:game:1']).then(
        () => null,
        (thrown: unknown) => thrown,
      );
      expect(error).toMatchObject({ code, retryable });
      expect(String((error as Error).message)).not.toMatch(/Made-up refusal|made-up-cloudflare/);
    }
  });

  it('refuses a zone id or token that cannot be right', () => {
    expect(() => createCloudflarePageCache({ zoneId: 'zone', apiToken })).toThrow();
    expect(() => createCloudflarePageCache({ zoneId, apiToken: ' ' })).toThrow();
  });
});
