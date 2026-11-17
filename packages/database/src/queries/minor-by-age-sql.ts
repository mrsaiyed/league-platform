// R-28 in SQL (changed November 17): whether a row of `people` counts as a child, worked
// out inside the database so a birth date never leaves it (record 080): a query that needs
// to know selects this, a yes, a no or "not known", never the date. It is core's rule
// (isMinorOn, the people module's minor-by-age.ts) written for the database: a child if
// the "minor" tick is on or their birth date says so (under 18 on the league's own today,
// in its time zone, by the database's clock); a date that says adult unticks no one; a
// date that cannot be read against the league's today (its league row not found) counts
// as a child; with no date, the tick, and with no tick "not known". Its test runs core's
// cases through both and finds the same answers.
//
// The expression reads `people.birth_date`, `people.is_minor` and `people.league_id`, so it
// is used in a query whose people table is named `people`. Built here, run by the queries
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
 * True, false or null for the `people` row in the query, on `today` (a date expression;
 * the person's league's own today unless a test gives another). By date, a child while
 * their 18th birthday is after today: born after the day 18 years before today, which is
 * 28 February when today is 29 February, so a 29 February child stays one until 1 March.
 * A comparison that gives no answer (no today) is a child's: the careful reading.
 */
export function isMinorSql(
  today: RawBuilder<string> = leagueTodayOfPerson,
): RawBuilder<boolean | null> {
  return sql<boolean | null>`(case
    when people.is_minor is true then true
    when people.birth_date is not null
      then coalesce(
        people.birth_date > (${today} - make_interval(years => ${sql.lit(adultAge)}))::date,
        true
      )
    else people.is_minor
  end)`;
}
