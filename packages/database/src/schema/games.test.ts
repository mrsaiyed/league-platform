// T3 §8 and §12: a game's two teams are different and of its season; its stage,
// round and division are of its season; its venue is the league's and its court is
// at that venue; its scores fit its status; its winner follows from the scores; and
// it keeps the rules it started with (S-1, S-21).
import type { PGlite } from '@electric-sql/pglite';
import { tablePlayerEventTypes } from '@srleagues/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asApp,
  freshSchema,
  gameRules,
  newCourt,
  newDivision,
  newGame,
  newLeague,
  newRound,
  newSeason,
  newStage,
  newTeam,
  newVenue,
  one,
  refused,
} from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

/** A league with a season, its regular-season stage and two teams. */
async function season() {
  const league = await newLeague(db);
  const seasonId = await newSeason(db, league.leagueId, league.defaultProgramId);
  const stageId = await newStage(db, league.leagueId, seasonId);
  const homeTeamId = await newTeam(db, league.leagueId, seasonId);
  const awayTeamId = await newTeam(db, league.leagueId, seasonId);
  const game = { leagueId: league.leagueId, seasonId, stageId, homeTeamId, awayTeamId };
  return { ...league, seasonId, stageId, homeTeamId, awayTeamId, game };
}

type Season = Awaited<ReturnType<typeof season>>;

const set = (game: string, columns: Record<string, unknown>) => {
  const names = Object.keys(columns);
  return db.query(
    `update games set ${names.map((name, k) => `${name} = $${k + 1}`).join(', ')}
     where id = $${names.length + 1}`,
    [...Object.values(columns), game],
  );
};

const final = (home: number, away: number) => ({
  status: 'final',
  home_score: home,
  away_score: away,
  finalized_at: new Date().toISOString(),
});

const winnerOf = async (game: string) =>
  (
    await one<{ winner_team_id: string | null }>(
      db,
      'select winner_team_id from games where id = $1',
      [game],
    )
  ).winner_team_id;

describe('a game’s teams (T3 §12)', () => {
  it('are two different teams', async () => {
    const s = await season();
    await expect(newGame(db, { ...s.game, awayTeamId: s.homeTeamId })).rejects.toMatchObject({
      ...refused.check,
      constraint: 'games_teams_differ',
    });
  });

  it("are both of the game's own season, never another season's or league's", async () => {
    const s = await season();
    const nextSeason = await newSeason(db, s.leagueId, s.defaultProgramId);
    const elsewhere = await newTeam(db, s.leagueId, nextSeason);
    await expect(newGame(db, { ...s.game, homeTeamId: elsewhere })).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'games_home_team',
    });
    await expect(newGame(db, { ...s.game, awayTeamId: elsewhere })).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'games_away_team',
    });
    const other = await season();
    await expect(newGame(db, { ...s.game, awayTeamId: other.awayTeamId })).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'games_away_team',
    });
    await newGame(db, s.game);
  });

  it("are refused just the same for the app's fenced role (T-60)", async () => {
    const s = await season();
    const other = await season();
    await expect(
      asApp(db, { league: s.leagueId }, (tx) =>
        newGame(tx, { ...s.game, awayTeamId: other.awayTeamId }),
      ),
    ).rejects.toMatchObject({ ...refused.foreignKey, constraint: 'games_away_team' });
  });
});

