'use client';
// The box score screen's "Reopen to correct" (S-7, step 2.154) as the answer to a post
// (T-271, record 067): refused, the reason still holds what was typed, is marked, and the
// sentence beside it says why; reopened, the browser goes to the screen where the result
// is entered again, with "Saved" there. It goes quiet once sent. Words from the server.
import { useActionState, useId } from 'react';
import { untouched, type FormState } from './form-state.ts';
import { useOneSubmit } from './use-one-submit.ts';

export type ReopenFormProps = {
  readonly action: (state: FormState, form: FormData) => Promise<FormState>;
  readonly permalink: string;
  /** The form's hidden values: league, game, version, door, and so on. */
  readonly hidden: Readonly<Record<string, string>>;
  readonly texts: {
    /** Until when this person may reopen it, when there is a limit. */
    readonly until?: string;
    readonly reason: string;
    readonly reopen: string;
  };
};

export function ReopenForm({ action, permalink, hidden, texts }: ReopenFormProps) {
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const problemId = `${useId()}-problem`;
  const refused = state.kind === 'refused' ? state : undefined;
  const wrong = refused?.wrong.includes('reason') === true;
  return (
    <form action={dispatch} onSubmit={onSubmit} className="staff-form" data-reopen-form="">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {texts.until === undefined ? null : <p>{texts.until}</p>}
      <label className="staff-field">
        <span>{texts.reason}</span>
        <input
          type="text"
          name="reason"
          required
          maxLength={1000}
          autoComplete="off"
          defaultValue={refused?.typed['reason'] ?? ''}
          {...(wrong ? { 'aria-invalid': true, 'aria-describedby': problemId } : {})}
        />
      </label>
      {refused === undefined ? null : (
        <p id={problemId} className="ui-field-error" role="alert">
          {refused.said}
        </p>
      )}
      <p className="staff-buttons">
        <button type="submit" className="ui-button" data-kind="main">
          {texts.reopen}
        </button>
      </p>
    </form>
  );
}
