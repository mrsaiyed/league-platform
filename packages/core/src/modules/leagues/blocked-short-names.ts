// U-7: short names nobody may take: our own words and obviously offensive ones (a
// starter list the founder reviews, U-16). Data, one word per line; no league is named.
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

/**
 * Obviously offensive words and phrases, refused as a short name and as any word of one
 * (U-16, decided for you on 2026-11-17 for the founder to review: a starter list, which
 * the founder extends or trims). A phrase is its words joined by hyphens, as a short name
 * writes them. Kept to words with no everyday meaning that a league could want, since
 * a word here also refuses every short name it is a word of (`shit-hoops`); a word that
 * is offensive only in some uses (`cock`, `dyke`, `fag`, `spic`) is left to the founder.
 * In alphabetical order.
 */
export const offensiveShortNames: ReadonlySet<string> = new Set<string>([
  'arsehole',
  'asshole',
  'bastard',
  'bitch',
  'bitches',
  'bullshit',
  'chink',
  'cocksucker',
  'cunt',
  'dickhead',
  'faggot',
  'fuck',
  'fucker',
  'fucking',
  'heil',
  'hitler',
  'kike',
  'kkk',
  'motherfucker',
  'nazi',
  'nigga',
  'nigger',
  'paedo',
  'paedophile',
  'pedo',
  'pedophile',
  'porn',
  'porno',
  'pussy',
  'rape',
  'rapist',
  'retard',
  'retarded',
  'shit',
  'shitty',
  'slut',
  'tranny',
  'twat',
  'wank',
  'wanker',
  'wetback',
  'whore',
  'xxx',
]);

/** Every name nobody may take. */
export const blockedShortNames: ReadonlySet<string> = new Set([
  ...systemShortNames,
  ...offensiveShortNames,
]);
