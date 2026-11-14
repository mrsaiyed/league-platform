export type Fact = {
  readonly key: string;
  /** "Seed", "Record", "Division". */
  readonly label: string;
  readonly value: string;
};

/** A few short facts in a row, each a small label and its value: a team's seed, record and division. */
export function Facts({ facts }: { readonly facts: readonly Fact[] }) {
  return (
    <dl className="ui-facts">
      {facts.map((fact) => (
        <div key={fact.key}>
          <dt>{fact.label}</dt>
          <dd dir="auto">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
