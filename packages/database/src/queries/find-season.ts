// A season of the scope's league that is not in the bin, field by field (T-29). The
// rules come back as stored, whatever their version.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type SeasonRow = {
  id: string;
  programId: string;
  slug: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  status: string;
  isCurrent: boolean;
  rules: unknown;
  version: number;
};

export async function findSeason(
  scope: LeagueScope,
  seasonId: string,
): Promise<SeasonRow | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('seasons')
    .select([
      'id',
      'program_id',
      'slug',
      'name',
      'starts_on',
      'ends_on',
      'status',
      'is_current',
      'rules',
      'version',
    ])
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (row === undefined) return undefined;
  return {
    id: row.id,
    programId: row.program_id,
    slug: row.slug,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    status: row.status,
    isCurrent: row.is_current,
    rules: row.rules,
    version: row.version,
  };
}
