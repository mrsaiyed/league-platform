'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { Emblem } from '../emblem/emblem.tsx';
import { safeColor } from '../team-color.ts';
import { nextSort, sortStatRows, type Sort, type StatRow } from './sort-stat-rows.ts';

export type StatsColumn = {
  readonly key: string;
  readonly label: string;
  readonly fullName?: string;
  /** Numbers line up at the end and first sort biggest-first. */
  readonly numeric?: boolean;
};

export type StatsTableLabels = {
  /** Spoken on each heading button, before the column's name: "Sort by". */
  readonly sortBy: string;
  /** Said to screen readers in a cell that holds no number, where a dash is drawn. */
  readonly noValue?: string;
};

export type SortableStatsTableProps = {
  readonly caption: string;
  /** For a table under a heading that already says the same words: the caption is kept for screen readers and not drawn. */
  readonly captionHidden?: boolean;
  /** Names the scrollable region for screen readers; the caption is used when left out. */
  readonly regionLabel?: string;
  /** The first column is the row heading (the player or team name). */
  readonly columns: readonly StatsColumn[];
  readonly rows: readonly StatRow[];
  readonly initialSort?: Sort | null;
  /** The language the names are sorted in. */
  readonly locale?: string;
  readonly labels: StatsTableLabels;
  /**
   * Draws a team's small shield, with its first letter, where a row names a team, in
   * place of the plain chip of its color (docs/build/DESIGN.md, section 4, line 14).
   */
  readonly emblems?: boolean;
  /**
   * The key of a column that names the row's team. In a box as narrow as a phone's that
   * column folds into the first: the team is its shield alone, before the row's name, with
   * its name kept for screen readers, so the numbers come straight after the name.
   */
  readonly foldTeam?: string;
};

/**
 * A team's mark, when the row says this column names a team: its small shield in the
 * team's own color (`emblems`), or a chip of that color; plain for a team with no color,
 * so the names of a column stay in line.
 */
function chipOf(row: StatRow, key: string, emblems: boolean): ReactNode {
  if (row.chips === undefined || !Object.hasOwn(row.chips, key)) return null;
  const color = safeColor(row.chips[key]);
  if (emblems) {
    // A cell that names several teams gets a plain shield with no letter.
    const name = row.severalTeams?.[key] === true ? '' : String(row.cells[key] ?? '');
    return <Emblem name={name} color={color} size="small" />;
  }
  return (
    <span
      className="ui-team-chip"
      aria-hidden="true"
      style={color ? ({ '--team-color': color } as CSSProperties) : undefined}
    />
  );
}

/**
 * What a cell with no number shows: a dash, and a word for screen readers. Never blank,
 * so an empty row is not read as a table that failed to load.
 */
function noValue(word: string | undefined): ReactNode {
  return (
    <>
      <span className="ui-no-value" aria-hidden="true">
        –
      </span>
      {word === undefined ? null : <span className="ui-visually-hidden">{word}</span>}
    </>
  );
}

/** The words said after a figure this row draws quieter, when it does. */
function quietWord(row: StatRow, key: string): string | undefined {
  return row.quiet !== undefined && Object.hasOwn(row.quiet, key) ? row.quiet[key] : undefined;
}

/** A table of statistics the reader can sort by any column. Shows the initial sort without scripts. */
export function SortableStatsTable({
  caption,
  captionHidden = false,
  regionLabel,
  columns,
  rows,
  initialSort = null,
  locale,
  labels,
  emblems = false,
  foldTeam,
}: SortableStatsTableProps) {
  const [sort, setSort] = useState<Sort | null>(initialSort);
  const sorted = sortStatRows(rows, sort, locale);
  return (
    <div className="ui-table-frame">
      <div className="ui-table-wrap" tabIndex={0} role="region" aria-label={regionLabel ?? caption}>
        <table
          className="ui-table ui-stats"
          data-fold={foldTeam === undefined ? undefined : 'true'}
        >
          <caption dir="auto" className={captionHidden ? 'ui-visually-hidden' : undefined}>
            {caption}
          </caption>
          <thead>
            <tr>
              {columns.map((c, i) => {
                const active = sort && sort.key === c.key ? sort.direction : undefined;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={i === 0 ? 'ui-team-cell' : c.numeric ? 'ui-num' : undefined}
                    aria-sort={active ?? 'none'}
                    data-folded={c.key === foldTeam ? 'true' : undefined}
                  >
                    <button
                      type="button"
                      className="ui-sort-button"
                      onClick={() => setSort(nextSort(sort, c.key, c.numeric === true))}
                    >
                      <span className="ui-visually-hidden">{labels.sortBy}</span> {c.label}
                      {c.fullName ? (
                        <>
                          {' '}
                          <span className="ui-visually-hidden">{c.fullName}</span>
                        </>
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id}>
                {columns.map((c, i) =>
                  i === 0 ? (
                    <th key={c.key} scope="row" className="ui-team-cell">
                      {chipOf(row, c.key, emblems)}
                      {foldTeam === undefined ? null : (
                        <span className="ui-fold">{chipOf(row, foldTeam, true)}</span>
                      )}
                      <span dir="auto">{row.cells[c.key] ?? ''}</span>
                      {foldTeam === undefined ? null : (
                        <span className="ui-fold ui-visually-hidden">
                          <bdi>{row.cells[foldTeam] ?? ''}</bdi>
                        </span>
                      )}
                    </th>
                  ) : (
                    <td
                      key={c.key}
                      className={c.numeric ? 'ui-num' : undefined}
                      data-sorted={sort && sort.key === c.key ? 'true' : undefined}
                      data-folded={c.key === foldTeam ? 'true' : undefined}
                      data-quiet={quietWord(row, c.key) === undefined ? undefined : 'true'}
                    >
                      {c.numeric ? (
                        <>
                          {row.cells[c.key] ?? noValue(labels.noValue)}
                          {quietWord(row, c.key) === undefined ? null : (
                            <span className="ui-visually-hidden"> {quietWord(row, c.key)}</span>
                          )}
                        </>
                      ) : (
                        <>
                          {chipOf(row, c.key, emblems)}
                          <span dir="auto">{row.cells[c.key] ?? ''}</span>
                        </>
                      )}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
