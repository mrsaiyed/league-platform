// The running-clock switch, the mercy rule's notice and the last-minutes sign (step 2.69's
// component tests): what the screen reads from the engine's own plays, what it draws, and
// the switch sent with no signal, kept as unsaved and replayed the same.
import { TrackerGameState } from '@srleagues/contracts';
import { createTranslator, en } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { trackerStateRequest } from '../../server/tracker-state-endpoint.ts';
import { bears, games, hawks, liveLeagueId } from '../../server/tracker-endpoints.test-helper.ts';
import {
  clockModeShown,
  lastMinutesStop,
  lastMinutesStopDismissal,
  mercyDismissal,
  mercySwitch,
  mercyDismissedIndexKey,
  mercyDismissedKept,
  readMercyDismissed,
  switchedClock,
  writeMercyDismissed,
  type ClockModeShown,
} from './clock-mode.ts';
import {
  ClockButton,
  ClockSheetView,
  LastMinutesStopNotice,
  MercyNotice,
  type ClockHandlers,
  type CourtClock,
} from './clock-parts.tsx';
import { endpointNetwork, type EndpointNetwork } from './endpoint-network.test-helper.ts';
import { createFetchCommandTransport } from './fetch-command-transport.ts';
import { createFetchTrackerServer } from './fetch-tracker-server.ts';
import { clockEntry, periodChoices } from './game-clock.ts';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import { noLineupPicks } from './opened-game-storage.ts';
import { played, testRosters, tippedOff } from './scoring-test-game.test-helper.ts';
import { scoringView } from './scoring-view.ts';
import { trackerCatalog } from './tracker-catalog.ts';
import { createTrackerController, type TapInput } from './tracker-controller.ts';
import { createManualClock } from './tracker-queue.test-helper.ts';

const t = createTranslator('en', { en: trackerCatalog(en) });
const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** A stop clock that switches to running at a lead of 10. */
const mercyRules: basketball.Rules = { ...basketball.QUARTERS, clockMode: 'stop', mercyLead: 10 };
/** A running clock that stops in the last two minutes of each half. */
const lastTwo: basketball.Rules = {
  ...basketball.QUARTERS,
  clockMode: 'running',
  stopClockLastSeconds: 120,
};
const three = (side: 'home' | 'away', playerId: string): basketball.Command => ({
  type: 'score',
  side,
  playerId,
  points: 3,
});
/** Home leads 12 to 0 after four threes: the fourth crosses a lead of 10. */
const homeRuns = (rules: basketball.Rules) =>
  played(
    [{ type: 'start' }, ...Array.from({ length: 4 }, () => three('home', 'h3'))],
    tippedOff(rules),
  );

const switchOnly: Pick<ClockHandlers, 'clockSheet' | 'clockKey' | 'setClock' | 'pickPeriod'> & {
  switchClock: () => void;
} = {
  clockSheet: () => undefined,
  clockKey: () => undefined,
  setClock: () => undefined,
  pickPeriod: () => undefined,
  switchClock: () => undefined,
};
const courtClock = (mode: ClockModeShown): CourtClock => ({
  text: '1:30',
  running: false,
  over: false,
  start: null,
  mode,
});
const sheetOf = (game: basketball.GameState, mode: ClockModeShown) =>
  renderToStaticMarkup(
    createElement(ClockSheetView, {
      t,
      view: scoringView(game, testRosters, noLineupPicks),
      clock: courtClock(mode),
      sheet: {
        entry: clockEntry(''),
        effect: null,
        periodLength: '8:00',
        periods: periodChoices(game.rules, 1),
      },
      on: switchOnly,
    }),
  );
/** The running-clock switch's own tag in the clock's form: never `disabled` (S-21, S-124). */
const switchTag = (game: basketball.GameState, mode: ClockModeShown): string =>
  /<button[^>]*data-clock-switch=""[^>]*>/.exec(sheetOf(game, mode))?.[0] ?? 'no switch';
const buttonOf = (game: basketball.GameState, mode: ClockModeShown) =>
  renderToStaticMarkup(
    createElement(ClockButton, {
      t,
      view: scoringView(game, testRosters, noLineupPicks),
      clock: courtClock(mode),
      open: false,
      on: switchOnly,
    }),
  );

