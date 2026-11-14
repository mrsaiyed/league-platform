// The League settings form, drawn from the settings' own declarations (step 2.48, T-98).
// Each row is a LeagueSettingRow (core's listLeagueSettings): nothing about any setting
// is written here. The words come from the message files by the setting's label key and,
// for a list of choices, `setting.<key>.option.<choice>` (T-187). The words are given as
// a function so a test can draw a setting that has no words of its own.
import type { LeagueSettingRow } from '@srleagues/core';
import { saveSettingAction } from './actions.ts';
import { clearIntent } from './form-input.ts';

export type Say = (key: string, params?: Readonly<Record<string, string | number>>) => string;

const optionKey = (row: LeagueSettingRow, choice: string) =>
  `${row.label.replace(/\.label$/, '')}.option.${choice}`;

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

function Control({ row, say }: { readonly row: LeagueSettingRow; readonly say: Say }) {
  const { field } = row;
  const describedBy = `${row.key}-about`;
  const radios = (options: readonly { value: string; text: string }[], current: string) => (
    <fieldset aria-describedby={describedBy}>
      <legend>{say(row.label)}</legend>
      {options.map((option) => (
        <p key={option.value}>
          <label>
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
          <label>
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
          <label>
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
      return <p>{say(row.label)}</p>;
  }
}

/** One form for each setting that can be set for the league. */
export function SettingForms({
  rows,
  league,
  say,
}: {
  readonly rows: readonly LeagueSettingRow[];
  /** The route's `[league]` value, so the server can find the page again. */
  readonly league: string;
  readonly say: Say;
}) {
  return (
    <>
      {rows.map((row) => (
        <section key={row.key} data-setting={row.key}>
          <form action={saveSettingAction}>
            <input type="hidden" name="league" value={league} />
            <input type="hidden" name="key" value={row.key} />
            <input type="hidden" name="version" value={row.version ?? ''} />
            <Control row={row} say={say} />
            <p id={`${row.key}-about`}>
              <small>
                {say('adminSettings.default', { value: valueText(row, row.default, say) })}{' '}
                {limitsText(row, say)}{' '}
                {say(
                  row.source === 'league' ? 'adminSettings.usingOwn' : 'adminSettings.usingDefault',
                )}
              </small>
            </p>
            {row.field.kind === 'other' ? null : (
              <p>
                <button type="submit">{say('adminSettings.save')}</button>
                {row.version === null ? null : (
                  <>
                    {' '}
                    <button type="submit" name="intent" value={clearIntent} formNoValidate>
                      {say('adminSettings.clear')}
                    </button>
                  </>
                )}
              </p>
            )}
          </form>
        </section>
      ))}
    </>
  );
}
