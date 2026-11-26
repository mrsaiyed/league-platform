'use client';
// "Your email" on the account page (T-73, step 2.128, S-129): the new address and the
// current password ask for a code; once asked, a second form takes the code from the new
// address. Nothing changes until a right code. A refusal draws the boxes empty (a password
// or a code is never sent back to the page) and says which box was wrong, beside it. The
// answers show at once with scripts on (a change refreshes the page) and by the server's own
// answer with them off. Words come from the server (T-187); `{email}` is a hole.
import { useActionState } from 'react';
import type { ChangeEmailFormState } from './change-email-state.ts';

type Problem = NonNullable<ChangeEmailFormState['problem']>;

export type ChangeEmailWords = {
  readonly newEmail: string;
  readonly password: string;
  readonly send: string;
  /** Has an `{email}` hole for the address the code went to. */
  readonly sent: string;
  readonly code: string;
  readonly confirm: string;
  /** Has an `{email}` hole for the account's new address. */
  readonly changed: string;
  /** Each problem's words; `tooManyAttempts` has a `{count}` hole for the minutes. */
  readonly problems: Readonly<Record<Problem, string>>;
  readonly tooManyAttemptsOne: string;
};

type Box = 'newEmail' | 'password' | 'code';

export function ChangeEmailForm({
  action,
  initial,
  words,
}: {
  readonly action: (state: ChangeEmailFormState, form: FormData) => Promise<ChangeEmailFormState>;
  readonly initial: ChangeEmailFormState;
  readonly words: ChangeEmailWords;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const fill = (text: string, hole: string, value: string) => text.split(hole).join(value);
  const problem =
    state.problem === null
      ? null
      : state.problem === 'tooManyAttempts'
        ? fill(
            state.waitMinutes === 1 ? words.tooManyAttemptsOne : words.problems.tooManyAttempts,
            '{count}',
            String(state.waitMinutes),
          )
        : words.problems[state.problem];
  const boxProblem = (box: Box) => (state.box === box ? problem : null);
  const general = state.box === null ? problem : null;
  const box = (name: Box, label: string, type: string, autoComplete: string) => (
    <Field
      name={name}
      label={label}
      type={type}
      autoComplete={autoComplete}
      round={state.round}
      problem={boxProblem(name)}
      problemName={state.problem}
    />
  );
  return (
    <div data-change-email="">
      {general === null ? null : (
        <p className="ui-problem" role="alert" data-change-email-problem={state.problem ?? ''}>
          {general}
        </p>
      )}
      {state.changedTo === null ? null : (
        <p role="status" data-change-email-changed="">
          {fill(words.changed, '{email}', state.changedTo)}
        </p>
      )}
      <form action={formAction} className="ui-form" data-change-email-ask="">
        <input type="hidden" name="step" value="ask" />
        {box('newEmail', words.newEmail, 'email', 'email')}
        {box('password', words.password, 'password', 'current-password')}
        <button className="ui-button" data-kind="second" type="submit" disabled={pending}>
          {words.send}
        </button>
      </form>
      {state.sentTo === null ? null : (
        <form action={formAction} className="ui-form" data-change-email-code="">
          <p role="status" data-change-email-sent="">
            {fill(words.sent, '{email}', state.sentTo)}
          </p>
          <input type="hidden" name="step" value="code" />
          {box('code', words.code, 'text', 'one-time-code')}
          <button className="ui-button" data-kind="main" type="submit" disabled={pending}>
            {words.confirm}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  type,
  autoComplete,
  round,
  problem,
  problemName,
}: {
  readonly name: Box;
  readonly label: string;
  readonly type: string;
  readonly autoComplete: string;
  readonly round: number;
  readonly problem: string | null;
  readonly problemName: string | null;
}) {
  const id = `change-email-${name}`;
  return (
    <label className="ui-field">
      <span>{label}</span>
      {problem === null ? null : (
        <span
          className="ui-problem"
          role="alert"
          id={`${id}-problem`}
          data-change-email-problem={problemName ?? ''}
          data-box={name}
        >
          {problem}
        </span>
      )}
      <input
        key={`${name}-${round}`}
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue=""
        required
        {...(name === 'code' ? { inputMode: 'numeric' as const, maxLength: 6 } : {})}
        aria-invalid={problem === null ? undefined : true}
        aria-describedby={problem === null ? undefined : `${id}-problem`}
      />
    </label>
  );
}
