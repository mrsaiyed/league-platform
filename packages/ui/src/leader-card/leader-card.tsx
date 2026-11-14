export type LeaderEntry = {
  readonly id: string;
  /** The player as the page writes them, with their place: "1. Dana W." */
  readonly name: string;
  /** A quiet line under the name: the team and the games played. */
  readonly detail?: string | undefined;
  /** The number, already written by the page. */
  readonly value: string;
};

export type LeaderCardProps = {
  /** What is being led: "Points". */
  readonly title: string;
  /** In order, the leader first. */
  readonly entries: readonly LeaderEntry[];
};

/** Who leads in one thing: the leader's number is the biggest thing on the card. */
export function LeaderCard({ title, entries }: LeaderCardProps) {
  return (
    <article className="ui-leader-card">
      <h3>{title}</h3>
      <ol className="ui-leader-list">
        {entries.map((entry) => (
          <li key={entry.id} className="ui-leader">
            <span className="ui-leader-who">
              <span className="ui-leader-name" dir="auto">
                {entry.name}
              </span>
              {entry.detail ? (
                <span className="ui-leader-detail" dir="auto">
                  {entry.detail}
                </span>
              ) : null}
            </span>
            <span className="ui-leader-value">{entry.value}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
