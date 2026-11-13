'use client';

import { useState } from 'react';
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
  /** The first column is the row heading (the player or team name). */
  readonly columns: readonly StatsColumn[];
  readonly rows: readonly StatRow[];
  readonly initialSort?: Sort | null;
  /** The language the names are sorted in. */
  readonly locale?: string;
  readonly labels: StatsTableLabels;
};

/** A table of statistics the reader can sort by any column. Shows the initial sort without scripts. */
export function SortableStatsTable({
  caption,
  columns,
  rows,
  initialSort = null,
  locale,
  labels,
}: SortableStatsTableProps) {
  const [sort, setSort] = useState<Sort | null>(initialSort);
  const sorted = sortStatRows(rows, sort, locale);
  return (
    <div className="ui-table-wrap">
      <table className="ui-table ui-stats">
        <caption dir="auto">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort && sort.key === c.key ? sort.direction : undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={c.numeric ? 'ui-num' : undefined}
                  aria-sort={active ?? 'none'}
                >
                  <button
                    type="button"
                    className="ui-sort-button"
                    onClick={() => setSort(nextSort(sort, c.key, c.numeric === true))}
                  >
                    <span className="ui-visually-hidden">{labels.sortBy}</span>
                    {c.label}
                    {c.fullName ? <span className="ui-visually-hidden">{c.fullName}</span> : null}
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
                    <span dir="auto">{row.cells[c.key] ?? ''}</span>
                  </th>
                ) : (
                  <td key={c.key} className={c.numeric ? 'ui-num' : undefined}>
                    {c.numeric ? (
                      (row.cells[c.key] ?? '')
                    ) : (
                      <span dir="auto">{row.cells[c.key] ?? ''}</span>
                    )}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