describe('the running-clock switch (step 2.69, item 1)', () => {
  it('shows the mode in force and sends the other one, at any moment of the game', () => {
    const stop = tippedOff(mercyRules);
    expect(clockModeShown(stop).now).toBe('stop');
    expect(switchedClock(clockModeShown(stop))).toEqual({ type: 'clock-mode', mode: 'running' });
    const sheet = sheetOf(stop, clockModeShown(stop));
    expect(sheet).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(text(sheet)).toContain('Running clock Off The clock stops on every foul.');

    // What the switch sends, the engine takes, and the switch then reads On.
    const switched = played([switchedClock(clockModeShown(stop))], stop);
    expect(basketball.derive(switched).clockMode).toBe('running');
    expect(switchedClock(clockModeShown(switched))).toEqual({ type: 'clock-mode', mode: 'stop' });
    const on = sheetOf(switched, clockModeShown(switched));
    expect(on).toMatch(/role="switch"[^>]*aria-checked="true"/);
    expect(text(on)).toContain('Running clock On The clock keeps going after a foul.');
  });

  it('is sent with no signal like any tap: kept as unsaved, then replayed the same', async () => {
    const network: EndpointNetwork = endpointNetwork();
    const clock = createManualClock();
    let n = 0;
    const fetch: typeof globalThis.fetch = (input, init) =>
      network.fetchAs('scorekeeper')(input, init);
    const controller = createTrackerController({
      gameId: games.hawksBears,
      deviceId: 'tablet-1',
      storage: createMemoryQueueStorage(),
      clock,
      wallClock: clock.now,
      newCommandId: () => {
        n += 1;
        return `01900000-0000-7000-8000-00f1${n.toString(16).padStart(8, '0')}`;
      },
      random: () => 1,
      transport: createFetchCommandTransport({
        leagueId: liveLeagueId,
        gameId: games.hawksBears,
        fetch,
      }),
      server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId: games.hawksBears, fetch }),
    });
    await controller.start();
    await controller.idle();
    const tipOff: TapInput[] = [
      { type: 'lineup', side: 'home', playerIds: hawks },
      { type: 'lineup', side: 'away', playerIds: bears },
    ];
    for (const input of tipOff) expect((await controller.tap(input)).ok).toBe(true);
    await controller.idle();
    const game = () => {
      const shown = controller.status().game;
      if (shown === null) throw new Error('no game on the device');
      return shown;
    };
    const before = clockModeShown(game()).now;

    network.mode = 'down';
    const sent = switchedClock(clockModeShown(game()));
    expect(sent.mode).not.toBe(before);
    expect((await controller.tap(sent)).ok).toBe(true);
    await controller.idle();
    // Shown at once, and kept on the device as not yet saved.
    expect(clockModeShown(game()).now).toBe(sent.mode);
    const waiting = controller.status().waiting.map((kept) => kept.command);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ input: sent });
    const commandId = waiting[0]?.commandId;

    network.mode = 'up';
    controller.online();
    await controller.idle();
    expect(controller.status().waiting).toEqual([]);
    expect(controller.status().notApplied).toEqual([]);
    const context = await network.world.contextAs('owner', 'live', [
      'games',
      games.hawksBears,
      'state',
    ]);
    const answer = await trackerStateRequest(context, games.hawksBears, network.world.tracker);
    const server = TrackerGameState.parse(answer.body).state as basketball.GameState;
    // The same tap, once: its own id, and the mode it asked for.
    const switches = server.plays.filter((play) => play.type === 'clock-mode');
    expect(switches).toHaveLength(1);
    expect(switches[0]).toMatchObject({ id: commandId, type: 'clock-mode', mode: sent.mode });
    expect(basketball.derive(server).clockMode).toBe(sent.mode);
    await controller.leave();
  });
});

