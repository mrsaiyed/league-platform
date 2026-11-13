// The sign-in service as the rest of the product sees it (T-6, T-14, T4 §3, record 013).
// The service answers "who is this?" and keeps passwords; everything about what a
// person may do lives in our own tables. Two things supply it: the Supabase adapter
// (step 1.15) and the local stand-in for development and tests (./local).
//
// Every operation returns a typed result or a typed, expected error. Where an answer
// could tell a stranger whether an account exists, it is the same either way (T-68):
// asking for a code always looks like a code was sent and costs the same work; a
// wrong email and a wrong password are one error; wrong guesses are counted against
// the address typed and the network, not against an account, so lock-outs look the
// same too.
//
// Inputs are plain strings as the app has them; the service checks them against the
// shapes in @srleagues/contracts. A device or network address that does not fit is
// the app's mistake, not the person's, and is thrown.
import type { SignInDevice } from '@srleagues/contracts';
import type { Result } from '@srleagues/core';

export type { SignInDevice };

/** What a code was asked for. Sign-up proves a new address; reset is the forgotten-password route (T-67). */
export type CodePurpose = 'sign-up' | 'reset';

/**
 * One sign-in email to send, through our own email service (T4 §3: not the vendor's
 * sender). Every request for a code makes one, whether or not an account exists, so
 * asking costs the same either way (T-68). `code` is null for a reset asked for an
 * address with no account: the sender records it like any other (a job), and the job
 * sends nothing. `accountExists` lets an email say "you already have an account" to
 * the mailbox, the only place that may learn it.
 */
export type SignInCodeMessage = {
  readonly to: string;
  readonly purpose: CodePurpose;
  readonly code: string | null;
  readonly accountExists: boolean;
  readonly expiresAt: Date;
};

export type CodeNotSent = { readonly code: 'code-not-sent' };

/**
 * Delivers sign-in emails. The app wires it to the email interface (step 1.19); tests
 * use a capture. An expected failure (the queue refused it) comes back as an error;
 * the code is then not kept, so no one can be asked for a code they never received.
 */
export type SignInCodeSender = {
  readonly send: (
    message: SignInCodeMessage,
  ) => Promise<Result<{ readonly queued: true }, CodeNotSent>>;
};

/** The tokens behind the session cookie (T-69). The app keeps them where page scripts cannot read them. */
export type SessionTokens = {
  readonly sessionId: string;
  /** Short-lived; replaced by `renew`, which ends the old one. */
  readonly accessToken: string;
  readonly accessExpiresAt: Date;
  /** Changes on every use. Using an old one again ends the session (T-69). */
  readonly refreshToken: string;
};

export type SignedIn = {
  readonly accountId: string;
  readonly session: SessionTokens;
  /**
   * True when this account has never signed in on this device before (T-70). The
   * app sends the new-device email; the service only says so.
   */
  readonly newDevice: boolean;
};

/**
 * After a code: `account-created` for a new address; `password-changed` for an
 * existing one, which has also ended every other session of the account (T-85). The
 * app emails the account when the password changed.
 */
export type PasswordSet = SignedIn & {
  readonly outcome: 'account-created' | 'password-changed';
  readonly endedSessions: number;
};

/** After Google: a new account, or an existing one with the same address. */
export type ExternalSignedIn = SignedIn & { readonly outcome: 'account-created' | 'signed-in' };

export type ExternalProvider = 'google';

export type ExternalSignInStarted = {
  /** Where to send the browser. */
  readonly redirectTo: string;
  /** Kept by the app in a short-lived cookie and handed back to `completeExternalSignIn`. */
  readonly verifier: string;
};

/** Who a session belongs to: the only question the service answers (T-6). */
export type SessionIdentity = {
  readonly accountId: string;
  readonly email: string;
  readonly sessionId: string;
  /** False for an account made with Google that has never set a password. */
  readonly hasPassword: boolean;
  /** When the password was last typed in this session; null if it never was. */
  readonly passwordEnteredAt: Date | null;
  /**
   * When the person last proved who they are in this session, by password or by
   * Google. Core decides whether a sensitive action needs that again (T-70): for an
   * account with no password, a recent Google sign-in is the proof.
   */
  readonly lastSignInAt: Date;
};

/** One line on the account page's device list (T-71). */
export type SessionSummary = {
  readonly sessionId: string;
  readonly deviceLabel: string;
  readonly signedInAt: Date;
  readonly lastActiveAt: Date;
  /** The session that asked for the list. */
  readonly current: boolean;
};

/** "If that address can sign in, we have sent it a code" (T-68). The same whatever the address. */
export type CodeRequested = { readonly codeValidMinutes: number };

/** Too many attempts or codes; try again after this many seconds. */
export type TooManyAttempts = {
  readonly code: 'too-many-attempts';
  readonly retryAfterSeconds: number;
};

export type CodeRequestError = { readonly code: 'invalid-email' } | TooManyAttempts | CodeNotSent;

/** Proof that the person holds the mailbox, good for one `setPassword`. */
export type CodeProof = { readonly proof: string; readonly proofExpiresAt: Date };

