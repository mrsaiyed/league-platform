import type { CSSProperties } from 'react';
import { safeColor } from '../team-color.ts';

export type PlayRow = {
  readonly key: string;
  /** The clock when it happened, for example "16:03"; empty when it is not known. */
  readonly clock: string;
  /** The play in one sentence, already written by the page. */
  readonly text: string;
  /** The team whose play it is, for its color chip; left out for a play of neither team. */
  readonly team?: { readonly color: string | null } | undefined;
  /**
   * The score after a play that changed it: as drawn ("10–13", away team first as on the
   * board above) and as said ("Lions 10, Hawks 13").
   */
  readonly score?: { readonly text: string; readonly spoken: string } | undefined;
};

export type PlayTableLabels = {
  readonly time: string;
  readonly play: string;
  readonly score: string;
};

export type PlayTableProps = {
  /** Names the table: the period, for example "Half 2". */
  readonly title: string;
  /** The plays of the period, in the order given. */
  readonly rows: readonly PlayRow[];
  readonly labels: PlayTableLabels;
};

/**
 * The plays of one period of a game, as a table in the frame every table sits in: when on
 * the clock, the play with its team's color beside it, and the score after each basket.
 * The words wrap, so on a phone it never needs to scroll sideways.
 */
export function PlayTable({ title, rows, labels }: PlayTableProps) {
  return (
    <div className="ui-table-frame">
      <div className="ui-table-wrap">
        <table className="ui-table ui-plays">
          <caption dir="auto">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="ui-num">
                {labels.time}
              </th>
              <th scope="col">{labels.play}</th>
              <th scope="col" className="ui-num">
                {labels.score}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const color = safeColor(row.team?.color);
              return (
                <tr key={row.key} data-scored={row.score ? 'true' : undefined}>
                  <td className="ui-num">{row.clock}</td>
                  <td>
                    <span
                      className="ui-play"
                      style={color ? ({ '--team-color': color } as CSSProperties) : undefined}
                    >
                      <span className="ui-play-mark">
                        {row.team ? <span className="ui-team-chip" aria-hidden="true" /> : null}
                      </span>
                      <span dir="auto">{row.text}</span>
                    </span>
                  </td>
                  <td className="ui-num">
                    {row.score ? (
                      <>
                        <span aria-hidden="true">{row.score.text}</span>
                        <span className="ui-visually-hidden">{row.score.spoken}</span>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
