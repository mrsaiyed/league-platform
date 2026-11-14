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

/** A strip of big numbers, each with a small label under it. */
export function StatStrip({ label, items }: StatStripProps) {
  return (
    <dl className="ui-stat-strip" aria-label={label}>
      {items.map((item) => (
        <div key={item.key} className="ui-stat">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