/**
 * `code-expired` covers a code past its time and an address no code was asked for;
 * `too-many-attempts` means this code is used up, or the network has guessed too
 * often (then with a wait).
 */
export type VerifyCodeError =
  | { readonly code: 'code-wrong' }
  | { readonly code: 'code-expired' }
  | { readonly code: 'too-many-attempts'; readonly retryAfterSeconds?: number };

/** The proof is kept on a password error, so the person can try another password. */
export type SetPasswordError =
  | { readonly code: 'proof-invalid' }
  | { readonly code: 'password-too-short' }
  | { readonly code: 'password-too-long' }
  | { readonly code: 'password-leaked' };

/** One error for a wrong email and a wrong password (T-68). */
export type SignInError = { readonly code: 'wrong-email-or-password' } | TooManyAttempts;

export type ExternalSignInError =
  | { readonly code: 'external-sign-in-failed' }
  | { readonly code: 'return-address-refused' };

/** `access-expired`: renew and retry. `session-ended`: the person must sign in again. */
export type SessionError = { readonly code: 'access-expired' } | { readonly code: 'session-ended' };

export type RenewError = { readonly code: 'session-ended' };

/**
 * `no-password`: the account has none (made with Google), so the app asks for a
 * fresh Google sign-in instead. Only the signed-in owner of the account can get this
 * answer, so it tells no stranger anything (T-68), and it never counts as a wrong guess.
 */
export type ConfirmPasswordError =
  | { readonly code: 'wrong-password' }
  | { readonly code: 'no-password' }
  | TooManyAttempts
  | SessionError;

/** Signing out by either token: the access token may have run out; the refresh token is in the cookie. */
export type SignOutInput = { readonly accessToken: string } | { readonly refreshToken: string };

export type SignInService = {
  /** Emails a 6-digit code, valid 10 minutes, to prove the address (T-67). */
  readonly startSignUp: (input: {
    readonly email: string;
    readonly networkAddress: string;
  }) => Promise<Result<CodeRequested, CodeRequestError>>;
  /** The forgotten-password route: the same code, sent only if the address has an account. */
  readonly startReset: (input: {
    readonly email: string;
    readonly networkAddress: string;
  }) => Promise<Result<CodeRequested, CodeRequestError>>;
  /** Checks a code; a few attempts per code, and wrong codes are limited per network (T-67, T-225). */
  readonly verifyCode: (input: {
    readonly email: string;
    readonly code: string;
    readonly networkAddress: string;
  }) => Promise<Result<CodeProof, VerifyCodeError>>;
  /** Creates the account, or replaces its password, and signs this device in. */
  readonly setPassword: (input: {
    readonly proof: string;
    readonly password: string;
    readonly device: SignInDevice;
  }) => Promise<Result<PasswordSet, SetPasswordError>>;
  /** Email and password. Wrong guesses are limited per address typed and per network (T-85). */
  readonly signIn: (input: {
    readonly email: string;
    readonly password: string;
    readonly device: SignInDevice;
  }) => Promise<Result<SignedIn, SignInError>>;
  /** Where to send the browser for Google (T-67). The return address must be one of ours. */
  readonly startExternalSignIn: (input: {
    readonly provider: ExternalProvider;
    readonly returnAddress: string;
  }) => Promise<Result<ExternalSignInStarted, ExternalSignInError>>;
  /** Google sent the browser back with `code`. */
  readonly completeExternalSignIn: (input: {
    readonly provider: ExternalProvider;
    readonly code: string;
    readonly verifier: string;
    readonly device: SignInDevice;
  }) => Promise<Result<ExternalSignedIn, ExternalSignInError>>;
  /** "Who is this?" for one request. */
  readonly identify: (input: {
    readonly accessToken: string;
  }) => Promise<Result<SessionIdentity, SessionError>>;
  /** A new access token and a new refresh token; the old ones stop working (T-69). */
  readonly renew: (input: {
    readonly refreshToken: string;
  }) => Promise<Result<SessionTokens, RenewError>>;
  /** The password again before a sensitive action (T-70). Wrong guesses count as for `signIn`. */
  readonly confirmPassword: (input: {
    readonly accessToken: string;
    readonly password: string;
    readonly networkAddress: string;
  }) => Promise<Result<{ readonly passwordEnteredAt: Date }, ConfirmPasswordError>>;
  /** Ends this session. A second call is harmless. */
  readonly signOut: (input: SignOutInput) => Promise<Result<{ readonly ended: boolean }, never>>;
  /**
   * Ends every other session of the account at once (T-70, T-71), and this one too
   * unless `keepThisSession`.
   */
  readonly signOutEverywhere: (input: {
    readonly accessToken: string;
    readonly keepThisSession: boolean;
  }) => Promise<Result<{ readonly endedSessions: number }, SessionError>>;
  /** The account's active sessions by device and time, most recent first (T-71). */
  readonly listSessions: (input: {
    readonly accessToken: string;
  }) => Promise<Result<readonly SessionSummary[], SessionError>>;
};
