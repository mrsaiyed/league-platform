// What code outside packages/database holds for the database: an opaque handle. The
// Kysely instance behind it is reached only from inside this package, so queries
// are written here and nowhere else (T2 §1–2), and every one runs through
// withTransaction (T-28, T-61).
import type { Kysely } from 'kysely';
import type { Database } from './schema-types.ts';

declare const handleBrand: unique symbol;

/** An open database, made by createDatabase. Pass it to withTransaction. */
export type DatabaseHandle = {
  /** Closes the connections this handle opened. A PGlite passed in stays open. */
  readonly close: () => Promise<void>;
  readonly [handleBrand]: true;
};

const open = new WeakMap<DatabaseHandle, Kysely<Database>>();

/** Wraps a Kysely instance in a handle. Only createDatabase calls this. */
export function handleFor(kysely: Kysely<Database>): DatabaseHandle {
  // The brand is a type with no value: this cast is the only way to make a handle.
  const handle = Object.freeze({ close: () => kysely.destroy() }) as DatabaseHandle;
  open.set(handle, kysely);
  return handle;
}

/** The Kysely instance behind a handle. Not exported from the package. */
export function kyselyOf(handle: DatabaseHandle): Kysely<Database> {
  const kysely = open.get(handle);
  if (kysely === undefined) throw new Error('Not a database handle made by createDatabase.');
  return kysely;
}