describe('a game’s place in the season', () => {
  it("has a stage, and a round and division if any, all of the game's season", async () => {
    const s = await season();
    const round = await newRound(db, s.leagueId, s.seasonId, 1);
    const division = await newDivision(db, s.leagueId, s.seasonId);
    await newGame(db, { ...s.game, columns: { round_id: round, division_id: division } });

    const nextSeason = await newSeason(db, s.leagueId, s.defaultProgramId);
    const cases: [string, Record<string, unknown>, string][] = [
      ['stage', { stage_id: await newStage(db, s.leagueId, nextSeason) }, 'games_stage'],
      ['round', { round_id: await newRound(db, s.leagueId, nextSeason, 1) }, 'games_round'],
      [
        'division',
        { division_id: await newDivision(db, s.leagueId, nextSeason) },
        'games_division',
      ],
    ];
    for (const [, columns, constraint] of cases) {
      await expect(newGame(db, { ...s.game, columns })).rejects.toMatchObject({
        ...refused.foreignKey,
        constraint,
      });
    }
    await expect(
      db.query(
        `insert into games (league_id, season_id, home_team_id, away_team_id, capture_mode)
         values ($1, $2, $3, $4, 'live')`,
        [s.leagueId, s.seasonId, s.homeTeamId, s.awayTeamId],
      ),
    ).rejects.toMatchObject(refused.notNull);
  });

  it("is at one of the league's venues, on a court of that venue", async () => {
    const s = await season();
    const venue = await newVenue(db, s.leagueId);
    const court = await newCourt(db, s.leagueId, venue);
    const otherVenue = await newVenue(db, s.leagueId);
    await newGame(db, { ...s.game, columns: { venue_id: venue, court_id: court } });
    await newGame(db, { ...s.game, columns: { venue_id: venue } });

    await expect(
      newGame(db, { ...s.game, columns: { venue_id: otherVenue, court_id: court } }),
    ).rejects.toMatchObject({ ...refused.foreignKey, constraint: 'games_court' });
    await expect(newGame(db, { ...s.game, columns: { court_id: court } })).rejects.toMatchObject({
      ...refused.check,
      constraint: 'games_court_has_venue',
    });
    const other = await season();
    const theirVenue = await newVenue(db, other.leagueId);
    await expect(
      newGame(db, { ...s.game, columns: { venue_id: theirVenue } }),
    ).rejects.toMatchObject({ ...refused.foreignKey, constraint: 'games_venue' });
  });

  it('has a game number from 1 to 100000, unique in its season while not in the bin', async () => {
    const s = await season();
    const first = await newGame(db, { ...s.game, columns: { game_number: 7 } });
    await expect(newGame(db, { ...s.game, columns: { game_number: 7 } })).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'games_game_number_key',
    });
    await newGame(db, { ...s.game, columns: { game_number: null } });
    await newGame(db, { ...s.game, columns: { game_number: null } });
    await set(first, { deleted_at: new Date().toISOString() });
    await newGame(db, { ...s.game, columns: { game_number: 7 } });
    for (const number of [0, -1, 100001]) {
      await expect(
        newGame(db, { ...s.game, columns: { game_number: number } }),
      ).rejects.toMatchObject({ ...refused.check, constraint: 'games_game_number_range' });
    }
    // Another season may use the same number.
    const other = await season();
    await newGame(db, { ...other.game, columns: { game_number: 7 } });
  });

  it('has an outside reference of 1 to 200 characters, unique in its season while not in the bin', async () => {
    const s = await season();
    const first = await newGame(db, { ...s.game, columns: { external_ref: 'TCS-653' } });
    await expect(
      newGame(db, { ...s.game, columns: { external_ref: 'TCS-653' } }),
    ).rejects.toMatchObject({ ...refused.unique, constraint: 'games_external_ref_key' });
    await set(first, { deleted_at: new Date().toISOString() });
    await newGame(db, { ...s.game, columns: { external_ref: 'TCS-653' } });
    for (const ref of ['', '   ', 'x'.repeat(201)]) {
      await expect(
        newGame(db, { ...s.game, columns: { external_ref: ref } }),
      ).rejects.toMatchObject({
        ...refused.check,
        constraint: 'games_external_ref_length',
      });
    }
  });

  it('never moves to another season', async () => {
    const s = await season();
    const game = await newGame(db, s.game);
    const other = await newSeason(db, s.leagueId, s.defaultProgramId);
    await expect(set(game, { season_id: other })).rejects.toMatchObject(refused.restrict);
  });

  it('leaves only through the bin: the app cannot remove a game', async () => {
    const s = await season();
    const game = await newGame(db, s.game);
    await expect(
      asApp(db, { league: s.leagueId }, (tx) =>
        tx.query('delete from games where id = $1', [game]),
      ),
    ).rejects.toMatchObject(refused.privilege);
    await asApp(db, { league: s.leagueId }, (tx) =>
      tx.query('update games set deleted_at = now() where id = $1', [game]),
    );
  });
});

