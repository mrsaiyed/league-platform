// The numbers behind "a few" (T-67, T-85, T-225, record 013), shared by every
// adapter of the sign-in interface so the local stand-in and the Supabase adapter
// count the same way. The Supabase project itself is set to match (record 018).

export type AttemptLimits = {
  /** Failures older than this are forgotten. */
  readonly windowMinutes: number;
  /** From this many failures in the window, each new try waits `slowSeconds` after the last failure. */
  readonly slowAfter: number;
  readonly slowSeconds: number;
  /** At this many failures in the window, the key is locked for `lockMinutes`. */
  readonly lockAfter: number;
  readonly lockMinutes: number;
};

export type SignInSettings = {
  /** T-67: a code is valid 10 minutes. */
  readonly codeValidMinutes: number;
  /** T-67: a few attempts per code. */
  readonly attemptsPerCode: number;
  /** T-67: a few codes per hour per address (sign-up and reset together). */
  readonly codesPerHour: number;
  /** T-225: codes asked for from one network in an hour, whatever the addresses. */
  readonly codesPerHourPerNetwork: number;
  /** How long the proof from a right code stays good for setting the password. */
  readonly proofValidMinutes: number;
  /** T-85: wrong passwords per address typed. */
  readonly guessesPerEmail: AttemptLimits;
  /** T-85, T-225: wrong passwords and wrong codes per network. */
  readonly guessesPerNetwork: AttemptLimits;
};

export const signInDefaults: SignInSettings = {
  codeValidMinutes: 10,
  attemptsPerCode: 5,
  codesPerHour: 5,
  codesPerHourPerNetwork: 30,
  proofValidMinutes: 15,
  guessesPerEmail: {
    windowMinutes: 15,
    slowAfter: 5,
    slowSeconds: 30,
    lockAfter: 10,
    lockMinutes: 15,
  },
  guessesPerNetwork: {
    windowMinutes: 15,
    slowAfter: 30,
    slowSeconds: 5,
    lockAfter: 100,
    lockMinutes: 15,
  },
};
