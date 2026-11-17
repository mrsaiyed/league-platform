'use client';
// A form of the games area with no typed boxes ("Put this game back", step 2.158): behind
// its own button (a panel that opens), its hidden values, one choice that starts empty and
// must be made, and its button. It goes quiet once sent, and a refusal is said inside it,
// beside its button, naming the game, in the response to the post itself (T-271, record
// 067): the panel stays open, the choice still holds what was picked (and is marked when
// it is what was wrong), and the sentence is what the button and the choice are described
// by. A change that works sends the browser to the list again, where "Saved" is said
// beside the game. Words come from the server, from the message files (T-187).
import { useActionState, useId } from 'react';
import { untouched, type FormState } from './form-state.ts';
import { useOneSubmit } from './use-one-submit.ts';

export type ActionChoice = {
  readonly name: string;
  readonly label: string;
  /** The empty first option ("Choose why"): nothing is chosen for the person. */
  readonly choose: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
};

export function ActionForm({
  action,
  permalink,
  hidden,
  summary,
  choice,
  button,
  refusal,
}: {
  readonly action: (state: FormState, form: FormData) => Promise<FormState>;
  /** Where the browser lands with scripts off: the thing's place on the screen. */
  readonly permalink: string;
  /** The form's hidden values: league, game, version and its one-time token. */
  readonly hidden: Readonly<Record<string, string>>;
  /** The button that opens the form's panel. */
  readonly summary: string;
  readonly choice: ActionChoice;
  readonly button: string;
  /** A refusal's sentence, naming the game, with {problem} for why. */
  readonly refusal: string;
}) {
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const problemId = `${useId()}-problem`;
  const refused = state.kind === 'refused' ? state : undefined;
  const describedBy = refused === undefined ? {} : { 'aria-describedby': problemId };
  const picked = refused?.typed[choice.name] ?? '';
  return (
    <details open={refused !== undefined} data-action-form="">
      <summary className="ui-button">{summary}</summary>
      <form action={dispatch} onSubmit={onSubmit} className="admin-action">
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label className="staff-field">
          <span>{choice.label}</span>
          <select
            // React takes a select's defaultValue only as it is first drawn: drawn afresh
            // with what was picked, it keeps it through the form's reset after the answer.
            key={picked}
            name={choice.name}
            required
            defaultValue={picked}
            {...(refused?.wrong.includes(choice.name) === true
              ? { 'aria-invalid': true, ...describedBy }
              : {})}
          >
            <option value="">{choice.choose}</option>
            {choice.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="ui-button" data-kind="main" {...describedBy}>
          {button}
        </button>
        {refused === undefined ? null : (
          <p id={problemId} className="ui-field-error" role="alert">
            {refusal.replaceAll('{problem}', refused.said)}
          </p>
        )}
      </form>
    </details>
  );
}
