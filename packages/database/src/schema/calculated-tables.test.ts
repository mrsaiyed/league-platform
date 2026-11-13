// T3 §9, S-9, S-10: the calculated tables. A team has one standings row in its
// season, with seeds 1 to n once in each table; an adjustment changes something and
// says why; a player has one set of totals per season.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asApp,
  freshSchema,
  newDivision,
  newLeague,
  newPerson,
  newSeason,
  newTeam,
  refused,
  type Sql,
} from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

async function season() {
  const league = await newLeague(db);
  const seasonId = await newSeason(db, league.leagueId, league.defaultProgramId);
  return { ...league, seasonId };
}

type Made = Awaited<ReturnType<typeof season>>;

const refusedBy = (constraint: string, kind: { code: string } = refused.check) => ({
  ...kind,
  constraint,
});

const row = (
  sql: Sql,
  s: Made,
  teamId: string,
  columns: Record<string, unknown> = {},
  seasonId = s.seasonId,
) => {
  const all: Record<string, unknown> = {
    league_id: s.leagueId,
    season_id: seasonId,
    team_id: teamId,
    rank: 1,
    seed: 1,
    ...columns,
  };
  const names = Object.keys(all);
  return sql.query(
    `insert into standings_rows (${names.join(', ')})
     values (${names.map((_, k) => `$${k + 1}`).join(', ')})`,
    Object.values(all),
  );
};

describe('standings rows (T3 §9)', () => {
  it('give a team one row in its season, and each seed once per table', async () => {
    const s = await season();
    const north = await newDivision(db, s.leagueId, s.seasonId);
    const south = await newDivision(db, s.leagueId, s.seasonId);
    const [a, b, c, d] = [
      await newTeam(db, s.leagueId, s.seasonId, { divisionId: north }),
      await newTeam(db, s.leagueId, s.seasonId, { divisionId: north }),
      await newTeam(db, s.leagueId, s.seasonId, { divisionId: south }),
      await newTeam(db, s.leagueId, s.seasonId),
    ];
    await row(db, s, a!, { division_id: north });
    await expect(row(db, s, a!, { division_id: north, seed: 2 })).rejects.toMatchObject(
      refusedBy('standings_rows_team_once', refused.unique),
    );
    await expect(row(db, s, b!, { division_id: north })).rejects.toMatchObject(
      refusedBy('standings_rows_seed_once', refused.unique),
    );
    // Tied teams share a rank but never a seed.
    await row(db, s, b!, { division_id: north, seed: 2 });
    await row(db, s, c!, { division_id: south });
    // A season without divisions is one table: seeds are unique in it too.
    await row(db, s, d!);
    const e = await newTeam(db, s.leagueId, s.seasonId);
    await expect(row(db, s, e)).rejects.toMatchObject(
      refusedBy('standings_rows_seed_once', refused.unique),
    );
  });

  it('name a team and division of their own season and league (T-40)', async () => {
    const s = await season();
    const otherSeason = await newSeason(db, s.leagueId, s.defaultProgramId);
    const elsewhere = await newTeam(db, s.leagueId, otherSeason);
    await expect(row(db, s, elsewhere)).rejects.toMatchObject(
      refusedBy('standings_rows_team', refused.foreignKey),
    );
    const team = await newTeam(db, s.leagueId, s.seasonId);
    const otherDivision = await newDivision(db, s.leagueId, otherSeason);
    await expect(row(db, s, team, { division_id: otherDivision })).rejects.toMatchObject(
      refusedBy('standings_rows_division', refused.foreignKey),
    );
    const other = await season();
    const theirs = await newTeam(db, other.leagueId, other.seasonId);
    await expect(row(db, s, theirs, {}, other.seasonId)).rejects.toMatchObject(refused.foreignKey);
  });

  it('keep counts, places, streak and what decided the place in range', async () => {
    const s = await season();
    const team = await newTeam(db, s.leagueId, s.seasonId);
    for (const [columns, constraint] of [
      [{ rank: 0 }, 'standings_rows_place_positive'],
      [{ seed: 0 }, 'standings_rows_place_positive'],
      [{ wins: -1 }, 'standings_rows_counts_range'],
      [{ points_against: -1 }, 'standings_rows_counts_range'],
      [{ streak_result: 'won' }, 'standings_rows_streak'],
      [{ streak_length: 2 }, 'standings_rows_streak'],
      [{ streak_result: 'drew', streak_length: 1 }, 'standings_rows_streak'],
      [{ streak_result: 'won', streak_length: 0 }, 'standings_rows_streak'],
      [{ decided_by: 'record' }, 'standings_rows_decided_by'],
    ] as const) {
      await expect(row(db, s, team, columns)).rejects.toMatchObject(refusedBy(constraint));
    }
    await row(db, s, team, {
      games_played: 3,
      wins: 2,
      losses: 1,
      points_for: 150,
      points_against: 140,
      standings_points: 4,
      streak_result: 'won',
      streak_length: 2,
      decided_by: 'still-tied',
    });
  });

  it('are rebuilt by removing and writing again', async () => {
    const s = await season();
    const team = await newTeam(db, s.leagueId, s.seasonId);
    await asApp(db, { league: s.leagueId }, async (tx) => {
      await row(tx, s, team);
      await tx.query('delete from standings_rows where season_id = $1', [s.seasonId]);
      await row(tx, s, team, { wins: 1, games_played: 1 });
    });
  });
});

