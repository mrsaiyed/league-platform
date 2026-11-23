'use client';
// "Forfeit, postpone or cancel" on a game of the games list, and "Put it back on its date"
// on a postponed one (step 2.158; A-5, audit findings H9 and M32, S-75). Nothing changes
// on the first tap: each form only asks, naming the game ("Cancel Bears at Tigers?
// Everyone will see it as cancelled. …"); only the question's "Yes" changes it, and "No"
// leaves it as it was. "Team that forfeits" and the reason start empty and must be chosen.
//
// Where the answers stand (the review of 2.158, its one High finding): a double tap must
// never reach "Yes". So the question is drawn without moving anything above or at the
// button just touched: that button's place is taken by "No" (in the same row, at the same
// start), its choice stays where it was (shown, not to be changed), the panel's other
// controls stay where they were (shown, not to be used), and the question and its "Yes"
// come after all of them. Whatever the question's length or the width, the spot just
// touched holds "No" (or the empty end of its row). With scripts on, "Yes" also takes no
// tap for its first half second; and the server takes a "Yes" sent within `askRestMs` of
// the question as a question again (call-off-step.ts), which holds with scripts off too,
// where the browser lands on a page drawn anew.
//
// The question and a refusal are the answer to a post, drawn from what was posted (T-271,
// record 067): with scripts on, in place; with scripts off, in the page the post answers,
// at the game's place on the list (the form's permalink), the panel open. A change that
// works sends the browser to the list again, where "Saved" is said beside the game. Words
// come from the server, from the message files (T-187).
import { useActionState, useEffect, useId, useRef, type FormEvent } from 'react';
import { untouched, type CallOffAct, type CallOffState } from './form-state.ts';
import { useOneSubmit } from './use-one-submit.ts';

/** A change's own choice: the team that forfeits, or why a game is put back. */
export type CallOffChoice = {
  readonly label: string;
  /** The empty first option: "Choose a team", "Choose why". */
  readonly choose: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
};

/** One change's words: its button, its question (by what was chosen, for one with a choice). */
export type CallOffActTexts = {
  readonly button: string;
  readonly ask: string | Readonly<Record<string, string>>;
  readonly yes: string;
  readonly no: string;
  readonly choice?: CallOffChoice;
};

export type CallOffTexts = {
  /** The panel's own button: "Forfeit, postpone or cancel", "Put it back on its date". */
  readonly summary: string;
  /** A refusal's sentence, naming the game, with {problem} for why. */
  readonly refusal: string;
  /** The changes offered, in the order they are drawn. */
  readonly acts: Readonly<Partial<Record<CallOffAct, CallOffActTexts>>>;
};

export type CallOffFormsProps = {
  readonly action: (state: CallOffState, form: FormData) => Promise<CallOffState>;
  /** Where the browser lands with scripts off: the game's place on the list. */
  readonly permalink: string;
  /** The forms' hidden values: league, game, version and the one-time token. */
  readonly hidden: Readonly<Record<string, string>>;
  /** The panel's button drawn as a button (a panel that is the card's one thing to do). */
  readonly summaryButton?: boolean;
  readonly texts: CallOffTexts;
};

/** The changes with a choice of their own, by the field it posts. */
const choiceField: Partial<Record<CallOffAct, string>> = {
  forfeit: 'forfeitingTeamId',
  restore: 'reason',
};

/** "Yes" takes no tap for this long after it is drawn (ms), with scripts on. */
const yesRestMs = 500;

