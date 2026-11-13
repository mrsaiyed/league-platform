import { describe, expect, it } from 'vitest';
import {
  adminAreas,
  forwardedLeagueUrl,
  isLeagueIdFormat,
  isLeagueSiteName,
  leagueApiUrl,
  leaguePages,
  leagueSiteNames,
  leagueUrl,
} from './league-url.ts';

const north = { slug: 'north-league' };

describe('leagueUrl (T-34)', () => {
  it('builds every public page of a league at /{league} (P2 §4)', () => {
    expect(leagueUrl(north, 'home')).toBe('/north-league');
    expect(leagueUrl(north, 'schedule')).toBe('/north-league/schedule');
    expect(leagueUrl(north, 'standings')).toBe('/north-league/standings');
    expect(leagueUrl(north, 'stats')).toBe('/north-league/stats');
    expect(leagueUrl(north, 'teams')).toBe('/north-league/teams');
    expect(leagueUrl(north, 'team', { team: 'lions' })).toBe('/north-league/teams/lions');
    expect(leagueUrl(north, 'player', { player: 'p-7' })).toBe('/north-league/players/p-7');
    expect(leagueUrl(north, 'game', { game: 'g1' })).toBe('/north-league/games/g1');
    expect(leagueUrl(north, 'register')).toBe('/north-league/register');
    expect(leagueUrl(north, 'my')).toBe('/north-league/my');
    expect(leagueUrl(north, 'news')).toBe('/north-league/news');
    expect(leagueUrl(north, 'news-post', { post: 'opening-day' })).toBe(
      '/north-league/news/opening-day',
    );
    for (const page of ['awards', 'draft', 'media', 'sponsors'] as const) {
      expect(leagueUrl(north, page)).toBe(`/north-league/${page}`);
    }
    expect(leagueUrl(north, 'club', { club: 'east-high' })).toBe('/north-league/clubs/east-high');
    expect(leagueUrl(north, 'page', { page: 'about' })).toBe('/north-league/about');
  });

  it('builds the admin, its areas and the tracker', () => {
    expect(leagueUrl(north, 'admin')).toBe('/north-league/admin');
    for (const area of adminAreas) {
      expect(leagueUrl(north, 'admin-area', { area })).toBe(`/north-league/admin/${area}`);
    }
    expect(leagueUrl(north, 'score', { game: 'g1' })).toBe('/north-league/score/g1');
  });

  it('builds pages inside an admin area, each part encoded and checked', () => {
    expect(leagueUrl(north, 'admin-area', { area: 'teams', subpath: ['lions', 'roster'] })).toBe(
      '/north-league/admin/teams/lions/roster',
    );
    expect(leagueUrl(north, 'admin-area', { area: 'people', subpath: [] })).toBe(
      '/north-league/admin/people',
    );
    expect(leagueUrl(north, 'admin-area', { area: 'site', subpath: ['a/b?c'] })).toBe(
      '/north-league/admin/site/a%2Fb%3Fc',
    );
    for (const part of ['', '.', '..']) {
      expect(() => leagueUrl(north, 'admin-area', { area: 'teams', subpath: [part] })).toThrow(
        TypeError,
      );
    }
    const notList = 'lions' as unknown as readonly string[];
    expect(() => leagueUrl(north, 'admin-area', { area: 'teams', subpath: notList })).toThrow(
      TypeError,
    );
    // @ts-expect-error: only an admin area takes a subpath.
    leagueUrl(north, 'admin', { subpath: ['x'] });
  });

  it('puts sports pages under the program, and leaves league-wide pages at the top', () => {
    const program = 'varsity-boys';
    expect(leagueUrl(north, 'schedule', { program })).toBe('/north-league/varsity-boys/schedule');
    expect(leagueUrl(north, 'team', { program, team: 'lions' })).toBe(
      '/north-league/varsity-boys/teams/lions',
    );
    expect(leagueUrl(north, 'game', { program, game: 'g1' })).toBe(
      '/north-league/varsity-boys/games/g1',
    );
    expect(leagueUrl(north, 'schedule', { program: undefined })).toBe('/north-league/schedule');
  });

  it('adds a past season as ?season=, but never to the admin or the tracker', () => {
    expect(leagueUrl(north, 'standings', { season: 'fall-2025' })).toBe(
      '/north-league/standings?season=fall-2025',
    );
    expect(leagueUrl(north, 'home', { season: 'fall-2025' })).toBe(
      '/north-league?season=fall-2025',
    );
    expect(
      leagueUrl(north, 'schedule', { program: 'youth', season: 'spring 2026', origin: undefined }),
    ).toBe('/north-league/youth/schedule?season=spring+2026');
  });

  it('builds a full address for emails and feeds when given our origin', () => {
    expect(leagueUrl(north, 'schedule', { origin: 'https://site.example.test' })).toBe(
      'https://site.example.test/north-league/schedule',
    );
    expect(leagueUrl(north, 'home', { origin: 'http://localhost:3000/' })).toBe(
      'http://localhost:3000/north-league',
    );
    for (const origin of [
      'site.example.test',
      'https://site.example.test/base',
      'https://site.example.test/?x=1',
      'ftp://site.example.test',
      'https://user@site.example.test',
    ]) {
      expect(() => leagueUrl(north, 'home', { origin })).toThrow(TypeError);
    }
  });

  it('encodes values, so a value cannot add a segment or a query', () => {
    expect(leagueUrl(north, 'team', { team: 'a/b?c#d' })).toBe('/north-league/teams/a%2Fb%3Fc%23d');
    expect(leagueUrl(north, 'game', { game: 'élan' })).toBe('/north-league/games/%C3%A9lan');
    expect(leagueUrl(north, 'news', { season: 'a&b=c' })).toBe(
      '/north-league/news?season=a%26b%3Dc',
    );
  });

  it('refuses values that cannot be part of an address', () => {
    for (const team of ['', '.', '..']) {
      expect(() => leagueUrl(north, 'team', { team })).toThrow(TypeError);
    }
    expect(() => leagueUrl(north, 'schedule', { season: '' })).toThrow(TypeError);
    for (const slug of ['', 'ab', 'North-League', 'north league', '../x', 'x'.repeat(41)]) {
      expect(() => leagueUrl({ slug }, 'home')).toThrow(TypeError);
    }
  });

  it('refuses a custom page or program named like a page of the site (P2 §5)', () => {
    expect(() => leagueUrl(north, 'page', { page: 'schedule' })).toThrow(TypeError);
    expect(() => leagueUrl(north, 'page', { page: 'Admin' })).toThrow(TypeError);
    expect(() => leagueUrl(north, 'stats', { program: 'teams' })).toThrow(TypeError);
  });

  it('refuses an admin area it does not know, even past the types', () => {
    const area = 'billing' as (typeof adminAreas)[number];
    expect(() => leagueUrl(north, 'admin-area', { area })).toThrow(TypeError);
  });

  it('checks page names and their values at compile time', () => {
    // @ts-expect-error: a team page needs the team.
    expect(() => leagueUrl(north, 'team')).toThrow(TypeError);
    // @ts-expect-error: there is no such page.
    expect(() => leagueUrl(north, 'nowhere')).toThrow();
    // @ts-expect-error: the admin takes no season.
    leagueUrl(north, 'admin', { season: 'fall-2025' });
    // @ts-expect-error: a league-wide page is never under a program.
    leagueUrl(north, 'news', { program: 'youth' });
    // @ts-expect-error: only the areas of the admin.
    expect(() => leagueUrl(north, 'admin-area', { area: 'billing' })).toThrow(TypeError);
  });
});

