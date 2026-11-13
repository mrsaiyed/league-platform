import type { findLeagueByShortName } from '@srleagues/database';
import type { SessionIdentity } from '@srleagues/providers';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  commandContextOf,
  requestContext,
  type ContextDeps,
  type FoundLeague,
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

function setup(siteOrigin = 'https://site.example.test') {
  const findLeague = vi.fn((shortName: string) => Promise.resolve(leagues[shortName]));
  const deps: ContextDeps = { siteOrigin, findLeague };
  const build = (facts: Partial<RequestFacts>) =>
    requestContext(
      {
        requestId: 'req-1',
        host: new URL(siteOrigin).host,
        path: '/',
        session: null,
        ...facts,
      },
      deps,
    );
  return { build, findLeague };
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
    for (const path of ['/', '/account', '/account/inbox', '/signin?next=x', '/Help', '/api/v1']) {
      expect(await build({ path })).toEqual({
        ok: true,
        value: { kind: 'platform', requestId: 'req-1', account: null },
      });
    }
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
      error: { code: 'league-moved', to: '/north-league/teams/a%2Fb?season=fall-2025' },
    });
    expect(await build({ path: '/old-north' })).toEqual({
      ok: false,
      error: { code: 'league-moved', to: '/north-league' },
    });
  });

  it('forwards other capitals to the short name in lower case', async () => {
    const { build, findLeague } = setup();
    expect(await build({ path: '/North-League/schedule' })).toEqual({
      ok: false,
      error: { code: 'league-moved', to: '/north-league/schedule' },
    });
    expect(findLeague).toHaveBeenCalledWith('north-league');
  });

  it('forwards only within our site, whatever follows the name', async () => {
    const { build } = setup();
    const result = await build({ path: '/old-north//evil.example/x' });
    expect(result).toEqual({
      ok: false,
      error: { code: 'league-moved', to: '/north-league//evil.example/x' },
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
});