export function CallOffForms(props: CallOffFormsProps) {
  const { action, permalink, hidden, texts } = props;
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const id = useId();
  const drawnAt = useRef(0);
  useEffect(() => {
    drawnAt.current = Date.now();
  }, [state]);
  const asked = state.kind === 'ask' ? state : undefined;
  const refused = state.kind === 'refused' ? state : undefined;
  const refusedAct = refused?.typed['act'];
  const problemId = `${id}-problem`;
  const questionId = `${id}-question`;
  const hiddenFields = Object.entries(hidden).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
  const acts = (Object.keys(texts.acts) as CallOffAct[]).filter(
    (act) => texts.acts[act] !== undefined,
  );
  const withChoice = acts.filter((act) => choiceField[act] !== undefined);
  const buttonsOnly = acts.filter((act) => choiceField[act] === undefined);

  /** The refusal, beside the form it is about. */
  const problemOf = (act: CallOffAct) =>
    refused === undefined || refusedAct !== act ? null : (
      <p id={problemId} className="ui-field-error" role="alert">
        {texts.refusal.replaceAll('{problem}', refused.said)}
      </p>
    );
  const describedBy = (act: CallOffAct) =>
    refused !== undefined && refusedAct === act ? { 'aria-describedby': problemId } : {};

  /**
   * One change's form, in place. While a question is open: the asked one's button is its
   * "No" (step back), the others' controls are shown and not to be used.
   */
  const formOf = (act: CallOffAct) => {
    const words = texts.acts[act];
    if (words === undefined) return null;
    const isAsked = asked?.act === act;
    const waiting = asked !== undefined && !isAsked;
    const field = choiceField[act];
    const picked =
      field === undefined
        ? ''
        : isAsked
          ? (asked?.typed[field] ?? '')
          : refusedAct === act
            ? (refused?.typed[field] ?? '')
            : '';
    const wrong = field !== undefined && refusedAct === act && refused?.wrong.includes(field);
    return (
      <form
        key={act}
        action={dispatch}
        onSubmit={onSubmit}
        // A choice above its button, which starts its own row at every width (so "No" takes
        // its place exactly); the destructive one apart at the far end of its row.
        className={
          field !== undefined ? 'staff-form' : act === 'cancel' ? 'staff-apart' : undefined
        }
        data-call-off-act={act}
      >
        {hiddenFields}
        <input type="hidden" name="act" value={act} />
        <input type="hidden" name="step" value={isAsked ? 'back' : 'ask'} />
        {field === undefined || words.choice === undefined ? null : (
          <label className="staff-field">
            <span>{words.choice.label}</span>
            <select
              // Drawn afresh with what was picked, so it keeps it through the form's reset.
              key={`${asked?.act ?? ''}${picked}`}
              name={field}
              required
              disabled={asked !== undefined}
              defaultValue={picked}
              {...(wrong === true ? { 'aria-invalid': true, ...describedBy(act) } : {})}
            >
              {/* Empty to start with: nothing is chosen for the person (step 2.158, H9). */}
              <option value="">{words.choice.choose}</option>
              {words.choice.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {field === undefined ? (
          buttonOf(act, words, isAsked, waiting)
        ) : (
          <p className="staff-buttons">{buttonOf(act, words, isAsked, waiting)}</p>
        )}
        {problemOf(act)}
      </form>
    );
  };

  /** A form's button: its own, or, while it is asked about, "No" in its very place. */
  const buttonOf = (act: CallOffAct, words: CallOffActTexts, isAsked: boolean, waiting: boolean) =>
    isAsked ? (
      <button type="submit" className="ui-button" aria-describedby={questionId}>
        {words.no}
      </button>
    ) : (
      <button
        type="submit"
        className="ui-button"
        disabled={waiting}
        {...(act === 'cancel' ? { 'data-kind': 'danger' } : {})}
        {...describedBy(act)}
      >
        {words.button}
      </button>
    );

  /** The question and its "Yes", after every control of the panel. */
  const question = () => {
    if (asked === undefined) return null;
    const words = texts.acts[asked.act];
    if (words === undefined) return null;
    const field = choiceField[asked.act];
    const chosen = field === undefined ? '' : (asked.typed[field] ?? '');
    const said = typeof words.ask === 'string' ? words.ask : (words.ask[chosen] ?? '');
    const onYes = (event: FormEvent<HTMLFormElement>) => {
      // The second tap of a double tap, on a "Yes" just drawn: not taken.
      if (Date.now() - drawnAt.current < yesRestMs) {
        event.preventDefault();
        return;
      }
      onSubmit(event);
    };
    return (
      <div
        className="ui-panel ui-stack"
        role="group"
        aria-labelledby={questionId}
        data-question=""
        data-call-off-ask={asked.act}
      >
        <p id={questionId}>
          <strong>{said}</strong>
        </p>
        <form action={dispatch} onSubmit={onYes}>
          {/* "Yes" sends what the asking form held (the game's version as it was read). */}
          {Object.keys(hidden).map((name) => (
            <input
              key={name}
              type="hidden"
              name={name}
              value={asked.typed[name] ?? hidden[name] ?? ''}
            />
          ))}
          <input type="hidden" name="act" value={asked.act} />
          <input type="hidden" name="step" value="confirm" />
          <input type="hidden" name="confirmed" value="yes" />
          <input type="hidden" name="askedAt" value={String(asked.askedAt)} />
          {field === undefined ? null : <input type="hidden" name={field} value={chosen} />}
          <button
            type="submit"
            className="ui-button"
            // Putting a postponement back is no loss: the main kind; the others take away.
            data-kind={asked.act === 'restore' ? 'main' : 'danger'}
          >
            {words.yes}
          </button>
        </form>
      </div>
    );
  };

  return (
    <details
      // A panel behind a quiet button is "the other things to do"; one behind a button of its
      // own (the card's one thing to do) is drawn as "Put this game back" is, its button not
      // stretched across the card.
      className={props.summaryButton === true ? undefined : 'admin-game-other'}
      open={asked !== undefined || refused !== undefined}
      data-call-off=""
    >
      <summary className={props.summaryButton === true ? 'ui-button' : undefined}>
        {texts.summary}
      </summary>
      <div className="ui-stack">
        {withChoice.map(formOf)}
        {buttonsOnly.length === 0 ? null : (
          // The buttons with no choice in one row; "Cancel the game" apart at its far end.
          <div className="staff-buttons">{buttonsOnly.map(formOf)}</div>
        )}
        {question()}
      </div>
    </details>
  );
}
