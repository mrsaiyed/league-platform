// Whether an id from an address can be a row's id: the database stores ids as UUIDs, so
// anything else is no row, asked of no database (where it could not even be cast).

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a UUID, the only shape a row's id has. */
export const isDatabaseId = (value: string): boolean => idPattern.test(value);
