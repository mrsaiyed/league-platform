// T-34: every league address is built here and nowhere else. Pages, emails, the
// worker and redirects call leagueUrl(league, 'schedule'); none writes `/{league}/...`
// by hand (a structure check fails the build if one does). The other half of T-34,
// working out the league a request is for, is apps/web/src/server/context.ts.
//
// Today a league lives at `oursite.com/{league}` (U-1). Moving to
// `{league}.oursite.com` (U-13) or a league's own domain (U-2) changes this file and
// context.ts, and no caller: callers say which league and which page, never how the
// address is spelled. (In those forms an address to another league's host has to be
// absolute; this file will then return one, so links stay right without callers changing.)
//
// The pages and their addresses are P2 §4 and the folders of T2 §4. In a league with
// several programs, the sports pages move one level down, under the program's short
// name; league-wide pages stay at the top (P2 §4). A past season is the same address
// with `?season=` (P2 §4).
//
// The JSON endpoints (T-26) are not pages: the tracker's queue may hold a command
// across a change of short name, so they name the league by its id, under
// `/api/v1/leagues/{leagueId}/...` (record 017, T-229). leagueApiUrl builds those.
import { isShortNameFormat } from '../short-names.ts';

/** What the builder needs to know about a league: its current short name. */
export type LeagueAddressee = { readonly slug: string };

/**
 * Where a page sits. `program`: a sports page, under the program in a league with
 * several programs. `league`: a league-wide page of the public site. `private`: the
 * admin and the tracker, which take no season.
 */
type PageLevel = 'program' | 'league' | 'private';

type PageSpec = {
  /** Path below the league. `:name` is filled from the options. */
  readonly path: readonly string[];
  readonly level: PageLevel;
};

/**
 * Every page of a league, by name. Awards, draft, media and sponsors are league-wide
 * here: P2 §4 names only the sports pages that move under a program (schedule,
 * standings, teams, players, stats, games) and the league-wide ones (home, news,
 * register, clubs, custom pages); the rest is not said yet.
 */
export const leaguePages = {
  home: { path: [], level: 'league' },
  schedule: { path: ['schedule'], level: 'program' },
  standings: { path: ['standings'], level: 'program' },
  stats: { path: ['stats'], level: 'program' },
  teams: { path: ['teams'], level: 'program' },
  team: { path: ['teams', ':team'], level: 'program' },
  player: { path: ['players', ':player'], level: 'program' },
  game: { path: ['games', ':game'], level: 'program' },
  register: { path: ['register'], level: 'league' },
  my: { path: ['my'], level: 'league' },
  news: { path: ['news'], level: 'league' },
  'news-post': { path: ['news', ':post'], level: 'league' },
  awards: { path: ['awards'], level: 'league' },
  draft: { path: ['draft'], level: 'league' },
  media: { path: ['media'], level: 'league' },
  sponsors: { path: ['sponsors'], level: 'league' },
  club: { path: ['clubs', ':club'], level: 'league' },
  /** A page the admin made (About, Rules): `/{league}/{page}`. */
  page: { path: [':page'], level: 'league' },
  admin: { path: ['admin'], level: 'private' },
  /** An area of the admin, and optionally a page inside it (`subpath`). */
  'admin-area': { path: ['admin', ':area'], level: 'private' },
  /** The courtside tracker for one game. */
  score: { path: ['score', ':game'], level: 'private' },
  /**
   * Accepting an invitation (P4 §4, T-226): the link in the invitation's email, built
   * only by the worker as it sends. `token` is the link's secret, in the path (record
   * 023): the page that opens it must answer with `Referrer-Policy: no-referrer` and
   * `Cache-Control: no-store`, and the path is left out of our request logs and
   * analytics (steps 1.14 and 1.17).
   */
  invitation: { path: ['invitation', ':token'], level: 'private' },
} as const satisfies Record<string, PageSpec>;

export type LeaguePage = keyof typeof leaguePages;

