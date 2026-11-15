// Step 2.160 on the made-up world: in the adult league's season that is not public yet
// and has no rounds, the grid's buttons add three rounds, put a game in the first, move
// it to the third, offer that round's date and flag the game until it is on it; a round
// with games is not removed and says so beside it; an empty one is; the address carries
// each answer back; nothing is published until Publish.
import { getScheduleDraft, type CommandContext, type ScheduleDraftView } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInLeagues, standInPeople } from '../../server/stand-in-cast.ts';
import { standInSchedule } from '../../server/stand-in-schedule.ts';
import { standInSeasonIds } from '../../server/stand-in-world-seed.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { buildGrid, dayText, daysAfter } from './build-grid.ts';
import { answerParams, refusedAtOf, savedDetailOf } from './grid-answer.ts';
import { noticeOf } from './notice.ts';
import { runScheduleAction, type ScheduleActionKind } from './run-schedule-action.ts';

const leagueId = standInLeagues.live.id;
const seasonId = standInSeasonIds.adultNext;
const context: CommandContext = {
  leagueId,
  accountId: standInPeople.owner.accountId,
  requestId: 'request-1',
};
const roundId = (n: number) => `01900000-0000-7000-8000-0000000b9${String(n).padStart(3, '0')}`;
const gameId = '01900000-0000-7000-8000-0000000c9001';
const weeks = [
  { roundId: roundId(1), label: 'Week 1', date: '2026-11-15' },
  { roundId: roundId(2), label: 'Week 2', date: '2026-11-22' },
  { roundId: roundId(3), label: 'Week 3', date: '2026-11-29' },
];

function setup() {
  const ports = standInSchedule(testWorld());
  const read = async (): Promise<ScheduleDraftView> => {
    const got = await getScheduleDraft(context, { seasonId }, ports.deps);
    if (!got.ok) throw new Error('could not read the draft');
    return got.value;
  };
  const press = async (kind: ScheduleActionKind, fields: Record<string, string>) => {
    const view = await read();
    const form = new FormData();
    const all = {
      seasonId,
      basedOnRevision: view.latestRevision === null ? '' : String(view.latestRevision),
      version: view.draft === null ? '' : String(view.draft.version),
      draftId: view.draft?.id ?? '',
      ...fields,
    };
    for (const [k, v] of Object.entries(all)) form.set(k, v);
    return runScheduleAction(kind, form, context, ports.deps);
  };
  return { ports, read, press };
}

