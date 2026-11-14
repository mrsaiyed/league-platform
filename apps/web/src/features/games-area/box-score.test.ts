import { getBoxScoreSheet, listMyGames, type AccessReader } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInGames } from '../../server/stand-in-games.ts';
import { boxScoreField, readBoxScoreForm } from './box-score-form.ts';
import { boxScoreNotice } from './box-score-notice.ts';
import { buildGameRows } from './build-games-view.ts';
import { runBoxScoreAction } from './run-box-score-action.ts';
import { scoreMismatch } from './score-mismatch.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const owner = '01900000-0000-7000-8000-0000000000a1';
const other = '01900000-0000-7000-8000-0000000000a9';
const access: AccessReader = {
  ownerAccountId: async () => owner,
  leagueStatus: async () => 'live',
  activeGrantsOf: async () => [],
};

function setup() {
  const ports = standInGames({
    leagueId,
    people: {},
    assignees: [owner, other],
    accessOf: () => access,
    log: () => {},
  });
  const ctx = { leagueId, accountId: owner, requestId: 'r1' };
  const games = async () => {
    const listed = await listMyGames(ctx, {}, ports.deps);
    return listed.ok ? listed.value.games : [];
  };
  const sheetOf = async (gameId: string) => {
    const read = await getBoxScoreSheet(ctx, { gameId }, ports.deps);
    if (!read.ok) throw new Error(read.error.code);
    return read.value;
  };
  return { ports, ctx, games, sheetOf };
}

