// What every command returns (T-23): a typed result, or a typed expected error the
// caller can show ("someone else changed this"). Unexpected failures are thrown.

/** An expected error. `code` is a fixed word, never text built from the input. */
export type CommandError = { readonly code: string };

/** The input did not match the command's schema. Paths and Zod codes only, no values. */
export type InvalidInput = {
  readonly code: 'invalid-input';
  readonly issues: readonly { readonly path: string; readonly problem: string }[];
};

/** The acting account may not run this command in this league (T-74). */
export type NotAllowed = { readonly code: 'not-allowed' };

export type Result<Value, Err extends CommandError> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: Err };

export const ok = <Value>(value: Value): { readonly ok: true; readonly value: Value } => ({
  ok: true,
  value,
});

export const fail = <Err extends CommandError>(
  error: Err,
): { readonly ok: false; readonly error: Err } => ({ ok: false, error });
