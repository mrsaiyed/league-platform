// The shell's done test, without a server: an admin address without access is
// "you do not have access" (U-6); unpublished leagues are seen only by the people
// who run them (U-9). Runs on the made-up stand-in, through the real request
// context and the access module's own query.
import { describe, expect, it } from 'vitest';
import {
  addressMatchesRoute,
  leagueOutcome,
  leaguePageOutcome,
  resolveLeagueRequest,
  type LeagueOutcome,
  type LeagueWant,
} from './league-gate.ts';
import { standInPeople, standInPorts } from './stand-in-ports.ts';

const signInOptions = { nodeEnv: 'test', emailFrom: 'hello@example.test' };

const ports = standInPorts({
  appEnv: 'test',
  publicBaseUrl: 'http://localhost:3000',
  log: () => {},
  ...signInOptions,
});
const deps = { ...ports, siteOrigin: 'http://localhost:3000' };

type Who = keyof typeof standInPeople | 'visitor';

async function ask(who: Who, path: string, want: LeagueWant, host = 'localhost:3000') {
  const session = who === 'visitor' ? null : await ports.identify(standInPeople[who].token);
  return leagueOutcome({ host, path, session }, want, deps);
}

const site: LeagueWant = { page: 'site' };
const adminHome: LeagueWant = { page: 'admin', area: null };
const area = (name: 'teams' | 'schedule' | 'settings'): LeagueWant => ({
  page: 'admin',
  area: name,
});
const score: LeagueWant = { page: 'score' };

const kind = (outcome: LeagueOutcome) => outcome.kind;

describe('a live league', () => {
  it('shows its public site to everyone', async () => {
    for (const who of ['visitor', 'stranger', 'coach', 'scheduler', 'owner'] as const) {
      expect(kind(await ask(who, '/north-valley/schedule', site))).toBe('show');
    }
  });

  it('answers "no access" to an admin address for anyone without access, whoever they are (U-6)', async () => {
    expect(await ask('visitor', '/north-valley/admin', adminHome)).toEqual({
      kind: 'no-access',
      signedIn: false,
    });
    for (const who of ['stranger', 'coach'] as const) {
      expect(await ask(who, '/north-valley/admin', adminHome)).toEqual({
        kind: 'no-access',
        signedIn: true,
      });
      expect(kind(await ask(who, '/north-valley/admin/settings', area('settings')))).toBe(
        'no-access',
      );
    }
  });

  it('opens to each person only the areas their roles use (P4 §4)', async () => {
    const asScheduler = await ask('scheduler', '/north-valley/admin', adminHome);
    expect(asScheduler.kind === 'show' && asScheduler.view.areas).toEqual(['schedule', 'games']);
    expect(kind(await ask('scheduler', '/north-valley/admin/schedule', area('schedule')))).toBe(
      'show',
    );
    expect(kind(await ask('scheduler', '/north-valley/admin/teams', area('teams')))).toBe(
      'no-access',
    );
    const asOwner = await ask('owner', '/north-valley/admin/settings', area('settings'));
    expect(asOwner.kind === 'show' && asOwner.view.runsTheLeague).toBe(true);
  });

  it('opens the tracker only to those who may score', async () => {
    expect(kind(await ask('scheduler', '/north-valley/score/game-1', score))).toBe('show');
    expect(kind(await ask('coach', '/north-valley/score/game-1', score))).toBe('no-access');
    expect(kind(await ask('visitor', '/north-valley/score/game-1', score))).toBe('no-access');
  });

  it("does not let one league's access open another league", async () => {
    expect(kind(await ask('scheduler', '/harbor-city/admin', adminHome))).toBe('no-access');
  });

  it('forwards a former short name and other capitals to the one proper address (U-7)', async () => {
    expect(await ask('visitor', '/north-vale/teams?x=1', site)).toEqual({
      kind: 'forward',
      to: '/north-valley/teams?x=1',
    });
    expect(await ask('visitor', '/North-Valley', site)).toEqual({
      kind: 'forward',
      to: '/north-valley',
    });
  });
});

describe('a draft league (U-9)', () => {
  it('is not there for visitors, strangers, or a coach who does not run it', async () => {
    for (const who of ['visitor', 'stranger', 'coach'] as const) {
      expect(kind(await ask(who, '/quiet-pines', site))).toBe('not-found');
      expect(kind(await ask(who, '/quiet-pines/admin', adminHome))).toBe('not-found');
    }
  });

  it('is there for its owner and admins only, not for other staff (U-9 read literally)', async () => {
    expect(kind(await ask('owner', '/quiet-pines', site))).toBe('show');
    expect(kind(await ask('owner', '/quiet-pines/admin', adminHome))).toBe('show');
    expect(kind(await ask('scheduler', '/quiet-pines/admin', adminHome))).toBe('not-found');
    expect(kind(await ask('scheduler', '/quiet-pines', site))).toBe('not-found');
  });

  it('forwards a former short name only for those who may see it', async () => {
    expect(await ask('visitor', '/quiet-pine/admin', adminHome)).toEqual({ kind: 'not-found' });
    expect(await ask('coach', '/quiet-pine', site)).toEqual({ kind: 'not-found' });
    expect(await ask('scheduler', '/quiet-pine/admin', adminHome)).toEqual({ kind: 'not-found' });
    expect(await ask('owner', '/quiet-pine/admin', adminHome)).toEqual({
      kind: 'forward',
      to: '/quiet-pines/admin',
    });
  });

  it('gives the same answer as a short name nobody has', async () => {
    expect(await ask('visitor', '/quiet-pines', site)).toEqual(
      await ask('visitor', '/nobody-has-this', site),
    );
  });
});