describe('rounds an owner can make (step 2.160)', () => {
  it('offers the season that is not public yet, which has no rounds', async () => {
    const { ports, read } = setup();
    const seasons = await ports.seasonsOf(leagueId);
    expect(seasons.find((s) => s.id === seasonId)).toMatchObject({
      name: 'Winter 2027',
      isPublic: false,
    });
    expect(seasons.filter((s) => s.isPublic).length).toBeGreaterThan(0);
    expect((await read()).result.rounds).toEqual([]);
  });

  it('adds three rounds, moves a game to the third and offers its date', async () => {
    const { ports, read, press } = setup();
    for (const week of weeks) {
      expect(await press('add-round', week)).toEqual({
        kind: 'saved',
        detail: { what: 'round-added', roundId: week.roundId },
      });
    }
    const teams = await ports.teamsOf(leagueId, seasonId);
    const [home, away] = teams;
    if (home === undefined || away === undefined) throw new Error('two teams');
    expect(
      await press('add-game', {
        gameId,
        homeTeamId: home.id,
        awayTeamId: away.id,
        roundId: roundId(1),
        date: '2026-11-15',
        time: '18:00',
        place: '',
      }),
    ).toEqual({ kind: 'saved' });

    // To Week 3 with the date left alone: saved, and the grid is told which game.
    const was = [roundId(1), '2026-11-15', '18:00', ''].join('~');
    const moved = await press('save-game', {
      gameId,
      wasSlot: was,
      roundId: roundId(3),
      date: '2026-11-15',
      time: '18:00',
      place: '',
      recording: '',
      wasRecording: '',
    });
    expect(moved).toEqual({ kind: 'saved', detail: { what: 'game-round', gameId } });
    const answer = answerParams(moved);
    expect(savedDetailOf(answer.query)).toEqual({ what: 'game-round', gameId });
    let grid = buildGrid(await read(), teams, []);
    const game = () => grid.allGames.find((g) => g.id === gameId);
    expect(game()).toMatchObject({
      roundId: roundId(3),
      offRoundDate: '2026-11-29',
      outsideRound: true,
    });
    expect(dayText('2026-11-29')).toBe('Sun, Nov 29');

    // "Yes, move it to Sun, Nov 29": its date follows, and the flag goes.
    const yes = await press('save-game', {
      gameId,
      wasSlot: [roundId(3), '2026-11-15', '18:00', ''].join('~'),
      roundId: roundId(3),
      date: '2026-11-29',
      time: '18:00',
      place: '',
    });
    expect(yes).toEqual({ kind: 'saved' });
    grid = buildGrid(await read(), teams, []);
    expect(game()).toMatchObject({ date: '2026-11-29', offRoundDate: null, outsideRound: false });

    // Moved to Week 2 with a date typed as well: the person said otherwise, so no offer
    // is made, and a day inside Week 2's (before Week 3's date) is not flagged.
    const typed = await press('save-game', {
      gameId,
      wasSlot: [roundId(3), '2026-11-29', '18:00', ''].join('~'),
      roundId: roundId(2),
      date: '2026-11-23',
      time: '18:00',
      place: '',
    });
    expect(typed).toEqual({ kind: 'saved' });
    grid = buildGrid(await read(), teams, []);
    expect(game()).toMatchObject({
      date: '2026-11-23',
      offRoundDate: '2026-11-22',
      outsideRound: false,
    });
    // On Week 3's date it is outside Week 2; the last round's days run a week.
    const late = await press('save-game', {
      gameId,
      wasSlot: [roundId(2), '2026-11-23', '18:00', ''].join('~'),
      roundId: roundId(2),
      date: '2026-11-29',
      time: '18:00',
      place: '',
    });
    expect(late).toEqual({ kind: 'saved' });
    grid = buildGrid(await read(), teams, []);
    expect(game()).toMatchObject({ outsideRound: true });
    const lastWeek = await press('save-game', {
      gameId,
      wasSlot: [roundId(2), '2026-11-29', '18:00', ''].join('~'),
      roundId: roundId(3),
      date: '2026-12-05',
      time: '18:00',
      place: '',
    });
    expect(lastWeek).toEqual({ kind: 'saved' });
    grid = buildGrid(await read(), teams, []);
    expect(game()).toMatchObject({ offRoundDate: '2026-11-29', outsideRound: false });

    // Nothing is published: the season still has no rounds outside the draft (A-9).
    const view = await read();
    expect(view.published.rounds).toEqual([]);
    expect(view.summary.roundsAdded).toHaveLength(3);
  });

  it('refuses to remove a round with games, beside it, and removes an empty one', async () => {
    const { ports, read, press } = setup();
    for (const week of weeks.slice(0, 2)) await press('add-round', week);
    const [home, away] = await ports.teamsOf(leagueId, seasonId);
    await press('add-game', {
      gameId,
      homeTeamId: home?.id ?? '',
      awayTeamId: away?.id ?? '',
      roundId: roundId(1),
      date: '2026-11-15',
      time: '18:00',
      place: '',
    });
    const refused = await press('remove-round', { roundId: roundId(1) });
    expect(refused).toEqual({
      kind: 'refused',
      code: 'change-refused',
      reason: 'round-has-games',
      at: { form: 'round', roundId: roundId(1) },
    });
    const back = answerParams(refused);
    expect(back.hash).toBe(`#round-${roundId(1)}`);
    expect(refusedAtOf(back.query)).toEqual({ form: 'round', roundId: roundId(1) });
    expect(noticeOf(back.query)?.text).toBe(
      'That was not saved: That change cannot be made to the schedule as it stands. This round has games. Move or remove its games first, then remove the round.',
    );

    expect(await press('remove-round', { roundId: roundId(2) })).toEqual({
      kind: 'saved',
      detail: { what: 'round-removed' },
    });
    expect((await read()).result.rounds.map((r) => r.id)).toEqual([roundId(1)]);
  });

  it('keeps what was typed in a refused new round, and says why', async () => {
    const { press } = setup();
    const refused = await press('add-round', {
      roundId: roundId(1),
      label: 'Week 1',
      date: '2026-11-31',
    });
    expect(refused).toEqual({
      kind: 'refused',
      code: 'change-refused',
      reason: 'invalid-date',
      at: { form: 'add-round', label: 'Week 1', date: '2026-11-31' },
    });
    const back = answerParams(refused);
    expect(back.hash).toBe('#add-round');
    expect(refusedAtOf(back.query)).toEqual({
      form: 'add-round',
      label: 'Week 1',
      date: '2026-11-31',
    });
    expect(noticeOf(back.query)?.text).toMatch(/That is not a date\.$/);
    // An address that names no id, or a date of another shape, is not read as one.
    expect(savedDetailOf({ done: 'saved', saved: 'round-added', round: 'x' })).toBeUndefined();
    expect(refusedAtOf({ problem: 'invalid-input', at: 'add-round', date: '29/11' })).toEqual({
      form: 'add-round',
      label: '',
      date: '',
    });
  });

  it('publishes the new rounds', async () => {
    const { read, press } = setup();
    for (const week of weeks) await press('add-round', week);
    expect(await press('publish', {})).toEqual({ kind: 'published' });
    const view = await read();
    expect(view.draft).toBeNull();
    expect(view.published.rounds).toEqual(
      weeks.map((w) => ({ id: w.roundId, label: w.label, date: w.date })),
    );
  });

  it('suggests a day a week on', () => {
    expect(daysAfter('2026-11-29', 7)).toBe('2026-12-06');
    expect(daysAfter('not a day', 7)).toBeUndefined();
  });
});