describe('the box score grid', () => {
  it('reads a paper sheet: empty columns are not recorded, empty boxes in kept ones are 0', async () => {
    const { games, sheetOf } = setup();
    const target = (await games()).find((g) => g.status === 'scheduled');
    const sheet = await sheetOf(target?.id ?? '');
    const [h1, h2, h3] = sheet.players.filter((p) => p.teamId === sheet.game.homeTeamId);
    const [a1] = sheet.players.filter((p) => p.teamId === sheet.game.awayTeamId);
    if (h1 === undefined || h2 === undefined || h3 === undefined || a1 === undefined) {
      throw new Error('the stand-in has players on both teams');
    }
    const input = readBoxScoreForm(sheet, {
      [boxScoreField.stat(h1.personId, 'points')]: '12',
      [boxScoreField.stat(h1.personId, 'fouls')]: '3',
      // Ticked with no numbers: played, 0 points, 0 fouls.
      [boxScoreField.played(h2.personId)]: 'on',
      [boxScoreField.stat(a1.personId, 'points')]: ' 9 ',
      [boxScoreField.minutes(a1.personId)]: '20',
      homeScore: '',
      awayScore: '11',
    });
    expect(input).toEqual({
      // Every home player who played has points: the score is their total.
      homeScore: 12,
      awayScore: 11,
      lines: expect.arrayContaining([
        {
          teamId: sheet.game.homeTeamId,
          personId: h1.personId,
          played: true,
          secondsPlayed: null,
          stats: { points: 12, fouls: 3 },
        },
        {
          teamId: sheet.game.homeTeamId,
          personId: h2.personId,
          played: true,
          secondsPlayed: null,
          stats: { points: 0, fouls: 0 },
        },
        {
          teamId: sheet.game.homeTeamId,
          personId: h3.personId,
          played: false,
          secondsPlayed: null,
          stats: {},
        },
        // The away sheet kept no fouls, so fouls are left out for that team.
        {
          teamId: sheet.game.awayTeamId,
          personId: a1.personId,
          played: true,
          secondsPlayed: 1200,
          stats: { points: 9 },
        },
      ]),
    });
    // One line for every rostered player of both teams (six a team in the stand-in).
    expect(sheet.players).toHaveLength(12);
    expect(input?.lines).toHaveLength(12);
  });

  it('refuses a box that is not a count; an empty score with no points to add up is 0', async () => {
    const { games, sheetOf } = setup();
    const target = (await games()).find((g) => g.status === 'scheduled');
    const sheet = await sheetOf(target?.id ?? '');
    const someone = sheet.players[0]?.personId ?? '';
    for (const bad of ['-1', '2.5', 'x', '1000']) {
      expect(
        readBoxScoreForm(sheet, {
          [boxScoreField.stat(someone, 'points')]: bad,
          homeScore: '1',
          awayScore: '2',
        }),
      ).toBeUndefined();
    }
    // P7 §5.2: an empty team score is the total of its players' points, here none.
    expect(readBoxScoreForm(sheet, { homeScore: '10' })).toMatchObject({
      homeScore: 10,
      awayScore: 0,
    });
  });

  it('saves the sheet so the game is final, then reopens it to correct it', async () => {
    const { ports, ctx, games, sheetOf } = setup();
    const target = (await games()).find((g) => g.status === 'scheduled');
    const sheet = await sheetOf(target?.id ?? '');
    const someone = sheet.players[0]?.personId ?? '';
    const fields = {
      gameId: target?.id,
      version: String(target?.version),
      [boxScoreField.stat(someone, 'points')]: '20',
      homeScore: '',
      awayScore: '18',
    };
    expect(await runBoxScoreAction('save', fields, ctx, ports.deps)).toEqual({ ok: true });
    const after = await sheetOf(target?.id ?? '');
    expect(after.game).toMatchObject({ status: 'final', captureMode: 'box', homeScore: 20 });
    expect(after.locked).toBe('decided');
    expect(after.lines.find((l) => l.personId === someone)?.stats).toEqual({ points: 20 });
    // The games list now links the final box-score game to its grid.
    const row = buildGameRows(await games(), { teams: {}, scorekeepers: {} }, undefined).find(
      (r) => r.id === target?.id,
    );
    expect(row?.boxScoreLink).toBe(true);
    // Saving again is refused; reopening needs a reason.
    expect(await runBoxScoreAction('save', fields, ctx, ports.deps)).toEqual({
      ok: false,
      code: 'changed-since-read',
    });
    const reopen = { gameId: target?.id, version: String(after.game.version) };
    expect(await runBoxScoreAction('reopen', reopen, ctx, ports.deps)).toEqual({
      ok: false,
      code: 'reopen-reason',
    });
    expect(
      await runBoxScoreAction('reopen', { ...reopen, reason: '   ' }, ctx, ports.deps),
    ).toEqual({ ok: false, code: 'reopen-reason' });
    expect(
      await runBoxScoreAction('reopen', { ...reopen, reason: 'Misread' }, ctx, ports.deps),
    ).toEqual({ ok: true });
    const reopened = await sheetOf(target?.id ?? '');
    expect(reopened.locked).toBeNull();
    expect(reopened.lines.find((l) => l.personId === someone)?.stats).toEqual({ points: 20 });
  });

  it('warns, but saves the typed score, when it differs from the players’ points', async () => {
    const { ports, ctx, games, sheetOf } = setup();
    const target = (await games()).find((g) => g.status === 'scheduled');
    const sheet = await sheetOf(target?.id ?? '');
    const home = sheet.players.filter((p) => p.teamId === sheet.game.homeTeamId);
    const [h1, h2] = home;
    if (h1 === undefined || h2 === undefined) throw new Error('the stand-in has players');
    const team = { scoreField: 'homeScore', personIds: home.map((p) => p.personId) } as const;
    const fields = {
      gameId: target?.id,
      version: String(target?.version),
      [boxScoreField.stat(h1.personId, 'points')]: '10',
      [boxScoreField.stat(h2.personId, 'points')]: '4',
      homeScore: '15',
      awayScore: '9',
    };
    expect(scoreMismatch(team, fields)).toEqual({ score: 15, points: 14 });
    // No warning when they agree, when the score is left to the total, or with no points kept.
    expect(scoreMismatch(team, { ...fields, homeScore: '14' })).toBeUndefined();
    expect(scoreMismatch(team, { ...fields, homeScore: '' })).toBeUndefined();
    expect(scoreMismatch(team, { homeScore: '15' })).toBeUndefined();
    // Not refused: the admin may know better than the sheet.
    expect(await runBoxScoreAction('save', fields, ctx, ports.deps)).toEqual({ ok: true });
    expect((await sheetOf(target?.id ?? '')).game.homeScore).toBe(15);
  });

  it('keeps a tracked game out of the grid', async () => {
    const { ports, ctx, games, sheetOf } = setup();
    const live = (await games()).find((g) => g.status === 'live');
    expect((await sheetOf(live?.id ?? '')).locked).toBe('tracked');
    const row = buildGameRows(await games(), { teams: {}, scorekeepers: {} }, undefined).find(
      (r) => r.id === live?.id,
    );
    expect(row?.boxScoreLink).toBe(false);
    expect(
      await runBoxScoreAction(
        'save',
        { gameId: live?.id, version: String(live?.version), homeScore: '1', awayScore: '2' },
        ctx,
        ports.deps,
      ),
    ).toEqual({ ok: false, code: 'game-is-tracked' });
  });

  it('words every notice from the message files', () => {
    expect(boxScoreNotice({ done: 'save' })).toEqual({
      key: 'admin.boxScore.done.save',
      problem: false,
    });
    expect(boxScoreNotice({ problem: 'game-is-tracked' })?.key).toBe(
      'admin.boxScore.error.game-is-tracked',
    );
    expect(boxScoreNotice({ problem: 'reopen-reason' })?.key).toBe(
      'admin.boxScore.error.reopen-reason',
    );
    expect(boxScoreNotice({ problem: 'tie-not-allowed' })?.key).toBe(
      'admin.games.error.tie-not-allowed',
    );
    expect(boxScoreNotice({ problem: 'something-else' })?.key).toBe('admin.games.error.unknown');
  });
});
