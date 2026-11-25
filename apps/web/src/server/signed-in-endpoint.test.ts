import { SignedInAnswer, signedInApiPath } from '@srleagues/contracts';
import { fail, ok } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import type { ContextDeps, RequestFacts } from './context.ts';
import { signedInAnswer } from './signed-in-endpoint.ts';

const reads: string[] = [];
const deps: ContextDeps = {
  siteOrigin: 'http://localhost:3000',
  findLeague: async (name) => (reads.push(name), undefined),
  findLeagueById: async (id) => (reads.push(id), undefined),
  newRequestId: () => 'request-1',
};

const live = ok({
  accountId: '01900000-0000-7000-8000-0000000000a1',
  email: 'someone@example.test',
  emailConfirmed: true,
  sessionId: 's',
  hasPassword: true,
  passwordEnteredAt: null,
  lastSignInAt: new Date(0),
});

const facts = (session: RequestFacts['session'], host = 'localhost:3000'): RequestFacts => ({
  host,
  path: signedInApiPath,
  session,
});

describe('signedInAnswer (T-456)', () => {
  it('says signed in for a live session, and reads no league', async () => {
    const answer = await signedInAnswer(facts(live), deps);
    expect(answer).toEqual({ status: 200, body: { signedIn: true } });
    expect(SignedInAnswer.parse(answer.body)).toEqual({ signedIn: true });
    expect(reads).toEqual([]);
  });

  it('says signed out with no cookie, or a session that ended or must be renewed', async () => {
    for (const session of [
      null,
      fail({ code: 'session-ended' as const }),
      fail({ code: 'access-expired' as const }),
    ]) {
      expect(await signedInAnswer(facts(session), deps)).toEqual({
        status: 200,
        body: { signedIn: false },
      });
    }
  });

  it('answers another host "not found"', async () => {
    expect((await signedInAnswer(facts(live, 'elsewhere.test'), deps)).status).toBe(404);
  });
});
