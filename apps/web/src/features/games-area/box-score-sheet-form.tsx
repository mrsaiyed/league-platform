'use client';
// The box score grid's form (steps 2.64 and 2.155): each team's players and the stats the
// game's rules keep, the two scores, and the save button. A refusal is the answer to the
// post itself, drawn from what was posted (T-271, record 067): every box still holds what
// was typed, the wrong ones are marked, and the sentence sits beside the scores, just
// above the save button, naming the box (or the score, for a tie). With scripts off the
// browser lands there (the form's permalink). It goes quiet once sent. Words come from
// the server, from the message files (T-187).
//
// The browser's own checking is switched off for this form (`noValidate`; step 2.103). On
// a phone one team's grid is shown at a time and the other is put away, and a browser
// that finds a box out of range in the grid put away blocks the save on a box it can
// neither show nor focus: nothing happens and nothing is said. So the server does the
// telling, as it does for a tie: it refuses anything that is not a whole number from 0 to
// the box's limit (box-score-form.ts, which is stricter than every `min`, `max` and `step`
// here), in words, with that team shown and that box marked, and with scripts off too.
// One thing never reaches the server: text a number box cannot read at all ("1-2", "e"),
// which a browser sends as an empty box. With scripts on that is caught here before the
// send and said the same way; with scripts off it is saved as an empty box.
import { useActionState, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { fillScores, sheetScoresId, untouched, type BoxScoreState } from './form-state.ts';
import { ScoreCheck, type ScoreCheckProps } from './score-check.tsx';
import { SavedLine } from './saved-line.tsx';
import type { ScoreField } from './score-fields.ts';
import { useOneSubmit } from './use-one-submit.ts';

/** One box of the grid: its field, the label it is read by, and what is saved in it. */
export type SheetBox = {
  readonly field: string;
  readonly label: string;
  readonly saved: string;
  /** The box as a refusal names it: the column and the player with their number. */
  readonly named?: string;
};

export type SheetRow = {
  readonly personId: string;
  /** "#4 Ada Lionel", as the row's heading. */
  readonly heading: string;
  readonly played: { readonly field: string; readonly label: string; readonly saved: boolean };
  readonly minutes?: SheetBox;
  readonly stats: readonly SheetBox[];
};

export type SheetTeam = {
  readonly teamId: string;
  readonly name: string;
  readonly rows: readonly SheetRow[];
  readonly score: SheetBox & { readonly field: ScoreField };
  /** The sentence for a score that is not a count, naming the team. */
  readonly wrongScore: string;
};

export type SheetTexts = {
  readonly player: string;
  readonly played: string;
  /** The minutes column's heading, when the grid asks for minutes. */
  readonly minutes?: { readonly short: string; readonly full: string };
  readonly columns: readonly {
    readonly key: string;
    readonly short: string;
    readonly full: string;
  }[];
  /** What the choice of team shown on a phone is called. */
  readonly teamShown: string;
  /** What the list of column names above the grids is called. */
  readonly columnsKey: string;
  readonly noPlayers: string;
  readonly scoreHelp: string;
  readonly save: string;
  /** A stat box that is not a count, with {cell} for the box's label. */
  readonly wrongCell: string;
  /** A minutes box that is not whole minutes, with {cell}. */
  readonly wrongMinutes: string;
  /** A tie in a season without ties, with {awayScore} and {homeScore}. */
  readonly tie: string;
};

export type BoxScoreSheetFormProps = {
  readonly action: (state: BoxScoreState, form: FormData) => Promise<BoxScoreState>;
  readonly permalink: string;
  /** The form's hidden values: league, game, version and its one-time token. */
  readonly hidden: Readonly<Record<string, string>>;
  /** Away team first, as on the card. */
  readonly teams: readonly SheetTeam[];
  readonly editable: boolean;
  readonly texts: SheetTexts;
  /** The warning while typing when a score differs from its players' points. */
  readonly check?: ScoreCheckProps;
  /** "Saved", naming the game and its score, said beside the scores after a save. */
  readonly saved?: string;
};

export function BoxScoreSheetForm(props: BoxScoreSheetFormProps) {
  const { teams, texts, editable } = props;
  const [state, dispatch, pending] = useActionState(props.action, untouched, props.permalink);
  const sendOnce = useOneSubmit(pending, state);
  const problemId = `${useId()}-problem`;
  // A box whose text the browser could not read as a number, found as the form was about
  // to be sent; it stands until the server next answers.
  const [unread, setUnread] = useState<{ readonly field: string; readonly under: BoxScoreState }>();
  const unreadField = unread?.under === state ? unread.field : undefined;
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const boxes = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input[type=number]')];
    const bad = boxes.find((box) => box.validity.badInput);
    if (bad === undefined) return sendOnce(event);
    // Nothing is sent: the box would arrive empty and be saved as one.
    event.preventDefault();
    setUnread({ field: bad.name, under: state });
  };
  // After a refusal (scripts on), the first wrong box takes the focus, which brings it into
  // view inside the grid: the sentence beside the scores names it.
  const formRef = useRef<HTMLFormElement>(null);
  const tabsId = useId();
  useEffect(() => {
    const first = unreadField ?? (state.kind === 'refused' ? state.wrong[0] : undefined);
    const box = first === undefined ? null : formRef.current?.elements.namedItem(first);
    if (!(box instanceof HTMLInputElement)) return;
    // On a phone one team's grid is shown at a time: the wrong box's team is shown first.
    const team = box.closest<HTMLElement>('[data-sheet-team]')?.dataset['sheetTeam'];
    const tab =
      team === undefined
        ? null
        : formRef.current?.querySelector<HTMLInputElement>(
            `.admin-sheet-tabs input[value="${team}"]`,
          );
    if (tab !== null && tab !== undefined) tab.checked = true;
    box.focus();
  }, [state, unread, unreadField]);
  const refused = state.kind === 'refused' ? state : undefined;
  const wrong = new Set(unreadField === undefined ? (refused?.wrong ?? []) : [unreadField]);
  const text = (box: SheetBox) =>
    refused === undefined ? box.saved : (refused.typed[box.field] ?? '');
  const marked = (field: string) =>
    wrong.has(field) ? { 'aria-invalid': true, 'aria-describedby': problemId } : {};

  const firstWrong = unreadField ?? refused?.wrong[0];
  const problem = (() => {
    if (unreadField === undefined) {
      if (refused === undefined) return undefined;
      if (refused.code === 'tie-not-allowed' && refused.scores !== undefined) {
        return fillScores(texts.tie, refused.scores);
      }
      if (refused.code !== 'invalid-input') return refused.said;
    }
    if (firstWrong === undefined) return refused?.said;
    for (const team of teams) {
      if (team.score.field === firstWrong) return team.wrongScore;
      for (const row of team.rows) {
        if (row.minutes?.field === firstWrong) {
          return texts.wrongMinutes.replaceAll('{cell}', row.minutes.named ?? row.minutes.label);
        }
        const box = row.stats.find((s) => s.field === firstWrong);
        if (box !== undefined) {
          return texts.wrongCell.replaceAll('{cell}', box.named ?? box.label);
        }
      }
    }
    return refused?.said;
  })();
  // The team whose grid a phone shows first: the one a refusal's first wrong box is in.
  const wrongTeam = teams.findIndex((team) =>
    team.rows.some(
      (row) => row.minutes?.field === firstWrong || row.stats.some((s) => s.field === firstWrong),
    ),
  );
  const shownFirst = Math.max(0, wrongTeam);

  const columns = [...(texts.minutes === undefined ? [] : [texts.minutes]), ...texts.columns];
  return (
    <form
      ref={formRef}
      action={dispatch}
      onSubmit={onSubmit}
      className="admin-sheet-form"
      noValidate
    >
      {Object.entries(props.hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {/* Each short column name spelled out once, above the grids (step 2.103). */}
      {columns.length === 0 ? null : (
        <dl className="admin-sheet-key" aria-label={texts.columnsKey}>
          {columns.map((column) => (
            <div key={column.short}>
              <dt>{column.short}</dt>
              <dd>{column.full}</dd>
            </div>
          ))}
        </dl>
      )}
      {/* On a phone one team's grid is shown at a time: which, is picked here. The choice
          is the screen's own and is no part of what the form sends (it belongs to no form). */}
      {teams.length < 2 ? null : (
        <div className="admin-sheet-tabs" role="radiogroup" aria-label={texts.teamShown}>
          {teams.map((team, index) => (
            <label key={team.teamId}>
              <input
                type="radio"
                name={`${tabsId}-team`}
                form={`${tabsId}-none`}
                value={index}
                defaultChecked={index === shownFirst}
              />
              <span dir="auto">{team.name}</span>
            </label>
          ))}
        </div>
      )}
      {teams.map((team, index) => (
        <section key={team.teamId} className="staff-panel" data-sheet-team={index}>
          <h2 dir="auto">{team.name}</h2>
          {team.rows.length === 0 ? (
            <p className="staff-quiet">{texts.noPlayers}</p>
          ) : (
            <div className="box-score-grid" role="region" aria-label={team.name} tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{texts.player}</th>
                    <th scope="col">{texts.played}</th>
                    {texts.minutes === undefined ? null : (
                      <th scope="col">
                        <abbr title={texts.minutes.full}>{texts.minutes.short}</abbr>
                      </th>
                    )}
                    {texts.columns.map((column) => (
                      <th scope="col" key={column.key}>
                        <abbr title={column.full}>{column.short}</abbr>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {team.rows.map((row) => (
                    <tr key={row.personId}>
                      <th scope="row">{row.heading}</th>
                      <td>
                        <input
                          type="checkbox"
                          name={row.played.field}
                          defaultChecked={
                            refused === undefined
                              ? row.played.saved
                              : refused.typed[row.played.field] !== undefined
                          }
                          disabled={!editable}
                          aria-label={row.played.label}
                        />
                      </td>
                      {row.minutes === undefined ? null : (
                        <td>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={1440}
                            step={1}
                            name={row.minutes.field}
                            defaultValue={text(row.minutes)}
                            disabled={!editable}
                            aria-label={row.minutes.label}
                            {...marked(row.minutes.field)}
                          />
                        </td>
                      )}
                      {row.stats.map((box) => (
                        <td key={box.field}>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={999}
                            step={1}
                            name={box.field}
                            defaultValue={text(box)}
                            disabled={!editable}
                            aria-label={box.label}
                            {...marked(box.field)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      <fieldset id={sheetScoresId} className="staff-panel admin-sheet-scores">
        {/* Each team's label above its own box, at every width (step 2.103): beside the
            boxes, the second box wrapped under the first team's label on a phone. */}
        <div className="staff-scores">
          {teams.map((team) => (
            <label key={team.score.field} className="staff-field" data-size="figure">
              <span>{team.score.label}</span>
              <input
                type="number"
                name={team.score.field}
                inputMode="numeric"
                min={0}
                max={999}
                step={1}
                defaultValue={text(team.score)}
                disabled={!editable}
                {...marked(team.score.field)}
              />
            </label>
          ))}
        </div>
        {editable ? <p className="staff-quiet">{texts.scoreHelp}</p> : null}
        {editable && props.check !== undefined ? <ScoreCheck {...props.check} /> : null}
        {problem === undefined ? null : (
          <p id={problemId} className="ui-field-error" role="alert">
            {problem}
          </p>
        )}
        {props.saved === undefined ? null : <SavedLine text={props.saved} />}
      </fieldset>
      {editable ? (
        <p className="staff-buttons">
          <button type="submit" className="ui-button" data-kind="main">
            {texts.save}
          </button>
        </p>
      ) : null}
    </form>
  );
}
