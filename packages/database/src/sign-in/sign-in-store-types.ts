// The shape of the sign-in store the Supabase adapter takes (record 018), as this
// package supplies it. The adapter's own copy is SupabaseSignInStore in
// packages/providers/src/sign-in/supabase/sign-in-store.ts: this package may not
// import providers (T-21), and providers may not write SQL, so the shape is written
// twice and the two must stay the same. The web app passes this store to the
// adapter (step 2.93), and TypeScript checks there that they still fit (record 052).
//
// Ids (`accountId`) here are the sign-in service's user ids, not our account ids:
// public.account_of_sign_in turns one into the other.

export type AttemptLimits = {
  readonly windowMinutes: number;
  readonly slowAfter: number;
  readonly slowSeconds: number;
  readonly lockAfter: number;
  readonly lockMinutes: number;
};

/** A wait, in whole seconds. */
export type Limited = { readonly retryAfterSeconds: number };

export type VerifyType = 'signup' | 'magiclink' | 'recovery';

export type PendingCode = {
  readonly verifyType: VerifyType | null;
  readonly expiresAt: Date;
  readonly attemptsLeft: number;
};

export type CodeAttempt =
  | { readonly status: 'none' }
  | { readonly status: 'used-up' }
  | {
      readonly status: 'taken';
      readonly verifyType: VerifyType | null;
      readonly attemptsLeft: number;
    };

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

export type StoredSession = {
  readonly sessionId: string;
  readonly accountId: string;
  readonly deviceLabel: string;
  readonly signedInAt: Date;
  readonly lastActiveAt: Date;
  readonly lastSignInAt: Date;
  readonly passwordEnteredAt: Date | null;
  readonly accessTokenHash: string;
  readonly accessExpiresAt: Date;
  readonly ended: boolean;
};

export type NewSession = StoredSession & { readonly refreshTokenHash: string };

export type RefreshTokenUse =
  | { readonly status: 'unknown' }
  | { readonly status: 'current'; readonly session: StoredSession }
  | { readonly status: 'old'; readonly session: StoredSession };

export type RenewedTokens = {
  readonly accessTokenHash: string;
  readonly accessExpiresAt: Date;
  readonly refreshTokenHash: string;
  readonly at: Date;
};

export type DatabaseSignInStore = {
  readonly limits: {
    readonly countCodeRequest: (input: {
      readonly email: string;
      readonly network: string;
      readonly perEmail: number;
      readonly perNetwork: number;
    }) => Promise<Limited | null>;
    readonly reserveGuess: (input: {
      readonly email: string | null;
      readonly network: string;
      readonly perEmail: AttemptLimits;
      readonly perNetwork: AttemptLimits;
    }) => Promise<Limited | { readonly ticket: string }>;
    readonly forgiveGuess: (ticket: string) => Promise<void>;
    readonly cancelGuess: (ticket: string) => Promise<void>;
    readonly clearGuesses: (email: string) => Promise<void>;
  };
  readonly codes: {
    readonly putCode: (email: string, code: PendingCode) => Promise<void>;
    readonly takeCodeAttempt: (email: string, at: Date) => Promise<CodeAttempt>;
    readonly dropCode: (email: string) => Promise<void>;
    readonly putProof: (proofHash: string, proof: HeldProof) => Promise<void>;
    readonly peekProof: (proofHash: string, at: Date) => Promise<HeldProof | undefined>;
    readonly takeProof: (proofHash: string, at: Date) => Promise<HeldProof | undefined>;
    readonly dropProofsFor: (email: string) => Promise<void>;
  };
  readonly accounts: {
    readonly claimAccount: (accountId: string) => Promise<{ readonly created: boolean }>;
    readonly accountExists: (accountId: string) => Promise<boolean>;
    readonly hasPassword: (accountId: string) => Promise<boolean>;
    readonly setHasPassword: (accountId: string) => Promise<void>;
    readonly rememberDevice: (accountId: string, deviceId: string) => Promise<boolean>;
  };
  readonly sessions: {
    readonly addSession: (session: NewSession) => Promise<void>;
    readonly sessionByAccessToken: (accessTokenHash: string) => Promise<StoredSession | undefined>;
    readonly useRefreshToken: (refreshTokenHash: string) => Promise<RefreshTokenUse>;
    readonly releaseRefreshToken: (refreshTokenHash: string) => Promise<void>;
    readonly renewSession: (sessionId: string, tokens: RenewedTokens) => Promise<void>;
    readonly touchSession: (sessionId: string, at: Date) => Promise<void>;
    readonly passwordEntered: (sessionId: string, at: Date) => Promise<void>;
    readonly endSession: (sessionId: string) => Promise<boolean>;
    readonly endSessionsOf: (accountId: string, keep?: string) => Promise<number>;
    readonly liveSessionsOf: (accountId: string) => Promise<readonly StoredSession[]>;
  };
};
