'use client';
// "Remove from the league list" on a person's page (step 2.50, A-5): a tick the server
// requires, then the destructive button, alone in its own panel. A refusal (the tick not
// given, the person still on a roster) is the answer to the post itself and is said beside
// the button (T-271, record 067). It goes quiet once sent. Words come from the server.
import { useActionState, useId } from 'react';
import { untouched, type FormState } from '../list-forms/form-state.ts';
import { useOneSubmit } from '../list-forms/use-one-submit.ts';

export function RemoveForm({
  action,
  permalink,
  hidden,
  confirm,
  submit,
}: {
  readonly action: (state: FormState, form: FormData) => Promise<FormState>;
  readonly permalink: string;
  readonly hidden: Readonly<Record<string, string>>;
  readonly confirm: string;
  readonly submit: string;
}) {
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const problemId = `${useId()}-problem`;
  const refused = state.kind === 'refused' ? state : undefined;
  return (
    <form action={dispatch} onSubmit={onSubmit} className="staff-form">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p>
        <label className="staff-check">
          <input type="checkbox" name="confirm" required /> {confirm}
        </label>
      </p>
      {refused === undefined ? null : (
        <p id={problemId} className="ui-field-error" role="alert">
          {refused.said}
        </p>
      )}
      <p className="staff-buttons">
        <button
          type="submit"
          className="ui-button"
          data-kind="danger"
          {...(refused === undefined ? {} : { 'aria-describedby': problemId })}
        >
          {submit}
        </button>
      </p>
    </form>
  );
}
