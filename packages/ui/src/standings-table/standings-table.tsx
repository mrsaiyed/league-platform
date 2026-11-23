import type { CSSProperties } from 'react';
import { Emblem } from '../emblem/emblem.tsx';
import { safeColor } from '../team-color.ts';

export type StandingsColumn = {
  readonly key: string;
  readonly label: string;
  /**
   * In a phone-wide page: `in-view` columns stand beside the team with nothing to scroll
   * (they must come first among the columns drawn there), `left-out` ones are moved out of
   * their place to stand straight after the in-view ones, the first reached by scrolling,
   * and the others are reached by scrolling inside the table's own box after those.
   * `wide-only` ones are not drawn on a phone at all (the home page's small table).
   */
  readonly narrow?: 'in-view' | 'left-out' | 'wide-only';
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
  /**
   * Draws each team's emblem (a shield with its first letter, in its color) beside its
   * name, where the table otherwise draws a small chip of the team's color.
   */
  readonly emblems?: boolean;
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
  emblems = false,
}: StandingsTableProps) {
  const numberOf = new Map(footnotes.map((n, i) => [n.id, i + 1]));
  const hasSeeds = rows.some((r) => r.seed !== undefined && r.seed !== null);
  const classOf = (c: StandingsColumn) =>
    c.narrow === 'left-out' || c.narrow === 'wide-only' ? 'ui-num ui-left-out' : 'ui-num';
  // The columns in the order drawn: each left-out one is drawn twice, in its own place
  // (shown only in a wide layout) and again after the last in-view column (shown only on a
  // phone-wide page), so on a phone it is never lost, only one scroll away (table-css.ts).
  const lastInView = columns.findLastIndex((c) => c.narrow === 'in-view');
  const moved = columns
    .filter((c) => c.narrow === 'left-out')
    .map((c) => ({ c, key: `${c.key}-moved`, className: 'ui-num ui-moved' }));
  // The column in view before the last one stands at the box's edge when the screen is too
  // narrow for the last one beside the name, and that one is then scrolled to (table-css.ts).
  const nextToLast = columns[lastInView - 1]?.narrow === 'in-view' ? lastInView - 1 : -1;
  const classAt = (c: StandingsColumn, i: number) =>
    i === lastInView
      ? 'ui-num ui-last-in-view'
      : i === nextToLast
        ? 'ui-num ui-next-to-last'
        : classOf(c);
  const drawn = columns.flatMap((c, i) => [
    { c, key: c.key, className: classAt(c, i) },
    ...(i === lastInView ? moved : []),
  ]);
  // What a phone-wide table gives the team column: the box less the place and the columns
  // in view beside it, so those show whole and the first column to scroll to starts at the
  // box's edge, none of it half in view (table-css.ts).
  // A table whose columns say nothing of a phone keeps the plain sideways scroll there.
  const inView = columns.filter((c) => c.narrow === 'in-view').length;
  const narrow =
    inView === 0
      ? undefined
      : ({ '--ui-in-view': inView, '--ui-seed-col': hasSeeds ? 1 : 0 } as CSSProperties);
  return (
    <div className="ui-table-frame">
      <div className="ui-table-wrap" tabIndex={0} role="region" aria-label={regionLabel ?? caption}>
        <table
          className="ui-table ui-standings"
          data-emblems={emblems ? 'true' : undefined}
          data-narrow={narrow === undefined ? undefined : 'fit'}
          style={narrow}
        >
          <caption dir="auto">{caption}</caption>
          <thead>
            <tr>
              {hasSeeds ? (
                <th scope="col" className="ui-num">
                  {labels.seed}
                </th>
              ) : null}
              <th scope="col" className="ui-team-cell">
                {labels.team}
              </th>
              {drawn.map(({ c, key, className }) => (
                <th key={key} scope="col" className={className}>
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
                    {emblems ? (
                      <Emblem name={row.team} color={row.color} size="small" />
                    ) : (
                      <span className="ui-team-chip" aria-hidden="true" />
                    )}
                    {/* A note's mark is part of the name's own flow, so on a name long enough
                        to wrap it follows the last word, not the first line. The name's own
                        words have an element of their own (ui-team-name), so whatever reads
                        a team's name gets the name alone. Each mark has a direction of its
                        own, which keeps its hidden word out of the reckoning of the name's
                        (dir="auto" passes over a child that states one), and opens with a
                        space, so the cell reads "Owls Note 1", never "OwlsNote 1". */}
                    <span dir="auto">
                      <span className="ui-team-name">{row.team}</span>
                      {marks.map((m) => (
                        <sup key={m.id} className="ui-note-mark" dir="auto">
                          <a href={`#${idPrefix}-note-${m.id}`}>
                            {' '}
                            <span className="ui-visually-hidden">{labels.note}</span> {m.n}
                          </a>
                        </sup>
                      ))}
                    </span>
                  </th>
                  {drawn.map(({ c, key, className }) => (
                    <td key={key} className={className}>
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
    </div>
  );
}
