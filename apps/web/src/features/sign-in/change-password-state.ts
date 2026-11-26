// What the change-password form shows after an answer (change-password-form.tsx, step 2.128).
// It never holds a password: a refused change draws both boxes empty again, and `box` says
// which one was wrong. `round` changes with every answer, so the boxes are drawn afresh.
export type ChangePasswordFormState = {
  readonly problem:
    | 'wrongOld'
    | 'noPassword'
    | 'tooShort'
    | 'tooLong'
    | 'leaked'
    | 'tooManyAttempts'
    | null;
  readonly box: 'oldPassword' | 'newPassword' | null;
  /** Minutes to wait, for `tooManyAttempts`. */
  readonly waitMinutes: number;
  readonly saved: boolean;
  readonly round: number;
};

export const changePasswordStart: ChangePasswordFormState = {
  problem: null,
  box: null,
  waitMinutes: 0,
  saved: false,
  round: 0,
};