describe('suspended and archived leagues (U-9)', () => {
  it('shows a suspended league only to those who run it', async () => {
    expect(kind(await ask('visitor', '/closed-gate', site))).toBe('not-found');
    expect(kind(await ask('stranger', '/closed-gate/admin', adminHome))).toBe('not-found');
    expect(kind(await ask('scheduler', '/closed-gate', site))).toBe('not-found');
    expect(kind(await ask('owner', '/closed-gate/admin', adminHome))).toBe('show');
  });

  it('keeps an archived league viewable, and its admin closed to others', async () => {
    expect(kind(await ask('visitor', '/old-meadow/standings', site))).toBe('show');
    expect(kind(await ask('stranger', '/old-meadow/admin', adminHome))).toBe('no-access');
    expect(kind(await ask('owner', '/old-meadow/admin', adminHome))).toBe('show');
  });
});

describe('one request', () => {
  it("reads the person's access once, whatever its layouts and pages ask", async () => {
    let reads = 0;
    const counting = {
      ...deps,
      accessOf: (context: Parameters<typeof deps.accessOf>[0]) => {
        reads += 1;
        return deps.accessOf(context);
      },
    };
    const session = await ports.identify(standInPeople.scheduler.token);
    const resolved = await resolveLeagueRequest(
      { host: 'localhost:3000', path: '/north-valley/admin/teams', session },
      counting,
    );
    expect(kind(leaguePageOutcome(resolved, site))).toBe('show');
    expect(kind(leaguePageOutcome(resolved, adminHome))).toBe('show');
    expect(kind(leaguePageOutcome(resolved, area('teams')))).toBe('no-access');
    expect(reads).toBe(1);
  });

  it('uses one request id for everything, a forward included', async () => {
    let made = 0;
    const seen: string[] = [];
    const counting = {
      ...deps,
      newRequestId: () => `request-${(made += 1)}`,
      accessOf: (context: Parameters<typeof deps.accessOf>[0]) => {
        seen.push(context.requestId);
        return deps.accessOf(context);
      },
    };
    const session = await ports.identify(standInPeople.owner.token);
    const forwarded = await resolveLeagueRequest(
      { host: 'localhost:3000', path: '/quiet-pine/admin', session },
      counting,
    );
    expect(forwarded).toEqual({
      kind: 'settled',
      outcome: { kind: 'forward', to: '/quiet-pines/admin' },
    });
    expect(made).toBe(1);
    expect(seen).toEqual(['request-1']);

    const shown = await resolveLeagueRequest(
      { host: 'localhost:3000', path: '/north-valley', session },
      counting,
    );
    expect(shown.kind === 'league' && shown.context.requestId).toBe('request-2');
    expect(seen).toEqual(['request-1', 'request-2']);
  });
});

describe('addressMatchesRoute (the proxy ran)', () => {
  it("accepts the route's own league, in any capitals or spelling that forwards", () => {
    expect(addressMatchesRoute('/north-valley/admin', 'north-valley')).toBe(true);
    expect(addressMatchesRoute('/North-Valley?x=1', 'North-Valley')).toBe(true);
    expect(addressMatchesRoute('/north%2Dvalley', 'north-valley')).toBe(true);
    expect(addressMatchesRoute('/north%2Dvalley', 'north%2Dvalley')).toBe(true);
  });

  it('refuses an address header for another page, or none', () => {
    expect(addressMatchesRoute('/north-valley', 'quiet-pines')).toBe(false);
    expect(addressMatchesRoute('/north-valley', 'faviconxico')).toBe(false);
    expect(addressMatchesRoute('', 'north-valley')).toBe(false);
    expect(addressMatchesRoute('/', 'north-valley')).toBe(false);
    expect(addressMatchesRoute('/%E0%A4%A', 'north-valley')).toBe(false);
  });
});

describe('everything else', () => {
  it('finds no league in the bin, under our own words, or on another host', async () => {
    expect(kind(await ask('owner', '/binned-league', site))).toBe('not-found');
    expect(kind(await ask('owner', '/admin', adminHome))).toBe('not-found');
    expect(kind(await ask('owner', '/api/v1', site))).toBe('not-found');
    expect(kind(await ask('owner', '/north-valley', site, 'elsewhere.example.test'))).toBe(
      'not-found',
    );
  });

  it('draws the page as for a visitor when the session has ended', async () => {
    const session = await ports.identify('no-such-token');
    expect(session.ok).toBe(false);
    const outcome = await leagueOutcome(
      { host: 'localhost:3000', path: '/north-valley/admin', session },
      adminHome,
      deps,
    );
    expect(outcome).toEqual({ kind: 'no-access', signedIn: false });
  });

  it('refuses to make the stand-in for staging or production', () => {
    for (const appEnv of ['staging', 'production']) {
      expect(() =>
        standInPorts({
          appEnv,
          publicBaseUrl: 'http://localhost:3000',
          log: () => {},
          ...signInOptions,
        }),
      ).toThrow(/local work and tests only/);
    }
  });

  it('refuses to make the stand-in for a site address that is not local or a test name', () => {
    for (const publicBaseUrl of [
      'https://leagues.example.com',
      'https://localhost.example.com',
      'https://staging.example.test.com',
      'http://10.0.0.5:3000',
      'not an address',
    ]) {
      expect(() =>
        standInPorts({ appEnv: 'local', publicBaseUrl, log: () => {}, ...signInOptions }),
      ).toThrow(/PUBLIC_BASE_URL/);
    }
    for (const publicBaseUrl of [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
      'http://north.localhost:3000',
      'https://staging.example.test',
    ]) {
      expect(() =>
        standInPorts({ appEnv: 'test', publicBaseUrl, log: () => {}, ...signInOptions }),
      ).not.toThrow();
    }
  });
});
