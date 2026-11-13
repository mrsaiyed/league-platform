import type { findCurrentLeague, findLeagueByShortName } from '@srleagues/database';
import type { SessionIdentity } from '@srleagues/providers';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  commandContextOf,
  requestContext,
  type ContextDeps,
  type FoundLeague,
  type LeagueById,
  type LeagueRequestContext,
  type RequestFacts,
} from './context.ts';

const leagueId = '01900000-0000-7000-8000-00000000000a';
const accountId = '01900000-0000-7000-8000-0000000000bb';

const identity: SessionIdentity = {
  accountId: accountId.toUpperCase(),
  email: 'made-up@example.test',
  sessionId: 'session-1',
  hasPassword: true,
  passwordEnteredAt: new Date('2026-11-01T10:00:00Z'),
  lastSignInAt: new Date('2026-11-01T10:00:00Z'),
};

const leagues: Readonly<Record<string, FoundLeague>> = {
  'north-league': {
    leagueId,
    slug: 'north-league',
    status: 'live',
    inBin: false,
    forwarded: false,
  },
  'old-north': { leagueId, slug: 'north-league', status: 'live', inBin: false, forwarded: true },
  'gone-league': {
    leagueId: '01900000-0000-7000-8000-00000000000c',
    slug: 'gone-league',
    status: 'archived',
    inBin: true,
    forwarded: false,
  },
  'draft-league': {
    leagueId: '01900000-0000-7000-8000-00000000000d',
    slug: 'draft-league',
    status: 'draft',
    inBin: false,
    forwarded: false,
  },
};

const byId: Readonly<Record<string, LeagueById>> = {
  [leagueId]: { id: leagueId, slug: 'north-league', status: 'live' },
  '01900000-0000-7000-8000-00000000000d': {
    id: '01900000-0000-7000-8000-00000000000d',
    slug: 'draft-league',
    status: 'draft',
  },
};

function setup(siteOrigin = 'https://site.example.test') {
  const findLeague = vi.fn((shortName: string) => Promise.resolve(leagues[shortName]));
  const findLeagueById = vi.fn((id: string) => Promise.resolve(byId[id]));
  const newRequestId = vi.fn(() => 'req-1');
  const deps: ContextDeps = { siteOrigin, findLeague, findLeagueById, newRequestId };
  const build = (facts: Partial<RequestFacts>) =>
    requestContext(
      {
        host: new URL(siteOrigin).host,
        path: '/',
        session: null,
        ...facts,
      },
      deps,
    );
  return { build, findLeague, findLeagueById, newRequestId };
}

