import { ownTrackerRefusal } from '@srleagues/contracts';
import { leagueApiUrl, ok } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import type { RequestFacts } from './context.ts';
import { refusalAnswer, resolveLeagueApi, type LeagueApiDeps } from './league-api.ts';

const leagueA = '01900000-0000-7000-8000-00000000000a';
const leagueB = '01900000-0000-7000-8000-00000000000b';
const game = '01900000-0000-7000-8000-0000000b0001';
const parts = ['games', game, 'commands'];

const deps: LeagueApiDeps = {
  accessOf: async () => undefined,
  siteOrigin: 'http://localhost:3000',
  findLeague: async () => undefined,
  findLeagueById: async (id) =>
    id === leagueA || id === leagueB
      ? { id, slug: id === leagueA ? 'north' : 'south', status: 'live' }
      : undefined,
  newRequestId: () => 'request-1',
};

const facts = (path: string, session: RequestFacts['session'] = null): RequestFacts => ({
  host: 'localhost:3000',
  path,
  session,
});

describe('resolveLeagueApi', () => {
  it('finds the league the address names by its id, with no account for a visitor', async () => {
    const resolved = await resolveLeagueApi(
      facts(leagueApiUrl({ id: leagueA }, parts)),
      parts,
      deps,
    );
    expect(resolved).toMatchObject({
      ok: true,
      context: { kind: 'league', account: null, league: { id: leagueA, slug: 'north' } },
    });
  });

  it('takes the account from the session, never from the request', async () => {
    const session = ok({
      accountId: '01900000-0000-7000-8000-0000000000A1',
      email: 'someone@example.test',
      emailConfirmed: true,
      sessionId: 's',
      hasPassword: true,
      passwordEnteredAt: null,
      lastSignInAt: new Date(0),
    });
    const resolved = await resolveLeagueApi(
      facts(`${leagueApiUrl({ id: leagueA }, parts)}?accountId=x`, session),
      parts,
      deps,
    );
    expect(resolved.ok && resolved.context.account?.accountId).toBe(
      '01900000-0000-7000-8000-0000000000a1',
    );
  });

  it('is "not found" when the address is not exactly the one the route answers', async () => {
    for (const path of [
      // The route was reached some other way: the proxy did not write the address.
      '',
      // Another endpoint's address, or the same in other capitals.
      leagueApiUrl({ id: leagueA }, ['games', game, 'session']),
      leagueApiUrl({ id: leagueA }, parts).toUpperCase(),
      `/api/v1/leagues/${leagueA.toUpperCase()}/games/${game}/commands`,
      // A league that is not there.
      leagueApiUrl({ id: '01900000-0000-7000-8000-00000000000c' }, parts),
      `/north/games/${game}/commands`,
    ]) {
      expect(await resolveLeagueApi(facts(path), parts, deps)).toEqual({
        ok: false,
        refusal: { status: 404, error: 'not-found' },
      });
    }
  });

  it('is "not found" for another host', async () => {
    const resolved = await resolveLeagueApi(
      { ...facts(leagueApiUrl({ id: leagueA }, parts)), host: 'elsewhere.test' },
      parts,
      deps,
    );
    expect(resolved.ok).toBe(false);
  });

  it('is "signed out" when the session cookie no longer works', async () => {
    for (const code of ['access-expired', 'session-ended'] as const) {
      const resolved = await resolveLeagueApi(
        facts(leagueApiUrl({ id: leagueA }, parts), { ok: false, error: { code } }),
        parts,
        deps,
      );
      expect(resolved).toEqual({ ok: false, refusal: { status: 401, error: 'signed-out' } });
    }
  });

  it('sees a session cookie that no longer works as a visitor for a public read', async () => {
    const snapshot = ['games', game, 'snapshot'];
    for (const code of ['access-expired', 'session-ended'] as const) {
      const resolved = await resolveLeagueApi(
        facts(leagueApiUrl({ id: leagueA }, snapshot), { ok: false, error: { code } }),
        snapshot,
        deps,
        'visitor',
      );
      expect(resolved).toMatchObject({
        ok: true,
        context: { kind: 'league', account: null, league: { id: leagueA } },
      });
    }
  });

  it('is "account problem" for a live session none of our accounts hold, a visitor for a public read', async () => {
    const session = {
      ok: false,
      error: { code: 'account-problem', problem: 'sign-in-link-conflict' },
    } as const;
    expect(
      await resolveLeagueApi(facts(leagueApiUrl({ id: leagueA }, parts), session), parts, deps),
    ).toEqual({ ok: false, refusal: { status: 403, error: 'account-problem' } });
    const snapshot = ['games', game, 'snapshot'];
    expect(
      await resolveLeagueApi(
        facts(leagueApiUrl({ id: leagueA }, snapshot), session),
        snapshot,
        deps,
        'visitor',
      ),
    ).toMatchObject({ ok: true, context: { account: null, league: { id: leagueA } } });
  });

  it('is still "not found" for a public read of an address that is not the route\'s', async () => {
    const resolved = await resolveLeagueApi(
      facts(leagueApiUrl({ id: leagueA }, parts), { ok: false, error: { code: 'session-ended' } }),
      ['games', game, 'snapshot'],
      deps,
      'visitor',
    );
    expect(resolved).toEqual({ ok: false, refusal: { status: 404, error: 'not-found' } });
  });

  it("answers each refusal as the tracker's own refusal, at its own status (T-251)", async () => {
    const refusals = [
      await resolveLeagueApi(facts(''), parts, deps),
      await resolveLeagueApi(
        facts(leagueApiUrl({ id: leagueA }, parts), {
          ok: false,
          error: { code: 'session-ended' },
        }),
        parts,
        deps,
      ),
      await resolveLeagueApi(
        facts(leagueApiUrl({ id: leagueA }, parts), {
          ok: false,
          error: { code: 'account-problem', problem: 'sign-in-link-conflict' },
        }),
        parts,
        deps,
      ),
    ];
    const answers = refusals.map((resolved) => {
      if (resolved.ok) throw new Error('expected a refusal');
      return refusalAnswer(resolved.refusal);
    });
    expect(answers).toEqual([
      { status: 404, body: { error: 'not-found' } },
      { status: 401, body: { error: 'signed-out' } },
      { status: 403, body: { error: 'account-problem' } },
    ]);
    // A tracker takes each as the server's word, not as a page in between.
    for (const answer of answers) {
      expect(ownTrackerRefusal(answer.status, answer.body)).not.toBeNull();
    }
  });
});
