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

/**
 * A strip of big numbers, each with a small label under it. A list of terms takes no name
 * of its own, so the strip's name is on a group around it, which screen readers read.
 */
export function StatStrip({ label, items }: StatStripProps) {
  return (
    <div role="group" aria-label={label}>
      <dl className="ui-stat-strip">
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
