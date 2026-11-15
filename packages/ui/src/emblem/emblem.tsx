import type { CSSProperties } from 'react';
import { safeColor } from '../team-color.ts';

/** The first letter of a name, whatever script it is written in. */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? '';
}

/**
 * The shield, drawn on a field 48 wide and 56 high: its outline, a second line just inside
 * it, and a short bar over the letter. The hero's pattern is drawn from the same outline.
 */
export const shieldOutline = 'M3.5 3h41v27.5c0 12.2-20.5 22.7-20.5 22.7S3.5 42.7 3.5 30.5Z';
const shieldInner = 'M7.5 7h33v23.3c0 9.4-16.5 18-16.5 18s-16.5-8.6-16.5-18Z';
const shieldBar = 'M17 12.5h14';

export type EmblemProps = {
  /** The team's name; only its first letter is drawn, and screen readers skip it. */
  readonly name: string;
  /** The team's own color, #rrggbb. */
  readonly color?: string | null | undefined;
  /** `small` sits in a row of a table, `card` in a card, `large` at the head of a page. */
  readonly size?: 'small' | 'card' | 'large';
  /**
   * A team's shield is drawn in the team's own color. The league's, in the header, is
   * filled with the league's main color.
   */
  readonly kind?: 'team' | 'league';
};

/**
 * A team's emblem: a shield with its first letter, drawn in the team's own color. Made
 * from the team's data alone, as part of the page, so there is no picture to fetch. It
 * says nothing to a screen reader: the team's name is always written beside it.
 */
export function Emblem({ name, color, size = 'card', kind = 'team' }: EmblemProps) {
  const safe = safeColor(color);
  return (
    <svg
      className="ui-emblem"
      data-size={size}
      data-kind={kind}
      viewBox="0 0 48 56"
      aria-hidden="true"
      focusable="false"
      style={safe ? ({ '--team-color': safe } as CSSProperties) : undefined}
    >
      <path className="ui-emblem-shield" d={shieldOutline} />
      <path className="ui-emblem-inner" d={shieldInner} />
      <path className="ui-emblem-bar" d={shieldBar} />
      <text className="ui-emblem-letter" x="24" y="36.5" fontSize="23" textAnchor="middle">
        {initialOf(name)}
      </text>
    </svg>
  );
}
