import type { CSSProperties } from 'react';

export type StatStripItem = {
  readonly key: string;
  /** What the number counts: "Teams". */
  readonly label: string;
  /** The number, already written by the page. */
  readonly value: string;
};

export type StatStripProps = {
  /** Names the strip for screen readers: "The season in numbers". */
  readonly label: string;
  readonly items: readonly StatStripItem[];
};

/** How many numbers stand in one line of a strip before it wraps. */
const oneLine = 4;
/** The most numbers across a strip that wraps: on a phone, and from a tablet up. */
const mostAcross = { phone: 4, wide: 6 } as const;

/**
 * How many numbers stand across a strip of `count` that is held to `most` in a line: as
 * few lines as that takes, and the lines as even as they can be, so seven are four and
 * three, never six and one left over.
 */
export function stripAcross(count: number, most: number): number {
  if (count <= most) return Math.max(1, count);
  return Math.ceil(count / Math.ceil(count / most));
}

/**
 * A strip of big numbers, each with a small label under it. A list of terms takes no name
 * of its own, so the strip's name is on a group around it, which screen readers read.
 * Up to four numbers stand in one line; more (a team's totals in a sport that keeps many
 * statistics) wrap onto further lines of the same strip, so numbers that belong together
 * are never a table of one row across the page.
 */
export function StatStrip({ label, items }: StatStripProps) {
  const wraps = items.length > oneLine;
  return (
    <div role="group" aria-label={label}>
      <dl
        className="ui-stat-strip"
        data-wrap={wraps ? 'true' : undefined}
        style={
          wraps
            ? ({
                '--ui-stat-across': stripAcross(items.length, mostAcross.phone),
                '--ui-stat-across-wide': stripAcross(items.length, mostAcross.wide),
              } as CSSProperties)
            : undefined
        }
      >
        {items.map((item) => (
          <div key={item.key} className="ui-stat">
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
