// What the change-email form shows after an answer (change-email-form.tsx, step 2.128). It
// never holds a password nor a code: a refusal draws the boxes empty again. `sentTo` is the
// address a code was asked for (the person typed it), so the code box shows; `changedTo` the
// address the account now has. `round` changes with every answer, so boxes are drawn afresh.
export type ChangeEmailFormState = {
  readonly sentTo: string | null;
  readonly changedTo: string | null;
  readonly problem:
    | 'wrongPassword'
    | 'noPassword'
    | 'invalid'
    | 'same'
    | 'notSent'
    | 'tooManyAttempts'
    | 'codeWrong'
    | 'codeExpired'
    | null;
  readonly box: 'newEmail' | 'password' | 'code' | null;
  /** Minutes to wait, for `tooManyAttempts`. */
  readonly waitMinutes: number;
  readonly round: number;
};

export const changeEmailStart: ChangeEmailFormState = {
  sentTo: null,
  changedTo: null,
  problem: null,
  box: null,
  waitMinutes: 0,
  round: 0,
};
