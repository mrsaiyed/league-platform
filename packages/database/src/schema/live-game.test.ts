// T3 §8 and §12, T6 §1 and §5, S-5, S-6: the live game's tables. Every tap is saved
// once (each command id and each seq once per game, in order) and never changed;
// one device scores a game at a time; a game has one state; a player has one line
// per game, for a team playing in it; a player added at the scorer's table says so.
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asApp,
  freshSchema,
  newGame,
  newLeague,
  newPerson,
  newRosterEntry,
  newSeason,
  newStage,
  newTeam,
  one,
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

/** A league with a season, its stage, two teams, a person on the home team, and a live game. */
async function game() {
  const league = await newLeague(db);
  const seasonId = await newSeason(db, league.leagueId, league.defaultProgramId);
  const stageId = await newStage(db, league.leagueId, seasonId);
  const homeTeamId = await newTeam(db, league.leagueId, seasonId);
  const awayTeamId = await newTeam(db, league.leagueId, seasonId);
  const gameId = await newGame(db, {
    leagueId: league.leagueId,
    seasonId,
    stageId,
    homeTeamId,
    awayTeamId,
    columns: { status: 'live', capture_mode: 'live', home_score: 0, away_score: 0 },
  });
  const personId = await newPerson(db, league.leagueId);
  await newRosterEntry(db, league.leagueId, homeTeamId, personId, { jersey: '23' });
  return { ...league, seasonId, stageId, homeTeamId, awayTeamId, gameId, personId };
}

type Made = Awaited<ReturnType<typeof game>>;

const event = (
  sql: Sql,
  g: Pick<Made, 'leagueId' | 'gameId'>,
  seq: number,
  options: { commandId?: string; type?: string; payload?: string } = {},
) =>
  sql.query<{ id: string }>(
    `insert into game_events (league_id, game_id, seq, command_id, type, payload, tapped_at)
     values ($1, $2, $3, $4, $5, $6, now()) returning id`,
    [
      g.leagueId,
      g.gameId,
      seq,
      options.commandId ?? randomUUID(),
      options.type ?? 'score',
      options.payload ?? '{"side": "home", "playerId": "p1", "points": 2}',
    ],
  );

const refusedBy = (constraint: string, kind: { code: string } = refused.check) => ({
  ...kind,
  constraint,
});

