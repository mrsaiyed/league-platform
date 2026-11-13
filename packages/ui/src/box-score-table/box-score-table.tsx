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
  readonly player: string;
  readonly total: string;
};

export type BoxScoreTableProps = {
  /** Names the table: the team's name. */
  readonly teamName: string;
  readonly columns: readonly BoxScoreColumn[];
  /** Null when this team's player numbers are hidden from the viewer: only the total shows (S-22). */
  readonly players: readonly BoxScorePlayer[] | null;
  readonly totals: Readonly<Record<string, string | number>>;
  /** Said under the table when the players are hidden. */
  readonly hiddenNotice?: string;
  readonly labels: BoxScoreLabels;
};

/** One team's box score: players in the order given, then the team's totals. */
export function BoxScoreTable({
  teamName,
  columns,
  players,
  totals,
  hiddenNotice,
  labels,
}: BoxScoreTableProps) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table ui-box-score">
        <caption dir="auto">{teamName}</caption>
        <thead>
          <tr>
            {players ? (
              <>
                <th scope="col" className="ui-num">
                  {labels.jersey}
                </th>
                <th scope="col">{labels.player}</th>
              </>
            ) : (
              <td aria-hidden="true" />
            )}
            {columns.map((c) => (
              <th key={c.key} scope="col" className="ui-num" title={c.fullName}>
                {c.label}
                {c.fullName ? <span className="ui-visually-hidden">{c.fullName}</span> : null}
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
                    {p.cells[c.key] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ) : null}
        <tfoot>
          <tr>
            <th scope="row" colSpan={players ? 2 : 1}>
              {labels.total}
            </th>
            {columns.map((c) => (
              <td key={c.key} className="ui-num">
                {totals[c.key] ?? ''}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
      {!players && hiddenNotice ? <p className="ui-table-notice">{hiddenNotice}</p> : null}
    </div>
  );
}