describe('requestContext: which league (T-34, T4 §2 fence 1)', () => {
  it('reads the league from the first part of the path', async () => {
    const { build, findLeague } = setup();
    for (const path of ['/north-league', '/north-league/', '/north-league/teams/lions?season=x']) {
      expect(await build({ path })).toEqual({
        ok: true,
        value: {
          kind: 'league',
          requestId: 'req-1',
          account: null,
          league: { id: leagueId, slug: 'north-league', status: 'live' },
        },
      });
    }
    expect(findLeague).toHaveBeenCalledWith('north-league');
  });

  it('gives a draft league with its state, for the shell to decide who sees it (U-9)', async () => {
    const { build } = setup();
    expect(await build({ path: '/draft-league/admin' })).toMatchObject({
      ok: true,
      value: { kind: 'league', league: { slug: 'draft-league', status: 'draft' } },
    });
  });

  it('treats our own pages as no league, and never looks them up', async () => {
    const { build, findLeague } = setup();
    for (const path of ['/', '/account', '/account/inbox', '/signin?next=x', '/help', '/api/v1']) {
      expect(await build({ path })).toEqual({
        ok: true,
        value: { kind: 'platform', requestId: 'req-1', account: null },
      });
    }
    expect(findLeague).not.toHaveBeenCalled();
  });

  it('forwards our own pages spelled another way to their one proper address', async () => {
    const { build, findLeague } = setup();
    expect(await build({ path: '/Help' })).toEqual({
      ok: false,
      error: { code: 'forward', to: '/help' },
    });
    expect(await build({ path: '/%61ccount/inbox?x=1' })).toEqual({
      ok: false,
      error: { code: 'forward', to: '/account/inbox?x=1' },
    });
    expect(findLeague).not.toHaveBeenCalled();
  });

  it('finds no league for a name nobody has, one in the bin, or one of the wrong form', async () => {
    const { build, findLeague } = setup();
    for (const path of [
      '/nobody-here',
      '/gone-league',
      '/ab',
      '/north_league',
      '/north%2Fleague',
      '/%E0%A4%A',
      'north-league',
    ]) {
      expect(await build({ path })).toEqual({ ok: false, error: { code: 'league-not-found' } });
    }
    expect(findLeague.mock.calls.map(([name]) => name)).toEqual(['nobody-here', 'gone-league']);
  });

  it('forwards a former short name to the same page under the current one (U-7)', async () => {
    const { build } = setup();
    expect(await build({ path: '/old-north/teams/a%2Fb?season=fall-2025' })).toEqual({
      ok: false,
      error: {
        code: 'league-moved',
        to: '/north-league/teams/a%2Fb?season=fall-2025',
        leagueId,
        status: 'live',
      },
    });
    expect(await build({ path: '/old-north' })).toEqual({
      ok: false,
      error: { code: 'league-moved', to: '/north-league', leagueId, status: 'live' },
    });
  });

  it("carries the league's id and state, so a draft's forward can be kept to its admins (U-9)", async () => {
    const { build } = setup();
    expect(await build({ path: '/Draft-League/admin' })).toEqual({
      ok: false,
      error: {
        code: 'league-moved',
        to: '/draft-league/admin',
        leagueId: '01900000-0000-7000-8000-00000000000d',
        status: 'draft',
      },
    });
  });

  it('forwards another spelling of the name, and never serves it (U-7)', async () => {
    const { build, findLeague } = setup();
    for (const path of [
      '/north%2Dleague/teams',
      '/north%2dleague/teams',
      '/%6Eorth-league/teams',
    ]) {
      expect(await build({ path })).toEqual({
        ok: false,
        error: { code: 'league-moved', to: '/north-league/teams', leagueId, status: 'live' },
      });
    }
    expect(findLeague.mock.calls.every(([name]) => name === 'north-league')).toBe(true);
  });

  it('finds no league, rather than failing, when the database holds a bad short name', async () => {
    const findLeague = vi.fn(() =>
      Promise.resolve<FoundLeague>({
        leagueId,
        slug: 'Bad Name',
        status: 'live',
        inBin: false,
        forwarded: true,
      }),
    );
    const result = await requestContext(
      { host: 'site.example.test', path: '/old-north/teams', session: null },
      {
        siteOrigin: 'https://site.example.test',
        findLeague,
        findLeagueById: () => Promise.resolve(undefined),
        newRequestId: () => 'req-1',
      },
    );
    expect(result).toEqual({ ok: false, error: { code: 'league-not-found' } });
  });

  it('treats a word refused only as offensive as a league name, not as one of our pages', async () => {
    // The offensive list is the founder's to fill; any name not of ours is looked up.
    const { build, findLeague } = setup();
    expect(await build({ path: '/nobody-here' })).toEqual({
      ok: false,
      error: { code: 'league-not-found' },
    });
    expect(findLeague).toHaveBeenCalledWith('nobody-here');
  });

  it('forwards other capitals to the short name in lower case', async () => {
    const { build, findLeague } = setup();
    expect(await build({ path: '/North-League/schedule' })).toEqual({
      ok: false,
      error: { code: 'league-moved', to: '/north-league/schedule', leagueId, status: 'live' },
    });
    expect(findLeague).toHaveBeenCalledWith('north-league');
  });

  it('forwards only within our site, whatever follows the name', async () => {
    const { build } = setup();
    const result = await build({ path: '/old-north//evil.example/x' });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'league-moved',
        to: '/north-league//evil.example/x',
        leagueId,
        status: 'live',
      },
    });
  });

  it('refuses a request to a host that is not ours', async () => {
    const { build, findLeague } = setup();
    for (const host of [
      'evil.example',
      'site.example.test.evil.example',
      'evil.example/site.example.test',
      'site.example.test@evil.example',
      'site.example.test:8443',
      '',
    ]) {
      expect(await build({ host, path: '/north-league' })).toEqual({
        ok: false,
        error: { code: 'unknown-host' },
      });
    }
    expect(findLeague).not.toHaveBeenCalled();
  });

  it('accepts our host in other capitals or with its default port', async () => {
    const { build } = setup();
    for (const host of ['SITE.example.test', 'site.example.test:443']) {
      expect(await build({ host, path: '/north-league' })).toMatchObject({ ok: true });
    }
    const local = setup('http://localhost:3000');
    expect(await local.build({ host: 'localhost:3000', path: '/' })).toMatchObject({ ok: true });
    expect(await local.build({ host: 'localhost', path: '/' })).toMatchObject({ ok: false });
  });
});