describe('game events (T3 §8, §12)', () => {
  it('refuse the same command id twice in one game: a tap cannot be saved twice', async () => {
    const g = await game();
    const commandId = randomUUID();
    await event(db, g, 1, { commandId });
    await expect(event(db, g, 2, { commandId })).rejects.toMatchObject(
      refusedBy('game_events_command_once', refused.unique),
    );
    // Another game may carry the same id: the rule is per game.
    const other = await game();
    await event(db, other, 1, { commandId });
  });

  it('refuse the same command id twice even when the app sends it (T-47)', async () => {
    const g = await game();
    const commandId = randomUUID();
    await asApp(db, { league: g.leagueId }, (tx) => event(tx, g, 1, { commandId }));
    await expect(
      asApp(db, { league: g.leagueId }, (tx) => event(tx, g, 2, { commandId })),
    ).rejects.toMatchObject(refusedBy('game_events_command_once', refused.unique));
  });

  it('take each place in the game once, from 1, with no gaps', async () => {
    const g = await game();
    await expect(event(db, g, 0)).rejects.toMatchObject(refusedBy('game_events_seq_positive'));
    await expect(event(db, g, 2)).rejects.toMatchObject(refusedBy('game_events_in_order'));
    await event(db, g, 1);
    await expect(event(db, g, 1)).rejects.toMatchObject(
      refusedBy('game_events_seq_once', refused.unique),
    );
    await event(db, g, 2);
    await expect(event(db, g, 4)).rejects.toMatchObject(refusedBy('game_events_in_order'));
    // Another game's events do not count toward this one's order.
    const other = await game();
    await expect(event(db, other, 3)).rejects.toMatchObject(refusedBy('game_events_in_order'));
  });

  it('are taken in order in the same way at every isolation level (no lock to take)', async () => {
    const g = await game();
    for (const [seq, level] of [
      [1, 'repeatable read'],
      [2, 'serializable'],
    ] as const) {
      await db.transaction(async (tx) => {
        await tx.exec(`set transaction isolation level ${level}`);
        await event(tx, g, seq);
      });
    }
  });

  it('can never be changed or removed, even by the tables’ owner (T-45)', async () => {
    const g = await game();
    const { rows } = await event(db, g, 1);
    const id = rows[0]?.id;
    for (const sql of [
      `update game_events set payload = '{"side": "away"}' where id = $1`,
      'update game_events set seq = 9 where id = $1',
      'delete from game_events where id = $1',
    ]) {
      await expect(db.query(sql, [id])).rejects.toMatchObject(refused.restrict);
    }
    for (const sql of [
      `update game_events set type = 'foul' where id = $1`,
      'delete from game_events where id = $1',
    ]) {
      await expect(
        asApp(db, { league: g.leagueId }, (tx) => tx.query(sql, [id])),
      ).rejects.toMatchObject(refused.privilege);
    }
    const kept = await one<{ type: string; seq: number }>(
      db,
      'select type, seq from game_events where id = $1',
      [id],
    );
    expect(kept).toEqual({ type: 'score', seq: 1 });
  });

  it('belong to a game of their own league (T-40)', async () => {
    const a = await game();
    const b = await game();
    await expect(event(db, { leagueId: a.leagueId, gameId: b.gameId }, 1)).rejects.toMatchObject(
      refusedBy('game_events_game', refused.foreignKey),
    );
  });

  it("hold the engine's command as a type and an object payload", async () => {
    const g = await game();
    for (const type of ['', 'Score', 'score!', 'x'.repeat(41)]) {
      await expect(event(db, g, 1, { type })).rejects.toMatchObject(
        refusedBy('game_events_type_format'),
      );
    }
    for (const payload of ['[]', '"score"', '2']) {
      await expect(event(db, g, 1, { payload })).rejects.toMatchObject(
        refusedBy('game_events_payload_object'),
      );
    }
    await expect(
      event(db, g, 1, { payload: JSON.stringify({ pad: 'x'.repeat(16400) }) }),
    ).rejects.toMatchObject(refusedBy('game_events_payload_size'));
    await event(db, g, 1, { type: 'team-turnover', payload: '{"side": "away"}' });
    await event(db, g, 2, { type: 'start', payload: '{}' });
  });

  it('are removed with the rest of a purged league’s history (T-220)', async () => {
    const binned = await game();
    const kept = await game();
    await event(db, binned, 1);
    await event(db, kept, 1);
    await db.query("update leagues set deleted_at = now() - interval '31 days' where id = $1", [
      binned.leagueId,
    ]);
    await db.query('select public.purge_league_history($1)', [binned.leagueId]);
    const count = async (leagueId: string) =>
      (
        await one<{ n: number }>(
          db,
          'select count(*)::int as n from game_events where league_id = $1',
          [leagueId],
        )
      ).n;
    expect(await count(binned.leagueId)).toBe(0);
    expect(await count(kept.leagueId)).toBe(1);
  });
});

describe('scoring sessions (S-5, T-116)', () => {
  const session = (sql: Sql, g: Made, device = 'tablet-1', gameId = g.gameId) =>
    sql.query<{ id: string }>(
      `insert into scoring_sessions (league_id, game_id, account_id, device_id, held_until)
       values ($1, $2, $3, $4, now() + interval '2 minutes') returning id`,
      [g.leagueId, gameId, g.ownerId, device],
    );

  it('let one device hold a game at a time; taking over changes the holder', async () => {
    const g = await game();
    const { rows } = await session(db, g);
    await expect(session(db, g, 'phone-2')).rejects.toMatchObject(
      refusedBy('scoring_sessions_one_per_game', refused.unique),
    );
    await db.query(
      `update scoring_sessions set device_id = 'phone-2', held_until = now() + interval '2 minutes'
       where id = $1`,
      [rows[0]?.id],
    );
    const held = await one<{ device_id: string; version: number }>(
      db,
      'select device_id, version from scoring_sessions where id = $1',
      [rows[0]?.id],
    );
    expect(held).toEqual({ device_id: 'phone-2', version: 2 });
  });

  it('stay with their game, of their own league, and name the device', async () => {
    const a = await game();
    const b = await game();
    await expect(session(db, a, 'tablet', b.gameId)).rejects.toMatchObject(
      refusedBy('scoring_sessions_game', refused.foreignKey),
    );
    for (const device of ['', '  ', 'x'.repeat(201)]) {
      await expect(session(db, a, device)).rejects.toMatchObject(
        refusedBy('scoring_sessions_device_id_length'),
      );
    }
    const { rows } = await session(db, a);
    const other = await newGame(db, {
      leagueId: a.leagueId,
      seasonId: a.seasonId,
      stageId: a.stageId,
      homeTeamId: a.awayTeamId,
      awayTeamId: a.homeTeamId,
    });
    await expect(
      db.query('update scoring_sessions set game_id = $1 where id = $2', [other, rows[0]?.id]),
    ).rejects.toMatchObject(refused.restrict);
  });
});