describe('the mercy rule’s notice (step 2.69, item 2)', () => {
  it('says so when the lead reaches the mercy lead, with the way back in one tap', () => {
    const game = homeRuns(mercyRules);
    const mercy = mercySwitch(game);
    expect(mercy).toEqual({ playId: game.plays.at(-1)?.id, lead: 10, lastMinutes: false });
    const html = renderToStaticMarkup(
      createElement(MercyNotice, {
        t,
        mercy: mercy ?? { playId: '', lead: 0, lastMinutes: false },
        back: () => undefined,
        keep: () => undefined,
      }),
    );
    expect(text(html)).toBe(
      'One team leads by 10 or more, so the clock now keeps running after fouls (the mercy rule). Stop the clock on fouls again Keep it running',
    );
    expect(html).toContain('data-mercy-back');
    // The way back is the switch's own command: the engine takes it and the notice goes.
    const back = played([{ type: 'clock-mode', mode: 'stop' }], game);
    expect(basketball.derive(back).clockMode).toBe('stop');
    expect(mercySwitch(back)).toBeNull();
  });

  it('is not said before the lead is reached, nor without a mercy lead, nor once the basket is undone', () => {
    const short = played(
      [{ type: 'start' }, ...Array.from({ length: 3 }, () => three('home', 'h3'))],
      tippedOff(mercyRules),
    );
    expect(mercySwitch(short)).toBeNull();
    expect(mercySwitch(homeRuns({ ...mercyRules, mercyLead: null }))).toBeNull();
    expect(mercySwitch(played([{ type: 'undo' }], homeRuns(mercyRules)))).toBeNull();
    // Switched back, then to running again by hand: the scorer's own switch, not the rule's.
    const byHand = played(
      [
        { type: 'clock-mode', mode: 'stop' },
        { type: 'clock-mode', mode: 'running' },
      ],
      homeRuns(mercyRules),
    );
    expect(basketball.derive(byHand).clockMode).toBe('running');
    expect(mercySwitch(byHand)).toBeNull();
  });

  it('a later crossing is a new notice: the one dismissed is not said again', () => {
    const first = homeRuns(mercyRules);
    const firstId = mercySwitch(first)?.playId;
    // Switched back, the lead drops below ten, then reaches it again.
    const again = played(
      [{ type: 'clock-mode', mode: 'stop' }, three('away', 'a3'), three('home', 'h3')],
      first,
    );
    const second = mercySwitch(again);
    expect(second).not.toBeNull();
    expect(second?.playId).not.toBe(firstId);
    // Still the same crossing while the lead stays: the notice keeps the first basket's id.
    expect(mercySwitch(played([three('home', 'h5')], first))?.playId).toBe(firstId);
  });

  it('a dismissal is kept on the device by game and person, so a reload does not say it again', () => {
    const kept = new Map<string, string>();
    const store = {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
      removeItem: (key: string) => void kept.delete(key),
    };
    const owner = { gameId: 'game-1', accountId: 'person-1' };
    const firstId = mercySwitch(homeRuns(mercyRules))?.playId ?? '';
    expect(readMercyDismissed(store, owner)).toBeNull();
    writeMercyDismissed(store, owner, firstId);
    // The page is opened again: the same game and person read the same basket back.
    expect(readMercyDismissed(store, owner)).toBe(firstId);
    expect(readMercyDismissed(store, { ...owner, gameId: 'game-2' })).toBeNull();
    expect(readMercyDismissed(store, { ...owner, accountId: 'person-2' })).toBeNull();
    // A storage that cannot be reached loses only the dismissal.
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    };
    expect(() => writeMercyDismissed(broken, owner, firstId)).not.toThrow();
    expect(readMercyDismissed(broken, owner)).toBeNull();
    expect(readMercyDismissed(null, owner)).toBeNull();
  });

  it('only the newest 20 games keep their dismissal, so the keys never pile up', () => {
    const kept = new Map<string, string>();
    const store = {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
      removeItem: (key: string) => void kept.delete(key),
    };
    const game = (n: number) => ({ gameId: `game-${n}`, accountId: 'person-1' });
    for (let n = 1; n <= 25; n++) writeMercyDismissed(store, game(n), `basket-${n}`);
    // Game 3 is dismissed again: it comes back as the newest, game 6 goes, and game 7 is the oldest kept.
    writeMercyDismissed(store, game(3), 'basket-3b');
    const dismissals = [...kept.keys()].filter((key) => key !== mercyDismissedIndexKey);
    expect(dismissals).toHaveLength(mercyDismissedKept);
    expect(readMercyDismissed(store, game(3))).toBe('basket-3b');
    for (const n of [1, 2, 4, 5, 6]) expect(readMercyDismissed(store, game(n))).toBeNull();
    for (const n of [7, 25]) expect(readMercyDismissed(store, game(n))).toBe(`basket-${n}`);
    // A list that cannot be read is begun again, never a fault.
    kept.set(mercyDismissedIndexKey, '{not a list');
    expect(() => writeMercyDismissed(store, game(26), 'basket-26')).not.toThrow();
    expect(readMercyDismissed(store, game(26))).toBe('basket-26');
  });
});

