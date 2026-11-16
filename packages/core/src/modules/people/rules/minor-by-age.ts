// R-28: whether a person counts as a child. Where the record has a date of birth, that
// date decides (under 18 on the league's own today, in its time zone), whatever the
// "minor" tick says; the tick is only for records with no date. A child must never be
// shown in full because a box was left unticked.
//
// This is the one rule every reader of "is this person a child" goes through: the
// people commands (setNameRequest) and the made-up world's reads call it, and the
// database works out the same rule in SQL inside its own reads, so a birth date never
// leaves it (packages/database queries/minor-by-age-sql.ts, held to this function by
// its test). What it answers is then read by shownAsChild (name-policy.ts), which
// decides a person whose age is still not known by the league's audience (R-15).

/** What the rule reads of a person: never more than the two sensitive fields. */
export type MinorFacts = {
  /** A date, yyyy-mm-dd, or null where the league has none. */
  readonly birthDate: string | null;
  /** The "minor" tick: null where the league does not know. */
  readonly isMinor: boolean | null;
};

/** The age at which a person stops counting as a child (R-28: "under 18 today"). */
export const adultAge = 18;

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whether the person counts as a child on `today`, the league's own day (yyyy-mm-dd, in
 * the league's time zone; `dayIn` of the leagues module gives it): true, false, or null
 * where neither a birth date nor the tick says.
 *
 * With a birth date: a child until their 18th birthday, which is the first day they are
 * not (someone born on 29 February is a child until 1 March in a year with no 29th). A
 * birth date after today cannot be saved (T3 §3: the commands and the database refuse
 * it); were one ever read, the person counts as a child, the careful reading. A value
 * that is not a yyyy-mm-dd date is no birth date, so the tick decides. Without one, the
 * tick: true or false, and anything else counts as not known.
 */
export function isMinorOn(person: MinorFacts, today: string): boolean | null {
  const born = person.birthDate === null ? null : datePattern.exec(person.birthDate);
  if (born !== null) {
    const [, year = '', month = '', day = ''] = born;
    // Their 18th birthday as the same month and day 18 years on, compared as text: a
    // 29 February birthday falls after every 28 February and before every 1 March.
    const eighteenth = `${String(Number(year) + adultAge).padStart(4, '0')}-${month}-${day}`;
    return eighteenth > today;
  }
  if (person.isMinor === true) return true;
  if (person.isMinor === false) return false;
  return null;
}
