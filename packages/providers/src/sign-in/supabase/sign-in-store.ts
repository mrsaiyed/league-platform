// What the Supabase adapter keeps for itself, because Supabase Auth does not (record
// 018): which devices an account has used (T-70), a list of sessions by device with
// "this session ended" (T-71), our own counts of wrong guesses and code requests
// (T-85, T-225: Supabase limits by network only, and by its own numbers), the codes
// asked for with their attempts left (Supabase answers a wrong code and an expired
// one alike), and the short-lived proofs between a right code and a new password.
//
// Every method is one atomic step: an implementation backed by a database does each
// in one statement or transaction. The adapter's guarantees about requests at once
// (record 013) rest on that. Tokens are never kept, only their SHA-256 (`...Hash`),
// except the proof's Supabase session, which lives for at most the proof's minutes.
//
// Two implementations: `createMemorySignInStore` (development and tests, one process)
// and, for production, one backed by our own tables, which is not built yet.
import type { AttemptLimits } from '../sign-in-settings.ts';

/** A wait, in whole seconds. */
export type Limited = { readonly retryAfterSeconds: number };

export type SignInLimitStore = {
  /**
   * Counts a code request against the address and the network, unless either has had
   * its limit in the last hour; then nothing is counted and the longer wait returned.
   */
  readonly countCodeRequest: (input: {
    readonly email: string;
    readonly network: string;
    readonly perEmail: number;
    readonly perNetwork: number;
  }) => Promise<Limited | null>;
  /**
   * Checks the network's guess limit (and the address's, unless null). If both allow
   * a try, counts it as wrong on each now and returns a ticket that takes it back.
   */
  readonly reserveGuess: (input: {
    readonly email: string | null;
    readonly network: string;
    readonly perEmail: AttemptLimits;
    readonly perNetwork: AttemptLimits;
  }) => Promise<Limited | { readonly ticket: string }>;
  /** The try was right: takes the network's count back and clears the address's. */
  readonly forgiveGuess: (ticket: string) => Promise<void>;
  /** The try did not count (no code to check): takes both counts back. */
  readonly cancelGuess: (ticket: string) => Promise<void>;
  /** A new password: the address's wrong guesses are forgotten. */
  readonly clearGuesses: (email: string) => Promise<void>;
};

/** A code asked for. The code itself is Supabase's; this keeps what Supabase does not. */
export type PendingCode = {
  /** Which Supabase check the code answers; null when no code was sent (T-68). */
  readonly verifyType: 'signup' | 'magiclink' | 'recovery' | null;
  readonly expiresAt: Date;
  readonly attemptsLeft: number;
};

export type CodeAttempt =
  | { readonly status: 'none' }
  | { readonly status: 'used-up' }
  /** One attempt taken; `attemptsLeft` is what remains after it. */
  | {
      readonly status: 'taken';
      readonly verifyType: PendingCode['verifyType'];
      readonly attemptsLeft: number;
    };

/** What a proof stands for: Supabase's session from the right code, good for one new password. */
export type HeldProof = {
  readonly email: string;
  readonly accountId: string;
  readonly expiresAt: Date;
  readonly supabase: {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly accessExpiresAt: Date;
    readonly sessionId: string;
  };
};

export type SignInCodeStore = {
  /** Replaces any code the address had. */
  readonly putCode: (email: string, code: PendingCode) => Promise<void>;
  /** Takes one attempt at the address's code, if it has one that has not expired at `at`. */
  readonly takeCodeAttempt: (email: string, at: Date) => Promise<CodeAttempt>;
  readonly dropCode: (email: string) => Promise<void>;
  readonly putProof: (proofHash: string, proof: HeldProof) => Promise<void>;
  /** The proof, if it has not expired at `at`, without using it. */
  readonly peekProof: (proofHash: string, at: Date) => Promise<HeldProof | undefined>;
  /** The proof, removed, if it has not expired at `at`. Two callers at once: one gets it. */
  readonly takeProof: (proofHash: string, at: Date) => Promise<HeldProof | undefined>;
  /** Ends every proof and code for the address. */
  readonly dropProofsFor: (email: string) => Promise<void>;
};

/** One session as the account page lists it, and what the adapter needs to check its tokens. */
export type StoredSession = {
  readonly sessionId: string;
  readonly accountId: string;
  readonly deviceLabel: string;
  readonly signedInAt: Date;
  readonly lastActiveAt: Date;
  readonly lastSignInAt: Date;
  readonly passwordEnteredAt: Date | null;
  /** The newest access token; an older one stops working when a new one is issued. */
  readonly accessTokenHash: string;
  readonly accessExpiresAt: Date;
  readonly ended: boolean;
};

export type RefreshTokenUse =
  | { readonly status: 'unknown' }
  /** The newest refresh token: now marked used, so a second use at once reads as `old`. */
  | { readonly status: 'current'; readonly session: StoredSession }
  /** One already used: copied, by T-69. */
  | { readonly status: 'old'; readonly session: StoredSession };

export type SignInAccountStore = {
  /** Records that the account exists for us; `created` is true for exactly one caller. */
  readonly claimAccount: (accountId: string) => Promise<{ readonly created: boolean }>;
  /** True once the account has signed up with a code or Google through us. */
  readonly accountExists: (accountId: string) => Promise<boolean>;
  readonly hasPassword: (accountId: string) => Promise<boolean>;
  readonly setHasPassword: (accountId: string) => Promise<void>;
  /** Adds the device to the account's list; true if it was not on it (T-70). */
  readonly rememberDevice: (accountId: string, deviceId: string) => Promise<boolean>;
};

export type SignInSessionStore = {
  readonly addSession: (
    session: StoredSession & { readonly refreshTokenHash: string },
  ) => Promise<void>;
  readonly sessionByAccessToken: (accessTokenHash: string) => Promise<StoredSession | undefined>;
  readonly useRefreshToken: (refreshTokenHash: string) => Promise<RefreshTokenUse>;
  /** Undoes `useRefreshToken` after Supabase could not be reached, so the token may be tried again. */
  readonly releaseRefreshToken: (refreshTokenHash: string) => Promise<void>;
  /** New tokens after a renewal; the old access token stops working. */
  readonly renewSession: (
    sessionId: string,
    tokens: {
      readonly accessTokenHash: string;
      readonly accessExpiresAt: Date;
      readonly refreshTokenHash: string;
      readonly at: Date;
    },
  ) => Promise<void>;
  readonly touchSession: (sessionId: string, at: Date) => Promise<void>;
  /** The password was typed again in this session (T-70). */
  readonly passwordEntered: (sessionId: string, at: Date) => Promise<void>;
  /** True if it was live. */
  readonly endSession: (sessionId: string) => Promise<boolean>;
  /** Ends the account's live sessions except `keep`; returns how many. */
  readonly endSessionsOf: (accountId: string, keep?: string) => Promise<number>;
  readonly liveSessionsOf: (accountId: string) => Promise<readonly StoredSession[]>;
};

export type SupabaseSignInStore = {
  readonly limits: SignInLimitStore;
  readonly codes: SignInCodeStore;
  readonly accounts: SignInAccountStore;
  readonly sessions: SignInSessionStore;
};
