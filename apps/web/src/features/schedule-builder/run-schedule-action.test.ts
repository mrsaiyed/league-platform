// The schedule grid's buttons on the made-up scheduling store: ten games built by hand,
// a clash flagged the moment it happens and fixed, every edit held in the draft until
// publishing, and the grid's rows read back from the draft.
import {
  getScheduleDraft,
  listVenues,
  type CommandContext,
  type ScheduleDraftView,
} from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInSchedule } from '../../server/stand-in-schedule.ts';
import { buildGrid, parsePlace, placeValue } from './build-grid.ts';
import { runScheduleAction, type ScheduleActionKind } from './run-schedule-action.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const owner = '01900000-0000-7000-8000-0000000000a1';
const seasonId = '01900000-0000-7000-8000-0000c1000001';
const team = (n: number) =>
  `01900000-0000-7000-8000-${(0xa1 * 0x1000000 + n).toString(16).padStart(12, '0')}`;
const teams = Array.from({ length: 8 }, (_, i) => ({ id: team(i + 1), name: `Team ${i + 1}` }));
const context: CommandContext = { leagueId, accountId: owner, requestId: 'request-1' };

function setup() {
  const ports = standInSchedule({
    leagues: [{ leagueId, seasonId, teams, rounds: 3 }],
    accessFor: () => ({
      ownerAccountId: async () => owner,
      leagueStatus: async () => 'live',
      activeGrantsOf: async () => [],
    }),
    log: () => undefined,
    today: () => '2026-11-13',
  });
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
  it('builds ten games by hand, flags a clash and lets it be fixed, then publishes', async () => {
    const { ports, read, press } = setup();
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

    // Ten games, one pair at a time at 18:00 and 19:00 on Court 1.
    for (let n = 1; n <= 10; n += 1) {
      const home = teams[(n * 2 - 2) % 8];
      const away = teams[(n * 2 - 1) % 8];
      const done = await press('add-game', {
        gameId: gameId(n),
        homeTeamId: home?.id ?? '',
        awayTeamId: away?.id ?? '',
        roundId: round.id,
        date: round.date,
        time: `${String(8 + n).padStart(2, '0')}:00`,
        place,
        recording: n === 1 ? 'live' : '',
      });
      expect(done).toEqual({ kind: 'saved' });
    }
    let view = await read();
    expect(view.result.games).toHaveLength(10);
    expect(view.clashes).toEqual([]);
    // Nothing is public yet: the published schedule is still empty.
    expect(view.published.games).toHaveLength(0);

    // A game booked on top of game 2 (same court, same time) is flagged at once.
    const dup = await press('add-game', {
      gameId: gameId(11),
      homeTeamId: team(5),
      awayTeamId: team(6),
      roundId: round.id,
      date: round.date,
      time: '10:00',
      place,
    });
    expect(dup).toEqual({ kind: 'saved' });
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
      time: '10:00',
      place: placeValue(gym.id, court2?.name ?? null),
      wasSlot: [round.id, round.date, '10:00', place].join('~'),
      recording: '',
      wasRecording: '',
    });
    expect(fixed).toEqual({ kind: 'saved' });
    view = await read();
    expect(view.clashes).toEqual([]);

    // Recording mode, swap, remove, rename, round date.
    expect(
      await press('save-game', {
        gameId: gameId(2),
        roundId: round.id,
        date: round.date,
        time: '10:00',
        place,
        wasSlot: [round.id, round.date, '10:00', place].join('~'),
        recording: 'box-score',
        wasRecording: '',
      }),
    ).toEqual({ kind: 'saved' });
    expect(await press('swap-games', { gameId: gameId(3), otherGameId: gameId(4) })).toEqual({
      kind: 'saved',
    });
    expect(await press('remove-game', { gameId: gameId(10) })).toEqual({ kind: 'saved' });
    expect(
      await press('rename-round', { roundId: round.id, label: 'Week 5, Rivalry Week' }),
    ).toEqual({ kind: 'saved' });
    view = await read();
    expect(view.result.games).toHaveLength(10);
    expect(view.result.games.find((g) => g.id === gameId(2))?.recording).toBe('box-score');
    expect(view.result.rounds[0]?.label).toBe('Week 5, Rivalry Week');
    expect(view.published.rounds[0]?.label).toBe('Round 1');

    // Publishing makes the draft the schedule.
    expect(await press('publish', {})).toEqual({ kind: 'published' });
    view = await read();
    expect(view.draft).toBeNull();
    expect(view.published.games).toHaveLength(10);
    expect(view.published.rounds[0]?.label).toBe('Week 5, Rivalry Week');
  });

  it('refuses an edit based on an old reading of the draft', async () => {
    const { press } = setup();
    const done = await press('rename-round', {
      roundId: '01900000-0000-7000-8000-0000b2000001',
      label: 'First',
    });
    expect(done).toEqual({ kind: 'saved' });
    const stale = await press('rename-round', {
      roundId: '01900000-0000-7000-8000-0000b2000001',
      label: 'Second',
      version: '1',
      draftId: '01900000-0000-7000-8000-0000d2000099',
    });
    expect(stale).toEqual({ kind: 'refused', code: 'changed-since-read' });
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
