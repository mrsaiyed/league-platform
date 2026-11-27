// R-28 in SQL (changed November 17): whether a row of `people` counts as a child, worked
// out inside the database so a birth date never leaves it (record 080): a query that needs
// to know selects this, a yes, a no or "not known", never the date. It is core's rule
// (isMinorOn, the people module's minor-by-age.ts) written for the database: a child if
// the "minor" tick is on or their birth date says so (under 18 on the league's own today,
// in its time zone, by the database's clock); a date that says adult unticks no one; a
// date that cannot be read against the league's today (its league row not found) counts
// as a child; with no date, the tick, and with no tick "not known", except for a player
// typed in at a scorer's table (a roster place with `added_at_game_id`), who counts as a
// child until an admin says otherwise (S-136). Its test runs core's cases through both and
// finds the same answers.
//
// The expression reads `people.birth_date`, `people.is_minor`, `people.league_id` and
// `people.id`, so it is used in a query whose people table is named `people`. Built here, run by the queries
// that select it (list-public-roster.ts, list-people-for-display.ts, has-recorded-child.ts,
// find-person-is-minor.ts).
import { adultAge } from '@srleagues/core';
import { sql, type RawBuilder } from 'kysely';

/** Today in the person's own league's time zone, by the database's clock (find-league-today.ts). */
const leagueTodayOfPerson: RawBuilder<string> = sql<string>`(
  select (now() at time zone minor_league.time_zone)::date
    from leagues as minor_league
   where minor_league.id = people.league_id
)`;

/**
 * Whether the `people` row is ticked as a child though their birth date makes them 18 or
 * over on `today` (core's tickedButGrownOn): a yes or a no, never the date.
 */
export function tickedButGrownSql(
  today: RawBuilder<string> = leagueTodayOfPerson,
): RawBuilder<boolean> {
  return sql<boolean>`(people.is_minor is true and people.birth_date is not null and coalesce(
    people.birth_date <= (${today} - make_interval(years => ${sql.lit(adultAge)}))::date,
    false
  ))`;
}

/** Whether any roster place of the person was added at a scorer's table (MinorOrigin). */
const addedAtTableOfPerson: RawBuilder<boolean> = sql<boolean>`exists (
  select 1
    from roster_entries as table_entry
   where table_entry.league_id = people.league_id
     and table_entry.person_id = people.id
     and table_entry.added_at_game_id is not null
)`;

/**
 * What only what is recorded says (the date or the tick), with nobody counted a child for
 * having been added at a scorer's table: whether the league has a recorded child (S-109).
 */
export const recordedOnly: RawBuilder<boolean> = sql<boolean>`false`;

/**
 * True, false or null for the `people` row in the query, on `today` (a date expression;
 * the person's league's own today unless a test gives another) and with `addedAtTable`
 * (whether a roster place of theirs was added at a scorer's table, read from
 * `roster_entries` unless the caller gives `recordedOnly` or a test gives another). By date, a child while
 * their 18th birthday is after today: born after the day 18 years before today, which is
 * 28 February when today is 29 February, so a 29 February child stays one until 1 March.
 * A comparison that gives no answer (no today) is a child's: the careful reading.
 */
export function isMinorSql(
  given: {
    readonly today?: RawBuilder<string>;
    readonly addedAtTable?: RawBuilder<boolean>;
  } = {},
): RawBuilder<boolean | null> {
  const today = given.today ?? leagueTodayOfPerson;
  const addedAtTable = given.addedAtTable ?? addedAtTableOfPerson;
  return sql<boolean | null>`(case
    when people.is_minor is true then true
    when people.birth_date is not null
      then coalesce(
        people.birth_date > (${today} - make_interval(years => ${sql.lit(adultAge)}))::date,
        true
      )
    when people.is_minor is false then false
    when ${addedAtTable} then true
    else null
  end)`;
}