describe('a game’s status and recording mode', () => {
  it('is one of scheduled, live, final, postponed, cancelled or forfeit; scheduled to start', async () => {
    const s = await season();
    const game = await newGame(db, s.game);
    const { status } = await one<{ status: string }>(db, 'select status from games where id = $1', [
      game,
    ]);
    expect(status).toBe('scheduled');
    await set(game, { format: gameRules });
    for (const value of ['postponed', 'cancelled', 'live', 'scheduled']) {
      await set(game, { status: value });
    }
    for (const value of ['done', 'Final', '']) {
      await expect(set(game, { status: value })).rejects.toMatchObject({
        ...refused.check,
        constraint: 'games_status',
      });
    }
  });

  it('records final score only, box score or live, always chosen (P7 §5.2)', async () => {
    const s = await season();
    const game = await newGame(db, s.game);
    for (const mode of ['final', 'box', 'live']) await set(game, { capture_mode: mode });
    for (const mode of ['final-score', 'box-score', 'Live', '']) {
      await expect(set(game, { capture_mode: mode })).rejects.toMatchObject({
        ...refused.check,
        constraint: 'games_capture_mode',
      });
    }
    await expect(newGame(db, { ...s.game, columns: { capture_mode: null } })).rejects.toMatchObject(
      refused.notNull,
    );
  });
});

describe('a game’s scores (T3 §12)', () => {
  let s: Season;
  beforeAll(async () => {
    s = await season();
  });

  it('are absent while it is scheduled, postponed or cancelled', async () => {
    for (const status of ['scheduled', 'postponed', 'cancelled']) {
      await expect(
        newGame(db, { ...s.game, columns: { status, home_score: 0, away_score: 0 } }),
      ).rejects.toMatchObject({ ...refused.check, constraint: 'games_unplayed_has_no_score' });
    }
  });

  it('are both there once it is final or forfeited, with the time it was decided', async () => {
    for (const status of ['final', 'forfeit']) {
      await expect(
        newGame(db, { ...s.game, columns: { status, finalized_at: new Date().toISOString() } }),
      ).rejects.toMatchObject({ ...refused.check, constraint: 'games_decided_has_scores' });
      await expect(
        newGame(db, { ...s.game, columns: { status, home_score: 20, away_score: 0 } }),
      ).rejects.toMatchObject({ ...refused.check, constraint: 'games_finalized_when_decided' });
    }
    await newGame(db, { ...s.game, columns: final(52, 48) });
    await expect(
      newGame(db, {
        ...s.game,
        columns: { status: 'live', finalized_at: new Date().toISOString() },
      }),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'games_finalized_when_decided' });
  });

  it('come in pairs, from 0 to 999; a live game has both or neither', async () => {
    await newGame(db, { ...s.game, columns: { status: 'live' } });
    await newGame(db, { ...s.game, columns: { status: 'live', home_score: 3, away_score: 0 } });
    await expect(
      newGame(db, { ...s.game, columns: { status: 'live', home_score: 3 } }),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'games_scores_paired' });
    for (const score of [-1, 1000]) {
      await expect(newGame(db, { ...s.game, columns: final(score, 0) })).rejects.toMatchObject({
        ...refused.check,
        constraint: 'games_score_range',
      });
    }
    await newGame(db, { ...s.game, columns: final(999, 0) });
  });
});

