// Copies what a new season takes from the program's last one (step 2.130, T-378), in the
// caller's transaction: the rules document as stored and the statistics the season names,
// its season-level setting values, its divisions (their tree, colors and order), and, if
// asked, its teams and their rosters. A team is carried as a new row of the new season
// with the old row's lineage (0008), its division the copy of its old one; a team in the
// bin or one that left (S-87) stays behind. A roster carries the players still on it and
// not in the bin, with their numbers, roles and order; their joining date is left empty
// and none is marked for review. Games, rounds, the schedule and the old season's own
// state are never copied.
import type { JsonObject } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type SeasonSetupCopyRow = {
  readonly fromSeasonId: string;
  readonly toSeasonId: string;
  readonly teams: boolean;
  readonly rosters: boolean;
};

export type SeasonSetupCopiedRow = {
  readonly divisions: number;
  readonly settings: number;
  readonly teams: number;
  readonly rosterEntries: number;
};

export async function copySeasonSetup(
  scope: LeagueScope,
  copy: SeasonSetupCopyRow,
): Promise<SeasonSetupCopiedRow> {
  const trx = transactionOf(scope);
  const leagueId = scope.leagueId;
  const from = await trx
    .selectFrom('seasons')
    .select(['rules', 'stat_keys'])
    .where('league_id', '=', leagueId)
    .where('id', '=', copy.fromSeasonId)
    .executeTakeFirstOrThrow();
  await trx
    .updateTable('seasons')
    .set({
      rules: from.rules as JsonObject,
      stat_keys: from.stat_keys.filter((key): key is string => key !== null),
    })
    .where('league_id', '=', leagueId)
    .where('id', '=', copy.toSeasonId)
    .execute();

  const settings = await trx
    .selectFrom('setting_values')
    .select(['key', 'value'])
    .where('league_id', '=', leagueId)
    .where('level', '=', 'season')
    .where('season_id', '=', copy.fromSeasonId)
    .execute();
  if (settings.length > 0) {
    await trx
      .insertInto('setting_values')
      .values(
        settings.map((row) => ({
          league_id: leagueId,
          level: 'season',
          season_id: copy.toSeasonId,
          key: row.key,
          value: row.value as JsonObject,
        })),
      )
      .execute();
  }

  // Parents before their children, so each copy can name its parent's copy.
  const divisions = await trx
    .selectFrom('divisions')
    .select(['id', 'parent_division_id', 'name', 'color', 'sort'])
    .where('league_id', '=', leagueId)
    .where('season_id', '=', copy.fromSeasonId)
    .where('deleted_at', 'is', null)
    .orderBy('sort')
    .orderBy('id')
    .execute();
  const divisionCopy = new Map<string, string>();
  let waiting = divisions;
  while (waiting.length > 0) {
    const ready = waiting.filter(
      (d) => d.parent_division_id === null || divisionCopy.has(d.parent_division_id),
    );
    if (ready.length === 0) break; // a parent in the bin: its children stay behind
    for (const division of ready) {
      const row = await trx
        .insertInto('divisions')
        .values({
          league_id: leagueId,
          season_id: copy.toSeasonId,
          parent_division_id:
            division.parent_division_id === null
              ? null
              : (divisionCopy.get(division.parent_division_id) ?? null),
          name: division.name,
          color: division.color,
          sort: division.sort,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      divisionCopy.set(division.id, row.id);
    }
    waiting = waiting.filter((d) => !divisionCopy.has(d.id));
  }

  let teams = 0;
  let rosterEntries = 0;
  if (copy.teams) {
    const oldTeams = await trx
      .selectFrom('teams')
      .select(['id', 'division_id', 'slug', 'name', 'color', 'stats_visibility', 'lineage_id'])
      .where('league_id', '=', leagueId)
      .where('season_id', '=', copy.fromSeasonId)
      .where('deleted_at', 'is', null)
      .where('left_at', 'is', null)
      .orderBy('id')
      .execute();
    for (const team of oldTeams) {
      const row = await trx
        .insertInto('teams')
        .values({
          league_id: leagueId,
          season_id: copy.toSeasonId,
          division_id:
            team.division_id === null ? null : (divisionCopy.get(team.division_id) ?? null),
          slug: team.slug,
          name: team.name,
          color: team.color,
          stats_visibility: team.stats_visibility,
          lineage_id: team.lineage_id,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      teams += 1;
      if (!copy.rosters) continue;
      const entries = await trx
        .selectFrom('roster_entries as r')
        .innerJoin('people as p', (join) =>
          join.onRef('p.league_id', '=', 'r.league_id').onRef('p.id', '=', 'r.person_id'),
        )
        .select(['r.person_id', 'r.jersey_number', 'r.role', 'r.sort'])
        .where('r.league_id', '=', leagueId)
        .where('r.team_id', '=', team.id)
        .where('r.left_on', 'is', null)
        .where('p.deleted_at', 'is', null)
        .orderBy('r.sort')
        .orderBy('r.id')
        .execute();
      if (entries.length === 0) continue;
      await trx
        .insertInto('roster_entries')
        .values(
          entries.map((entry) => ({
            league_id: leagueId,
            team_id: row.id,
            person_id: entry.person_id,
            jersey_number: entry.jersey_number,
            role: entry.role,
            sort: entry.sort,
          })),
        )
        .execute();
      rosterEntries += entries.length;
    }
  }
  return { divisions: divisionCopy.size, settings: settings.length, teams, rosterEntries };
}
