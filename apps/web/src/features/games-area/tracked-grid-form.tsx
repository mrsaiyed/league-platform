'use client';
// The "edit box score" grid of a live-tracked game (step 2.65, T6 §8, T-122): each team's
// players with the counts the tracker keeps, typed over, and one save. Minutes and points
// come from the plays and are shown, never typed. A refusal is the answer to the post
// itself, drawn from what was posted (T-271, record 067): every box still holds what was
// typed, a box the refusal is about is marked and its sentence sits beside it; any other
// sentence sits at the top, above the grids. Words come from the server (T-187).
// Like the box score's own grid, the boxes are text boxes the server checks (step 2.103).
import { useActionState, useEffect, useId, useRef } from 'react';
import { untouched, type FormState } from './form-state.ts';
import { useOneSubmit } from './use-one-submit.ts';

export type TrackedGridBox = {
  readonly field: string;
  /** "Fouls for #4 Ada Lionel": the box's label, and its name in a refusal. */
  readonly label: string;
  readonly saved: string;
};

export type TrackedGridRowView = {
  readonly personId: string;
  readonly heading: string;
  readonly minutes: string;
  readonly points: string;
  readonly boxes: readonly TrackedGridBox[];
};

export type TrackedGridTeam = {
  readonly teamId: string;
  readonly name: string;
  readonly rows: readonly TrackedGridRowView[];
};

export type TrackedGridTexts = {
  readonly player: string;
  readonly minutes: { readonly short: string; readonly full: string };
  readonly points: { readonly short: string; readonly full: string };
  readonly columns: readonly { readonly short: string; readonly full: string }[];
  readonly noPlayers: string;
  readonly save: string;
  /** "Load it again": the way to a fresh grid after someone else changed the game. */
  readonly reload: string;
};

export type TrackedGridFormProps = {
  readonly action: (state: FormState, form: FormData) => Promise<FormState>;
  readonly permalink: string;
  /** League, game, the read's sequence and the form's one-time token. */
  readonly hidden: Readonly<Record<string, string>>;
  readonly teams: readonly TrackedGridTeam[];
  readonly texts: TrackedGridTexts;
};

export function TrackedGridForm(props: TrackedGridFormProps) {
  const { teams, texts } = props;
  const [state, dispatch, pending] = useActionState(props.action, untouched, props.permalink);
  const sendOnce = useOneSubmit(pending, state);
  const problemId = `${useId()}-problem`;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const first = state.kind === 'refused' ? state.wrong[0] : undefined;
    const box = first === undefined ? null : formRef.current?.elements.namedItem(first);
    if (box instanceof HTMLInputElement) box.focus();
  }, [state]);
  const refused = state.kind === 'refused' ? state : undefined;
  const wrong = new Set(refused?.wrong ?? []);
  const boxes = teams.flatMap((team) => team.rows.flatMap((row) => row.boxes));
  const firstWrong = boxes.find((box) => wrong.has(box.field));
  // A sentence about a box goes beside that box; any other at the top.
  const atTop = refused !== undefined && firstWrong === undefined ? refused.said : undefined;
  const columns = [texts.minutes, texts.points, ...texts.columns];
  return (
    <form
      ref={formRef}
      action={dispatch}
      onSubmit={sendOnce}
      className="admin-sheet-form"
      data-tracked-grid=""
      noValidate
    >
      {Object.entries(props.hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {atTop === undefined ? null : (
        <div className="ui-field-error" role="alert" data-grid-problem={refused?.code}>
          <p>{atTop}</p>
          {refused?.code === 'changed-since-read' || refused?.code === 'gone' ? (
            <p>
              <a className="ui-more" href={props.permalink}>
                {texts.reload}
              </a>
            </p>
          ) : null}
        </div>
      )}
      <dl className="admin-sheet-key">
        {columns.map((column) => (
          <div key={column.short}>
            <dt>{column.short}</dt>
            <dd>{column.full}</dd>
          </div>
        ))}
      </dl>
      {teams.map((team) => (
        <section key={team.teamId} className="staff-panel">
          <h2 dir="auto">{team.name}</h2>
          {team.rows.length === 0 ? (
            <p className="staff-quiet">{texts.noPlayers}</p>
          ) : (
            <div className="ui-table-frame box-score-frame">
              <div
                className="ui-table-wrap box-score-grid"
                role="region"
                aria-label={team.name}
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{texts.player}</th>
                      {columns.map((column) => (
                        <th scope="col" key={column.short}>
                          <abbr title={column.full}>{column.short}</abbr>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {team.rows.map((row) => (
                      <tr key={row.personId}>
                        <th scope="row">{row.heading}</th>
                        <td>{row.minutes}</td>
                        <td>{row.points}</td>
                        {row.boxes.map((box) => {
                          const marked = wrong.has(box.field);
                          const value =
                            refused === undefined ? box.saved : (refused.typed[box.field] ?? '');
                          return (
                            <td key={box.field}>
                              <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                name={box.field}
                                defaultValue={value}
                                aria-label={box.label}
                                {...(marked
                                  ? { 'aria-invalid': true, 'aria-describedby': problemId }
                                  : {})}
                              />
                              {marked && box === firstWrong && refused !== undefined ? (
                                <span
                                  id={problemId}
                                  className="ui-field-error"
                                  role="alert"
                                  data-grid-problem={refused.code}
                                >
                                  {refused.said.replaceAll('{cell}', box.label)}
                                </span>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ))}
      <p className="staff-buttons">
        <button type="submit" className="ui-button" data-kind="main">
          {texts.save}
        </button>
      </p>
    </form>
  );
}
