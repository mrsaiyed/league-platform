'use client';
// "Show as" on a person's record (step 2.146, R-23): the three choices and the reason,
// always one of a fixed list (the activity log keeps no typed words), then save. The
// command decides whether the change may be made (R-25, R-26); a refusal is the answer to
// the post itself and is said beside the button (T-271, record 067). Words come from the
// server (T-187).
import { useActionState, useId } from 'react';
import { untouched, type FormState } from '../list-forms/form-state.ts';
import { useOneSubmit } from '../list-forms/use-one-submit.ts';

export type NameRequestFormWords = {
  readonly showAs: string;
  readonly choices: readonly { readonly value: string; readonly label: string }[];
  readonly reason: string;
  readonly chooseReason: string;
  readonly reasons: readonly { readonly value: string; readonly label: string }[];
  readonly submit: string;
};

export function NameRequestForm({
  action,
  permalink,
  hidden,
  current,
  saved,
  words,
}: {
  readonly action: (state: FormState, form: FormData) => Promise<FormState>;
  readonly permalink: string;
  readonly hidden: Readonly<Record<string, string>>;
  /** The request kept now: the choice the form starts on. */
  readonly current: string;
  /** "Saved", once, after a save of this form. */
  readonly saved?: string | undefined;
  readonly words: NameRequestFormWords;
}) {
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const id = useId();
  const problemId = `${id}-problem`;
  const refused = state.kind === 'refused' ? state : undefined;
  const typed = refused?.typed;
  return (
    <form action={dispatch} onSubmit={onSubmit} className="staff-form" data-show-as-form="true">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className="staff-field">
        <span>{words.showAs}</span>
        <select name="showAs" defaultValue={typed?.['showAs'] ?? current}>
          {words.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      <label className="staff-field">
        <span>{words.reason}</span>
        {/* It starts on no reason, and the form is not sent until one is chosen (R-23). */}
        <select name="reason" required defaultValue={typed?.['reason'] ?? ''}>
          <option value="" disabled>
            {words.chooseReason}
          </option>
          {words.reasons.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </select>
      </label>
      {refused === undefined ? null : (
        <p id={problemId} className="ui-field-error" role="alert">
          {refused.said}
        </p>
      )}
      {refused === undefined && saved !== undefined ? <p role="status">{saved}</p> : null}
      <p className="staff-buttons">
        <button
          type="submit"
          className="ui-button"
          {...(refused === undefined ? {} : { 'aria-describedby': problemId })}
        >
          {words.submit}
        </button>
      </p>
    </form>
  );
}
