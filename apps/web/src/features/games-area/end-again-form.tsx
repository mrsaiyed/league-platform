'use client';
// "End the game again" on a reopened tracked game (step 2.65 fix round, T-407): one button
// with the game's hidden values, on the game's page and on its grid. It ends the game with
// the scoring screen's own end (endTrackedGameAgainAction); a refusal is said beside the
// button, with the way to load the page again when the game changed meanwhile. Words come
// from the server, from the message files (T-187).
import { useActionState } from 'react';
import { untouched, type FormState } from './form-state.ts';
import { useOneSubmit } from '../list-forms/use-one-submit.ts';

export function EndAgainForm({
  action,
  permalink,
  hidden,
  texts,
}: {
  readonly action: (state: FormState, form: FormData) => Promise<FormState>;
  /** Where the browser lands with scripts off, and the page loaded again. */
  readonly permalink: string;
  /** League, game, the grid's `sequence` and the one-time token. */
  readonly hidden: Readonly<Record<string, string>>;
  readonly texts: { readonly help: string; readonly button: string; readonly reload: string };
}) {
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const refused = state.kind === 'refused' ? state : undefined;
  return (
    <form action={dispatch} onSubmit={onSubmit} className="admin-action" data-end-again="">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p>{texts.help}</p>
      <button type="submit" className="ui-button">
        {texts.button}
      </button>
      {refused === undefined ? null : (
        <div className="ui-field-error" role="alert" data-end-again-problem={refused.code}>
          <p>{refused.said}</p>
          {refused.code === 'changed-since-read' || refused.code === 'gone' ? (
            <p>
              <a className="ui-more" href={permalink}>
                {texts.reload}
              </a>
            </p>
          ) : null}
        </div>
      )}
    </form>
  );
}
