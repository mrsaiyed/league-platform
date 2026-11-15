// How the one made-up world's stores change a table (stand-in-world.ts): never in place.
// A store gives a table a new array (or a record a new object) with the change in it, and
// leaves every row it does not change as it is. So a transaction can start from a shallow
// copy of its league, sharing every table with the world as it stands, and only the tables
// it writes are copied (step 2.152, the review's M2); the world's own rows are frozen, so a
// store that changed one in place would fail at once. Local work and tests only.

/** The rows with the one at `at` replaced. */
export function replacedAt<Row>(rows: readonly Row[], at: number, row: Row): Row[] {
  return rows.map((old, i) => (i === at ? row : old));
}

/** Freezes a value and everything in it that is not frozen yet. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const inner of Object.values(value)) deepFreeze(inner);
  return value;
}