describe('requestContext: endpoints (record 017, T-229)', () => {
  const commands = `/api/v1/leagues/${leagueId}/games/g1/commands`;

  it('reads the league of /api/v1/leagues/{leagueId}/... by its id', async () => {
    const { build, findLeague, findLeagueById } = setup();
    expect(await build({ path: commands })).toEqual({
      ok: true,
      value: {
        kind: 'league',
        requestId: 'req-1',
        account: null,
        league: { id: leagueId, slug: 'north-league', status: 'live' },
      },
    });
    expect(await build({ path: `/api/v1/leagues/${leagueId}?x=1` })).toMatchObject({
      ok: true,
      value: { kind: 'league', league: { id: leagueId } },
    });
    expect(findLeagueById).toHaveBeenCalledWith(leagueId);
    expect(findLeague).not.toHaveBeenCalled();
  });

  it('gives other endpoints no league', async () => {
    const { build, findLeagueById } = setup();
    for (const path of ['/api', '/api/v1', '/api/v1/account', '/api/v1/webhooks/email']) {
      expect(await build({ path })).toEqual({
        ok: true,
        value: { kind: 'platform', requestId: 'req-1', account: null },
      });
    }
    expect(findLeagueById).not.toHaveBeenCalled();
  });

  it('finds no league for an unknown id, one spelled another way, or none at all', async () => {
    const { build, findLeagueById } = setup();
    for (const path of [
      '/api/v1/leagues',
      '/api/v1/leagues/',
      '/api/v1/leagues/north-league/games',
      `/api/v1/leagues/${leagueId.toUpperCase()}/games`,
      `/api/v1/leagues/%30${leagueId.slice(1)}/games`,
      '/api/v1/leagues/01900000-0000-7000-8000-0000000000ff/games',
    ]) {
      expect(await build({ path })).toEqual({ ok: false, error: { code: 'league-not-found' } });
    }
    expect(findLeagueById.mock.calls).toEqual([['01900000-0000-7000-8000-0000000000ff']]);
  });

  it('forwards /API/... like any page of ours, so the proper address is the one handlers see', async () => {
    const { build } = setup();
    expect(await build({ path: `/API/v1/leagues/${leagueId}` })).toEqual({
      ok: false,
      error: { code: 'forward', to: `/api/v1/leagues/${leagueId}` },
    });
  });
});

describe('requestContext: the request id', () => {
  it('is made by the server for each request, never read from the request', async () => {
    const { build, newRequestId } = setup();
    newRequestId.mockReturnValueOnce('req-a').mockReturnValueOnce('req-b');
    const first = await build({ path: '/north-league' });
    const second = await build({ path: '/account' });
    expect(first).toMatchObject({ ok: true, value: { requestId: 'req-a' } });
    expect(second).toMatchObject({ ok: true, value: { requestId: 'req-b' } });
    expectTypeOf<RequestFacts>().not.toHaveProperty('requestId');
  });
});

describe('requestContext: who is asking', () => {
  it('takes the account from the session, never from the request', async () => {
    const { build } = setup();
    const result = await build({ path: '/north-league', session: { ok: true, value: identity } });
    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'league',
        requestId: 'req-1',
        account: {
          accountId,
          sessionId: 'session-1',
          hasPassword: true,
          passwordEnteredAt: identity.passwordEnteredAt,
          lastSignInAt: identity.lastSignInAt,
        },
        league: { id: leagueId, slug: 'north-league', status: 'live' },
      },
    });
    expect(JSON.stringify(result)).not.toContain('made-up@example.test');
  });

  it('keeps a signed-in person on our own pages too', async () => {
    const { build } = setup();
    expect(await build({ path: '/account', session: { ok: true, value: identity } })).toMatchObject(
      { ok: true, value: { kind: 'platform', account: { accountId } } },
    );
  });

  it('asks for a renewal when the access token ran out, and a fresh start when the session ended', async () => {
    const { build, findLeague } = setup();
    expect(
      await build({
        path: '/north-league',
        session: { ok: false, error: { code: 'access-expired' } },
      }),
    ).toEqual({ ok: false, error: { code: 'renew-session' } });
    expect(
      await build({
        path: '/north-league',
        session: { ok: false, error: { code: 'session-ended' } },
      }),
    ).toEqual({ ok: false, error: { code: 'session-ended' } });
    expect(findLeague).not.toHaveBeenCalled();
  });
});

describe('commandContextOf (T-23)', () => {
  it("gives a command the request's league, account and request id", async () => {
    const { build } = setup();
    const signedIn = await build({ path: '/north-league', session: { ok: true, value: identity } });
    const visitor = await build({ path: '/north-league' });
    if (!signedIn.ok || signedIn.value.kind !== 'league') throw new Error('expected a league');
    if (!visitor.ok || visitor.value.kind !== 'league') throw new Error('expected a league');
    expect(commandContextOf(signedIn.value)).toEqual({ leagueId, accountId, requestId: 'req-1' });
    expect(commandContextOf(visitor.value)).toEqual({
      leagueId,
      accountId: null,
      requestId: 'req-1',
    });
  });

  it('is made only from a league request', () => {
    expectTypeOf(commandContextOf).parameter(0).toEqualTypeOf<LeagueRequestContext>();
  });
});

describe('the lookup the database supplies', () => {
  it("fits findLeague once given the transaction with no league (step 1.17's wiring)", () => {
    type Answer = Awaited<ReturnType<typeof findLeagueByShortName>>;
    expectTypeOf<Answer>().toExtend<FoundLeague | undefined>();
  });

  it("fits findLeagueById once given the league's own transaction", () => {
    type Answer = Awaited<ReturnType<typeof findCurrentLeague>>;
    expectTypeOf<Answer>().toExtend<LeagueById | undefined>();
  });
});
