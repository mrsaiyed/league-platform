import type { CSSProperties } from 'react';
import { safeColor } from '../team-color.ts';

export type StandingsColumn = {
  readonly key: string;
  readonly label: string;
};

export type StandingsRow = {
  readonly id: string;
  readonly seed?: number | null;
  readonly team: string;
  readonly color?: string | null;
  /** The value shown under each column, already written by the page. */
  readonly cells: Readonly<Record<string, string | number>>;
  /** Footnote ids this row carries, such as an adjustment or the reason for a tie-break (S-9, S-10). */
  readonly notes?: readonly string[];
};

export type StandingsFootnote = { readonly id: string; readonly text: string };

export type StandingsTableLabels = {
  readonly seed: string;
  readonly team: string;
  /** Said before a note's number, for screen readers. */
  readonly note: string;
  readonly notes: string;
};

export type StandingsTableProps = {
  /** Names the table: the division's name. */
  readonly caption: string;
  /** Names the scrollable region for screen readers; the caption is used when left out. */
  readonly regionLabel?: string;
  readonly columns: readonly StandingsColumn[];
  readonly rows: readonly StandingsRow[];
  readonly footnotes?: readonly StandingsFootnote[];
  /** Makes the footnote addresses unique when a page holds several tables. */
  readonly idPrefix: string;
  readonly labels: StandingsTableLabels;
};

/** One division's table, in the order given: the page ranks, this only shows. */
export function StandingsTable({
  caption,
  regionLabel,
  columns,
  rows,
  footnotes = [],
  idPrefix,
  labels,
}: StandingsTableProps) {
  const numberOf = new Map(footnotes.map((n, i) => [n.id, i + 1]));
  const hasSeeds = rows.some((r) => r.seed !== undefined && r.seed !== null);
  return (
    <div className="ui-table-wrap" tabIndex={0} role="region" aria-label={regionLabel ?? caption}>
      <table className="ui-table ui-standings">
        <caption dir="auto">{caption}</caption>
        <thead>
          <tr>
            {hasSeeds ? (
              <th scope="col" className="ui-num">
                {labels.seed}
              </th>
            ) : null}
            <th scope="col">{labels.team}</th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="ui-num">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const color = safeColor(row.color);
            const marks = (row.notes ?? []).flatMap((id) => {
              const n = numberOf.get(id);
              return n === undefined ? [] : [{ id, n }];
            });
            return (
              <tr
                key={row.id}
                style={color ? ({ '--team-color': color } as CSSProperties) : undefined}
              >
                {hasSeeds ? <td className="ui-num">{row.seed ?? ''}</td> : null}
                <th scope="row" className="ui-team-cell">
                  <span className="ui-team-chip" aria-hidden="true" />
                  <span dir="auto">{row.team}</span>
                  {marks.map((m) => (
                    <sup key={m.id} className="ui-note-mark">
                      <a href={`#${idPrefix}-note-${m.id}`}>
                        <span className="ui-visually-hidden">{labels.note}</span> {m.n}
                      </a>
                    </sup>
                  ))}
                </th>
                {columns.map((c) => (
                  <td key={c.key} className="ui-num">
                    {row.cells[c.key] ?? ''}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {footnotes.length > 0 ? (
        <ol className="ui-footnotes" aria-label={labels.notes}>
          {footnotes.map((n) => (
            <li key={n.id} id={`${idPrefix}-note-${n.id}`} dir="auto">
              {n.text}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
