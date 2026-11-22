// The schedule grid's buttons on the made-up scheduling store: ten games built by hand,
// a clash flagged the moment it happens and fixed, every edit held in the draft until
// publishing, and the grid's rows read back from the draft.
import {
  gameAnchor,
  getScheduleDraft,
  listVenues,
  publishChangeCount,
  type CommandContext,
  type ScheduleDraftView,
} from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInSchedule } from '../../server/stand-in-schedule.ts';
import { adultTeams } from '../../server/stand-in-world-seed.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { buildGrid, pageGrid, parsePlace, placeValue } from './build-grid.ts';
import { answerParams, noticeOfAnswer, savedDetailOf, savedDetailOfNotice } from './grid-answer.ts';
import { runScheduleAction, type ScheduleActionKind } from './run-schedule-action.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const owner = '01900000-0000-7000-8000-0000000000a1';
const seasonId = '01900000-0000-7000-8000-0000c1000001';
// Eight of the made-up season's own teams.
const teams = adultTeams.slice(0, 8).map((t) => ({ id: t.id, name: t.name }));
const team = (n: number) => teams[n - 1]?.id ?? '';
const context: CommandContext = { leagueId, accountId: owner, requestId: 'request-1' };

/** The made-up world, made at `now` (this computer's clock where not given). */
function setup(now?: string) {
  const ports = standInSchedule(
    testWorld(
      () => ({
        ownerAccountId: async () => owner,
        leagueStatus: async () => 'live',
        activeGrantsOf: async () => [],
      }),
      now === undefined ? undefined : () => new Date(now),
    ),
  );
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

const gameId = (n: number) =>
  `01900000-0000-7000-8000-${(0xc3 * 0x1000000 + n).toString(16).padStart(12, '0')}`;

describe('schedule grid', () => {
  // Now, and at the minutes GitHub failed at (2026-11-15 20:01 and 20:02 UTC, step 2.179)
  // and 06:10 UTC, a little after midnight in the made-up league's zone: the made-up
  // world's games set from now never hold a clash, at any hour.
  it.each([undefined, '2026-11-15T20:02:00Z', '2026-11-15T06:10:00Z'])(
    'builds ten games by hand, flags a clash and lets it be fixed, then publishes (made at %s)',
    async (now) => {
      const { ports, read, press } = setup(now);
      const first = await read();
      expect(first.draft).toBeNull();
      const round = first.result.rounds[0];
      if (round === undefined || round.date === null) throw new Error('no round');
      const venues = await listVenues(context, {}, ports.deps);
      if (!venues.ok) throw new Error('no venues');
      const gym = venues.value[0];
      const court1 = gym?.courts[0];
      if (gym === undefined || court1 === undefined) throw new Error('no court');
      const place = placeValue(gym.id, court1.name);
      expect(parsePlace(place)).toEqual({ venueId: gym.id, court: court1.name });

      // The season's games already published (the first round's are at 18:00 and 19:00).
      const publishedBefore = first.published.games.length;
      expect(publishedBefore).toBeGreaterThan(0);
      // Ten games, one an hour from 08:00 to 17:00 on Court 1.
      for (let n = 1; n <= 10; n += 1) {
        const home = teams[(n * 2 - 2) % 8];
        const away = teams[(n * 2 - 1) % 8];
        const done = await press('add-game', {
          gameId: gameId(n),
          homeTeamId: home?.id ?? '',
          awayTeamId: away?.id ?? '',
          roundId: round.id,
          date: round.date,
          time: `${String(7 + n).padStart(2, '0')}:00`,
          place,
          recording: n === 1 ? 'live' : '',
        });
        expect(done).toEqual({ kind: 'saved', detail: { what: 'game-saved', gameId: gameId(n) } });
      }
      let view = await read();
      expect(view.result.games).toHaveLength(publishedBefore + 10);
      expect(view.clashes).toEqual([]);
      // Nothing is public yet: the published schedule is still what it was.
      expect(view.published.games).toHaveLength(publishedBefore);

      // A game booked on top of game 2 (same court, same time) is flagged at once.
      const dup = await press('add-game', {
        gameId: gameId(11),
        homeTeamId: team(5),
        awayTeamId: team(6),
        roundId: round.id,
        date: round.date,
        time: '09:00',
        place,
      });
      expect(dup).toEqual({ kind: 'saved', detail: { what: 'game-saved', gameId: gameId(11) } });
      view = await read();
      expect(view.clashes.length).toBeGreaterThan(0);
      const grid = buildGrid(view, teams, venues.value);
      expect(grid.clashes.length).toBeGreaterThan(0);
      expect(grid.allGames.filter((g) => g.clashed).map((g) => g.id)).toContain(gameId(11));

      // Moving it to the other court fixes it.
      const court2 = gym.courts[1];
      const fixed = await press('save-game', {
        gameId: gameId(11),
        roundId: round.id,
        date: round.date,
        time: '09:00',
        place: placeValue(gym.id, court2?.name ?? null),
        wasSlot: [round.id, round.date, '09:00', place].join('~'),
        recording: '',
        wasRecording: '',
      });
      expect(fixed).toEqual({ kind: 'saved', detail: { what: 'game-saved', gameId: gameId(11) } });
      view = await read();
      expect(view.clashes).toEqual([]);

      // Recording mode, swap, remove, rename, round date.
      expect(
        await press('save-game', {
          gameId: gameId(2),
          roundId: round.id,
          date: round.date,
          time: '09:00',
          place,
          wasSlot: [round.id, round.date, '09:00', place].join('~'),
          recording: 'box-score',
          wasRecording: '',
        }),
      ).toEqual({ kind: 'saved', detail: { what: 'game-saved', gameId: gameId(2) } });
      expect(await press('swap-games', { gameId: gameId(3), otherGameId: gameId(4) })).toEqual({
        kind: 'saved',
        detail: { what: 'game-saved', gameId: gameId(3) },
      });
      expect(
        await press('remove-game', {
          gameId: gameId(10),
          wasSlot: [round.id, round.date, '17:00', place].join('~'),
        }),
      ).toMatchObject({ kind: 'saved', detail: { what: 'game-removed', roundId: round.id } });
      expect(
        await press('rename-round', { roundId: round.id, label: 'Week 5, Rivalry Week' }),
      ).toEqual({ kind: 'saved', detail: { what: 'round-saved', roundId: round.id } });
      view = await read();
      expect(view.result.games).toHaveLength(publishedBefore + 10);
      expect(view.result.games.find((g) => g.id === gameId(2))?.recording).toBe('box-score');
      expect(view.result.rounds[0]?.label).toBe('Week 5, Rivalry Week');
      expect(view.published.rounds[0]?.label).toBe('Round 1');

      // Publishing makes the draft the schedule.
      expect(await press('publish', {})).toEqual({ kind: 'published' });
      view = await read();
      expect(view.draft).toBeNull();
      expect(view.published.games).toHaveLength(publishedBefore + 10);
      expect(view.published.rounds[0]?.label).toBe('Week 5, Rivalry Week');
    },
  );

  it('puts a game removed by mistake back exactly as it was, published or only drafted (step 2.161)', async () => {
    const { ports, read, press } = setup();
    const first = await read();
    const round = first.result.rounds[0];
    if (round === undefined || round.date === null) throw new Error('no round');
    const venues = await listVenues(context, {}, ports.deps);
    const gym = venues.ok ? venues.value[0] : undefined;
    const court = gym?.courts[0];
    if (gym === undefined || court === undefined) throw new Error('no court');
    const place = placeValue(gym.id, court.name);
    expect(
      await press('add-game', {
        gameId: gameId(30),
        homeTeamId: team(1),
        awayTeamId: team(2),
        roundId: round.id,
        date: round.date,
        time: '08:00',
        place,
        recording: 'box-score',
      }),
    ).toMatchObject({ kind: 'saved' });
    // Only a game still just scheduled has "Remove game" on the grid.
    const published = first.published.games.find((g) => g.status === 'scheduled');
    if (published === undefined) throw new Error('no published game');
    const grid = buildGrid(await read(), teams, venues.ok ? venues.value : []);
    for (const id of [gameId(30), published.id]) {
      const before = grid.allGames.find((g) => g.id === id);
      if (before === undefined) throw new Error('no game');
      const wasSlot = [before.roundId ?? '', before.date, before.time ?? '', before.place];
      const removed = await press('remove-game', {
        gameId: id,
        wasSlot: wasSlot.join('~'),
        wasRecording: before.recording ?? '',
        // What the fields held when "Remove game" was tapped does not count.
        date: '2030-01-01',
        time: '23:00',
      });
      expect(removed).toEqual({
        kind: 'saved',
        detail: {
          what: 'game-removed',
          roundId: before.roundId,
          gameId: id,
          // A published game stays in the grid, struck through: the answer is said at it.
          ...(id === published.id ? { stays: true } : {}),
        },
      });
      const out = await read();
      expect(out.result.games.some((g) => g.id === id)).toBe(false);
      // The draft keeps its own record of the game as it was: "Put it back" reads that.
      expect(out.removed.map((g) => g.id)).toEqual([id]);
      // A game of the published schedule stays in the grid, struck through, in its round,
      // as it was (step 2.185); one only ever in the draft is gone. Neither is a game of
      // the grid (no count, clash or swap holds it).
      const shown = buildGrid(out, teams, venues.ok ? venues.value : []);
      const stays = [...shown.rounds.flatMap((r) => r.removed), ...shown.looseRemoved];
      expect(stays.map((g) => g.id)).toEqual(id === published.id ? [id] : []);
      if (id === published.id) {
        const { roundGone, ...was } = stays[0] ?? { roundGone: 'missing' };
        expect(roundGone).toBeNull();
        expect(was).toEqual({ ...before, clashed: false, offRoundDate: null, outsideRound: false });
        expect(shown.rounds.find((r) => r.id === before.roundId)?.removed).toHaveLength(1);
      }
      expect(shown.allGames.some((g) => g.id === id)).toBe(false);
      // The address carries nothing of the answer (step 2.185): it is a one-time notice
      // naming only which game and its round, and the page reads it back as it was.
      const answer = answerParams(removed);
      expect(answer.query).toEqual({});
      // The phone goes to the struck row, or to the round's "Saved" for a game that is gone.
      expect(answer.hash).toBe(id === published.id ? `#${gameAnchor(id)}` : '#saved');
      const notice = noticeOfAnswer(removed);
      expect(notice).toEqual({
        thing: id,
        said: 'game-removed',
        ...(before.roundId === null ? {} : { about: [before.roundId] }),
      });
      // The notice does not carry `stays`: the page knows it from the draft.
      const { stays: _stays, ...said } =
        removed.kind === 'saved' && removed.detail?.what === 'game-removed'
          ? removed.detail
          : { stays: undefined };
      expect(savedDetailOfNotice(notice)).toEqual(said);
      // An old address that names the removal says no more than "Saved".
      expect(
        savedDetailOf({
          done: 'saved',
          saved: 'game-removed',
          game: id,
          round: before.roundId ?? undefined,
        }),
      ).toBeUndefined();
      // The form names only the game, with a basis that is out of date: still put back.
      expect(
        await press('put-back-game', { gameId: id, version: '1', homeTeamId: team(5) }),
      ).toEqual({ kind: 'saved', detail: { what: 'game-put-back', gameId: id } });
      const after = buildGrid(await read(), teams, venues.ok ? venues.value : []).allGames.find(
        (g) => g.id === id,
      );
      expect(after).toEqual(before);
      // Tapped again (a double tap, or Back to the page before): it is already back, said
      // so (step 2.185), and nothing is added twice.
      const entries = (await read()).draft?.savedEdits;
      const again = await press('put-back-game', { gameId: id });
      expect(again).toEqual({ kind: 'saved', detail: { what: 'game-already-back', gameId: id } });
      expect(savedDetailOfNotice(noticeOfAnswer(again))).toEqual({
        what: 'game-already-back',
        gameId: id,
      });
      expect((await read()).draft?.savedEdits).toBe(entries);
    }
    // Put back as it was, the published game is no change at all to publish.
    const view = await read();
    expect(view.summary.gamesRemoved).toEqual([]);
    expect(view.summary.gamesMoved).toEqual([]);
    expect(view.summary.gamesRecordingChanged).toEqual([]);
    expect(view.summary.gamesAdded).toEqual([gameId(30)]);
    // The grid's count says what publishing would change: the one new game, not the five
    // entries the draft holds (an add, two removes, two put backs).
    expect(view.draft?.savedEdits).toBe(5);
    expect(publishChangeCount(view.summary)).toBe(1);
    expect(view.published.games.some((g) => g.id === published.id)).toBe(true);
  });

  it('offers nothing to put back from an old address once the draft is published (step 2.161)', async () => {
    const { read, press } = setup();
    const first = await read();
    const game = first.published.games.find((g) => g.status === 'scheduled');
    if (game === undefined) throw new Error('no published game');
    const wasSlot = [game.roundId ?? '', game.date, game.time ?? '', ''].join('~');
    expect(await press('remove-game', { gameId: game.id, wasSlot })).toMatchObject({
      kind: 'saved',
    });
    expect(await press('publish', {})).toEqual({ kind: 'published' });
    const published = await read();
    expect(published.published.games.some((g) => g.id === game.id)).toBe(false);
    // The old page's "Put it back": refused in words, and no game is added to a new draft.
    expect(await press('put-back-game', { gameId: game.id })).toEqual({
      kind: 'refused',
      code: 'nothing-to-put-back',
    });
    const after = await read();
    expect(after.draft).toBeNull();
    expect(after.result.games.some((g) => g.id === game.id)).toBe(false);
  });

  it("keeps a removed published game struck through in the page's own grid (pageGrid, step 2.185)", async () => {
    const { read, press } = setup();
    const first = await read();
    const game = first.published.games.find((g) => g.status === 'scheduled');
    if (game === undefined) throw new Error('no published game');
    const wasSlot = [game.roundId ?? '', game.date, game.time ?? '', ''].join('~');
    expect(await press('remove-game', { gameId: game.id, wasSlot })).toMatchObject({
      kind: 'saved',
    });
    const view = await read();
    const { grid } = pageGrid(view, teams, []);
    const struck = [...grid.rounds.flatMap((r) => r.removed), ...grid.looseRemoved];
    expect(struck.map((g) => g.id)).toEqual([game.id]);
    expect(grid.allGames.some((g) => g.id === game.id)).toBe(false);
    // The page's wiring cannot leave out what keeps a struck game in sight: without the
    // draft's removed games and the published schedule, every struck game would vanish.
    // @ts-expect-error -- pageGrid must require `removed` and `published` (and `undated`).
    pageGrid({ result: view.result, clashes: view.clashes }, teams, []);
  });

  it('says nothing is to put back once someone else discarded the draft, not "already back" (step 2.185)', async () => {
    const { read, press } = setup();
    const game = (await read()).published.games.find((g) => g.status === 'scheduled');
    if (game === undefined) throw new Error('no published game');
    expect(await press('remove-game', { gameId: game.id })).toMatchObject({ kind: 'saved' });
    expect(await press('discard', {})).toEqual({ kind: 'discarded' });
    // The game is in the published schedule again, but nothing was put back by this tap.
    expect(await press('put-back-game', { gameId: game.id })).toEqual({
      kind: 'refused',
      code: 'nothing-to-put-back',
    });
    expect((await read()).draft).toBeNull();
  });

  it('answers a second tap on "Remove game" as the first, never "someone else changed it" (step 2.185)', async () => {
    const { read, press } = setup();
    const game = (await read()).published.games.find((g) => g.status === 'scheduled');
    if (game === undefined) throw new Error('no published game');
    const wasSlot = [game.roundId ?? '', game.date, game.time ?? '', ''].join('~');
    const first = await press('remove-game', { gameId: game.id, wasSlot });
    expect(first).toEqual({
      kind: 'saved',
      detail: { what: 'game-removed', roundId: game.roundId, gameId: game.id, stays: true },
    });
    const edits = (await read()).draft?.savedEdits;
    // The same form again, with the basis it was drawn with (no draft yet).
    const second = await press('remove-game', {
      gameId: game.id,
      wasSlot,
      version: '',
      draftId: '',
    });
    expect(second).toEqual(first);
    expect((await read()).draft?.savedEdits).toBe(edits);
    // A stale tap on a game the draft does not remove is still refused as before.
    const other = (await read()).result.games.find(
      (g) => g.status === 'scheduled' && g.id !== game.id,
    );
    if (other === undefined) throw new Error('no other game');
    expect(
      await press('remove-game', { gameId: other.id, version: '', draftId: '' }),
    ).toMatchObject({ kind: 'refused', code: 'changed-since-read' });
  });

  it('says the move was saved when the recording change after it is refused', async () => {
    const { read, press } = setup();
    const first = await read();
    const round = first.result.rounds[0];
    if (round === undefined || round.date === null) throw new Error('no round');
    const added = await press('add-game', {
      gameId: gameId(1),
      homeTeamId: team(1),
      awayTeamId: team(2),
      roundId: round.id,
      date: round.date,
      time: '10:00',
      place: '',
    });
    expect(added).toEqual({ kind: 'saved', detail: { what: 'game-saved', gameId: gameId(1) } });
    const saved = await press('save-game', {
      gameId: gameId(1),
      roundId: round.id,
      date: round.date,
      time: '11:00',
      place: '',
      wasSlot: [round.id, round.date, '10:00', ''].join('~'),
      recording: 'not-a-mode',
      wasRecording: '',
    });
    expect(saved).toEqual({ kind: 'refused', code: 'invalid-input', partial: true });
    const view = await read();
    expect(view.result.games.find((g) => g.id === gameId(1))?.time).toBe('11:00');
  });

  it('refuses an edit based on an old reading of the draft', async () => {
    const { press } = setup();
    const done = await press('rename-round', {
      roundId: '01900000-0000-7000-8000-0000b2000001',
      label: 'First',
    });
    expect(done).toEqual({
      kind: 'saved',
      detail: { what: 'round-saved', roundId: '01900000-0000-7000-8000-0000b2000001' },
    });
    const stale = await press('rename-round', {
      roundId: '01900000-0000-7000-8000-0000b2000001',
      label: 'Second',
      version: '1',
      draftId: '01900000-0000-7000-8000-0000d2000099',
    });
    // Said beside the round it was about.
    expect(stale).toEqual({
      kind: 'refused',
      code: 'changed-since-read',
      at: { form: 'round', roundId: '01900000-0000-7000-8000-0000b2000001' },
    });
  });

  it('says a bad form is invalid and a team cannot play itself', async () => {
    const { press } = setup();
    expect(await press('swap-games', { gameId: gameId(1) })).toEqual({
      kind: 'refused',
      code: 'invalid-input',
    });
    const itself = await press('add-game', {
      gameId: gameId(1),
      homeTeamId: team(1),
      awayTeamId: team(1),
      roundId: '',
      date: '2026-11-20',
      time: '18:00',
    });
    expect(itself).toMatchObject({ kind: 'refused', code: 'change-refused' });
  });

  it('discards the draft', async () => {
    const { read, press } = setup();
    await press('rename-round', {
      roundId: '01900000-0000-7000-8000-0000b2000001',
      label: 'Opening night',
    });
    expect(await press('discard', {})).toEqual({ kind: 'discarded' });
    expect((await read()).draft).toBeNull();
  });
});
