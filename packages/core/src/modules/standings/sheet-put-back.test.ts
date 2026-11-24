// Step 2.229's done test in core: a reopened box score saved again as a final score only
// or as a forfeit loses its lines (S-27), but the reopen's correction keeps them (ids and
// numbers only, T-220, T-365), and "put the sheet back as it was" restores every line,
// the result, the standings and every total as they were before the reopen (A-5, T-366).
import { describe, expect, it } from 'vitest';
import {
  putSheetBack,
  readSheetPutBackOffer,
  recordFinalScore,
  recordForfeit,
  reopenGame,
  setBoxScore,
} from '../games/index.ts';
import {
  gameId,
  game,
  memoryStandings,
  ownerId,
  personId,
  schedulerGrant,
  schedulerId,
  seasonId,
  teamId,
} from './memory-standings.test-helper.ts';

const rostered = (n: number, team: number) => ({
  teamId: teamId(team),
  personId: personId(n),
  firstName: `Firstname${n}`,
  lastName: `Lastname${n}`,
  jerseyNumber: String(n + 10),
  left: false,
});

const sheet = (game: number, home: number, away: number, version: number) => ({
  gameId: gameId(game),
  version,
  homeScore: 41,
  awayScore: 45,
  lines: [
    {
      teamId: teamId(home),
      personId: personId(home * 10 + 1),
      played: true,
      secondsPlayed: 1500,
      stats: { points: 20, fouls: 2 },
    },
    {
      teamId: teamId(home),
      personId: personId(home * 10 + 2),
      played: true,
      secondsPlayed: null,
      stats: { points: 21 },
    },
    {
      teamId: teamId(away),
      personId: personId(away * 10 + 1),
      played: true,
      secondsPlayed: 2400,
      stats: { points: 45, fouls: 1 },
    },
    {
      teamId: teamId(away),
      personId: personId(away * 10 + 2),
      played: false,
      secondsPlayed: null,
      stats: {},
    },
  ],
});

const reason = 'Saved the wrong thing';

function setUp() {
  const world = memoryStandings({
    games: [game(1, 1, 2), game(2, 1, 3)],
    roster: [11, 12]
      .map((n) => rostered(n, 1))
      .concat(
        [21, 22].map((n) => rostered(n, 2)),
        [31, 32].map((n) => rostered(n, 3)),
      ),
    grants: [schedulerGrant],
  });
  return world;
}

type World = ReturnType<typeof setUp>;
const sorted = <T extends { personId: string }>(rows: readonly T[]) =>
  [...rows].sort((a, b) => a.personId.localeCompare(b.personId));
const linesOf = (w: World, n: number) =>
  sorted(w.db.state.lines.filter((l) => l.gameId === gameId(n)));
const snapshot = (w: World) =>
  structuredClone({
    lines: linesOf(w, 1),
    rows: w.db.state.rows[seasonId],
    totals: w.db.state.totals[seasonId],
    game: w.db.state.games.find((g) => g.id === gameId(1)),
  });
const versionOf = (w: World) => w.db.state.games.find((g) => g.id === gameId(1))?.version ?? 0;
const actsOn = (w: World, n: number) =>
  w.db.state.activity.filter((a) => a.targetId === gameId(n)).map((a) => a.action);

/** Two box scores entered, then game 1 reopened: what the standings were before it. */
async function enteredAndReopened(w: World) {
  expect(await setBoxScore(w.as(ownerId), sheet(1, 1, 2, 1), w.deps)).toMatchObject({ ok: true });
  expect(await setBoxScore(w.as(ownerId), sheet(2, 1, 3, 1), w.deps)).toMatchObject({ ok: true });
  const before = snapshot(w);
  expect(
    await reopenGame(w.as(ownerId), { gameId: gameId(1), version: versionOf(w), reason }, w.deps),
  ).toMatchObject({ ok: true });
  return before;
}

