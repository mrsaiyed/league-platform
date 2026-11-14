import { Emblem } from '../emblem/emblem.tsx';
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
};

/** A team as a card: its emblem, its name, its record and a few facts. One link, whole. */
export function TeamCard({ name, href, color, figure, facts }: TeamCardProps) {
  return (
    <article className="ui-team-card">
      <Emblem name={name} color={color} />
      <div className="ui-team-card-text">
        <h3 className="ui-team-card-name">
          <a href={href} dir="auto">
            {name}
          </a>
        </h3>
        <Facts facts={facts} />
      </div>
      <p className="ui-team-card-figure">
        <span className="ui-visually-hidden">{figure.label}</span> {figure.value}
      </p>
    </article>
  );
}
