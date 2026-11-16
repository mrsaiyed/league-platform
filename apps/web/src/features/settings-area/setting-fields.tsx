// The League settings form, drawn from the settings' own declarations (step 2.48, T-98).
// Each row is a LeagueSettingRow (core's listLeagueSettings): nothing about any setting
// is written here. The words come from the message files by the setting's label key and,
// for a list of choices, `setting.<key>.option.<choice>` (T-187); the page may add
// sentences around them (privacy-notes.ts, record 065). The words are given as
// a function so a test can draw a setting that has no words of its own.
import type { LeagueSettingRow } from '@srleagues/core';
import { saveSettingAction } from './actions.ts';
import { clearIntent, tickValue } from './form-input.ts';
import type { Line, SettingNotes } from './privacy-notes.ts';

export type Say = (key: string, params?: Readonly<Record<string, string | number>>) => string;

const wordsOf = (row: LeagueSettingRow) => row.label.replace(/\.label$/, '');
const optionKey = (row: LeagueSettingRow, choice: string) => `${wordsOf(row)}.option.${choice}`;

/** The first part of a setting's key: the group it is shown under. */
export const areaOf = (key: string): string => key.slice(0, Math.max(0, key.indexOf('.')));

/** The rows in order, in runs of the same area. */
function byArea(rows: readonly LeagueSettingRow[]) {
  const groups: { area: string; rows: LeagueSettingRow[] }[] = [];
  for (const row of rows) {
    const area = areaOf(row.key);
    const last = groups.at(-1);
    if (last?.area === area) last.rows.push(row);
    else groups.push({ area, rows: [row] });
  }
  return groups;
}

/** The box to tick before a value that asks to be confirmed is saved (R-14). */
function Confirm({ row, say }: { readonly row: LeagueSettingRow; readonly say: Say }) {
  if (row.confirm.length === 0 || drawnAsTick(row)) return null;
  const choices = row.confirm.map((value) => valueText(row, value, say)).join(', ');
  return (
    <div className="settings-confirm">
      <p className="ui-field-help">{say('adminSettings.confirmNote', { choice: choices })}</p>
      <p>
        <label className="staff-check">
          <input type="checkbox" name="confirmed" value="yes" /> {say(`${wordsOf(row)}.confirm`)}
        </label>
      </p>
    </div>
  );
}

/** A value in words, as the screen shows a default. */
export function valueText(row: LeagueSettingRow, value: unknown, say: Say): string {
  const { field } = row;
  if (field.kind === 'choice' && typeof value === 'string') return say(optionKey(row, value));
  if (field.kind === 'toggle')
    return say(value === true ? 'adminSettings.yes' : 'adminSettings.no');
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : JSON.stringify(value);
}

/** What the setting accepts, in words, from its limits. */
export function limitsText(row: LeagueSettingRow, say: Say): string {
  const { field } = row;
  switch (field.kind) {
    case 'number':
      return say(field.whole ? 'adminSettings.limits.whole' : 'adminSettings.limits.number', {
        min: field.min,
        max: field.max,
      });
    case 'text':
      return say('adminSettings.limits.text', { max: field.maxLength });
    case 'choice':
      return say('adminSettings.limits.choice');
    case 'toggle':
      return say('adminSettings.limits.toggle');
    case 'other':
      return say('adminSettings.limits.other');
  }
}

/**
 * A yes-or-no setting whose "yes" asks to be confirmed (R-14, the parents' confirmation)
 * is drawn as one box to tick, worded by its confirm message: ticking it is saying yes
 * and confirming at once, and an unticked save says no (record 065).
 */
export function drawnAsTick(row: LeagueSettingRow): boolean {
  return row.field.kind === 'toggle' && row.confirm.includes(true);
}

