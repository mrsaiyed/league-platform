import type { CSSProperties, ReactNode } from 'react';
import { NoValue } from '../no-value/no-value.tsx';

export type BoxScoreColumn = {
  readonly key: string;
  /** Short heading, for example "PTS". */
  readonly label: string;
  /** The full name for screen readers and hover, for example "Points". */
  readonly fullName?: string;
};

export type BoxScorePlayer = {
  readonly id: string;
  readonly jersey?: string | null;
  readonly name: string;
  readonly cells: Readonly<Record<string, string | number>>;
};

export type BoxScoreLabels = {
  readonly jersey: string;
  /**
   * The same heading drawn short, for example "#", so the narrowest column is not the widest
   * heading. The full word stays for screen readers and on hover.
   */
  readonly jerseyShort?: string | undefined;
  readonly player: string;
  readonly total: string;
  /**
   * The heading over "Total" in a table that lists no players (their numbers are hidden):
   * "Team". Left out, that heading cell holds nothing.
   */
  readonly team?: string | undefined;
  /** Said to screen readers in a cell that holds no number, where a dash is drawn. */
  readonly noValue?: string | undefined;
};

export type BoxScoreTableProps = {
  /** Names the table: the team's name. */
  readonly teamName: string;
  /** Names the scrollable region for screen readers; the team's name is used when left out. */
  readonly regionLabel?: string;
  readonly columns: readonly BoxScoreColumn[];
  /** Null when this team's player numbers are hidden from the viewer: only the total shows (S-22). */
  readonly players: readonly BoxScorePlayer[] | null;
  readonly totals: Readonly<Record<string, string | number>>;
  /** Said under the table when the players are hidden. */
  readonly hiddenNotice?: string;
  readonly labels: BoxScoreLabels;
  /**
   * The letters of the longest name in the tables this one is read beside (the two box
   * scores of one game; `lettersWide`). Every one of them then gives its names the same
   * room, so their number columns stand under each other and one table never hides a
   * column the other shows. Left out, the names take what their own words need.
   */
  readonly nameRoom?: number | undefined;
};

/** A number, or a dash with a word for screen readers where there is none: never a blank cell. */
function valueOrDash(value: string | number | undefined, word: string | undefined): ReactNode {
  if (value !== undefined && value !== '') return value;
  return <NoValue word={word} />;
}

/** One team's box score: players in the order given, then the team's totals. */
export function BoxScoreTable({
  teamName,
  regionLabel,
  columns,
  players,
  totals,
  hiddenNotice,
  labels,
  nameRoom,
}: BoxScoreTableProps) {
  return (
    <div className="ui-table-frame">
      <div
        className="ui-table-wrap"
        tabIndex={0}
        role="region"
        aria-label={regionLabel ?? teamName}
      >
        <table
          className="ui-table ui-box-score"
          data-players={players ? undefined : 'hidden'}
          style={
            nameRoom === undefined ? undefined : ({ '--name-room': nameRoom } as CSSProperties)
          }
        >
          <caption dir="auto">{teamName}</caption>
          <thead>
            <tr>
              {players ? (
                <>
                  {labels.jerseyShort ? (
                    <th scope="col" className="ui-num" title={labels.jersey}>
                      <span aria-hidden="true">{labels.jerseyShort}</span>
                      <span className="ui-visually-hidden">{labels.jersey}</span>
                    </th>
                  ) : (
                    <th scope="col" className="ui-num">
                      {labels.jersey}
                    </th>
                  )}
                  <th scope="col" className="ui-team-cell">
                    {labels.player}
                  </th>
                </>
              ) : labels.team ? (
                <th scope="col" className="ui-team-cell">
                  {labels.team}
                </th>
              ) : (
                <td aria-hidden="true" />
              )}
              {columns.map((c) => (
                <th key={c.key} scope="col" className="ui-num" title={c.fullName}>
                  {c.label}
                  {c.fullName ? (
                    <>
                      {' '}
                      <span className="ui-visually-hidden">{c.fullName}</span>
                    </>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          {players ? (
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td className="ui-num">{p.jersey ?? ''}</td>
                  <th scope="row" className="ui-team-cell">
                    <span dir="auto">{p.name}</span>
                  </th>
                  {columns.map((c) => (
                    <td key={c.key} className="ui-num">
                      {valueOrDash(p.cells[c.key], labels.noValue)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : null}
          <tfoot>
            <tr>
              {/* "Total" sits under the names and is exactly as wide as they are, so when the
                  table is scrolled it covers no more of the numbers than a name does. */}
              {players ? <td /> : null}
              <th scope="row" className="ui-team-cell">
                {labels.total}
              </th>
              {columns.map((c) => (
                <td key={c.key} className="ui-num">
                  {valueOrDash(totals[c.key], labels.noValue)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
        {!players && hiddenNotice ? <p className="ui-table-notice">{hiddenNotice}</p> : null}
      </div>
    </div>
  );
}
