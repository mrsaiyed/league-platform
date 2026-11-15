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
    return <Emblem name={String(row.cells[key] ?? '')} color={color} size="small" />;
  }
  return (
    <span
      className="ui-team-chip"
      aria-hidden="true"
      style={color ? ({ '--team-color': color } as CSSProperties) : undefined}
    />
  );
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
}: SortableStatsTableProps) {
  const [sort, setSort] = useState<Sort | null>(initialSort);
  const sorted = sortStatRows(rows, sort, locale);
  return (
    <div className="ui-table-frame">
      <div className="ui-table-wrap" tabIndex={0} role="region" aria-label={regionLabel ?? caption}>
        <table className="ui-table ui-stats">
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
                      <span dir="auto">{row.cells[c.key] ?? ''}</span>
                    </th>
                  ) : (
                    <td key={c.key} className={c.numeric ? 'ui-num' : undefined}>
                      {c.numeric ? (
                        (row.cells[c.key] ?? '')
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
