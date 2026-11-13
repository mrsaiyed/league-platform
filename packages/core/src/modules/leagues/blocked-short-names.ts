// U-7: short names nobody may take: our own words and (to be extended by the
// founder) obviously offensive ones. Data, one word per line; no league is named.
// The two lists are kept apart because they mean different things: our own words
// are also how a request knows it is for one of our pages, not a league
// (apps/web/src/server/context.ts); an offensive word is only refused as a name.

/** Our own pages and areas, and words that could pass for us. */
export const systemShortNames: ReadonlySet<string> = new Set([
  'account',
  'accounts',
  'admin',
  'administrator',
  'api',
  'app',
  'about',
  'billing',
  'blog',
  'careers',
  'checkout',
  'contact',
  'dashboard',
  'demo',
  'docs',
  'download',
  'embed',
  'faq',
  'features',
  'find',
  'help',
  'home',
  'invite',
  'invitations',
  'join',
  'legal',
  'login',
  'logout',
  'new',
  'news',
  'notifications',
  'pricing',
  'privacy',
  'register',
  'root',
  'security',
  'settings',
  'signin',
  'signout',
  'signup',
  'start',
  'static',
  'status',
  'support',
  'terms',
  'tracker',
  'www',
  'srleagues',
  'sr-leagues',
  'platform',
  'staff',
]);

/** Obviously offensive words, refused as a short name. The founder extends this list. */
export const offensiveShortNames: ReadonlySet<string> = new Set<string>([]);

/** Every name nobody may take. */
export const blockedShortNames: ReadonlySet<string> = new Set([
  ...systemShortNames,
  ...offensiveShortNames,
]);
