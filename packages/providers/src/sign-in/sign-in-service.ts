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

/**
 * What a code was asked for. Sign-up proves a new address; reset is the forgotten-password
 * route (T-67); email-change proves the new address of a signed-in account (T-73, T-455).
 */
export type CodePurpose = 'sign-up' | 'reset' | 'email-change';

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
  /**
   * Whether the service holds the address as proved (a right code, or Google). The
   * app links an account to the session by its address only when it is (record 055).
   */
  readonly emailConfirmed: boolean;
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

/**
 * Proof that the person holds the mailbox, good for one `setPassword`. `accountExists`
 * says whether the address already has an account, so the password screen can say that
 * saving changes its password and signs out its other devices (R-31). It is given only
 * after a right code, to whoever holds the mailbox, which the code's email already tells
 * (`SignInCodeMessage.accountExists`): before the code nothing differs (T-68).
 */
export type CodeProof = {
  readonly proof: string;
  readonly proofExpiresAt: Date;
  readonly accountExists: boolean;
};

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

/**
 * Why a password change changed nothing (T-85, step 2.128). `wrong-password`: the old one
 * is wrong, counted as `confirmPassword`'s guesses are. The `password-*` refusals are the
 * new one's, by `setPassword`'s rule. `no-password`: as for `confirmPassword`.
 */
export type ChangePasswordError =
  | ConfirmPasswordError
  | { readonly code: 'password-too-short' }
  | { readonly code: 'password-too-long' }
  | { readonly code: 'password-leaked' };

/** A changed password: every other session ended, this one kept (T-70, T-85). */
export type PasswordChanged = { readonly endedSessions: number };

/**
 * Why asking to change the email sent nothing (T-73, T-455). The password's refusals are
 * `confirmPassword`'s, counted the same. `same-email`: the account's own address, nothing
 * to change. An address another account holds is never a refusal: it answers as a free one
 * does, with no code sent (T-68).
 */
export type StartEmailChangeError =
  | ConfirmPasswordError
  | { readonly code: 'invalid-email' }
  | { readonly code: 'same-email' }
  | CodeNotSent;

/**
 * Why a code changed nothing. As `verifyCode`'s: `code-expired` also covers no pending
 * change, one asked by another account, and an address taken since it was asked.
 */
export type ConfirmEmailChangeError = VerifyCodeError | SessionError;

/** A changed email: every other session ended, this one kept (T-73, T-70). */
export type EmailChanged = {
  readonly oldEmail: string;
  readonly newEmail: string;
  readonly endedSessions: number;
};

/** Signing out by either token: the access token may have run out; the refresh token is in the cookie. */
export type SignOutInput = { readonly accessToken: string } | { readonly refreshToken: string };

/**
 * Whether the service itself holds an address as proved only once its owner has shown
 * they hold the mailbox (step 2.115). `on`: it does. `off`: it takes an address as
 * proved without that, so anyone could sign up with another person's address by
 * typing it. `unknown`: the service could not be asked, or answered in a shape we do
 * not know, and why, as one of a few fixed kinds. Unknown is never taken as `on`.
 */
export type EmailConfirmation =
  | 'on'
  | 'off'
  | {
      readonly unknown: EmailConfirmationUnknown;
      /**
       * The answer's status number, for `key-refused` and an `unexpected-answer` that
       * had one. Nothing else of the answer is ever kept: never its words, never an
       * address, a key or a token.
       */
      readonly status?: number;
    };

/**
 * Why a service could not say whether it confirms addresses (step 2.115), so that the
 * person starting the app can tell a refused key from a timeout:
 * - `no-answer-in-time`: it did not answer within the time limit;
 * - `no-connection`: it could not be reached, or its answer was cut off;
 * - `key-refused`: it refused the key the app holds (401 or 403);
 * - `setting-missing`: it answered, but not with the setting as a plain yes or no;
 * - `unexpected-answer`: any other answer, such as a redirect, a 404 or a 5xx.
 */
export type EmailConfirmationUnknown =
  | 'no-answer-in-time'
  | 'no-connection'
  | 'key-refused'
  | 'setting-missing'
  | 'unexpected-answer';

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
  /**
   * The signed-in person's own change of password (T-85, step 2.128, T-451): the old one,
   * whose wrong guesses count as for `confirmPassword`, and the new one, by `setPassword`'s
   * rule (judged first as far as the service can without the old one, so a new one too
   * short or, on the stand-in, leaked spends no guess). On success
   * every other session of the account is ended at once and this one stays signed in. A
   * refusal changes nothing. The caller emails the account.
   */
  readonly changePassword: (input: {
    readonly accessToken: string;
    readonly oldPassword: string;
    readonly newPassword: string;
    readonly networkAddress: string;
  }) => Promise<Result<PasswordChanged, ChangePasswordError>>;
  /**
   * The signed-in person asks to move their account to `newEmail` (T-73, step 2.128, T-455):
   * the password first, counted as `confirmPassword`'s guesses, then a code for the new
   * address under every code's limits (T-225). An address the service gives another
   * account, or `takenElsewhere` (the caller's own records do), gets no code and the same
   * answer (T-68). Asking again replaces the pending change. Nothing changes yet; the caller
   * tells the old address.
   */
  readonly startEmailChange: (input: {
    readonly accessToken: string;
    readonly password: string;
    readonly newEmail: string;
    readonly takenElsewhere: boolean;
    readonly networkAddress: string;
  }) => Promise<Result<CodeRequested, StartEmailChangeError>>;
  /**
   * The code from the new address. A right one moves the account's address, ends every
   * other session and keeps this one; a wrong one spends an attempt and counts against the
   * network, as for `verifyCode`. Any refusal changes nothing.
   */
  readonly confirmEmailChange: (input: {
    readonly accessToken: string;
    readonly code: string;
    readonly networkAddress: string;
  }) => Promise<Result<EmailChanged, ConfirmEmailChangeError>>;
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
  /**
   * "Does this service confirm email addresses before a sign-in counts?" (step 2.115).
   * Linking an account made in advance to whoever presents its address
   * (`account_for_sign_in`, record 052) is safe only when it does, so the web app
   * refuses to start on a real service that answers anything but `on`. Never throws:
   * a failure to ask is `unknown`, with its kind. Says nothing about any person.
   */
  readonly emailConfirmation: () => Promise<EmailConfirmation>;
};

/** The one question start-up asks a sign-in service before it serves anyone (step 2.115). */
export type EmailConfirmationQuestion = Pick<SignInService, 'emailConfirmation'>;
