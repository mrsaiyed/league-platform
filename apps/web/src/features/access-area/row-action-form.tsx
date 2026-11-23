'use client';
// A button on one line of the Admins page (step 2.97): "Send again" and "Cancel invitation"
// on an invitation, "Remove access" on a person's role, which asks first: its box must be
// ticked, and the server refuses it unticked too. A refusal is said beside the button, in
// the answer to the post itself (T-271, record 067); a change that works draws the page
// again with its notice. It goes quiet once sent, and works with no script in the page.
import { useActionState, useId } from 'react';
import { untouched, type FormState } from '../games-area/form-state.ts';
import { useOneSubmit } from '../games-area/use-one-submit.ts';

export function RowActionForm({
  action,
  permalink,
  hidden,
  button,
  kind,
  confirm,
  name,
}: {
  readonly action: (state: FormState, form: FormData) => Promise<FormState>;
  readonly permalink: string;
  /** League, the thing's id and the form's one-time token. */
  readonly hidden: Readonly<Record<string, string>>;
  readonly button: string;
  /** `danger` for a button that takes access away; `quiet` for one that only withdraws. */
  readonly kind?: 'danger' | 'quiet';
  /** The box to tick first, for a change that asks. */
  readonly confirm?: string;
  /** What the button is found by in tests and pictures: `data-action`. */
  readonly name: string;
}) {
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const problemId = `${useId()}-problem`;
  const refused = state.kind === 'refused' ? state : undefined;
  const describedBy = refused === undefined ? {} : { 'aria-describedby': problemId };
  return (
    <form action={dispatch} onSubmit={onSubmit} className="admin-action" data-action={name}>
      {Object.entries(hidden).map(([field, value]) => (
        <input key={field} type="hidden" name={field} value={value} />
      ))}
      {confirm === undefined ? null : (
        <p>
          <label className="staff-check">
            <input
              type="checkbox"
              name="confirm"
              value="yes"
              required
              {...(refused?.wrong.includes('confirm') === true
                ? { 'aria-invalid': true as const, ...describedBy }
                : {})}
            />{' '}
            {confirm}
          </label>
        </p>
      )}
      <button type="submit" className="ui-button" data-kind={kind} {...describedBy}>
        {button}
      </button>
      {refused === undefined ? null : (
        <p id={problemId} className="ui-field-error" role="alert">
          {refused.said}
        </p>
      )}
    </form>
  );
}
