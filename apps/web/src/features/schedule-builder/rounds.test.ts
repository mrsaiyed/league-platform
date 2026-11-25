// Step 2.160 on the made-up world: in the adult league's season that is not public yet
// and has no rounds, the grid's buttons add three rounds, put a game in the first, move
// it to the third, offer that round's date and flag the game until it is on it; a round
// with games is not removed and says so beside it; an empty one is; the address carries
// each answer back; nothing is published until Publish.
import {
  gameAnchor,
  getScheduleDraft,
  type CommandContext,
  type ScheduleDraftView,
} from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInLeagues, standInPeople } from '../../server/stand-in-cast.ts';
import { standInSchedule } from '../../server/stand-in-schedule.ts';
import { standInSeasonIds } from '../../server/stand-in-world-seed.ts';
import type { LeagueWorld } from '../../server/stand-in-world-state.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { buildGrid, dayText, daysAfter } from './build-grid.ts';
import {
  answerParams,
  answerShown,
  noticeOfAnswer,
  refusedAtOf,
  savedDetailOf,
  savedDetailOfNotice,
} from './grid-answer.ts';
import { addRoundProblemOf, gameProblemOf, noticeOf, whyNotSaved } from './notice.ts';
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
    const owner = { accountId: standInPeople.owner.accountId, isOwner: true, grants: [] };
    const seasons = await ports.seasonsOf(leagueId, owner);
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
    ).toEqual({ kind: 'saved', detail: { what: 'game-saved', gameId } });

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
    // The phone is taken to the game's row, its name above its "Saved" (step 2.185).
    expect(answer.hash).toBe(`#${gameAnchor(gameId)}`);
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
    expect(yes).toEqual({ kind: 'saved', detail: { what: 'game-saved', gameId } });
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
    expect(typed).toEqual({ kind: 'saved', detail: { what: 'game-saved', gameId } });
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
    expect(late).toEqual({ kind: 'saved', detail: { what: 'game-saved', gameId } });
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
    expect(lastWeek).toEqual({ kind: 'saved', detail: { what: 'game-saved', gameId } });
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
    // Beside the round, one sentence: the rule's own.
    expect(whyNotSaved(back.query)).toBe(
      'This round has games. Move or remove its games first, then remove the round.',
    );

    expect(await press('remove-round', { roundId: roundId(2), afterRoundId: roundId(1) })).toEqual({
      kind: 'saved',
      detail: { what: 'round-removed', afterRoundId: roundId(1) },
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
    // Beside the date field, in one sentence.
    expect(addRoundProblemOf(back.query, { label: 'Week 1', date: '' })).toEqual({
      field: 'date',
      text: 'Choose the day the round is played.',
    });
    const blank = answerParams(
      await press('add-round', { roundId: roundId(1), label: '', date: '2026-11-29' }),
    );
    expect(addRoundProblemOf(blank.query, { label: '', date: '2026-11-29' })).toEqual({
      field: 'label',
      text: 'Give the round a name.',
    });
    const far = answerParams(
      await press('add-round', { roundId: roundId(1), label: 'Week 1', date: '3026-11-29' }),
    );
    expect(addRoundProblemOf(far.query, { label: 'Week 1', date: '3026-11-29' })).toEqual({
      field: 'date',
      text: 'Choose a date between the years 1900 and 2999.',
    });
    expect(noticeOf(far.query)?.kind).toBe('problem');
    // An address that names no id, or a date of another shape, is not read as one.
    expect(savedDetailOf({ done: 'saved', saved: 'round-added', round: 'x' })).toBeUndefined();
    expect(refusedAtOf({ problem: 'invalid-input', at: 'add-round', date: '29/11' })).toEqual({
      form: 'add-round',
      label: '',
      date: '',
    });
  });

  it('says a second tap of "Publish" calmly: published already (step 2.53 fix round)', async () => {
    const first = setup();
    for (const week of weeks) await first.press('add-round', week);
    const view = await first.read();
    const sent = new FormData();
    for (const [k, v] of Object.entries({
      seasonId,
      basedOnRevision: view.latestRevision === null ? '' : String(view.latestRevision),
      version: String(view.draft?.version ?? ''),
      draftId: view.draft?.id ?? '',
    })) {
      sent.set(k, v);
    }
    const again = new FormData();
    for (const [k, v] of sent.entries()) again.set(k, v);
    expect(await runScheduleAction('publish', sent, context, first.ports.deps)).toEqual({
      kind: 'published',
    });
    expect(await runScheduleAction('publish', again, context, first.ports.deps)).toEqual({
      kind: 'published',
      already: true,
    });
  });

  it('publishes the new rounds', async () => {
    const { read, press } = setup();
    for (const week of weeks) await press('add-round', week);
    expect(await press('publish', {})).toEqual({ kind: 'published' });
    const view = await read();
    expect(view.draft).toBeNull();
    expect(view.published.rounds).toEqual(
      weeks.map((w, i) => ({ id: w.roundId, number: i + 1, label: w.label, date: w.date })),
    );
  });

  it("numbers the grid's rounds as they are stored, gaps and all", async () => {
    const { read, press } = setup();
    for (const week of weeks) await press('add-round', week);
    await press('remove-round', { roundId: roundId(2) });
    await press('add-round', { roundId: roundId(4), label: 'Week 4', date: '2026-12-06' });
    // Week 2's number is not given again until it is gone from the season.
    const grid = buildGrid(await read(), [], []);
    expect(grid.rounds.map((r) => [r.label, r.number])).toEqual([
      ['Week 1', 1],
      ['Week 3', 3],
      ['Week 4', 4],
    ]);
    expect(await press('publish', {})).toEqual({ kind: 'published' });
    expect((await read()).published.rounds.map((r) => r.number)).toEqual([1, 3, 4]);
  });

  it('suggests a day a week on', () => {
    expect(daysAfter('2026-11-29', 7)).toBe('2026-12-06');
    expect(daysAfter('not a day', 7)).toBeUndefined();
  });
});