describe('standings adjustments (S-10)', () => {
  const adjust = (sql: Sql, s: Made, teamId: string, columns: Record<string, unknown>) => {
    const all: Record<string, unknown> = {
      league_id: s.leagueId,
      season_id: s.seasonId,
      team_id: teamId,
      reason: 'Forfeit win awarded by ruling',
      account_id: s.ownerId,
      ...columns,
    };
    const names = Object.keys(all);
    return sql.query<{ id: string }>(
      `insert into standings_adjustments (${names.join(', ')})
       values (${names.map((_, k) => `$${k + 1}`).join(', ')}) returning id`,
      Object.values(all),
    );
  };

  it('change something, within range, and say why', async () => {
    const s = await season();
    const team = await newTeam(db, s.leagueId, s.seasonId);
    await expect(adjust(db, s, team, {})).rejects.toMatchObject(
      refusedBy('standings_adjustments_changes_something'),
    );
    await expect(adjust(db, s, team, { wins: 1001 })).rejects.toMatchObject(
      refusedBy('standings_adjustments_range'),
    );
    for (const reason of ['', '  ', 'x'.repeat(501)]) {
      await expect(adjust(db, s, team, { points: -2, reason })).rejects.toMatchObject(
        refusedBy('standings_adjustments_reason_length'),
      );
    }
    await adjust(db, s, team, { wins: 1, losses: -1 });
    await adjust(db, s, team, { points: -2 });
  });

  it('name a team of their own season, and go to the bin rather than away', async () => {
    const s = await season();
    const otherSeason = await newSeason(db, s.leagueId, s.defaultProgramId);
    const elsewhere = await newTeam(db, s.leagueId, otherSeason);
    await expect(adjust(db, s, elsewhere, { points: -1 })).rejects.toMatchObject(
      refusedBy('standings_adjustments_team', refused.foreignKey),
    );
    const team = await newTeam(db, s.leagueId, s.seasonId);
    const { rows } = await adjust(db, s, team, { points: -1 });
    const id = rows[0]?.id;
    await asApp(db, { league: s.leagueId }, (tx) =>
      tx.query('update standings_adjustments set deleted_at = now() where id = $1', [id]),
    );
    await expect(
      asApp(db, { league: s.leagueId }, (tx) =>
        tx.query('delete from standings_adjustments where id = $1', [id]),
      ),
    ).rejects.toMatchObject(refused.privilege);
  });
});

describe('season player totals (T3 §9)', () => {
  const totals = (sql: Sql, s: Made, personId: string, columns: Record<string, unknown> = {}) => {
    const all: Record<string, unknown> = {
      league_id: s.leagueId,
      season_id: s.seasonId,
      person_id: personId,
      ...columns,
    };
    const names = Object.keys(all);
    return sql.query(
      `insert into season_player_totals (${names.join(', ')})
       values (${names.map((_, k) => `$${k + 1}`).join(', ')})`,
      Object.values(all),
    );
  };

  it('are one row per player per season', async () => {
    const s = await season();
    const person = await newPerson(db, s.leagueId);
    await totals(db, s, person, { games_played: 2 });
    await expect(totals(db, s, person)).rejects.toMatchObject(
      refusedBy('season_player_totals_once', refused.unique),
    );
    const next = await newSeason(db, s.leagueId, s.defaultProgramId);
    await totals(db, { ...s, seasonId: next }, person);
  });

  it('name a person of their own league (T-40)', async () => {
    const a = await season();
    const b = await season();
    const theirs = await newPerson(db, b.leagueId);
    await expect(totals(db, a, theirs)).rejects.toMatchObject(
      refusedBy('season_player_totals_person', refused.foreignKey),
    );
  });

  it('keep counts in range and stats as a versioned document', async () => {
    const s = await season();
    const person = await newPerson(db, s.leagueId);
    for (const columns of [
      { games_played: -1 },
      { games_played: 1, seconds_games: 2 },
      { seconds_played: -1 },
    ]) {
      await expect(totals(db, s, person, columns)).rejects.toMatchObject(
        refusedBy('season_player_totals_counts_range'),
      );
    }
    await expect(totals(db, s, person, { stats: '{"points": 4}' })).rejects.toMatchObject(
      refusedBy('season_player_totals_stats_document'),
    );
    await totals(db, s, person, {
      games_played: 2,
      seconds_played: 2400,
      seconds_games: 2,
      stats: JSON.stringify({ version: 1, stats: { points: { total: 17, gamesRecorded: 2 } } }),
    });
  });
});