describe('the last-minutes stop clock sign (step 2.69, item 3)', () => {
  /** The game in Q2 (the end of the first half), the clock set to `ms` and running. */
  const at = (game: basketball.GameState, ms: number, period = 2) =>
    played(
      [
        ...(period === 1 ? [] : [{ type: 'period', period } as const]),
        { type: 'set-clock', ms },
        { type: 'start' },
      ],
      game,
    );

  it('is shown beside the period inside the last minutes of a running-clock game', () => {
    const early = at(tippedOff(lastTwo), 300_000);
    const shownEarly = clockModeShown(early);
    expect(shownEarly).toEqual({ now: 'running', lastMinutes: false, lastMinutesAtMs: 120_000 });
    expect(buttonOf(early, shownEarly)).not.toContain('data-last-minutes');

    const late = clockModeShown(early, 90_000);
    expect(late).toEqual({ now: 'stop', lastMinutes: true, lastMinutesAtMs: null });
    const html = buttonOf(early, late);
    expect(html).toContain('data-last-minutes');
    expect(text(html)).toContain('Stop clock');
    expect(text(html)).toContain('The last minutes: the clock stops on every foul.');
    // The switch reads Off there and works: a tap keeps the clock running (S-21, S-112).
    expect(text(sheetOf(early, late))).toContain(
      'These are the last minutes, so the clock stops on every foul. Turn it on to keep the clock going.',
    );
    expect(switchTag(early, late)).not.toContain('disabled');
  });

  it('is not shown where the scorer switched to running inside them, nor on a stop clock', () => {
    const late = at(tippedOff(lastTwo), 90_000);
    const kept = played([{ type: 'clock-mode', mode: 'running' }], late);
    expect(clockModeShown(kept)).toMatchObject({ now: 'running', lastMinutes: false });
    const stop = at(tippedOff({ ...lastTwo, clockMode: 'stop' }), 90_000);
    expect(clockModeShown(stop)).toEqual({
      now: 'stop',
      lastMinutes: false,
      lastMinutesAtMs: null,
    });
    // Q1 has no window when the last minutes are each half's.
    const q1 = at(tippedOff(lastTwo), 90_000, 1);
    expect(clockModeShown(q1)).toEqual({
      now: 'running',
      lastMinutes: false,
      lastMinutesAtMs: null,
    });
  });

  it('a stop-clock game is drawn again as the window begins: its moment is given under either clock', () => {
    // The review's M2: given only under a running clock, nothing redrew a stop-clock game.
    const stop = at(tippedOff({ ...lastTwo, clockMode: 'stop' }), 150_000);
    expect(clockModeShown(stop).lastMinutesAtMs).toBe(120_000);
    expect(clockModeShown(stop, 90_000).lastMinutesAtMs).toBeNull();
  });
});