describe('a correction keeps the sheet it replaces (step 2.229)', () => {
  it.each([
    [
      'a final score only',
      (w: World) =>
        recordFinalScore(
          w.as(ownerId),
          { gameId: gameId(1), version: versionOf(w), homeScore: 50, awayScore: 48 },
          w.deps,
        ),
      'games.record_final_score',
    ],
    [
      'a forfeit',
      (w: World) =>
        recordForfeit(
          w.as(ownerId),
          { gameId: gameId(1), version: versionOf(w), forfeitingTeamId: teamId(1) },
          w.deps,
        ),
      'games.record_forfeit',
    ],
  ])('saved as %s, then put back: everything is as before the reopen', async (_, save, act) => {
    const w = setUp();
    const before = await enteredAndReopened(w);
    const written = structuredClone(w.db.state.corrections);
    expect(await save(w)).toMatchObject({ ok: true });
    // S-27 stands: the lines are gone and count nowhere; the correction keeps them.
    expect(linesOf(w, 1)).toEqual([]);
    expect(w.db.state.totals[seasonId]?.find((t) => t.personId === personId(21))).toBeUndefined();
    expect(w.db.state.totals[seasonId]?.find((t) => t.personId === personId(11))).toMatchObject({
      gamesPlayed: 1,
    });
    expect(w.db.state.corrections[0]?.before.sheet?.lines).toHaveLength(4);

    expect(
      await putSheetBack(
        w.as(ownerId),
        { gameId: gameId(1), version: versionOf(w), reason: 'The sheet was right' },
        w.deps,
      ),
    ).toMatchObject({ ok: true });
    const after = snapshot(w);
    expect(after.lines).toEqual(before.lines);
    expect(after.rows).toEqual(before.rows);
    expect(after.totals).toEqual(before.totals);
    expect(after.game).toMatchObject({
      status: 'final',
      homeScore: 41,
      awayScore: 45,
      captureMode: 'box',
      overtimePeriods: before.game?.overtimePeriods,
    });
    // A correction already written is never changed; the put back writes its own (S-7).
    expect(w.db.state.corrections[0]).toEqual(written[0]);
    expect(w.db.state.corrections).toHaveLength(2);
    expect(w.db.state.corrections[1]).toMatchObject({
      reason: 'The sheet was right',
      after: { status: 'final', homeScore: 41, awayScore: 45 },
    });
    // Each act once in the activity log.
    expect(actsOn(w, 1)).toEqual([
      'games.set_box_score',
      'games.reopen_game',
      act,
      'games.put_sheet_back',
    ]);
    // Ids and numbers only: no name in any correction (T-220).
    const stored = JSON.stringify(w.db.state.corrections);
    expect(stored).not.toMatch(/Firstname|Lastname/);
    expect(stored).toContain(personId(21));
  });

  it('is refused once something newer has been saved on the game', async () => {
    const w = setUp();
    await enteredAndReopened(w);
    const final = (homeScore: number) =>
      recordFinalScore(
        w.as(ownerId),
        { gameId: gameId(1), version: versionOf(w), homeScore, awayScore: 48 },
        w.deps,
      );
    const putBack = () =>
      putSheetBack(w.as(ownerId), { gameId: gameId(1), version: versionOf(w), reason }, w.deps);
    expect(await final(50)).toMatchObject({ ok: true });
    // Reopened again and saved again: the newest correction holds no sheet.
    expect(
      await reopenGame(w.as(ownerId), { gameId: gameId(1), version: versionOf(w), reason }, w.deps),
    ).toMatchObject({ ok: true });
    expect(await putBack()).toEqual({ ok: false, error: { code: 'game-not-decided' } });
    expect(await final(52)).toMatchObject({ ok: true });
    expect(await putBack()).toEqual({ ok: false, error: { code: 'no-sheet-kept' } });
    expect(linesOf(w, 1)).toEqual([]);
  });

  it('is done once: a second put back, or one from an old page, is refused', async () => {
    const w = setUp();
    await enteredAndReopened(w);
    expect(
      await recordFinalScore(
        w.as(schedulerId),
        { gameId: gameId(1), version: versionOf(w), homeScore: 50, awayScore: 48 },
        w.deps,
      ),
    ).toMatchObject({ ok: true });
    const seen = versionOf(w);
    const asScheduler = (version: number) =>
      putSheetBack(w.as(schedulerId), { gameId: gameId(1), version, reason }, w.deps);
    expect(await asScheduler(seen)).toMatchObject({ ok: true });
    expect(await asScheduler(seen)).toEqual({ ok: false, error: { code: 'changed-since-read' } });
    expect(await asScheduler(versionOf(w))).toEqual({ ok: false, error: { code: 'newer-save' } });
    expect(actsOn(w, 1).filter((a) => a === 'games.put_sheet_back')).toHaveLength(1);
  });

  it('has nothing to put back for a game whose correction kept no sheet', async () => {
    const w = memoryStandings({ games: [game(1, 1, 2)] });
    expect(
      await recordFinalScore(
        w.as(ownerId),
        { gameId: gameId(1), version: 1, homeScore: 50, awayScore: 48 },
        w.deps,
      ),
    ).toMatchObject({ ok: true });
    expect(
      await putSheetBack(w.as(ownerId), { gameId: gameId(1), version: 2, reason }, w.deps),
    ).toEqual({ ok: false, error: { code: 'no-sheet-kept' } });
  });

  it('is offered before the tap exactly while the put back would be allowed', async () => {
    const w = setUp();
    const offer = () => readSheetPutBackOffer(w.as(ownerId), { gameId: gameId(1) }, w.deps);
    expect(await offer()).toEqual({
      ok: true,
      value: { offered: false, code: 'game-not-decided' },
    });
    await enteredAndReopened(w);
    expect(await offer()).toEqual({
      ok: true,
      value: { offered: false, code: 'game-not-decided' },
    });
    expect(
      await recordFinalScore(
        w.as(ownerId),
        { gameId: gameId(1), version: versionOf(w), homeScore: 50, awayScore: 48 },
        w.deps,
      ),
    ).toMatchObject({ ok: true });
    expect(await offer()).toEqual({ ok: true, value: { offered: true } });
    expect(
      await putSheetBack(
        w.as(ownerId),
        { gameId: gameId(1), version: versionOf(w), reason },
        w.deps,
      ),
    ).toMatchObject({ ok: true });
    expect(await offer()).toEqual({ ok: true, value: { offered: false, code: 'newer-save' } });
  });
});
