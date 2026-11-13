// A UUID in its usual written form, lower case: the only form the database reads as
// a league or account (0005, public.current_league_id).
const lowerUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The id in lower case, or null when it is not a UUID. */
export function normalizedUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  return lowerUuid.test(lower) ? lower : null;
}
