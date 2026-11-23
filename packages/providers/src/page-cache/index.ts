// The page cache (T5 §4, step 2.26, record 106): the interface and labels, the local
// stand-in, nothing to clear, and Cloudflare's purge by tag. Used only through the
// package's index.ts.
export type * from './page-cache.ts';
export {
  gamePageLabel,
  labelsForGameResult,
  leagueLabel,
  PageCacheClearError,
  seasonPageKinds,
  seasonPageLabel,
} from './page-cache.ts';
export {
  createLocalPageCache,
  createPageCacheOff,
  type LocalPageCache,
} from './local-page-cache.ts';
export {
  cloudflareTagsPerCall,
  createCloudflarePageCache,
  type CloudflarePageCacheOptions,
} from './cloudflare-page-cache.ts';