function Control({ row, say }: { readonly row: LeagueSettingRow; readonly say: Say }) {
  if (drawnAsTick(row)) {
    return (
      <fieldset className="settings-choice" aria-describedby={`${row.key}-about`}>
        <legend>{say(row.label)}</legend>
        <input type="hidden" name="value" value={tickValue} />
        <p>
          <label className="staff-check">
            <input
              type="checkbox"
              name="confirmed"
              value="yes"
              defaultChecked={row.value === true}
            />{' '}
            {say(`${wordsOf(row)}.confirm`)}
          </label>
        </p>
      </fieldset>
    );
  }
  const { field } = row;
  const describedBy = `${row.key}-about`;
  const radios = (options: readonly { value: string; text: string }[], current: string) => (
    <fieldset className="settings-choice" aria-describedby={describedBy}>
      <legend>{say(row.label)}</legend>
      {options.map((option) => (
        <p key={option.value}>
          <label className="staff-check">
            <input
              type="radio"
              name="value"
              value={option.value}
              defaultChecked={option.value === current}
            />{' '}
            {option.text}
          </label>
        </p>
      ))}
    </fieldset>
  );
  switch (field.kind) {
    case 'choice':
      return radios(
        field.choices.map((choice) => ({
          value: choice,
          text:
            choice === row.default
              ? say('adminSettings.defaultMark', { choice: say(optionKey(row, choice)) })
              : say(optionKey(row, choice)),
        })),
        String(row.value),
      );
    case 'toggle':
      return radios(
        [
          { value: 'true', text: say('adminSettings.yes') },
          { value: 'false', text: say('adminSettings.no') },
        ],
        String(row.value),
      );
    case 'number':
      return (
        <p>
          <label className="staff-field" data-size="figure">
            {say(row.label)}{' '}
            <input
              type="number"
              name="value"
              min={field.min}
              max={field.max}
              step={field.whole ? 1 : 'any'}
              defaultValue={String(row.value)}
              aria-describedby={describedBy}
              required
            />
          </label>
        </p>
      );
    case 'text':
      return (
        <p>
          <label className="staff-field">
            {say(row.label)}{' '}
            <input
              type="text"
              name="value"
              maxLength={field.maxLength}
              defaultValue={String(row.value)}
              aria-describedby={describedBy}
              autoComplete="off"
            />
          </label>
        </p>
      );
    case 'other':
      return <p className="settings-name">{say(row.label)}</p>;
  }
}

/** One form for each setting that can be set for the league. */
export function SettingForms({
  rows,
  league,
  say,
  notes = {},
}: {
  readonly rows: readonly LeagueSettingRow[];
  /** The route's `[league]` value, so the server can find the page again. */
  readonly league: string;
  readonly say: Say;
  /** Sentences the page adds around the settings, and settings it does not offer here. */
  readonly notes?: SettingNotes;
}) {
  const lines = (said: readonly Line[] | undefined) =>
    (said ?? []).map((line) => <p key={line.key}>{say(line.key, line.params)}</p>);
  return (
    <>
      {byArea(rows).map((group) => (
        // One panel a group (step 2.103): its title, then each setting as a form of its
        // own under a fine line. The class comes before the group's name in the markup.
        <section
          key={group.area}
          className="staff-panel settings-group"
          id={`settings-${group.area}`}
          data-area={group.area}
        >
          <h2>{say(`adminSettings.area.${group.area}`)}</h2>
          {lines(notes.area?.[group.area])}
          {group.rows.map((row) => (
            <section key={row.key} className="settings-item" data-setting={row.key}>
              {lines(notes.rows?.[row.key]?.before)}
              {notes.rows?.[row.key]?.offered === false ? null : (
                <form action={saveSettingAction} className="staff-form">
                  <input type="hidden" name="league" value={league} />
                  <input type="hidden" name="key" value={row.key} />
                  <input type="hidden" name="version" value={row.version ?? ''} />
                  <Control row={row} say={say} />
                  <Confirm row={row} say={say} />
                  {/* What it is set to, quietly, in one line: how it stands now as a small
                      pill, then its default and what it accepts. */}
                  <p id={`${row.key}-about`} className="settings-about">
                    <span
                      className="staff-pill"
                      data-kind={row.source === 'league' ? 'good' : 'plain'}
                    >
                      {say(
                        row.source === 'league'
                          ? 'adminSettings.usingOwn'
                          : 'adminSettings.usingDefault',
                      )}
                    </span>{' '}
                    <span>
                      {say('adminSettings.default', { value: valueText(row, row.default, say) })}
                    </span>{' '}
                    <span>{limitsText(row, say)}</span>
                  </p>
                  {row.field.kind === 'other' ? null : (
                    <p className="staff-buttons">
                      <button type="submit" className="ui-button" data-kind="main">
                        {say('adminSettings.save')}
                      </button>
                      {row.version === null ? null : (
                        <>
                          {' '}
                          <button
                            type="submit"
                            className="ui-button"
                            name="intent"
                            value={clearIntent}
                            formNoValidate
                          >
                            {say('adminSettings.clear')}
                          </button>
                        </>
                      )}
                    </p>
                  )}
                </form>
              )}
            </section>
          ))}
        </section>
      ))}
    </>
  );
}