/** The areas of the admin (T2 §4, P4). */
export const adminAreas = [
  'registration',
  'people',
  'teams',
  'schedule',
  'games',
  'standings',
  'site',
  'messages',
  'season',
  'settings',
] as const;
export type AdminArea = (typeof adminAreas)[number];

type Spec<P extends LeaguePage> = (typeof leaguePages)[P];
type ParamName<P extends LeaguePage> = Spec<P>['path'][number] extends infer S
  ? S extends `:${infer N}`
    ? N
    : never
  : never;
type Params<P extends LeaguePage> = P extends 'admin-area'
  ? {
      readonly area: AdminArea;
      /** Pages inside the area, one value per segment: `['teams', 'lions']`. */
      readonly subpath?: readonly string[] | undefined;
    }
  : { readonly [N in ParamName<P>]: string };

type Common = {
  /**
   * Our site's origin, such as `https://oursite.com`, for an address that leaves the
   * site (an email, a calendar feed). Without it the address starts at `/`.
   */
  readonly origin?: string | undefined;
};
type SeasonOption = {
  /** A past season's short name; without it the page shows the current season. */
  readonly season?: string | undefined;
};
type ProgramOption = {
  /**
   * The program's short name, given only in a league with several programs. The
   * hidden program of a one-program league is never in an address (U-3).
   */
  readonly program?: string | undefined;
};
type LevelOptions<L extends PageLevel> = L extends 'program'
  ? ProgramOption & SeasonOption
  : L extends 'league'
    ? SeasonOption
    : unknown;

/** What a page's address takes: its own values, and the options of its level. */
export type LeagueUrlOptions<P extends LeaguePage> = Params<P> &
  LevelOptions<Spec<P>['level']> &
  Common;

/** Options are required exactly when the page has a value of its own to fill in. */
type OptionsArg<P extends LeaguePage> = [ParamName<P>] extends [never]
  ? [options?: LeagueUrlOptions<P>]
  : [options: LeagueUrlOptions<P>];

/**
 * Names the site itself uses directly under a league (`schedule`, `admin`...). A
 * custom page or a program cannot take one (P2 §5); the site module refuses it when
 * the admin types it, and the builder refuses to build such an address.
 */
export const leagueSiteNames: ReadonlySet<string> = new Set(
  Object.values(leaguePages).flatMap((spec: PageSpec) => {
    const first = spec.path[0];
    return first === undefined || first.startsWith(':') ? [] : [first];
  }),
);

export function isLeagueSiteName(name: string): boolean {
  return leagueSiteNames.has(name.toLowerCase());
}

/**
 * The address of one page of a league: a path from `/`, or a full address when
 * `origin` is given. Throws on a value that cannot be part of an address (an empty
 * one, `.` or `..`, a short name of the wrong form, a custom page or program named
 * like a page of the site): those are mistakes in the calling code, not the person's.
 */
export function leagueUrl<P extends LeaguePage>(
  league: LeagueAddressee,
  page: P,
  ...[options]: OptionsArg<P>
): string {
  const spec: PageSpec = leaguePages[page];
  const values: Readonly<Record<string, unknown>> = options ?? {};
  const given = (name: string): string | undefined => {
    const value = values[name];
    if (value === undefined || typeof value === 'string') return value;
    throw new TypeError(`leagueUrl: "${name}" must be text.`);
  };
  const segments: string[] = [];

  const program = spec.level === 'program' ? given('program') : undefined;
  if (program !== undefined) {
    if (isLeagueSiteName(program)) {
      throw new TypeError(`leagueUrl: "${program}" is a page of the site, not a program.`);
    }
    segments.push(segment('program', program));
  }

  for (const part of spec.path) {
    if (!part.startsWith(':')) {
      segments.push(part);
      continue;
    }
    const name = part.slice(1);
    const value = given(name);
    if (value === undefined) throw new TypeError(`leagueUrl: "${page}" needs "${name}".`);
    if (page === 'page' && isLeagueSiteName(value)) {
      throw new TypeError(`leagueUrl: "${value}" is a page of the site, not a custom page.`);
    }
    if (page === 'admin-area' && !(adminAreas as readonly string[]).includes(value)) {
      throw new TypeError(`leagueUrl: "${value}" is not an area of the admin.`);
    }
    segments.push(segment(name, value));
  }

  const subpath = page === 'admin-area' ? values['subpath'] : undefined;
  if (subpath !== undefined) {
    if (!Array.isArray(subpath)) throw new TypeError('leagueUrl: "subpath" must be a list.');
    for (const part of subpath as readonly unknown[]) {
      if (typeof part !== 'string') throw new TypeError('leagueUrl: "subpath" holds only text.');
      segments.push(segment('subpath', part));
    }
  }

  const season = spec.level === 'private' ? undefined : given('season');
  const query =
    season === undefined ? '' : `?${new URLSearchParams({ season: checked('season', season) })}`;
  const below = segments.length === 0 ? '' : `/${segments.join('/')}`;
  return leagueRoot(league, given('origin')) + below + query;
}