describe('the names the site uses under a league', () => {
  it('are the first fixed part of every page address', () => {
    expect([...leagueSiteNames].sort()).toEqual(
      [
        'admin',
        'awards',
        'clubs',
        'draft',
        'games',
        'media',
        'my',
        'news',
        'players',
        'register',
        'schedule',
        'score',
        'sponsors',
        'standings',
        'stats',
        'teams',
      ].sort(),
    );
    expect(isLeagueSiteName('Schedule')).toBe(true);
    expect(isLeagueSiteName('about')).toBe(false);
  });

  it('cover every page in the table', () => {
    for (const spec of Object.values(leaguePages)) {
      const first = spec.path[0];
      if (first !== undefined && !first.startsWith(':'))
        expect(leagueSiteNames.has(first)).toBe(true);
    }
  });
});

describe('forwardedLeagueUrl (U-7)', () => {
  it('keeps what followed the old short name exactly', () => {
    expect(forwardedLeagueUrl(north, '')).toBe('/north-league');
    expect(forwardedLeagueUrl(north, '/teams/a%2Fb?season=fall-2025')).toBe(
      '/north-league/teams/a%2Fb?season=fall-2025',
    );
    expect(forwardedLeagueUrl(north, '?season=x')).toBe('/north-league?season=x');
    expect(forwardedLeagueUrl(north, '/admin', 'https://site.example.test')).toBe(
      'https://site.example.test/north-league/admin',
    );
  });

  it('cannot be turned into an address on another site', () => {
    expect(() => forwardedLeagueUrl(north, 'evil.example')).toThrow(TypeError);
    expect(forwardedLeagueUrl(north, '//evil.example')).toBe('/north-league//evil.example');
  });
});

describe('leagueApiUrl (record 017, T-229)', () => {
  const league = { id: '01900000-0000-7000-8000-00000000000a' };

  it('names the league by its id under /api/v1/leagues, each part encoded', () => {
    expect(leagueApiUrl(league, ['games', 'g1', 'commands'])).toBe(
      '/api/v1/leagues/01900000-0000-7000-8000-00000000000a/games/g1/commands',
    );
    expect(leagueApiUrl(league, [])).toBe('/api/v1/leagues/01900000-0000-7000-8000-00000000000a');
    expect(leagueApiUrl(league, ['a/b'])).toMatch(/\/a%2Fb$/);
  });

  it('refuses an id that is not a lower-case UUID, and parts that cannot be in an address', () => {
    for (const id of ['', 'north-league', league.id.toUpperCase(), `${league.id}/x`]) {
      expect(() => leagueApiUrl({ id }, [])).toThrow(TypeError);
      expect(isLeagueIdFormat(id)).toBe(false);
    }
    expect(isLeagueIdFormat(league.id)).toBe(true);
    expect(() => leagueApiUrl(league, ['..'])).toThrow(TypeError);
  });
});
