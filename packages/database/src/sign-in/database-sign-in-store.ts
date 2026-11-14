// THE PRODUCTION SIGN-IN STORE (record 018, record 052): what the Supabase adapter
// keeps for itself, in our own tables (0012, schema sign_in), so a restart or a
// second web server signs no one out, forgets no device and resets no count.
//
// Each method is one transaction as sign_in_store (withSignInTransaction): that is
// what makes it the one atomic step the adapter relies on (record 013). Times come
// from `now`, as in the in-memory store, not from the database's clock.
//
// It passes the in-memory store's tests (database-sign-in-store.test.ts runs the
// cases of packages/providers/src/sign-in/supabase/memory-sign-in-store.test.ts).
//
// Not done here (record 052): proofs that run out are forgotten with their tokens,
// as in the in-memory store, but their Supabase sessions are not yet ended there;
// and nothing removes ended sessions or used renewing tokens after a while.
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withSignInTransaction, type SignInScope } from '../db/sign-in-transaction.ts';
import { addSession } from './add-session.ts';
import { cancelGuess } from './cancel-guess.ts';
import { claimSignInUser } from './claim-sign-in-user.ts';
import { clearGuesses } from './clear-guesses.ts';
import { countCodeRequest } from './count-code-request.ts';
import { dropCode } from './drop-code.ts';
import { dropProofsFor } from './drop-proofs-for.ts';
import { endSession } from './end-session.ts';
import { endSessionsOf } from './end-sessions-of.ts';
import { forgiveGuess } from './forgive-guess.ts';
import { hasPassword } from './has-password.ts';
import { liveSessionsOf } from './live-sessions-of.ts';
import { passwordEntered } from './password-entered.ts';
import { peekProof } from './peek-proof.ts';
import { putCode } from './put-code.ts';
import { putProof } from './put-proof.ts';
import { releaseRefreshToken } from './release-refresh-token.ts';
import { rememberDevice } from './remember-device.ts';
import { renewSession } from './renew-session.ts';
import { reserveGuess } from './reserve-guess.ts';
import { sessionByAccessToken } from './session-by-access-token.ts';
import { setHasPassword } from './set-has-password.ts';
import { signInUserExists } from './sign-in-user-exists.ts';
import type { DatabaseSignInStore } from './sign-in-store-types.ts';
import { takeCodeAttempt } from './take-code-attempt.ts';
import { takeProof } from './take-proof.ts';
import { touchSession } from './touch-session.ts';
import { useRefreshToken } from './use-refresh-token.ts';

export type DatabaseSignInStoreOptions = {
  readonly db: DatabaseHandle;
  readonly now?: () => Date;
};

export function createDatabaseSignInStore(
  options: DatabaseSignInStoreOptions,
): DatabaseSignInStore {
  const { db } = options;
  const now = options.now ?? (() => new Date());
  const step = <T>(work: (scope: SignInScope) => Promise<T>) => withSignInTransaction(db, work);

  return {
    limits: {
      countCodeRequest: (request) => step((s) => countCodeRequest(s, request, now())),
      reserveGuess: (request) => step((s) => reserveGuess(s, request, now())),
      forgiveGuess: (ticket) => step((s) => forgiveGuess(s, ticket)),
      cancelGuess: (ticket) => step((s) => cancelGuess(s, ticket)),
      clearGuesses: (email) => step((s) => clearGuesses(s, email)),
    },
    codes: {
      putCode: (email, code) => step((s) => putCode(s, email, code)),
      takeCodeAttempt: (email, at) => step((s) => takeCodeAttempt(s, email, at)),
      dropCode: (email) => step((s) => dropCode(s, email)),
      putProof: (proofHash, proof) => step((s) => putProof(s, proofHash, proof)),
      peekProof: (proofHash, at) => step((s) => peekProof(s, proofHash, at)),
      takeProof: (proofHash, at) => step((s) => takeProof(s, proofHash, at)),
      dropProofsFor: (email) => step((s) => dropProofsFor(s, email)),
    },
    accounts: {
      claimAccount: (userId) => step((s) => claimSignInUser(s, userId)),
      accountExists: (userId) => step((s) => signInUserExists(s, userId)),
      hasPassword: (userId) => step((s) => hasPassword(s, userId)),
      setHasPassword: (userId) => step((s) => setHasPassword(s, userId)),
      rememberDevice: (userId, deviceId) => step((s) => rememberDevice(s, userId, deviceId, now())),
    },
    sessions: {
      addSession: (session) => step((s) => addSession(s, session)),
      sessionByAccessToken: (hash) => step((s) => sessionByAccessToken(s, hash)),
      useRefreshToken: (hash) => step((s) => useRefreshToken(s, hash)),
      releaseRefreshToken: (hash) => step((s) => releaseRefreshToken(s, hash)),
      renewSession: (sessionId, tokens) => step((s) => renewSession(s, sessionId, tokens)),
      touchSession: (sessionId, at) => step((s) => touchSession(s, sessionId, at)),
      passwordEntered: (sessionId, at) => step((s) => passwordEntered(s, sessionId, at)),
      endSession: (sessionId) => step((s) => endSession(s, sessionId)),
      endSessionsOf: (userId, keep) => step((s) => endSessionsOf(s, userId, keep)),
      liveSessionsOf: (userId) => step((s) => liveSessionsOf(s, userId)),
    },
  };
}