describe('game states (T3 §8, T6 §1)', () => {
  const state = (sql: Sql, g: Made, value = '{"version": 1, "plays": []}', seq = 0) =>
    sql.query('insert into game_states (league_id, game_id, seq, state) values ($1, $2, $3, $4)', [
      g.leagueId,
      g.gameId,
      seq,
      value,
    ]);

  it('hold one versioned engine state per game, with the last event it applied', async () => {
    const g = await game();
    for (const bad of ['{}', '[]', '{"version": 0}']) {
      await expect(state(db, g, bad)).rejects.toMatchObject(
        refusedBy('game_states_state_document'),
      );
    }
    await expect(state(db, g, undefined, -1)).rejects.toMatchObject(
      refusedBy('game_states_seq_range'),
    );
    await state(db, g);
    await expect(state(db, g)).rejects.toMatchObject(
      refusedBy('game_states_one_per_game', refused.unique),
    );
    await db.query(
      `update game_states set seq = 1, state = '{"version": 1, "plays": [1]}' where game_id = $1`,
      [g.gameId],
    );
  });

  it('have room for a whole game, and no more than 2 MB', async () => {
    const g = await game();
    const plays = Array.from({ length: 2000 }, (_, k) => ({ id: `play-${k}`, type: 'score' }));
    await state(db, g, JSON.stringify({ version: 1, plays }));
    const big = await game();
    await expect(
      state(db, big, JSON.stringify({ version: 1, pad: 'x'.repeat(2_100_000) })),
    ).rejects.toMatchObject(refusedBy('game_states_state_size'));
  });

  it('stay while their game does: the app cannot remove one', async () => {
    const g = await game();
    await state(db, g);
    await expect(
      asApp(db, { league: g.leagueId }, (tx) =>
        tx.query('delete from game_states where game_id = $1', [g.gameId]),
      ),
    ).rejects.toMatchObject(refused.privilege);
  });
});

