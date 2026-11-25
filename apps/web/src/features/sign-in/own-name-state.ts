// What the own-name form shows after an answer (own-name-form.tsx, step 2.128): the names as
// typed or saved, and what was refused. `round` changes with every answer, so the fields
// are drawn again with what the answer holds.
export type OwnNameFormState = {
  readonly firstName: string;
  readonly lastName: string;
  readonly problem: 'invalid' | 'alreadyNamed' | 'noNameYet' | null;
  readonly saved: boolean;
  readonly round: number;
};
