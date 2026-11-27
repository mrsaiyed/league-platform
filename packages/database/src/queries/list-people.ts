// The scope's league's people not in the bin (and not merged into another), by last
// name, first name, then id. `search` matches part of a name or public name in any
// capitals, and, only when the sensitive columns are asked for, of the contact email:
// a role that may not see emails cannot find a person by one (T-76).
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  allPersonColumns,
  personSummary,
  personSummaryWithSensitive,
  publicPersonColumns,
  type PersonSummary,
} from './person-summary.ts';
import { tickedButGrownSql } from './minor-by-age-sql.ts';

export type PeopleSearchRow = {
  search?: string;
  limit: number;
  offset: number;
  sensitive: boolean;
  /** Only people ticked as children and 18 or over by birth date, worked out here (step 2.146). */
  tickedButGrown?: boolean;
};

/** Makes `%`, `_` and `\` in what someone typed match themselves. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const curly = '\u2018\u2019';
const plain = "''";

export async function listPeople(
  scope: LeagueScope,
  { search, limit, offset, sensitive, tickedButGrown }: PeopleSearchRow,
): Promise<PersonSummary[]> {
  const pattern = search === undefined ? undefined : likePattern(search);
  const base = transactionOf(scope)
    .selectFrom('people')
    .where('league_id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .where('merged_into_id', 'is', null)
    .$if(tickedButGrown === true, (q) => q.where(tickedButGrownSql()))
    .$if(pattern !== undefined, (q) =>
      q.where((eb) =>
        eb.or([
          // Names only, for every role (never part of an email), with a curly apostrophe
          // stored in a name read as a plain one, as the search's own is (core's command).
          sql<boolean>`translate(first_name || ' ' || last_name, ${curly}, ${plain}) ilike ${pattern}`,
          sql<boolean>`translate(last_name || ' ' || first_name, ${curly}, ${plain}) ilike ${pattern}`,
          sql<boolean>`translate(coalesce(public_name, ''), ${curly}, ${plain}) ilike ${pattern}`,
        ]),
      ),
    )
    // Without regard to capitals: "de Vries" among the Ds, not after every capital Z.
    .orderBy(sql`lower(last_name)`)
    .orderBy(sql`lower(first_name)`)
    .orderBy('id')
    .limit(limit)
    .offset(offset);
  if (sensitive) {
    return (await base.select(allPersonColumns).execute()).map(personSummaryWithSensitive);
  }
  return (await base.select(publicPersonColumns).execute()).map(personSummary);
}
