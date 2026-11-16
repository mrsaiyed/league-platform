// R-28 in SQL: whether a row of `people` counts as a child, worked out inside the database
// so a birth date never leaves it (step 2.146): a query that needs to know selects this,
// a yes, a no or "not known", never the date. It is core's one rule (isMinorOn, the people
// module's minor-by-age.ts) written for the database: the birth date decides where there
// is one (under 18 on the league's own today, in its time zone, by the database's clock),
// whatever the "minor" tick says; the tick only where there is none. Its test runs core's
// cases through both and finds the same answers.
//
// The expression reads `people.birth_date`, `people.is_minor` and `people.league_id`, so it
// is used in a query whose people table is named `people`. Built here, run by the queries
// that select it (list-public-roster.ts, list-people-for-display.ts, has-recorded-child.ts).
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
 * the person's league's own today unless a test gives another). A child while their 18th
 * birthday is after today: born after the day 18 years before today, which is 28 February
 * when today is 29 February, so a 29 February child stays one until 1 March.
 */
export function isMinorSql(
  today: RawBuilder<string> = leagueTodayOfPerson,
): RawBuilder<boolean | null> {
  return sql<boolean | null>`(case
    when people.birth_date is not null
      then people.birth_date > (${today} - make_interval(years => ${sql.lit(adultAge)}))::date
    else people.is_minor
  end)`;
}