describe('a mercy rule beside the last minutes (step 2.248, items 1 and 2; S-124)', () => {
  /** A stop clock, a mercy lead of 10 and a stop clock in the last two minutes. */
  const both = (scope: basketball.Rules['stopClockScope'] = 'half'): basketball.Rules => ({
    ...basketball.QUARTERS,
    clockMode: 'stop',
    mercyLead: 10,
    stopClockLastSeconds: 120,
    stopClockScope: scope,
  });
  /** `game` moved to `period` (unless it is there) with `ms` left, the clock running. */
  const at = (game: basketball.GameState, period: number, ms: number) =>
    played(
      [
        ...(basketball.derive(game).period === period ? [] : [{ type: 'period', period } as const]),
        { type: 'set-clock', ms },
        { type: 'start' },
      ],
      game,
    );
  /** A tap on the running-clock switch, as the screen sends it. */
  const flip = (game: basketball.GameState) =>
    played([{ type: 'clock-mode', mode: switchedClock(clockModeShown(game)).mode }], game);
  const noticeOf = (game: basketball.GameState) => {
    const mercy = mercySwitch(game);
    return mercy === null
      ? null
      : renderToStaticMarkup(
          createElement(MercyNotice, { t, mercy, back: () => undefined, keep: () => undefined }),
        );
  };
  const said =
    'One team leads by 10 or more, so the clock now keeps running after fouls (the mercy rule). Stop the clock on fouls again Keep it running';
  const saidLast =
    'One team leads by 10 or more (the mercy rule), but in these last minutes the clock stops on every foul. Got it';
  const saidStop =
    'The clock now stops on fouls for the rest of the game. Tap Running clock to change it back. Got it';
  /** What the screen shows at `game`: the notices' words, the mode and the switch. */
  const seen = (game: basketball.GameState) => {
    const shown = clockModeShown(game);
    const html = noticeOf(game);
    return {
      notice: html === null ? null : text(html),
      back: html?.includes('data-mercy-back') ?? false,
      stop:
        lastMinutesStop(game) === null
          ? null
          : text(renderToStaticMarkup(createElement(LastMinutesStopNotice, { t, seen: () => {} }))),
      now: shown.now,
      locked: switchTag(game, shown).includes('disabled'),
    };
  };
  const outside = { notice: said, back: true, stop: null, now: 'running', locked: false };
  const inside = { notice: saidLast, back: false, stop: null, now: 'stop', locked: false };
  const plain = (now: string) => ({ notice: null, back: false, stop: null, now, locked: false });
  const stopped = { notice: null, back: false, stop: saidStop, now: 'stop', locked: false };

  it('before the mercy line: a stop clock, no notice, the switch usable in the window too', () => {
    const short = played(
      [{ type: 'start' }, ...Array.from({ length: 3 }, () => three('home', 'h3'))],
      tippedOff(both()),
    );
    expect(seen(at(short, 2, 300_000))).toEqual(plain('stop'));
    expect(seen(at(short, 2, 90_000))).toEqual(plain('stop'));
  });

  it('after it: the notice as step 2.69 made it outside the window, its own words inside', () => {
    const game = homeRuns(both());
    expect(seen(at(game, 2, 300_000))).toEqual(outside);
    const late = at(game, 2, 90_000);
    expect(seen(late)).toEqual(inside);
    // The way back the notice no longer offers: the engine refuses it there.
    expect(() => played([{ type: 'clock-mode', mode: 'stop' }], late)).toThrow(
      'The clock already stops on fouls.',
    );
    // The window begins while the clock runs: the same state read at a later moment.
    const early = at(game, 2, 125_000);
    expect(mercySwitch(early)?.lastMinutes).toBe(false);
    expect(mercySwitch(early, 110_000)?.lastMinutes).toBe(true);
    expect(clockModeShown(early).lastMinutesAtMs).toBe(120_000);
    // A new period ends the window: the running clock and the way back come back, and
    // "Got it" inside the window did not dismiss them (the review's L2).
    const after = at(late, 3, 480_000);
    expect(seen(after)).toEqual(outside);
    expect(mercyDismissal(mercySwitch(late)!)).not.toBe(mercyDismissal(mercySwitch(after)!));
    expect(mercyDismissal(mercySwitch(after)!)).toBe(mercySwitch(after)!.playId);
  });

  it('in overtime: each overtime period’s last minutes stop the clock, its start does not', () => {
    const game = homeRuns(both());
    expect(seen(at(game, 5, 200_000))).toEqual(outside);
    const late = at(game, 5, 60_000);
    expect(seen(late)).toEqual(inside);
    expect(seen(at(late, 6, 240_000))).toEqual(outside);
  });

  it('follows the window’s scope: the game’s, each half’s, each period’s', () => {
    const game = homeRuns(both('game'));
    expect(seen(at(game, 2, 90_000))).toEqual(outside);
    expect(seen(at(game, 3, 90_000))).toEqual(outside);
    expect(seen(at(game, 4, 90_000))).toEqual(inside);
    const half = homeRuns(both('half'));
    expect(seen(at(half, 1, 90_000))).toEqual(outside);
    expect(seen(at(half, 2, 90_000))).toEqual(inside);
    expect(seen(at(half, 3, 90_000))).toEqual(outside);
    expect(seen(at(half, 4, 90_000))).toEqual(inside);
    const period = homeRuns(both('period'));
    for (const q of [1, 2, 3, 4]) expect(seen(at(period, q, 90_000))).toEqual(inside);
  });

  // S-124: the switch works inside the last minutes; On then Off there leaves a stop clock
  // for the rest of the game (until step 2.252), and the screen says so while it holds.
  const seasons = {
    '(a) both rules, after the mercy line': homeRuns(both()),
    '(c) a running-clock season with last minutes': tippedOff({
      ...basketball.QUARTERS,
      clockMode: 'running',
      stopClockLastSeconds: 120,
    }),
  };
  for (const [name, game] of Object.entries(seasons)) {
    it(`${name}: On then Off inside the last minutes is said, then and after them`, () => {
      const late = at(game, 4, 90_000);
      expect(seen(late)).toMatchObject({ stop: null, now: 'stop', locked: false });
      const on = flip(late);
      expect(seen(on)).toEqual(plain('running'));
      const off = flip(on);
      expect(seen(off)).toEqual(stopped);
      // After the last minutes the screen still says the truth: a stop clock.
      const after = at(off, 5, 240_000);
      expect(seen(after)).toEqual(stopped);
      // One tap puts it right.
      expect(seen(flip(after))).toEqual(plain('running'));
      // Entered again, it is a new notice: a dismissal of the first does not hide it.
      const again = flip(flip(off));
      expect(seen(again)).toEqual(stopped);
      expect(lastMinutesStopDismissal(lastMinutesStop(again)!)).not.toBe(
        lastMinutesStopDismissal(lastMinutesStop(off)!),
      );
    });
  }

  // Where the game was already on a stop clock, Off only puts back the clock it had:
  // "Tap Running clock to change it back" would leave the rest of it on a running clock.
  it('(b) a stop-clock season with last minutes: On then Off inside them is not said', () => {
    const stopSeason = tippedOff({
      ...basketball.QUARTERS,
      clockMode: 'stop',
      stopClockLastSeconds: 120,
    });
    const on = flip(at(stopSeason, 4, 90_000));
    expect(seen(on)).toEqual(plain('running'));
    const off = flip(on);
    expect(seen(off)).toEqual(plain('stop'));
    expect(seen(at(off, 5, 240_000))).toEqual(plain('stop'));
    expect(seen(flip(flip(off)))).toEqual(plain('stop'));
  });

  it('Off chosen before the last minutes, then On and Off inside them, is not said', () => {
    const running = tippedOff({
      ...basketball.QUARTERS,
      clockMode: 'running',
      stopClockLastSeconds: 120,
    });
    const chosen = flip(at(running, 4, 300_000));
    expect(seen(chosen)).toEqual(plain('stop'));
    const on = flip(at(chosen, 4, 90_000));
    expect(seen(on)).toEqual(plain('running'));
    expect(seen(flip(on))).toEqual(plain('stop'));
    expect(seen(flip(flip(flip(on))))).toEqual(plain('stop'));
  });

  it('On then Off outside the last minutes, or across a new period, is not that', () => {
    const running = tippedOff({
      ...basketball.QUARTERS,
      clockMode: 'running',
      stopClockLastSeconds: 120,
    });
    const early = at(running, 4, 300_000);
    expect(seen(flip(early))).toEqual(plain('stop'));
    expect(seen(flip(flip(early)))).toEqual(plain('running'));
    // On in the second quarter's last minutes, Off in the third: an ordinary stop clock.
    const on = flip(at(running, 2, 90_000));
    expect(seen(flip(at(on, 3, 480_000)))).toEqual(plain('stop'));
  });
});
