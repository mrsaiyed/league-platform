// GET /api/v1/signed-in (T-456): whether this request is signed in, about no league. A
// tracker refused "not found" at a league asks it once: signed out, it asks for sign-in
// and holds the taps; signed in, it says this account can no longer open the game, keeps
// the taps and offers a copy for the league's admin. It reads no league and no access, so
// a hidden league and a missing one cost it the same, and it tells nobody anything about
// a league. A session that no longer works is signed out, as at a league endpoint.
import type { SignedInAnswer } from '@srleagues/contracts';
import { requestContext, type ContextDeps, type RequestFacts } from './context.ts';
import type { ApiAnswer } from './league-api.ts';

export async function signedInAnswer(facts: RequestFacts, deps: ContextDeps): Promise<ApiAnswer> {
  const built = await requestContext(facts, deps);
  if (!built.ok && built.error.code === 'unknown-host') {
    return { status: 404, body: { error: 'not-found' } };
  }
  const body = {
    signedIn: built.ok && built.value.kind === 'platform' && built.value.account !== null,
  } satisfies SignedInAnswer;
  return { status: 200, body };
}
