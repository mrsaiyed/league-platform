'use client';
// A game's final score on the games list (steps 2.154 and 2.155): the score boxes behind
// "Enter the final score", the question before it is saved, and a refusal beside the
// boxes. Each is the answer to a post, drawn from what was posted (T-271, record 067):
// with scripts on, in place; with scripts off, in the page the post answers, at the
// game's place on the list (the form's permalink). So after a refusal, or after "No,
// change the score", both boxes still hold what was typed, the wrong one is marked and
// the sentence beside it names it. A score that is saved sends the browser to the list
// again, where "Saved" is said beside the game (games-page.tsx). Words come from the
// server, from the message files (T-187).
import { useActionState, useId } from 'react';
import { fillScores, untouched, type FinalScoreState } from './form-state.ts';
import { scoreFields, type ScoreField } from './score-fields.ts';
import { useOneSubmit } from './use-one-submit.ts';

export type FinalScoreTexts = {
  readonly enterFinal: string;
  readonly save: string;
  /** "Score for Tigers", by box. */
  readonly labels: Readonly<Record<ScoreField, string>>;
  /** The question, with {awayScore} and {homeScore} for the score typed. */
  readonly ask: string;
  readonly yes: string;
  readonly no: string;
  /** A box that is not a whole number from 0 to 999, naming its team, by box. */
  readonly wrongBox: Readonly<Record<ScoreField, string>>;
  /** A tie in a season without ties, with {awayScore} and {homeScore}. */
  readonly tie: string;
};

export type FinalScoreBoxesProps = {
  readonly action: (state: FinalScoreState, form: FormData) => Promise<FinalScoreState>;
  /** The route's league value, which finds the page again (the gate checks it). */
  readonly league: string;
  readonly gameId: string;
  readonly version: number;
  /** This drawing of the form's one-time token (server/same-request.ts). */
  readonly token: string;
  /** Open to start with: the game was just reopened to correct it. */
  readonly open: boolean;
  /** The game's place on the list, where the browser lands with scripts off. */
  readonly permalink: string;
  readonly texts: FinalScoreTexts;
};

export function FinalScoreBoxes(props: FinalScoreBoxesProps) {
  const { action, league, gameId, token, texts, permalink } = props;
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const id = useId();
  const common = (
    <>
      <input type="hidden" name="league" value={league} />
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="requestToken" value={token} />
    </>
  );

  if (state.kind === 'ask') {
    const scores = { home: state.homeScore, away: state.awayScore };
    const typed = (
      <>
        <input type="hidden" name="homeScore" value={state.homeScore} />
        <input type="hidden" name="awayScore" value={state.awayScore} />
      </>
    );
    return (
      <div
        className="ui-panel ui-stack"
        role="group"
        aria-labelledby={`${id}-question`}
        data-question=""
      >
        <p id={`${id}-question`}>
          <strong>{fillScores(texts.ask, scores)}</strong>
        </p>
        <form action={dispatch} onSubmit={onSubmit}>
          {common}
          {typed}
          <input type="hidden" name="version" value={state.version} />
          <input type="hidden" name="step" value="confirm" />
          <input type="hidden" name="confirmed" value="yes" />
          <button type="submit" className="ui-button" data-kind="main">
            {texts.yes}
          </button>
        </form>
        <form action={dispatch} onSubmit={onSubmit}>
          {common}
          {typed}
          <input type="hidden" name="step" value="change" />
          <button type="submit" className="ui-button">
            {texts.no}
          </button>
        </form>
      </div>
    );
  }

  const typed = state.kind === 'refused' || state.kind === 'enter' ? state.typed : undefined;
  const wrong = state.kind === 'refused' ? state.wrong : [];
  const problemId = `${id}-problem`;
  const problem =
    state.kind !== 'refused'
      ? undefined
      : state.code === 'tie-not-allowed'
        ? fillScores(texts.tie, {
            home: state.typed['homeScore'] ?? '',
            away: state.typed['awayScore'] ?? '',
          })
        : state.code === 'invalid-input' && scoreFields.some((f) => wrong.includes(f))
          ? texts.wrongBox[scoreFields.find((f) => wrong.includes(f)) ?? 'awayScore']
          : state.said;
  return (
    <details open={props.open || typed !== undefined} data-score-boxes="">
      <summary className="ui-button">{texts.enterFinal}</summary>
      <form action={dispatch} onSubmit={onSubmit} className="ui-panel ui-stack">
        {common}
        <input type="hidden" name="version" value={props.version} />
        <input type="hidden" name="step" value="ask" />
        {scoreFields.map((name) => (
          <label key={name} className="ui-stack">
            <span>{texts.labels[name]}</span>
            <input
              type="number"
              name={name}
              inputMode="numeric"
              min={0}
              max={999}
              step={1}
              required
              defaultValue={typed?.[name] ?? ''}
              {...(wrong.includes(name)
                ? { 'aria-invalid': true, 'aria-describedby': problemId }
                : {})}
            />
          </label>
        ))}
        {problem === undefined ? null : (
          <p id={problemId} className="ui-field-error" role="alert">
            {problem}
          </p>
        )}
        <p>
          <button type="submit" className="ui-button" data-kind="main">
            {texts.save}
          </button>
        </p>
      </form>
    </details>
  );
}
