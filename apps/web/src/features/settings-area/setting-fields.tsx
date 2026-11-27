// The League settings form, drawn from the settings' own declarations (step 2.48, T-98).
// Each row is a LeagueSettingRow (core's listLeagueSettings): nothing about any setting
// is written here. The words come from the message files by the setting's label key and,
// for a list of choices, `setting.<key>.option.<choice>` (T-187); the page may add
// sentences around them (privacy-notes.ts, record 065). The words are given as
// a function so a test can draw a setting that has no words of its own.
import { randomUUID } from 'node:crypto';
import type { LeagueSettingRow } from '@srleagues/core';
import { requestTokenField } from '../../server/same-request.ts';
import { ListForm, SaidLine, type ListField } from '../list-forms/index.ts';
import { saveSettingAction } from './actions.ts';
import { clearIntent, tickValue } from './form-input.ts';
import { settingPlace } from './profile-place.ts';
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

/**
 * A setting's boxes, as ListForm draws them (step 2.155 part 4): its value, then, for a
 * value that asks to be confirmed (R-14), the words and the box to tick.
 */
function fieldsOf(row: LeagueSettingRow, say: Say): ListField[] {
  const value = String(row.value);
  if (drawnAsTick(row)) {
    return [
      {
        kind: 'tick',
        name: 'confirmed',
        label: say(`${wordsOf(row)}.confirm`),
        checked: row.value === true,
      },
    ];
  }
  const { field } = row;
  const control = ((): ListField | undefined => {
    switch (field.kind) {
      case 'choice':
        return {
          kind: 'choice',
          name: 'value',
          label: say(row.label),
          value,
          options: field.choices.map((choice) => ({
            value: choice,
            label:
              choice === row.default
                ? say('adminSettings.defaultMark', { choice: say(optionKey(row, choice)) })
                : say(optionKey(row, choice)),
          })),
        };
      case 'toggle':
        return {
          kind: 'choice',
          name: 'value',
          label: say(row.label),
          value,
          options: [
            { value: 'true', label: say('adminSettings.yes') },
            { value: 'false', label: say('adminSettings.no') },
          ],
        };
      case 'number':
        return {
          kind: 'number',
          name: 'value',
          label: say(row.label),
          value,
          limits: { min: field.min, max: field.max, whole: field.whole },
        };
      case 'text':
        return {
          kind: 'text',
          name: 'value',
          label: say(row.label),
          value,
          maxLength: field.maxLength,
        };
      case 'other':
        return undefined;
    }
  })();
  const confirm: ListField[] =
    row.confirm.length === 0
      ? []
      : [
          {
            kind: 'note',
            name: 'confirmNote',
            content: (
              <p className="ui-field-help">
                {say('adminSettings.confirmNote', {
                  choice: row.confirm.map((choice) => valueText(row, choice, say)).join(', '),
                })}
              </p>
            ),
          },
          {
            kind: 'tick',
            name: 'confirmed',
            label: say(`${wordsOf(row)}.confirm`),
            checked: false,
          },
        ];
  return [...(control === undefined ? [] : [control]), ...confirm];
}

/** What it is set to, quietly, in one line: a small pill, then its default and limits. */
function About({ row, say }: { readonly row: LeagueSettingRow; readonly say: Say }) {
  return (
    <p id={`${row.key}-about`} className="settings-about">
      <span className="staff-pill" data-kind={row.source === 'league' ? 'good' : 'plain'}>
        {say(row.source === 'league' ? 'adminSettings.usingOwn' : 'adminSettings.usingDefault')}
      </span>{' '}
      <span>{say('adminSettings.default', { value: valueText(row, row.default, say) })}</span>{' '}
      <span>{limitsText(row, say)}</span>
    </p>
  );
}

/** One form for each setting that can be set for the league. */
export function SettingForms({
  rows,
  league,
  address,
  say,
  notes = {},
  saved,
}: {
  readonly rows: readonly LeagueSettingRow[];
  /** The route's `[league]` value, so the server can find the page again. */
  readonly league: string;
  /** League settings' own address, where the browser lands with scripts off. */
  readonly address: string;
  readonly say: Say;
  /** The setting just saved and its "Saved" words, from the one-time notice (step 2.155). */
  readonly saved?: { readonly key: string; readonly text: string } | undefined;
  /** Sentences the page adds around the settings, and settings it does not offer here. */
  readonly notes?: SettingNotes;
}) {
  const lines = (said: readonly Line[] | undefined) =>
    (said ?? []).map((line) => (
      <p key={line.key}>
        {say(line.key, line.params)}
        {line.link === undefined ? null : (
          <>
            {' '}
            <a href={line.link.href}>{say(line.link.key)}</a>
          </>
        )}
      </p>
    ));
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
            <section
              key={row.key}
              className="settings-item"
              data-setting={row.key}
              id={settingPlace(row.key)}
            >
              {lines(notes.rows?.[row.key]?.before)}
              {saved?.key === row.key ? (
                // A fresh line on every answer (its own key), so a second save of the same
                // setting is said again and brought into view again.
                <SaidLine key={randomUUID()} kind="saved">
                  {saved.text}
                </SaidLine>
              ) : null}
              {notes.rows?.[row.key]?.offered === false ? null : row.field.kind === 'other' ? (
                // Nothing this screen can set: its name and how it stands, no button.
                <div className="staff-form">
                  <p className="settings-name">{say(row.label)}</p>
                  <About row={row} say={say} />
                </div>
              ) : (
                // A page of settings has no one main action: each setting's Save is
                // outlined, and giving a setting back its default is quieter still, so
                // no screen is a column of filled buttons (step 2.103).
                <ListForm
                  action={saveSettingAction}
                  permalink={`${address}#${settingPlace(row.key)}`}
                  hidden={{
                    league,
                    key: row.key,
                    version: row.version === null ? '' : String(row.version),
                    ...(drawnAsTick(row) ? { value: tickValue } : {}),
                    [requestTokenField]: randomUUID(),
                  }}
                  fields={[
                    ...fieldsOf(row, say),
                    { kind: 'note', name: 'about', content: <About row={row} say={say} /> },
                  ]}
                  about={`${row.key}-about`}
                  button={say('adminSettings.save')}
                  label={say(row.label)}
                  name="setting"
                  {...(row.version === null
                    ? {}
                    : {
                        second: {
                          label: say('adminSettings.clear'),
                          name: 'intent',
                          value: clearIntent,
                        },
                      })}
                />
              )}
            </section>
          ))}
        </section>
      ))}
    </>
  );
}
