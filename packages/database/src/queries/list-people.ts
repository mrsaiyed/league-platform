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

export type PeopleSearchRow = {
  search?: string;
  limit: number;
  offset: number;
  sensitive: boolean;
};

/** Makes `%`, `_` and `\` in what someone typed match themselves. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listPeople(
  scope: LeagueScope,
  { search, limit, offset, sensitive }: PeopleSearchRow,
): Promise<PersonSummary[]> {
  const pattern = search === undefined ? undefined : likePattern(search);
  const base = transactionOf(scope)
    .selectFrom('people')
    .where('league_id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .where('merged_into_id', 'is', null)
    .$if(pattern !== undefined, (q) =>
      q.where((eb) =>
        eb.or([
          sql<boolean>`(first_name || ' ' || last_name) ilike ${pattern}`,
          sql<boolean>`(last_name || ' ' || first_name) ilike ${pattern}`,
          sql<boolean>`coalesce(public_name, '') ilike ${pattern}`,
          ...(sensitive ? [sql<boolean>`coalesce(contact_email, '') ilike ${pattern}`] : []),
        ]),
      ),
    )
    .orderBy('last_name')
    .orderBy('first_name')
    .orderBy('id')
    .limit(limit)
    .offset(offset);
  if (sensitive) {
    return (await base.select(allPersonColumns).execute()).map(personSummaryWithSensitive);
  }
  return (await base.select(publicPersonColumns).execute()).map(personSummary);
}