describe('player game stats (T3 §8, P7 §5.6)', () => {
  const line = (
    sql: Sql,
    g: Made,
    columns: { teamId?: string; personId?: string; stats?: string; seconds?: number | null } = {},
  ) =>
    sql.query<{ id: string }>(
      `insert into player_game_stats (league_id, game_id, team_id, person_id, played, seconds_played, stats)
       values ($1, $2, $3, $4, true, $5, $6) returning id`,
      [
        g.leagueId,
        g.gameId,
        columns.teamId ?? g.homeTeamId,
        columns.personId ?? g.personId,
        columns.seconds === undefined ? 600 : columns.seconds,
        columns.stats ?? '{"points": 5, "fg1": 1, "fg2": 2, "fouls": 1}',
      ],
    );

  it("are one line per person per game, for one of the game's two teams", async () => {
    const g = await game();
    await line(db, g);
    await expect(line(db, g)).rejects.toMatchObject(
      refusedBy('player_game_stats_once', refused.unique),
    );
    const outsider = await newTeam(db, g.leagueId, g.seasonId);
    const away = await newPerson(db, g.leagueId);
    await expect(line(db, g, { teamId: outsider, personId: away })).rejects.toMatchObject(
      refusedBy('player_game_stats_team_in_game'),
    );
    const { rows } = await line(db, g, { teamId: g.awayTeamId, personId: away });
    await expect(
      db.query('update player_game_stats set team_id = $1 where id = $2', [outsider, rows[0]?.id]),
    ).rejects.toMatchObject(refusedBy('player_game_stats_team_in_game'));
  });

  it('name a game, team and person of their own league (T-40)', async () => {
    const a = await game();
    const b = await game();
    await expect(line(db, a, { personId: b.personId })).rejects.toMatchObject(
      refusedBy('player_game_stats_person', refused.foreignKey),
    );
    await expect(
      line(db, { ...a, gameId: b.gameId }, { teamId: b.homeTeamId }),
    ).rejects.toMatchObject(refused.foreignKey);
  });

  it('count each stat in whole numbers, 0 or more, keyed by stat', async () => {
    const g = await game();
    for (const stats of [
      '[]',
      '{"points": -1}',
      '{"points": 1.5}',
      '{"points": "2"}',
      '{"points": null}',
      '{"points": 10000000}',
      '{"": 1}',
      '{"two words": 1}',
      '{"points": {"total": 2}}',
    ]) {
      await expect(line(db, g, { stats })).rejects.toMatchObject(
        refusedBy('player_game_stats_stats_counts'),
      );
    }
    await expect(line(db, g, { seconds: -1 })).rejects.toMatchObject(
      refusedBy('player_game_stats_seconds_range'),
    );
    // No minutes recorded, and nothing recorded at all, are both fine.
    const { rows } = await line(db, g, { stats: '{}', seconds: null });
    await db.query(
      `update player_game_stats set stats = '{"points": 0, "fg3": 4, "turnovers": 2}' where id = $1`,
      [rows[0]?.id],
    );
  });

  it('keep the number worn in the game as the tracker takes them', async () => {
    const g = await game();
    const { rows } = await line(db, g);
    for (const number of ['000', '-1', '100', 'A']) {
      await expect(
        db.query('update player_game_stats set jersey_number = $1 where id = $2', [
          number,
          rows[0]?.id,
        ]),
      ).rejects.toMatchObject(refusedBy('player_game_stats_jersey_format'));
    }
    await db.query(`update player_game_stats set jersey_number = '00' where id = $1`, [
      rows[0]?.id,
    ]);
  });

  it('stay with their game and person', async () => {
    const g = await game();
    const { rows } = await line(db, g);
    const other = await newPerson(db, g.leagueId);
    await expect(
      db.query('update player_game_stats set person_id = $1 where id = $2', [other, rows[0]?.id]),
    ).rejects.toMatchObject(refused.restrict);
  });
});

describe("players added at the scorer's table (S-6)", () => {
  const walkUp = (sql: Sql, g: Made, gameId: string | null, needsReview: boolean) =>
    sql.query<{ id: string }>(
      `with person as (
         insert into people (league_id, first_name, last_name) values ($1, 'Walk', 'Up') returning id
       )
       insert into roster_entries (league_id, team_id, person_id, added_at_game_id, needs_review)
       select $1, $2, person.id, $3, $4 from person returning id`,
      [g.leagueId, g.homeTeamId, gameId, needsReview],
    );

  it('name the game they were added at, and only they can wait for review', async () => {
    const g = await game();
    const { rows } = await walkUp(db, g, g.gameId, true);
    await expect(walkUp(db, g, null, true)).rejects.toMatchObject(
      refusedBy('roster_entries_review_only_when_added'),
    );
    // Allowed with no flag: added at the table, nothing to review.
    await walkUp(db, g, g.gameId, false);
    // The admin confirms the player.
    await db.query('update roster_entries set needs_review = false where id = $1', [rows[0]?.id]);
    const { needs_review } = await one<{ needs_review: boolean }>(
      db,
      'select needs_review from roster_entries where id = $1',
      [rows[0]?.id],
    );
    expect(needs_review).toBe(false);
  });

  it('keep the game they were added at, of their own league', async () => {
    const a = await game();
    const b = await game();
    await expect(walkUp(db, a, b.gameId, true)).rejects.toMatchObject(
      refusedBy('roster_entries_added_at_game', refused.foreignKey),
    );
    const { rows } = await walkUp(db, a, a.gameId, true);
    for (const to of [null, b.gameId]) {
      await expect(
        db.query('update roster_entries set added_at_game_id = $1 where id = $2', [
          to,
          rows[0]?.id,
        ]),
      ).rejects.toMatchObject(refused.restrict);
    }
  });

  it('leave every other roster entry unmarked', async () => {
    const g = await game();
    const marks = await one<{ added: string | null; review: boolean }>(
      db,
      'select added_at_game_id as added, needs_review as review from roster_entries where person_id = $1',
      [g.personId],
    );
    expect(marks).toEqual({ added: null, review: false });
  });
});
