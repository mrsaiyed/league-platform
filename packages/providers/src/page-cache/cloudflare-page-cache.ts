// Clearing labels at Cloudflare (T5 §4, step 2.26, record 106): purge by cache tag. NOT
// VERIFIED against the live service: written from Cloudflare's published API
// (POST /client/v4/zones/{zone}/purge_cache with `{ "tags": [...] }` and an API token
// allowed "Cache Purge" on that zone) and tested only against made-up answers shaped like
// its own, never over the network. Which Cloudflare plans purge by tag, and how many tags
// one call takes, is checked when the zone is set up (T5 §4); 30 per call is the smallest
// limit Cloudflare has published, so labels go 30 at a time.
//
// Our labels are the tags: the web app sends them in the `Cache-Tag` header of an answer a
// shared cache may keep (cache-headers.ts in apps/web), which Cloudflare reads and strips.
// What a failure keeps is a fixed code (PageCacheClearError), never Cloudflare's own words
// or the token (T-86). The wait is 4 seconds, as for the bot check: the job is tried again.
import { PageCacheClearError, type PageCache } from './page-cache.ts';

export const cloudflareApiOrigin = 'https://api.cloudflare.com';

/** The most tags sent in one call. */
export const cloudflareTagsPerCall = 30;

/** How long to wait for Cloudflare by default. */
export const cloudflareWaitMs = 4_000;

export type CloudflarePageCacheOptions = {
  /** The zone's id (not secret). */
  readonly zoneId: string;
  /** An API token allowed to purge that zone's cache: sent to Cloudflare only. */
  readonly apiToken: string;
  /** Stand-in for tests; the real fetch otherwise. */
  readonly fetch?: typeof fetch;
  readonly apiOrigin?: string;
  readonly timeoutMs?: number;
};

const zoneIdPattern = /^[0-9a-f]{32}$/;

/** Whether `body` is Cloudflare's answer that the purge was taken. */
const saysSuccess = (body: unknown): boolean =>
  typeof body === 'object' && body !== null && (body as { success?: unknown }).success === true;

export function createCloudflarePageCache(options: CloudflarePageCacheOptions): PageCache {
  if (!zoneIdPattern.test(options.zoneId)) {
    throw new Error('A Cloudflare zone id is 32 lower-case hexadecimal characters.');
  }
  if (options.apiToken.trim() === '') throw new Error('A Cloudflare API token is needed.');
  const send = options.fetch ?? fetch;
  const url = `${options.apiOrigin ?? cloudflareApiOrigin}/client/v4/zones/${options.zoneId}/purge_cache`;
  const clearSome = async (tags: readonly string[]) => {
    let answer: Response;
    try {
      answer = await send(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(options.timeoutMs ?? cloudflareWaitMs),
      });
    } catch {
      throw new PageCacheClearError('unavailable');
    }
    if (answer.status === 401 || answer.status === 403) {
      throw new PageCacheClearError('not-authorized');
    }
    if (answer.status === 429) throw new PageCacheClearError('rate-limited');
    if (answer.status >= 500) throw new PageCacheClearError('unavailable');
    let body: unknown;
    try {
      body = await answer.json();
    } catch {
      throw new PageCacheClearError('unexpected-answer');
    }
    if (!answer.ok || !saysSuccess(body)) throw new PageCacheClearError('unexpected-answer');
  };
  return {
    kind: 'cloudflare',
    clear: async (labels) => {
      const tags = [...new Set(labels)];
      for (let start = 0; start < tags.length; start += cloudflareTagsPerCall) {
        await clearSome(tags.slice(start, start + cloudflareTagsPerCall));
      }
    },
  };
}