describe('a game’s winner', () => {
  it('follows from the scores of a decided game, and none for level scores or an undecided game', async () => {
    const s = await season();
    const home = await newGame(db, { ...s.game, columns: final(60, 51) });
    const away = await newGame(db, { ...s.game, columns: final(40, 41) });
    const level = await newGame(db, { ...s.game, columns: final(44, 44) });
    const live = await newGame(db, {
      ...s.game,
      columns: { status: 'live', home_score: 9, away_score: 2 },
    });
    expect(await winnerOf(home)).toBe(s.homeTeamId);
    expect(await winnerOf(away)).toBe(s.awayTeamId);
    // A tie when ties are off still counts, and is reported to the admin (T3 §9).
    expect(await winnerOf(level)).toBeNull();
    expect(await winnerOf(live)).toBeNull();
  });

  it('of a forfeit is the team given the higher score; a forfeit cannot be level', async () => {
    const s = await season();
    const forfeit = { status: 'forfeit', finalized_at: new Date().toISOString() };
    const game = await newGame(db, {
      ...s.game,
      columns: { ...forfeit, home_score: 0, away_score: 20 },
    });
    expect(await winnerOf(game)).toBe(s.awayTeamId);
    await expect(
      newGame(db, { ...s.game, columns: { ...forfeit, home_score: 0, away_score: 0 } }),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'games_forfeit_has_winner' });
  });

  it('is never written by hand', async () => {
    const s = await season();
    await expect(
      newGame(db, { ...s.game, columns: { winner_team_id: s.homeTeamId } }),
    ).rejects.toMatchObject({ code: '428C9' });
  });
});

