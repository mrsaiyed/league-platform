// R-28 (changed November 17): whether a person counts as a child. A child if their date
// of birth says so (under 18 on the league's own today, in its time zone) OR the "minor"
// tick is on. A date that says adult unticks no one: the admin unticks to show more. A
// date that cannot be read counts as a child. With no date, the tick says, and with no
// tick either the league does not know, except for a player typed in at a scorer's table
// (step 2.146, S-136): they come with no age, so they count as a child until an admin
// says otherwise, by the tick either way or a date. A child must never be shown in full
// because a box was left unticked, a birth year was mistyped, an 18th birthday came with
// nobody deciding, or a child walked up to the scorer's table in an adult league.
//
// The rule lives twice (record 080): here, for the made-up world's reads, and in SQL
// inside the database's own reads and the people store's "is this person a child"
// (packages/database queries/minor-by-age-sql.ts), so a birth date never leaves the
// database. A parity test holds the two together. What it answers is then read by
// shownAsChild (name-policy.ts), which decides a person whose age is still not known by
// the league's audience (R-15).

/** What the rule reads of a person: never more than the two sensitive fields. */
export type MinorFacts = {
  /** A date, yyyy-mm-dd, or null where the league has none. */
  readonly birthDate: string | null;
  /** The "minor" tick: null where the league does not know. */
  readonly isMinor: boolean | null;
};

/**
 * Where the person came from, as far as the rule reads it: whether any roster place of
 * theirs was added at a game's scorer's table (`roster_entries.added_at_game_id`). A read
 * of what is recorded only (whether the league has a recorded child, S-109) gives false.
 */
export type MinorOrigin = {
  readonly addedAtTable: boolean;
};

/**
 * Whether the person is ticked as a child though their birth date says they are 18 or over
 * on `today` (step 2.146): the people an admin may want to untick, as the tick is never
 * taken off by a date (R-28). False with no date or a date that cannot be read. The
 * database answers it in SQL (tickedButGrownSql), so the date never leaves it.
 */
export function tickedButGrownOn(person: MinorFacts, today: string): boolean {
  if (person.isMinor !== true || person.birthDate === null) return false;
  return (
    isMinorOn({ birthDate: person.birthDate, isMinor: null }, today, { addedAtTable: false }) ===
    false
  );
}

/**
 * Whether the person counts as a child only because they were added at a scorer's table
 * with no age (S-136 as amended in the fix round of step 2.146): no birth date, the tick
 * neither on nor off, and a roster place added at a table. These are the people an admin
 * may want to mark, by the tick either way or a date, after which the rule no longer
 * applies to them. The database answers it in SQL (walkUpOfUnknownAgeSql).
 */
export function walkUpOfUnknownAgeOn(person: MinorFacts, origin: MinorOrigin): boolean {
  return origin.addedAtTable && person.birthDate === null && person.isMinor === null;
}

/** The age at which a person stops counting as a child (R-28: "under 18 today"). */
export const adultAge = 18;

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `value` is a real calendar date written yyyy-mm-dd: 2012-02-30 is not one. */
function isCalendarDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Whether the person counts as a child on `today`, the league's own day (yyyy-mm-dd, in
 * the league's time zone; `dayIn` of the leagues module gives it): true, false, or null
 * where neither a birth date nor the tick says.
 *
 * The tick on: a child, whatever the date says. Otherwise, with a birth date: a child
 * until their 18th birthday, the first day they are not (someone born on 29 February is a
 * child until 1 March in a year with no 29th); a birth date after today cannot be saved
 * (T3 §3), and were one ever read the person counts as a child; a date that cannot be read
 * counts as a child too. Without a date: the tick off is an adult, and anything but true
 * or false counts as not known, but a player added at a scorer's table, who came with no
 * age, counts as a child (S-136).
 */
export function isMinorOn(person: MinorFacts, today: string, origin: MinorOrigin): boolean | null {
  if (person.isMinor === true) return true;
  if (person.birthDate !== null) {
    if (!isCalendarDate(person.birthDate)) return true;
    const [year, month, day] = person.birthDate.split('-');
    // Their 18th birthday as the same month and day 18 years on, compared as text: a
    // 29 February birthday falls after every 28 February and before every 1 March.
    const eighteenth = `${String(Number(year) + adultAge).padStart(4, '0')}-${month}-${day}`;
    return eighteenth > today;
  }
  if (person.isMinor === false) return false;
  return origin.addedAtTable ? true : null;
}
