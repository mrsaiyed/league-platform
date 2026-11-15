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
  /**
   * The list starts after the leader, who is shown on a card of their own right above it:
   * no line of the list is then picked out as the leader's, and the title, which that card
   * already shows, is kept for screen readers and not drawn again.
   */
  readonly afterLeader?: boolean;
};

/** Who leads in one thing: the leader's number is the biggest thing on the card. */
export function LeaderCard({ title, entries, afterLeader = false }: LeaderCardProps) {
  return (
    <article className="ui-leader-card" data-after-leader={afterLeader ? 'true' : undefined}>
      <h3 className={afterLeader ? 'ui-visually-hidden' : undefined}>{title}</h3>
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
