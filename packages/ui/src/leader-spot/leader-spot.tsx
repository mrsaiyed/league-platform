import { Emblem } from '../emblem/emblem.tsx';

export type LeaderSpotProps = {
  /** A tiny label over the number: the leader's place and what is led, "01 / Points". */
  readonly label: string;
  /** The number, already written by the page: "17.0". */
  readonly value: string;
  /** What the number is, beside it: "per game". */
  readonly unit?: string | undefined;
  /** The player, as the page writes them: the league's name setting is already applied. */
  readonly name: string;
  /** A quiet line under the name: the team and the games played. */
  readonly detail?: string | undefined;
  /** The player's team, for its shield in the card's corner. */
  readonly team?: { readonly name: string; readonly color?: string | null } | undefined;
  /** The first of a row carries the league's main color, as a band does. */
  readonly first?: boolean;
  /**
   * The level of the name's heading: 3 under a section's own title (the default), 4 where
   * the cards stand under a small heading of level 3 inside another section, 2 where
   * they stand straight under the page's title.
   */
  readonly headingLevel?: 2 | 3 | 4;
};

/**
 * One leader, picked out: one very large number, the player's name, the team and games
 * played, and the team's shield in the corner (docs/build/DESIGN.md, section 3, the first
 * standard, 6). The name is the card's title; the number is read with what it counts.
 */
export function LeaderSpot({
  label,
  value,
  unit,
  name,
  detail,
  team,
  first = false,
  headingLevel = 3,
}: LeaderSpotProps) {
  const Name = headingLevel === 4 ? 'h4' : headingLevel === 2 ? 'h2' : 'h3';
  return (
    <article className="ui-spot" data-first={first ? 'true' : undefined}>
      <p className="ui-spot-label">{label}</p>
      {team ? <Emblem name={team.name} color={team.color} /> : null}
      <p className="ui-spot-figure">
        <span className="ui-spot-value">{value}</span>
        {unit ? <span className="ui-spot-unit">{unit}</span> : null}
      </p>
      <div className="ui-spot-who">
        <Name className="ui-spot-name" dir="auto">
          {name}
        </Name>
        {detail ? (
          <p className="ui-spot-detail" dir="auto">
            {detail}
          </p>
        ) : null}
      </div>
    </article>
  );
}
