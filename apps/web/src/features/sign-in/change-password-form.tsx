'use client';
// "Your password" on the account page (T-85, step 2.128): the current password and a new
// one. A refused change draws both boxes empty (a password is never sent back to the page)
// and says which box was wrong, beside it; a change is said at once with scripts on (the
// action refreshes the page, so the devices list shows the others gone) and by the
// server's own answer with them off. Words come from the server (T-187).
import { useActionState } from 'react';
import type { ChangePasswordFormState } from './change-password-state.ts';

export type ChangePasswordWords = {
  readonly oldPassword: string;
  readonly newPassword: string;
  readonly newHelp: string;
  readonly save: string;
  readonly saved: string;
  /** Each problem's words; `tooManyAttempts` has a `{count}` hole for the minutes. */
  readonly problems: Readonly<Record<NonNullable<ChangePasswordFormState['problem']>, string>>;
  readonly tooManyAttemptsOne: string;
};

export function ChangePasswordForm({
  action,
  initial,
  words,
}: {
  readonly action: (
    state: ChangePasswordFormState,
    form: FormData,
  ) => Promise<ChangePasswordFormState>;
  readonly initial: ChangePasswordFormState;
  readonly words: ChangePasswordWords;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const problem =
    state.problem === null
      ? null
      : state.problem === 'tooManyAttempts'
        ? (state.waitMinutes === 1 ? words.tooManyAttemptsOne : words.problems.tooManyAttempts)
            .split('{count}')
            .join(String(state.waitMinutes))
        : words.problems[state.problem];
  const boxProblem = (box: 'oldPassword' | 'newPassword') =>
    state.box === box && problem !== null ? problem : null;
  const general = state.box === null ? problem : null;
  return (
    <form action={formAction} className="ui-form" data-change-password="">
      {general === null ? null : (
        <p className="ui-problem" role="alert" data-change-password-problem={state.problem ?? ''}>
          {general}
        </p>
      )}
      {state.saved ? (
        <p role="status" data-change-password-saved="">
          {words.saved}
        </p>
      ) : null}
      <PasswordBox
        name="oldPassword"
        label={words.oldPassword}
        autoComplete="current-password"
        round={state.round}
        problem={boxProblem('oldPassword')}
        problemName={state.problem}
      />
      <PasswordBox
        name="newPassword"
        label={words.newPassword}
        help={words.newHelp}
        autoComplete="new-password"
        round={state.round}
        problem={boxProblem('newPassword')}
        problemName={state.problem}
      />
      <button className="ui-button" data-kind="main" type="submit" disabled={pending}>
        {words.save}
      </button>
    </form>
  );
}

function PasswordBox({
  name,
  label,
  help,
  autoComplete,
  round,
  problem,
  problemName,
}: {
  readonly name: 'oldPassword' | 'newPassword';
  readonly label: string;
  readonly help?: string;
  readonly autoComplete: string;
  readonly round: number;
  readonly problem: string | null;
  readonly problemName: string | null;
}) {
  const id = `change-password-${name}`;
  const described = [
    help === undefined ? null : `${id}-help`,
    problem === null ? null : `${id}-problem`,
  ]
    .filter((part) => part !== null)
    .join(' ');
  return (
    <label className="ui-field">
      <span>{label}</span>
      {help === undefined ? null : <small id={`${id}-help`}>{help}</small>}
      {problem === null ? null : (
        <span
          className="ui-problem"
          role="alert"
          id={`${id}-problem`}
          data-change-password-problem={problemName ?? ''}
          data-box={name}
        >
          {problem}
        </span>
      )}
      <input
        key={`${name}-${round}`}
        id={id}
        name={name}
        type="password"
        autoComplete={autoComplete}
        defaultValue=""
        required
        aria-invalid={problem === null ? undefined : true}
        aria-describedby={described === '' ? undefined : described}
      />
    </label>
  );
}
