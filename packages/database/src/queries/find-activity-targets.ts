// What the activity log's entries point at, named as they are now (step 2.77, A-6): the
// teams, people, games, seasons, divisions and venues one page of entries names, and the
// team of a standings adjustment, all in one read of the scope's league. Things in the bin
// are found too, since an entry about a removal names what was removed; a thing purged
// for good is not, and the page then says the entry's plain sentence.
//
// A person's name is the record's own first and last name, which the page writes the
// way the admin's People page does; a game is its two teams and when it starts.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type ActivityTargetKind =
  | 'team'
  | 'person'
  | 'game'
  | 'season'
  | 'division'
  | 'venue'
  | 'adjustment';

export type ActivityTargetAsk = { readonly kind: ActivityTargetKind; readonly id: string };

export type ActivityTargetName =
  | {
      readonly kind: 'team' | 'season' | 'division' | 'venue' | 'adjustment';
      readonly id: string;
      /** For an adjustment, its team's name. */
      readonly name: string;
    }
  | {
      readonly kind: 'person';
      readonly id: string;
      readonly firstName: string;
      readonly lastName: string;
    }
  | {
      readonly kind: 'game';
      readonly id: string;
      readonly homeName: string;
      readonly awayName: string;
      readonly startsAt: string | null;
    };

type Row = {
  kind: ActivityTargetKind;
  id: string;
  name: string;
  second_name: string | null;
  starts_at: Date | string | null;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function findActivityTargets(
  scope: LeagueScope,
  asks: readonly ActivityTargetAsk[],
): Promise<readonly ActivityTargetName[]> {
  const league = scope.leagueId;
  const idsOf = (kind: ActivityTargetKind) => [
    ...new Set(asks.filter((a) => a.kind === kind && uuid.test(a.id)).map((a) => a.id)),
  ];
  if (asks.every((a) => !uuid.test(a.id))) return [];
  const { rows } = await sql<Row>`
    select 'team' as kind, t.id, t.name, null::text as second_name,
        null::timestamptz as starts_at
      from teams t where t.league_id = ${league} and t.id = any(${idsOf('team')}::uuid[])
    union all
    select 'person', p.id, coalesce(p.first_name, ''), coalesce(p.last_name, ''), null
      from people p where p.league_id = ${league} and p.id = any(${idsOf('person')}::uuid[])
    union all
    select 'game', g.id, h.name, a.name, g.starts_at
      from games g
      join teams h on h.league_id = g.league_id and h.id = g.home_team_id
      join teams a on a.league_id = g.league_id and a.id = g.away_team_id
      where g.league_id = ${league} and g.id = any(${idsOf('game')}::uuid[])
    union all
    select 'season', s.id, s.name, null, null
      from seasons s where s.league_id = ${league} and s.id = any(${idsOf('season')}::uuid[])
    union all
    select 'division', d.id, d.name, null, null
      from divisions d
      where d.league_id = ${league} and d.id = any(${idsOf('division')}::uuid[])
    union all
    select 'venue', v.id, v.name, null, null
      from venues v where v.league_id = ${league} and v.id = any(${idsOf('venue')}::uuid[])
    union all
    select 'adjustment', j.id, t.name, null, null
      from standings_adjustments j
      join teams t on t.league_id = j.league_id and t.id = j.team_id
      where j.league_id = ${league} and j.id = any(${idsOf('adjustment')}::uuid[])
  `.execute(transactionOf(scope));
  return rows.map((row): ActivityTargetName => {
    if (row.kind === 'person') {
      return {
        kind: 'person',
        id: row.id,
        firstName: row.name,
        lastName: row.second_name ?? '',
      };
    }
    if (row.kind === 'game') {
      return {
        kind: 'game',
        id: row.id,
        homeName: row.name,
        awayName: row.second_name ?? '',
        startsAt: row.starts_at === null ? null : new Date(row.starts_at).toISOString(),
      };
    }
    return { kind: row.kind, id: row.id, name: row.name };
  });
}
