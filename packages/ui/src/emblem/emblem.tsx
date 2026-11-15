import type { CSSProperties } from 'react';
import { safeColor } from '../team-color.ts';

/** The first letter of a name, whatever script it is written in. */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? '';
}

export type EmblemProps = {
  /** The team's name; only its first letter is drawn, and screen readers skip it. */
  readonly name: string;
  /** The team's own color, #rrggbb. */
  readonly color?: string | null | undefined;
  readonly size?: 'card' | 'large';
};

/** A team's round emblem: its first letter in a ring of its own color. */
export function Emblem({ name, color, size = 'card' }: EmblemProps) {
  const safe = safeColor(color);
  return (
    <span
      className="ui-emblem"
      data-size={size}
      aria-hidden="true"
      style={safe ? ({ '--team-color': safe } as CSSProperties) : undefined}
    >
      {initialOf(name)}
    </span>
  );
}