describe('the rules a game is played under (S-1, S-21)', () => {
  const rules = { version: 1, periods: 2 };

  it('are empty (the season’s) or a small versioned document', async () => {
    const s = await season();
    const game = await newGame(db, s.game);
    await set(game, { format: JSON.stringify(rules) });
    await set(game, { format: null });
    for (const format of [
      '{}',
      '[]',
      '{"version": 0}',
      JSON.stringify({ version: 1, pad: 'x'.repeat(16400) }),
    ]) {
      await expect(set(game, { format })).rejects.toMatchObject({
        ...refused.check,
        constraint: 'games_format_document',
      });
    }
  });

  it('can change before the game starts, never once it is live or decided', async () => {
    const s = await season();
    const game = await newGame(db, s.game);
    await set(game, { format: JSON.stringify(rules) });
    await set(game, { status: 'postponed' });
    await set(game, { format: JSON.stringify({ ...rules, periods: 4 }) });
    await set(game, { status: 'live' });
    const fixed = { ...refused.restrict, constraint: 'games_format_fixed_once_started' };
    await expect(set(game, { format: JSON.stringify(rules) })).rejects.toMatchObject(fixed);
    await expect(set(game, { format: null })).rejects.toMatchObject(fixed);
    // The scores and status move on; the rules stay.
    await set(game, { home_score: 2, away_score: 0 });
    await set(game, final(2, 0));
    await expect(set(game, { format: JSON.stringify(rules) })).rejects.toMatchObject(fixed);

    const forfeited = await newGame(db, {
      ...s.game,
      columns: {
        status: 'forfeit',
        home_score: 20,
        away_score: 0,
        finalized_at: new Date().toISOString(),
      },
    });
    await expect(
      set(forfeited, { format: JSON.stringify({ ...rules, periods: 4 }) }),
    ).rejects.toMatchObject(fixed);
  });

  it('are there once it is live or decided', async () => {
    const s = await season();
    const set_ = { ...refused.check, constraint: 'games_format_when_started' };
    for (const columns of [
      { status: 'live' },
      final(50, 45),
      { status: 'forfeit', home_score: 20, away_score: 0, finalized_at: new Date().toISOString() },
    ]) {
      await expect(
        newGame(db, { ...s.game, columns: { ...columns, format: null } }),
      ).rejects.toMatchObject(set_);
    }
    const game = await newGame(db, s.game);
    await expect(set(game, { status: 'live' })).rejects.toMatchObject(set_);
    // Given as the game goes live, as the step that starts games does (step 2.20).
    await set(game, { status: 'live', format: JSON.stringify(rules) });
  });

  it('stay fixed once the game has started, even if it goes back to scheduled or is postponed', async () => {
    const s = await season();
    const fixed = { ...refused.restrict, constraint: 'games_format_fixed_once_started' };
    const fixedAt = async (game: string) =>
      (
        await one<{ format_fixed_at: Date | null }>(
          db,
          'select format_fixed_at from games where id = $1',
          [game],
        )
      ).format_fixed_at;
    const game = await newGame(db, s.game);
    expect(await fixedAt(game)).toBeNull();
    await set(game, { status: 'live', format: JSON.stringify(rules) });
    const when = await fixedAt(game);
    expect(when).not.toBeNull();
    for (const status of ['scheduled', 'postponed', 'cancelled']) {
      await set(game, { status });
      await expect(
        set(game, { format: JSON.stringify({ ...rules, periods: 4 }) }),
      ).rejects.toMatchObject(fixed);
      await expect(set(game, { format: null })).rejects.toMatchObject(fixed);
    }
    // The time the rules were fixed is the database's: never cleared or moved.
    await set(game, { format_fixed_at: null });
    await set(game, { format_fixed_at: '2020-01-01T00:00:00Z' });
    expect(await fixedAt(game)).toEqual(when);
    const scheduled = await newGame(db, {
      ...s.game,
      columns: { format_fixed_at: '2020-01-01T00:00:00Z' },
    });
    expect(await fixedAt(scheduled)).toBeNull();
    const decided = await newGame(db, { ...s.game, columns: final(50, 45) });
    expect(await fixedAt(decided)).not.toBeNull();
  });

  it('are emptied, with the time they were fixed, only by the update that marks a live game not started (S-40)', async () => {
    const s = await season();
    const fixed = { ...refused.restrict, constraint: 'games_format_fixed_once_started' };
    const row = (game: string) =>
      one<{ format: unknown; format_fixed_at: Date | null; status: string }>(
        db,
        'select format, format_fixed_at, status from games where id = $1',
        [game],
      );
    const live = { status: 'live', home_score: 2, away_score: 0, format: JSON.stringify(rules) };
    const toScheduled = { status: 'scheduled', home_score: null, away_score: null };
    /** A live game whose tracker's log holds these events, in order. */
    const tracked = async (types: readonly string[]) => {
      const game = await newGame(db, { ...s.game, columns: live });
      await logged(game, types);
      return game;
    };
    const logged = async (game: string, types: readonly string[]) => {
      const { count } = await one<{ count: number }>(
        db,
        'select count(*)::int as count from game_events where game_id = $1',
        [game],
      );
      for (const [i, type] of types.entries()) {
        await db.query(
          `insert into game_events (league_id, game_id, seq, command_id, type, payload, tapped_at)
           values ($1, $2, $3, $4, $5, '{}', now())`,
          [s.leagueId, game, count + i + 1, crypto.randomUUID(), type],
        );
      }
    };

    // Live back to scheduled with the format emptied, its log ending at the marker: both go.
    const game = await tracked(['lineup', 'start', 'score', 'undo', 'reset']);
    await set(game, { ...toScheduled, format: null });
    expect(await row(game)).toMatchObject({
      status: 'scheduled',
      format: null,
      format_fixed_at: null,
    });
    // It is a game that never started: given rules of its own, or started again, as any.
    await set(game, { format: JSON.stringify({ ...rules, periods: 4 }) });
    await set(game, { format: null });
    await logged(game, ['start']);
    await set(game, { status: 'live', format: JSON.stringify(rules) });
    expect((await row(game)).format_fixed_at).not.toBeNull();

    // With no marker at the end of its log, or none at all: refused, whatever moves with it.
    for (const types of [[], ['start'], ['reset', 'start']]) {
      const unmarked = await tracked(types);
      await expect(
        set(unmarked, { ...toScheduled, format: null }),
        types.join(),
      ).rejects.toMatchObject(fixed);
    }

    // Back to scheduled keeping its format: both stay, and the format cannot be emptied after.
    const kept = await tracked(['start', 'reset']);
    await set(kept, toScheduled);
    expect((await row(kept)).format_fixed_at).not.toBeNull();
    await expect(set(kept, { format: null })).rejects.toMatchObject(fixed);

    // Emptied while live, or on the way to postponed or cancelled: refused as before.
    const other = await tracked(['start', 'reset']);
    await expect(set(other, { format: null })).rejects.toMatchObject(fixed);
    for (const status of ['postponed', 'cancelled']) {
      await expect(set(other, { ...toScheduled, status, format: null })).rejects.toMatchObject(
        fixed,
      );
    }
    // Back to scheduled with other rules in place of empty ones: refused.
    await expect(
      set(other, { ...toScheduled, format: JSON.stringify({ ...rules, periods: 4 }) }),
    ).rejects.toMatchObject(fixed);

    // A game that was ever decided is never cleared: ended by its tracker and reopened,
    // even with every play undone and a marker after it ...
    const reopened = await tracked(['start', 'score', 'end', 'reopen', 'undo', 'reset']);
    await expect(set(reopened, { ...toScheduled, format: null })).rejects.toMatchObject(fixed);
    // ... or decided by hand, reopened with a correction, then scored live.
    const corrected = await tracked(['start', 'reset']);
    await db.query(
      `insert into game_corrections (league_id, game_id, account_id, reason, before, after)
       values ($1, $2, $3, 'Harness', '{"version": 1}', '{"version": 1}')`,
      [s.leagueId, corrected, s.ownerId],
    );
    await expect(set(corrected, { ...toScheduled, format: null })).rejects.toMatchObject(fixed);

    // The app's fenced role marks a game not started the same way.
    const byApp = await tracked(['start', 'reset']);
    await asApp(db, { league: s.leagueId }, (tx) =>
      tx.query(
        `update games set status = 'scheduled', home_score = null, away_score = null,
           format = null where id = $1`,
        [byApp],
      ),
    );
    expect(await row(byApp)).toMatchObject({ format: null, format_fixed_at: null });

    // Cleared, with nothing after its marker, the game may go to the bin like one never
    // scored; with a tap after the marker, or once decided, it may not.
    await set(byApp, { deleted_at: new Date().toISOString() });
    // The players the scorer's table changed are not plays (record 058), after a marker
    // or with none at all.
    // One game per type, from the contract's own list: if it gains a type the SQL of
    // migration 0016 does not name, this fails.
    for (const type of tablePlayerEventTypes) {
      for (const types of [['start', 'reset', type], [type]]) {
        const tableOnly = await tracked(types);
        await set(tableOnly, toScheduled);
        await set(tableOnly, { deleted_at: new Date().toISOString() });
      }
    }
    const scoredBin = { ...refused.restrict, constraint: 'games_scored_not_binned' };
    const tappedAgain = await tracked(['start', 'reset', 'lineup']);
    await set(tappedAgain, { ...toScheduled });
    await expect(set(tappedAgain, { deleted_at: new Date().toISOString() })).rejects.toMatchObject(
      scoredBin,
    );
    await set(reopened, { ...toScheduled });
    await expect(set(reopened, { deleted_at: new Date().toISOString() })).rejects.toMatchObject(
      scoredBin,
    );
  });

  it('cannot change for the app either', async () => {
    const s = await season();
    const game = await newGame(db, {
      ...s.game,
      columns: { status: 'live', format: JSON.stringify(rules) },
    });
    await expect(
      asApp(db, { league: s.leagueId }, (tx) =>
        tx.query('update games set format = null where id = $1', [game]),
      ),
    ).rejects.toMatchObject({ ...refused.restrict, constraint: 'games_format_fixed_once_started' });
  });
});

describe('a game’s version (T-46)', () => {
  it('moves on every change, so a save from a stale version changes nothing (A-8)', async () => {
    const s = await season();
    const game = await newGame(db, s.game);
    await db.query('update games set starts_at = now() where id = $1 and version = 1', [game]);
    const stale = await db.query(
      "update games set starts_at = now() + interval '1 day' where id = $1 and version = 1",
      [game],
    );
    expect(stale.affectedRows).toBe(0);
  });
});
