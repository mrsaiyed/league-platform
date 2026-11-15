'use client';
// A form of the games area with no typed boxes of its own (a forfeit, postpone, cancel):
// it goes quiet once sent, and a refusal is said inside it, beside its button, in the
// response to the post itself (T-271, record 067). A change that works sends the browser
// to the list again, where "Saved" is said beside the game.
import { useActionState, useId, type ReactNode } from 'react';
import { untouched, type FormState } from './form-state.ts';
import { useOneSubmit } from './use-one-submit.ts';

export function ActionForm({
  action,
  permalink,
  className,
  children,
}: {
  readonly action: (state: FormState, form: FormData) => Promise<FormState>;
  /** Where the browser lands with scripts off: the thing's place on the screen. */
  readonly permalink: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const id = useId();
  return (
    <form action={dispatch} onSubmit={onSubmit} className={className}>
      {children}
      {state.kind === 'refused' ? (
        <p id={`${id}-problem`} className="ui-field-error" role="alert">
          {state.said}
        </p>
      ) : null}
    </form>
  );
}
