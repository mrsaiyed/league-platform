'use client';
// "Forfeit, postpone or cancel" on a game of the games list (step 2.158; A-5, audit
// findings H9 and M32). Nothing changes on the first tap: each of the three forms only
// asks, and the question names the game ("Cancel Bears at Tigers? Everyone will see it
// as cancelled. …"); only its "Yes" changes the game, and "No" leaves it as it was.
// "Team that forfeits" starts empty and must be chosen. The question and a refusal are
// the answer to a post, drawn from what was posted (T-271, record 067): with scripts on,
// in place; with scripts off, in the page the post answers, at the game's place on the
// list (the form's permalink), the panel open. A change that works sends the browser to
// the list again, where "Saved" is said beside the game. Words come from the server, from
// the message files (T-187).
import { useActionState, useId } from 'react';
import { untouched, type CallOffAct, type CallOffState } from './form-state.ts';
import { useOneSubmit } from './use-one-submit.ts';

export type CallOffTexts = {
  /** The panel's own button: "Forfeit, postpone or cancel". */
  readonly summary: string;
  /** A refusal's sentence, naming the game, with {problem} for why. */
  readonly refusal: string;
  /** Each change's button, its question and its two answers. */
  readonly postpone: { readonly button: string; readonly ask: string };
  readonly cancel: { readonly button: string; readonly ask: string };
  readonly forfeit: {
    readonly button: string;
    readonly label: string;
    /** The empty first choice: "Choose a team". */
    readonly choose: string;
    /** The question, by the team that forfeits. */
    readonly ask: Readonly<Record<string, string>>;
  };
  readonly yes: Readonly<Record<CallOffAct, string>>;
  readonly no: Readonly<Record<CallOffAct, string>>;
};

export type CallOffFormsProps = {
  readonly action: (state: CallOffState, form: FormData) => Promise<CallOffState>;
  /** Where the browser lands with scripts off: the game's place on the list. */
  readonly permalink: string;
  /** The forms' hidden values: league, game, version and the one-time token. */
  readonly hidden: Readonly<Record<string, string>>;
  /** Which changes this person may make to this game. */
  readonly offers: Readonly<Record<CallOffAct, boolean>>;
  /** The game's two teams, as "Team that forfeits" offers them. */
  readonly teams: readonly { readonly value: string; readonly label: string }[];
  readonly texts: CallOffTexts;
};

export function CallOffForms(props: CallOffFormsProps) {
  const { action, permalink, hidden, offers, teams, texts } = props;
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const id = useId();
  const hiddenFields = Object.entries(hidden).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));

  if (state.kind === 'ask') {
    const act = state.act;
    const team = state.typed['forfeitingTeamId'] ?? '';
    const question = act === 'forfeit' ? (texts.forfeit.ask[team] ?? '') : texts[act].ask;
    // The question in the panel, its answers in one row under it: "Yes" first, drawn as
    // the destructive kind (it changes the game for everyone), then "No", outlined, which
    // changes nothing (DESIGN.md section 4, line 22).
    return (
      <div
        // The same panel as the question before a final score (final-score-boxes.tsx).
        className="ui-panel ui-stack"
        role="group"
        aria-labelledby={`${id}-question`}
        data-question=""
        data-call-off-ask={act}
      >
        <p id={`${id}-question`}>
          <strong>{question}</strong>
        </p>
        <div className="staff-buttons">
          <form action={dispatch} onSubmit={onSubmit}>
            {/* "Yes" sends what the asking form held (the game's version as it was read). */}
            {Object.keys(hidden).map((name) => (
              <input
                key={name}
                type="hidden"
                name={name}
                value={state.typed[name] ?? hidden[name] ?? ''}
              />
            ))}
            <input type="hidden" name="act" value={act} />
            <input type="hidden" name="step" value="confirm" />
            <input type="hidden" name="confirmed" value="yes" />
            {act === 'forfeit' ? (
              <input type="hidden" name="forfeitingTeamId" value={team} />
            ) : null}
            <button type="submit" className="ui-button" data-kind="danger">
              {texts.yes[act]}
            </button>
          </form>
          <form action={dispatch} onSubmit={onSubmit}>
            {hiddenFields}
            <input type="hidden" name="act" value={act} />
            <input type="hidden" name="step" value="back" />
            <button type="submit" className="ui-button">
              {texts.no[act]}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const refused = state.kind === 'refused' ? state : undefined;
  const refusedAct = refused?.typed['act'];
  const problemId = `${id}-problem`;
  /** The refusal, beside the form it is about. */
  const problemOf = (act: CallOffAct) =>
    refused === undefined || refusedAct !== act ? null : (
      <p id={problemId} className="ui-field-error" role="alert">
        {texts.refusal.replaceAll('{problem}', refused.said)}
      </p>
    );
  const describedBy = (act: CallOffAct) =>
    refused !== undefined && refusedAct === act ? { 'aria-describedby': problemId } : {};
  const asks = (act: CallOffAct) => (
    <>
      {hiddenFields}
      <input type="hidden" name="act" value={act} />
      <input type="hidden" name="step" value="ask" />
    </>
  );
  const teamWrong = refusedAct === 'forfeit' && refused?.wrong.includes('forfeitingTeamId');
  return (
    <details className="admin-game-other" open={refused !== undefined}>
      <summary>{texts.summary}</summary>
      {offers.forfeit ? (
        <form action={dispatch} onSubmit={onSubmit} className="admin-action">
          {asks('forfeit')}
          <label className="staff-field">
            <span>{texts.forfeit.label}</span>
            <select
              // Drawn afresh with what was picked, so it keeps it through the form's reset.
              key={refusedAct === 'forfeit' ? (refused?.typed['forfeitingTeamId'] ?? '') : ''}
              name="forfeitingTeamId"
              required
              defaultValue={
                refusedAct === 'forfeit' ? (refused?.typed['forfeitingTeamId'] ?? '') : ''
              }
              {...(teamWrong === true ? { 'aria-invalid': true, ...describedBy('forfeit') } : {})}
            >
              {/* Empty to start with: the team is chosen on purpose (step 2.158, H9). */}
              <option value="">{texts.forfeit.choose}</option>
              {teams.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="ui-button" {...describedBy('forfeit')}>
            {texts.forfeit.button}
          </button>
          {problemOf('forfeit')}
        </form>
      ) : null}
      {offers.postpone ? (
        <form action={dispatch} onSubmit={onSubmit} className="admin-action">
          {asks('postpone')}
          <button type="submit" className="ui-button" {...describedBy('postpone')}>
            {texts.postpone.button}
          </button>
          {problemOf('postpone')}
        </form>
      ) : null}
      {offers.cancel ? (
        <form action={dispatch} onSubmit={onSubmit} className="admin-action">
          {asks('cancel')}
          <button type="submit" className="ui-button" data-kind="danger" {...describedBy('cancel')}>
            {texts.cancel.button}
          </button>
          {problemOf('cancel')}
        </form>
      ) : null}
    </details>
  );
}