describe('a game in the bin does not hold its round (step 2.181, S-60)', () => {
  const current = standInSeasonIds.adultFall;
  /** The current season's last round and its games, as the seed has them. */
  function lastRound(world: LeagueWorld) {
    const round = world.rounds
      .filter((r) => r.seasonId === current)
      .sort((a, b) => b.number - a.number)[0];
    if (round === undefined) throw new Error('the season has rounds');
    return { round, games: world.games.filter((g) => g.roundId === round.id) };
  }
  function setupIn(change: (league: LeagueWorld) => void = () => undefined) {
    const world = testWorld(undefined, undefined, (leagues) => {
      const adult = leagues.find((l) => l.leagueId === leagueId);
      if (adult === undefined) throw new Error('the adult league');
      change(adult);
    });
    const ports = standInSchedule(world);
    const read = async (): Promise<ScheduleDraftView> => {
      const got = await getScheduleDraft(context, { seasonId: current }, ports.deps);
      if (!got.ok) throw new Error('could not read the draft');
      return got.value;
    };
    const press = async (kind: ScheduleActionKind, fields: Record<string, string>) => {
      const view = await read();
      const form = new FormData();
      const all = {
        seasonId: current,
        basedOnRevision: view.latestRevision === null ? '' : String(view.latestRevision),
        version: view.draft === null ? '' : String(view.draft.version),
        draftId: view.draft?.id ?? '',
        ...fields,
      };
      for (const [k, v] of Object.entries(all)) form.set(k, v);
      return runScheduleAction(kind, form, context, ports.deps);
    };
    return { world, ports, read, press };
  }

  it('removes a round whose games were removed and published, and they keep everything but their round', async () => {
    let roundOf = '';
    let gameIds: string[] = [];
    const { world, ports, read, press } = setupIn((league) => {
      const { round, games } = lastRound(league);
      roundOf = round.id;
      gameIds = games.map((g) => g.id);
    });
    expect(gameIds.length).toBeGreaterThan(0);
    for (const gameId of gameIds) {
      expect(await press('remove-game', { gameId })).toMatchObject({ kind: 'saved' });
    }
    expect(await press('publish', {})).toEqual({ kind: 'published', removed: 2 });

    // The round shows no game, and offers the tap: it succeeds.
    const teams = await ports.teamsOf(leagueId, current);
    const shown = buildGrid(await read(), teams, []).rounds.find((r) => r.id === roundOf);
    expect(shown).toMatchObject({ games: [], undated: 0 });
    expect(await press('remove-round', { roundId: roundOf })).toEqual({
      kind: 'saved',
      detail: { what: 'round-removed', afterRoundId: null },
    });
    expect(await press('publish', {})).toEqual({ kind: 'published' });
    expect((await read()).published.rounds.map((r) => r.id)).not.toContain(roundOf);
    // In the bin, with their teams and date, and no round.
    const left = (await world.read(leagueId))?.games.filter((g) => gameIds.includes(g.id));
    expect(left?.map((g) => [g.binned, g.roundId, g.startsAt !== null])).toEqual(
      gameIds.map(() => [true, null, true]),
    );
  });

  it('puts a game back with no round when its round was removed in the same draft', async () => {
    let roundOf = '';
    let gameIds: string[] = [];
    const { ports, read, press } = setupIn((league) => {
      const { round, games } = lastRound(league);
      roundOf = round.id;
      gameIds = games.map((g) => g.id);
    });
    const [gameId] = gameIds;
    if (gameId === undefined) throw new Error('the last round has a game');
    for (const id of gameIds) await press('remove-game', { gameId: id });
    expect(await press('remove-round', { roundId: roundOf })).toMatchObject({ kind: 'saved' });
    // Until then they stay in sight, struck through, under "Games with no round", each
    // saying the draft removed its round too (step 2.185).
    const label = (await read()).result.removedRounds?.find((r) => r.id === roundOf)?.label;
    const struck = buildGrid(await read(), await ports.teamsOf(leagueId, current), []);
    expect(struck.looseRemoved.map((g) => [g.id, g.roundGone])).toEqual(
      gameIds.map((id) => [id, label]),
    );

    const back = await press('put-back-game', { gameId });
    expect(back).toEqual({
      kind: 'saved',
      detail: { what: 'game-put-back', gameId, fromRoundId: roundOf },
    });
    // The answer's notice carries the round it was in, so the page can say where it went.
    expect(answerParams(back).query).toEqual({});
    expect(savedDetailOfNotice(noticeOfAnswer(back))).toEqual({
      what: 'game-put-back',
      gameId,
      fromRoundId: roundOf,
    });
    const view = await read();
    expect(view.result.games.find((g) => g.id === gameId)?.roundId).toBeNull();
    expect(view.result.removedRounds?.map((r) => r.id)).toContain(roundOf);
    const grid = buildGrid(view, await ports.teamsOf(leagueId, current), []);
    expect(grid.looseGames.map((g) => g.id)).toContain(gameId);
    expect(await press('publish', {})).toEqual({ kind: 'published', removed: 1 });
    const published = (await read()).published;
    expect(published.games.find((g) => g.id === gameId)?.roundId).toBeNull();
    expect(published.rounds.map((r) => r.id)).not.toContain(roundOf);
  });

  it('refuses a round a game with no date is in, and the grid shows that game in it', async () => {
    let roundOf = '';
    const { ports, read, press } = setupIn((league) => {
      const { round, games } = lastRound(league);
      roundOf = round.id;
      // One game of the last round has no date yet; the others are in the bin.
      league.games = league.games.map((g) =>
        g.roundId !== round.id
          ? g
          : g.id === games[0]?.id
            ? { ...g, startsAt: null, localDate: null, localTime: null }
            : { ...g, binned: true },
      );
    });
    const teams = await ports.teamsOf(leagueId, current);
    const shown = buildGrid(await read(), teams, []).rounds.find((r) => r.id === roundOf);
    expect(shown).toMatchObject({ games: [], undated: 1 });
    const refused = await press('remove-round', { roundId: roundOf });
    expect(refused).toEqual({
      kind: 'refused',
      code: 'round-in-use',
      at: { form: 'round', roundId: roundOf },
    });
    expect(whyNotSaved(answerParams(refused).query)).toBe(
      'A game with no date yet is still in this round, so it cannot be removed.',
    );
  });
});

