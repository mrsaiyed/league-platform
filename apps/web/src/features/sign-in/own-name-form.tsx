'use client';
// The person's own first and last name (R-21, step 2.128): the one screen after the account
// is made, and "Your name" on the account page. A refused save keeps what was typed and says
// why; a saved one is drawn at once with scripts on (the action refreshes the page) and by
// the server's own answer with them off. Words come from the server (T-187).
import { useActionState } from 'react';
import type { OwnNameFormState } from './own-name-state.ts';

export type OwnNameWords = {
  readonly firstName: string;
  readonly lastName: string;
  readonly save: string;
  readonly saved: string;
  readonly problems: Readonly<Record<NonNullable<OwnNameFormState['problem']>, string>>;
};

export function OwnNameForm({
  action,
  initial,
  words,
  mark,
}: {
  readonly action: (state: OwnNameFormState, form: FormData) => Promise<OwnNameFormState>;
  readonly initial: OwnNameFormState;
  readonly words: OwnNameWords;
  /** The form's own mark, by which tests find it. */
  readonly mark: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const problem = state.problem === null ? null : words.problems[state.problem];
  return (
    <form action={formAction} className="ui-form" data-own-name={mark}>
      {problem === null ? null : (
        <p className="ui-problem" role="alert" data-own-name-problem={state.problem ?? ''}>
          {problem}
        </p>
      )}
      {state.saved ? (
        <p role="status" data-own-name-saved="">
          {words.saved}
        </p>
      ) : null}
      <label className="ui-field">
        <span>{words.firstName}</span>
        <input
          key={`first-${state.round}`}
          name="firstName"
          autoComplete="given-name"
          defaultValue={state.firstName}
          maxLength={100}
          required
        />
      </label>
      <label className="ui-field">
        <span>{words.lastName}</span>
        <input
          key={`last-${state.round}`}
          name="lastName"
          autoComplete="family-name"
          defaultValue={state.lastName}
          maxLength={100}
          required
        />
      </label>
      <button className="ui-button" data-kind="main" type="submit" disabled={pending}>
        {words.save}
      </button>
    </form>
  );
}
