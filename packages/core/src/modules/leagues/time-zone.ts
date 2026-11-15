// A league's time zone (T3 §4, P3 §1 step 2 "Where"): a named zone such as
// America/Chicago, never an offset or an abbreviation. PostgreSQL reads
// `at time zone '+05:00'` as five hours WEST of UTC (the POSIX sign), the opposite of
// what anyone typing it means, and several queries use leagues.time_zone that way; an
// abbreviation such as EST or CST6CDT is ambiguous or ignores summer time. So only a
// name made of an area and a place, or UTC itself, is accepted, and it is kept in the
// form the runtime calls canonical ("america/chicago" becomes "America/Chicago").

/** The areas of the time zone names (the tz database's continents and oceans). */
const areas = new Set([
  'africa',
  'america',
  'antarctica',
  'arctic',
  'asia',
  'atlantic',
  'australia',
  'europe',
  'indian',
  'pacific',
]);

const canonical = (value: string): string | undefined => {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

/** Area/Place, such as America/Argentina/Buenos_Aires or US/Central (an old alias). */
const placeName = /^[A-Za-z]+(?:\/[A-Za-z0-9_-]+)+$/;

const isNamedForm = (name: string) => {
  if (name === 'UTC') return true;
  if (!placeName.test(name)) return false;
  return areas.has(name.slice(0, name.indexOf('/')).toLowerCase());
};

/**
 * The canonical name of a named time zone the runtime knows, or undefined for anything
 * else: an offset (+05:00, Etc/GMT+5), an abbreviation (EST, CST6CDT, GMT) or a name
 * it does not know. UTC and Etc/UTC are both kept as UTC.
 */
export function namedTimeZone(value: string): string | undefined {
  const given = value.trim();
  if (given.length === 0 || given.length > 64) return undefined;
  const isUtc = /^(?:etc\/)?utc$/i.test(given);
  // The name as typed must already be a place name (or UTC): an abbreviation the
  // runtime maps to a place, such as EST, is still refused.
  if (!isUtc && !placeName.test(given)) return undefined;
  if (/^etc\//i.test(given) && !isUtc) return undefined;
  const name = canonical(given);
  if (name === undefined || name.length > 64 || !isNamedForm(name)) return undefined;
  return name;
}