describe('a refused game form keeps what was typed, and "Saved" is said once (step 2.155)', () => {
  const team = '11111111-1111-4111-8111-111111111111';
  const round = '22222222-2222-4222-8222-222222222222';
  const venue = '33333333-3333-4333-8333-333333333333';
  const typed = {
    homeTeamId: team,
    awayTeamId: team,
    roundId: round,
    date: '2026-12-05',
    time: '18:30',
    place: `${venue}|Court 1`,
    recording: 'box-score',
  };

  it('carries every box back to its own form and names the wrong one', () => {
    const back = answerParams({
      kind: 'refused',
      code: 'change-refused',
      reason: 'team-plays-itself',
      at: { form: 'add-game', typed },
    });
    expect(back.hash).toBe(`#add-game-${round}`);
    expect(refusedAtOf(back.query)).toEqual({ form: 'add-game', typed });
    const problem = gameProblemOf(back.query, typed, true);
    expect(problem?.field).toBe('awayTeamId');
    expect(problem?.text.startsWith('Away team: ')).toBe(true);
  });

  it('puts back nothing that is not the shape of its box', () => {
    expect(
      refusedAtOf({
        problem: 'invalid-input',
        at: 'game',
        game: team,
        date: '5/12',
        time: 'six',
        home: 'x',
        recording: '<b>',
      }),
    ).toEqual({
      form: 'game',
      gameId: team,
      typed: {
        homeTeamId: '',
        awayTeamId: '',
        roundId: '',
        date: '',
        time: '',
        place: '',
        recording: '',
      },
    });
    expect(gameProblemOf({ problem: 'invalid-input' }, { ...typed, date: '' }, false)?.field).toBe(
      'date',
    );
  });

  it('reads the address\'s "Saved" only while its notice is fresh', () => {
    const address = { done: 'saved', saved: 'game-saved', game: team, season: 's' };
    expect(answerShown(address, false)).toEqual({ season: 's' });
    expect(savedDetailOf(answerShown(address, true))).toEqual({ what: 'game-saved', gameId: team });
    expect(noticeOf(answerShown({ done: 'published' }, false))).toBeUndefined();
  });

  it("reads a refusal's words only while its notice is fresh, a refused swap beside its game", () => {
    const address = { problem: 'stale-version', at: 'swap', game: team, other: team, season: 's' };
    expect(answerShown(address, false)).toEqual({ season: 's' });
    expect(refusedAtOf(answerShown(address, false))).toBeUndefined();
    expect(refusedAtOf(answerShown(address, true))).toEqual({
      form: 'swap',
      gameId: team,
      otherGameId: team,
    });
  });
});