/** A league's id as it goes into an endpoint's address: a UUID in lower case. */
const leagueIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Whether `value`, exactly as it is, is a league id as endpoint addresses spell it. */
export function isLeagueIdFormat(value: string): boolean {
  return leagueIdPattern.test(value);
}

/** The fixed start of every league's endpoints, before the league's id. */
export const leagueApiBase = ['api', 'v1', 'leagues'] as const;

/**
 * The address of one of a league's JSON endpoints (T-26, record 017):
 * `/api/v1/leagues/{leagueId}/{...path}`, each part encoded. Throws on an id or part
 * that cannot be in an address, as leagueUrl does.
 */
export function leagueApiUrl(league: { readonly id: string }, path: readonly string[]): string {
  if (!isLeagueIdFormat(league.id)) {
    throw new TypeError('leagueApiUrl: the league id must be a UUID in lower case.');
  }
  const below = path.map((part) => `/${segment('path', part)}`).join('');
  return `/${leagueApiBase.join('/')}/${league.id}${below}`;
}

/**
 * The same request under a league's current short name, for forwarding an address
 * that used a former one or other capitals (U-7). `below` is what followed the short
 * name, exactly as it arrived: empty, or starting with `/` or `?`. Only
 * apps/web/src/server/context.ts needs this; pages use leagueUrl.
 */
export function forwardedLeagueUrl(
  league: LeagueAddressee,
  below: string,
  origin?: string,
): string {
  if (below !== '' && !below.startsWith('/') && !below.startsWith('?')) {
    throw new TypeError('forwardedLeagueUrl: what follows the short name must start with / or ?.');
  }
  return leagueRoot(league, origin) + below;
}

/** `/{league}`, or `{origin}/{league}`: the one place the league goes into an address. */
function leagueRoot(league: LeagueAddressee, origin: string | undefined): string {
  if (!isShortNameFormat(league.slug)) {
    throw new TypeError('leagueUrl: the league has no short name of the right form.');
  }
  return `${origin === undefined ? '' : checkedSiteOrigin(origin)}/${league.slug}`;
}

/**
 * Our site's origin as addresses use it: `https://site` or `http://site`, nothing
 * after the host. Throws on anything else, as leagueUrl does with `origin`; a
 * setting can be checked with this once, at startup, before it is used.
 */
export function checkedSiteOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new TypeError('leagueUrl: origin is not an address.');
  }
  const bare =
    url.pathname === '/' && url.search === '' && url.hash === '' && !url.username && !url.password;
  if (!bare || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new TypeError('leagueUrl: origin must be only a scheme and host, like https://site.');
  }
  return url.origin;
}

function checked(name: string, value: string): string {
  if (value === '' || value === '.' || value === '..') {
    throw new TypeError(`leagueUrl: "${name}" cannot be "${value}".`);
  }
  return value;
}

function segment(name: string, value: string): string {
  return encodeURIComponent(checked(name, value));
}
