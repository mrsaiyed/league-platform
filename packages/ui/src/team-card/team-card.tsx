import type { CSSProperties } from 'react';
import { Emblem } from '../emblem/emblem.tsx';
import { safeColor } from '../team-color.ts';
import { Facts, type Fact } from '../facts/facts.tsx';

export type TeamCardFact = Fact;

export type TeamCardProps = {
  readonly name: string;
  /** The team's page. The page builds it with the address helper. */
  readonly href: string;
  readonly color?: string | null | undefined;
  /** The one figure the card leads with: the team's record. */
  readonly figure: { readonly label: string; readonly value: string };
  readonly facts: readonly TeamCardFact[];
  /**
   * What the card leads to, in a word, for the foot of a card that stands upright
   * ("Roster"): drawn with the arrow of a way on. The card's link is the team's name, so
   * this word is only drawn, never said.
   */
  readonly way?: string | undefined;
};

/**
 * A team as a card: its emblem, its name, its record and a few facts. One link, whole. In
 * a list that stands its cards upright (`data-layout="teams"`, from a tablet up) the shield
 * is centered over the name, the record is the number beneath, and the facts and the way on
 * are the card's foot line; in a narrower list it is one row.
 */
export function TeamCard({ name, href, color, figure, facts, way }: TeamCardProps) {
  return (
    <article
      className="ui-team-card"
      // The team's own color, for the fine line at the card's top.
      style={safeColor(color) ? ({ '--team-color': safeColor(color) } as CSSProperties) : undefined}
    >
      <Emblem name={name} color={color} />
      <div className="ui-team-card-text">
        {/* Level two: a teams page has its title and then its teams, with no level between. */}
        <h2 className="ui-team-card-name">
          <a href={href} dir="auto">
            {name}
          </a>
        </h2>
        <Facts facts={facts} />
      </div>
      <p className="ui-team-card-figure">
        <span className="ui-visually-hidden">{figure.label}</span> {figure.value}
      </p>
      {way === undefined ? null : (
        <span className="ui-team-card-way" aria-hidden="true">
          {way}
        </span>
      )}
    </article>
  );
}
