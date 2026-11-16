// The scoring screen's actions against the engine's own results (step 2.35's done test).
// Each action is made the way the screen makes it (scoring-moves.ts), sent through the
// real controller to the real endpoints over the made-up stand-in, and then three things
// must agree: the game the device shows, the game the server's engine holds, and what
// the screen draws from it (court-view.tsx).
import { TrackerGameState } from '@srleagues/contracts';
import { createTranslator, en } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { bears, games, hawks, liveLeagueId } from '../../server/tracker-endpoints.test-helper.ts';
import { standInPlayerId } from '../../server/stand-in-games.ts';
import { trackerStateRequest } from '../../server/tracker-state-endpoint.ts';
import { CourtView, type CourtHandlers, type CourtSlots } from './court-view.tsx';
import { endpointNetwork, type EndpointNetwork } from './endpoint-network.test-helper.ts';
import { refusalText } from './engine-words.ts';
import { createFetchCommandTransport } from './fetch-command-transport.ts';
import { createFetchTrackerServer } from './fetch-tracker-server.ts';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import { noLineupPicks, type DeviceRosters, type LineupPicks } from './opened-game-storage.ts';
import {
  dropOn,
  padAtRest,
  padTap,
  startShortHanded,
  subTap,
  swapColorsTap,
  tapTile,
  type PadAction,
  type PadMode,
} from './scoring-moves.ts';
import { madeUpPlayer } from './scoring-test-game.test-helper.ts';
import { findTile, scoringView, type ScoringView } from './scoring-view.ts';
import { trackerCatalog } from './tracker-catalog.ts';
import { createTrackerController, type TapInput } from './tracker-controller.ts';
import { createManualClock } from './tracker-queue.test-helper.ts';

const gameId = games.hawksBears;
const t = createTranslator('en', { en: trackerCatalog(en) });

/** The stand-in's Hawks and Bears as the device keeps them: six each, numbered 3 to 13. */
const names = {
  home: ['Max', 'Ned', 'Oz', 'Pia', 'Quin', 'Ray'],
  away: ['Sol', 'Tam', 'Uma', 'Vic', 'Wes', 'Xan'],
};
const teamOf = (team: 3 | 4, family: string, first: readonly string[]) =>
  first.map((name, n) =>
    madeUpPlayer(standInPlayerId(team, n + 1), String(n * 2 + 3), name, family),
  );
const rosters: DeviceRosters = {
  home: { teamId: 'hawks', name: 'Hawks', players: teamOf(3, 'Hawkins', names.home) },
  away: { teamId: 'bears', name: 'Bears', players: teamOf(4, 'Bearsley', names.away) },
  uniqueJerseys: false,
};
const hawkBench = standInPlayerId(3, 6);
const bearBench = standInPlayerId(4, 6);
const [h1 = '', h2 = '', h3 = ''] = hawks;
const [b1 = '', b2 = ''] = bears;

let commandNumber = 0;
const newCommandId = () => {
  commandNumber += 1;
  return `01900000-0000-7000-8000-00e0${commandNumber.toString(16).padStart(8, '0')}`;
};

/** A scorekeeper's device with the game open, and the screen's view of it. */
async function scoringDevice(network: EndpointNetwork = endpointNetwork()) {
  const clock = createManualClock();
  const fetch: typeof globalThis.fetch = (input, init) =>
    network.fetchAs('scorekeeper')(input, init);
  const controller = createTrackerController({
    gameId,
    deviceId: 'tablet-1',
    storage: createMemoryQueueStorage(),
    clock,
    wallClock: clock.now,
    newCommandId,
    random: () => 1,
    transport: createFetchCommandTransport({ leagueId: liveLeagueId, gameId, fetch }),
    server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId, fetch }),
  });
  await controller.start();
  await controller.idle();
  const shown = () => {
    const game = controller.status().game;
    if (game === null) throw new Error('the game is not open');
    return game;
  };
  let picks: LineupPicks = noLineupPicks;
  const view = () => scoringView(shown(), rosters, picks);
  const tile = (id: string) => {
    const found = findTile(view(), id);
    if (found === undefined) throw new Error(`no tile for ${id}`);
    return found;
  };
  /** Sends a tap as the screen does, and waits until the server has it. */
  const send = async (input: TapInput) => {
    const result = await controller.tap(input);
    await controller.idle();
    return result;
  };
  const taken = async (input: TapInput) => {
    const result = await send(input);
    if (!result.ok) throw new Error(`tap not taken: ${result.reason}`);
  };
  /** The game as the server's engine holds it. */
  const onServer = async () => {
    const context = await network.world.contextAs('owner', 'live', ['games', gameId, 'state']);
    const answer = await trackerStateRequest(context, gameId, network.world.tracker);
    const held = TrackerGameState.parse(answer.body) as {
      sequence: number;
      state: basketball.GameState;
    };
    return basketball.derive(held.state);
  };
  return {
    controller,
    shown,
    view,
    tile,
    send,
    taken,
    onServer,
    /** Taps a player's tile while starters are picked; sends the lineup the fifth pick makes. */
    async pick(id: string) {
      const tapped = tapTile(view(), picks, padAtRest, id);
      if (tapped?.kind !== 'pick') throw new Error('not a pick');
      picks = tapped.picks;
      if (tapped.lineup !== null) await taken(tapped.lineup);
    },
    picks: () => picks,
    setPicks(next: LineupPicks) {
      picks = next;
    },
    /** Both lineups, picked tile by tile. */
    async tipOff() {
      for (const id of [...hawks, ...bears]) await this.pick(id);
    },
    /** A player's option, tapped. */
    async option(id: string, action: PadAction) {
      await taken(padTap(tile(id), action));
    },
  };
}

const noHandlers: CourtHandlers = {
  tile: () => undefined,
  startShortHanded: () => undefined,
  action: () => undefined,
  substitute: () => undefined,
  closePad: () => undefined,
  turnovers: () => undefined,
  bench: () => undefined,
  benchPick: () => undefined,
  takeBackTurnover: () => undefined,
  teamTurnover: () => undefined,
  takeBackTeamTurnover: () => undefined,
  more: () => undefined,
  swapColors: () => undefined,
  leave: () => () => undefined,
  startClock: () => undefined,
  pauseClock: () => undefined,
  periodOver: () => undefined,
  hideStart: () => undefined,
  clockSheet: () => undefined,
  clockKey: () => undefined,
  setClock: () => undefined,
  pickPeriod: () => undefined,
  timeouts: () => undefined,
  callTimeout: () => undefined,
  answerTimeout: () => undefined,
  takeBackTimeout: () => undefined,
};

/** The screen as it is drawn for `view`. */
function drawn(
  view: ScoringView,
  options: {
    readonly pad?: PadMode;
    readonly said?: string;
    readonly moreOpen?: boolean;
    readonly slots?: CourtSlots;
    readonly when?: string | null;
    readonly account?: ReactNode;
  } = {},
): string {
  return renderToStaticMarkup(
    createElement(CourtView, {
      t,
      view,
      title: 'Bears at Hawks',
      when: options.when === undefined ? 'Sat, 14 Nov, 7:00 PM' : options.when,
      clock: { text: '8:00', running: false, over: false, start: null },
      banner: { text: 'All saved', state: 'saved' },
      pad: options.pad ?? padAtRest,
      said: options.said ?? null,
      moreOpen: options.moreOpen ?? false,
      links: { back: '/back', account: '/account', watch: '/watch' },
      on: noHandlers,
      ...(options.slots === undefined ? {} : { slots: options.slots }),
      ...(options.account === undefined ? {} : { account: options.account }),
    }),
  );
}

/** The opening tag of the one element with `attribute` in `html`. */
const tagWith = (html: string, attribute: string): string => {
  const found = new RegExp(`<[a-z0-9]+ [^>]*${attribute}[^>]*>`).exec(html);
  if (found === null) throw new Error(`nothing drawn with ${attribute}`);
  return found[0];
};
/** What a team's scoreboard block says. */
const scoreDrawn = (html: string, side: 'home' | 'away'): number => {
  const found = new RegExp(`data-score="${side}"[^>]*>.*?court-score-value[^>]*>(\\d+)<`, 's').exec(
    html,
  );
  if (found === null) throw new Error(`no score drawn for ${side}`);
  return Number(found[1]);
};
/** A player's tile as drawn: the markup of its button. */
const tileDrawn = (html: string, id: string): string => {
  const found = new RegExp(`<button[^>]*data-player="${id}"[^>]*>.*?</button>`, 's').exec(html);
  if (found === null) throw new Error(`no tile drawn for ${id}`);
  return found[0];
};
const pointsDrawn = (html: string, id: string) =>
  Number(/data-points="(\d+)"/.exec(tileDrawn(html, id))?.[1]);
const foulsDrawn = (html: string, id: string) =>
  Number(/data-fouls="(\d+)"/.exec(tileDrawn(html, id))?.[1]);
/** The pad as drawn. */
const padDrawn = (html: string): string => html.slice(html.indexOf('id="court-pad"'));
/** The words of a piece of the screen, as they read, whatever they are wrapped in. */
const wordsDrawn = (html: string): string =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&#x27;/g, '’')
    .replace(/&amp;/g, '&');

describe('starting lineups (checklist C1 to C4)', () => {
  it('picks five by tapping, sets the lineup on the fifth, and draws the picks', async () => {
    const device = await scoringDevice();
    const before = drawn(device.view());
    expect(before).toContain('Pick the starting 5: tap players below.');
    expect(before).toContain('data-stage="lineups"');
    // Before tip-off the pad says what to do next (A6).
    expect(padDrawn(before)).toContain('Before tip-off');
    expect(padDrawn(before)).toContain('Hawks: 6 players · Bears: 6 players');

    for (const id of [h1, h2, h3]) await device.pick(id);
    const picking = drawn(device.view());
    expect(picking).toContain('3 of 5 picked.');
    expect(picking).toContain('Start with 3');
    expect(tileDrawn(picking, h1)).toContain('aria-pressed="true"');
    expect(tileDrawn(picking, hawkBench)).toContain('aria-pressed="false"');
    // Nothing is a play yet: the server holds no lineup.
    expect((await device.onServer()).teams.home.onCourt).toEqual([]);

    for (const id of hawks.slice(3)) await device.pick(id);
    // The five stay picked until the lineup is taken; the view then drops them.
    expect(device.picks().home).toEqual(hawks);
    expect(device.view().teams.home.picks).toEqual([]);
    const server = await device.onServer();
    expect(server.teams.home.onCourt).toEqual(hawks);
    const set = drawn(device.view());
    expect(tileDrawn(set, h1)).toContain('data-oncourt="1"');
    expect(tileDrawn(set, hawkBench)).toContain('data-oncourt="0"');
    // Setting lineups does not make the game live for viewers (C4).
    expect(device.shown().status).toBe('scheduled');
  });

  it('starts a short-handed team with "Start with 3"', async () => {
    const device = await scoringDevice();
    for (const id of [b1, b2, bearBench]) await device.pick(id);
    const lineup = startShortHanded(device.view(), 'away');
    if (lineup === null) throw new Error('nothing to start');
    await device.taken(lineup);
    expect((await device.onServer()).teams.away.onCourt).toEqual([b1, b2, bearBench]);
    expect(device.view().teams.away.floor.map((p) => p.id)).toEqual([b1, b2, bearBench]);
  });

  it('keeps the picks through a reload: the same picks draw the same screen (C3)', async () => {
    const device = await scoringDevice();
    for (const id of [h1, h3]) await device.pick(id);
    const kept = device.picks();
    const reloaded = await scoringDevice();
    reloaded.setPicks(kept);
    const html = drawn(reloaded.view());
    expect(html).toContain('2 of 5 picked.');
    expect(tileDrawn(html, h3)).toContain('aria-pressed="true"');
  });
});

describe('a player’s options (checklist D1 to D11)', () => {
  it('+1, +2 and +3 show on the tile and the scoreboard as the engine has them (D5, D7)', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    await device.option(h1, 'p1');
    await device.option(h1, 'p2');
    await device.option(b2, 'p3');
    // A bench player is scored without being brought on (E4).
    await device.option(hawkBench, 'p2');
    const server = await device.onServer();
    expect(server.teams.home.score).toBe(5);
    expect(server.teams.away.score).toBe(3);
    const html = drawn(device.view());
    expect(scoreDrawn(html, 'home')).toBe(server.teams.home.score);
    expect(scoreDrawn(html, 'away')).toBe(server.teams.away.score);
    expect(pointsDrawn(html, h1)).toBe(server.players[h1]?.points);
    expect(pointsDrawn(html, b2)).toBe(3);
    expect(pointsDrawn(html, hawkBench)).toBe(2);
    expect(tileDrawn(html, hawkBench)).toContain('data-oncourt="0"');
    expect(device.shown().status).toBe('live');
  });

  it('a foul and −Foul, which takes back that player’s latest foul (D5, D11)', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    // With no foul to take back, −Foul is greyed.
    const none = drawn(device.view(), { pad: { kind: 'player', playerId: h2 } });
    expect(tagWith(padDrawn(none), 'data-act="unfoul"')).toContain('disabled');
    await device.option(h2, 'foul');
    await device.option(h2, 'foul');
    await device.option(b1, 'p2');
    // Undo would reach the basket; −Foul reaches the foul.
    await device.option(h2, 'unfoul');
    const server = await device.onServer();
    expect(server.players[h2]?.fouls).toBe(1);
    expect(server.teams.home.periodFouls).toBe(1);
    const html = drawn(device.view(), { pad: { kind: 'player', playerId: h2 } });
    expect(foulsDrawn(html, h2)).toBe(1);
    expect(tagWith(padDrawn(html), 'data-act="unfoul"')).not.toContain('disabled');
    expect(wordsDrawn(padDrawn(html))).toContain('On court · 1 foul · 0 pts · 0:00 played');
  });

  it('marks a player at the league’s foul limit, and still scores them (D10)', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    const limit = device.shown().rules.playerFoulLimit;
    expect(limit).toBe(5);
    for (let i = 0; i < (limit ?? 0) - 1; i += 1) await device.option(h3, 'foul');
    expect(tileDrawn(drawn(device.view()), h3)).not.toContain('data-out');
    await device.option(h3, 'foul');
    expect((await device.onServer()).players[h3]?.fouledOut).toBe(true);
    const out = tileDrawn(drawn(device.view()), h3);
    expect(out).toContain('data-out=""');
    expect(out).toContain('>Out<');
    expect(out).toContain('fouled out');
    await device.option(h3, 'p2');
    expect((await device.onServer()).players[h3]?.points).toBe(2);
  });

  it('opens the options of the tapped player in the pad, and nowhere else (D4, D6)', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    const closed = drawn(device.view());
    expect(tileDrawn(closed, h1)).toContain('aria-expanded="false"');
    expect(padDrawn(closed)).toContain('How to score');
    expect(padDrawn(closed)).not.toContain('data-act="p2"');

    const tapped = tapTile(device.view(), noLineupPicks, padAtRest, h1);
    if (tapped?.kind !== 'pad') throw new Error('the options did not open');
    const open = drawn(device.view(), { pad: tapped.pad });
    expect(tileDrawn(open, h1)).toContain('aria-expanded="true"');
    expect(tileDrawn(open, h1)).toContain('data-open=""');
    expect(tileDrawn(open, h2)).toContain('aria-expanded="false"');
    const pad = padDrawn(open);
    for (const act of ['p1', 'p2', 'p3', 'foul', 'unfoul', 'turnover']) {
      expect(pad).toContain(`data-act="${act}"`);
    }
    expect(pad).toContain('#3 Max Hawkins');
    expect(pad).toContain('aria-label="+2 for #3 Max Hawkins"');
    // The options are outside the teams' panels: opening them moves no tile.
    expect(open.slice(0, open.indexOf('id="court-pad"'))).not.toContain('data-act=');
  });

  it('shows the jersey number large, a dash for none, and hides who has left (D1, D2)', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    const left = {
      ...rosters,
      home: {
        ...rosters.home,
        players: [
          ...rosters.home.players,
          madeUpPlayer('walk-on', null, '', 'Nonumber'),
          madeUpPlayer('left-team', '44', 'Gone', 'Hawkins', true),
        ],
      },
    };
    const html = drawn(scoringView(device.shown(), left, noLineupPicks));
    expect(tileDrawn(html, h1)).toContain('<span class="court-tile-number">3</span>');
    expect(tileDrawn(html, 'walk-on')).toContain('data-none="">–</span>');
    expect(html).not.toContain('data-player="left-team"');
  });
});

describe('substitutions (checklist E1 to E5)', () => {
  it('a bench player comes in by "In for", one button for each player on the court (E1)', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    const pad = padDrawn(drawn(device.view(), { pad: { kind: 'player', playerId: hawkBench } }));
    expect(pad).toContain('In for');
    for (const id of hawks) expect(pad).toContain(`data-other="${id}"`);
    expect(pad).toContain('aria-label="#13 Ray Hawkins in for #7 Oz Hawkins"');

    await device.taken(subTap(device.tile(hawkBench), device.tile(h3)));
    const server = await device.onServer();
    expect(server.teams.home.onCourt).toEqual([h1, h2, hawkBench, ...hawks.slice(3)]);
    const html = drawn(device.view());
    expect(tileDrawn(html, hawkBench)).toContain('data-oncourt="1"');
    expect(tileDrawn(html, h3)).toContain('data-oncourt="0"');
    // The player who came in sits where the one who went off was: no other tile moved.
    expect(device.view().teams.home.floor.map((p) => p.id)).toEqual(server.teams.home.onCourt);
  });

  it('a floor player’s options offer who can come in for them', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    const pad = padDrawn(drawn(device.view(), { pad: { kind: 'player', playerId: b1 } }));
    expect(pad).toContain('Sub in');
    expect(pad).toContain(`data-other="${bearBench}"`);
    expect(pad).toContain('aria-label="#13 Xan Bearsley in for #3 Sol Bearsley"');
  });

  it('dragging a bench player onto a floor player substitutes them (E2)', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    const dropped = dropOn(device.view(), bearBench, b2);
    if (dropped?.kind !== 'sub') throw new Error('not a substitution');
    await device.taken(dropped.input);
    expect((await device.onServer()).teams.away.onCourt).toContain(bearBench);
    expect(device.tile(b2).onCourt).toBe(false);
  });

  it('a wrong drag is explained, and nothing is recorded (E3)', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    const across = dropOn(device.view(), hawkBench, b1);
    const onBench = dropOn(device.view(), h1, hawkBench);
    if (across?.kind !== 'say' || onBench?.kind !== 'say') throw new Error('not explained');
    expect(t(across.key)).toBe('Substitutions have to stay within one team.');
    expect(t(onBench.key)).toBe('Drag a bench player onto someone on the court.');
    const html = drawn(device.view(), { said: t(across.key) });
    expect(tagWith(html, 'data-say=""')).toContain('role="status"');
    expect(padDrawn(html)).toContain('Substitutions have to stay within one team.');
    expect((await device.onServer()).teams.home.onCourt).toEqual(hawks);
  });

  it('opens the whole bench in the pad, to pick one or to come in for a floor player', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    // The team's header has the way to its bench, and each line of bench players an
    // end tile for those it cannot hold (shown by the stylesheet only where needed).
    const rest = drawn(device.view());
    expect(tagWith(rest, 'data-bench-open="home"')).toContain('aria-expanded="false"');
    expect(rest).toContain('>Bench 1<');
    expect(rest).toContain('aria-label="Show all of the Hawks bench"');
    const open = drawn(device.view(), { pad: { kind: 'bench', side: 'home', forId: null } });
    expect(tagWith(open, 'data-bench-open="home"')).toContain('aria-expanded="true"');
    const pad = padDrawn(open);
    expect(pad).toContain('Hawks bench');
    expect(tagWith(pad, `data-bench-pick="${hawkBench}"`)).toContain(
      'aria-label="#13 Ray Hawkins"',
    );
    // Opened from a floor player's "Sub in": it asks who comes in for them.
    const forOne = padDrawn(
      drawn(device.view(), { pad: { kind: 'bench', side: 'home', forId: h1 } }),
    );
    expect(forOne).toContain('Who comes in for #3 Max Hawkins?');
    expect(tagWith(forOne, `data-bench-pick="${hawkBench}"`)).toContain(
      'aria-label="#13 Ray Hawkins in for #3 Max Hawkins"',
    );
  });

  it('names a player missing from this device’s rosters "Not listed" in "Sub in" and "In for"', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    // The bench player has a line in the game (a point scored from the bench), so the
    // screen draws them even where the device's rosters do not know them.
    await device.option(hawkBench, 'p1');
    // The device does not have the Hawks' bench player, nor the third on the floor.
    const missing = {
      ...rosters,
      home: {
        ...rosters.home,
        players: rosters.home.players.filter((p) => p.personId !== hawkBench && p.personId !== h3),
      },
    };
    const view = scoringView(device.shown(), missing, noLineupPicks);
    const optionName = (pad: string, other: string) =>
      new RegExp(
        `data-other="${other}"[^>]*>.*?<span class="court-opt-name">([^<]*)</span>`,
        's',
      ).exec(pad)?.[1];
    // The tile and the bench in the pad say "Not listed"; so do the pad's rows.
    expect(tileDrawn(drawn(view), hawkBench)).toContain('Not listed');
    const subIn = padDrawn(drawn(view, { pad: { kind: 'player', playerId: h1 } }));
    expect(optionName(subIn, hawkBench)).toBe('Not listed');
    const inFor = padDrawn(drawn(view, { pad: { kind: 'player', playerId: hawkBench } }));
    expect(optionName(inFor, h3)).toBe('Not listed');
    expect(optionName(inFor, h1)).toBe('Max');
  });

  it('says so when everyone is on the court (E5)', async () => {
    const device = await scoringDevice();
    const five = {
      ...rosters,
      away: { ...rosters.away, players: rosters.away.players.slice(0, 5) },
    };
    await device.tipOff();
    const html = drawn(scoringView(device.shown(), five, noLineupPicks));
    expect(html).toContain('Everyone is on the court.');
  });
});

describe('turnovers (checklist D9, G1, G2)', () => {
  it('counts a player’s turnovers in the team’s chip, lists them, and takes one back', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    const none = drawn(device.view(), { pad: { kind: 'turnovers', side: 'home' } });
    expect(tagWith(none, 'data-turnovers="home"')).toContain('aria-expanded="true"');
    expect(none).toContain('>0 turnovers<');
    expect(padDrawn(none)).toContain('No turnovers yet. Tap a player, then Turnover.');

    await device.option(h2, 'turnover');
    await device.option(h1, 'turnover');
    await device.option(h2, 'turnover');
    expect((await device.onServer()).teams.home.turnovers).toBe(3);
    const html = drawn(device.view(), { pad: { kind: 'turnovers', side: 'home' } });
    expect(html).toContain('>3 turnovers<');
    // Turnovers are not on the tiles (D9).
    expect(tileDrawn(html, h2)).not.toMatch(/turnover/i);
    const pad = padDrawn(html);
    expect(pad).toContain('Hawks turnovers');
    // Most first.
    expect(pad.indexOf(`data-turnovers-of="${h2}"`)).toBeLessThan(
      pad.indexOf(`data-turnovers-of="${h1}"`),
    );
    expect(pad).toContain('aria-label="Take back one turnover from #5 Ned Hawkins"');

    await device.taken({ type: 'unturnover', side: 'home', playerId: h1 });
    const server = await device.onServer();
    expect(server.teams.home.turnovers).toBe(2);
    const after = drawn(device.view(), { pad: { kind: 'turnovers', side: 'home' } });
    expect(after).toContain('>2 turnovers<');
    expect(padDrawn(after)).not.toContain(`data-turnovers-of="${h1}"`);
  });

  it('adds a team turnover, charged to no player, and takes it back (G2)', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    await device.taken({ type: 'team-turnover', side: 'away' });
    const server = await device.onServer();
    expect(server.teams.away.teamTurnovers).toBe(1);
    expect(server.teams.away.turnovers).toBe(1);
    const html = drawn(device.view(), { pad: { kind: 'turnovers', side: 'away' } });
    expect(html).toContain('>1 turnover<');
    const pad = padDrawn(html);
    expect(pad).toContain('data-turnovers-of="team"');
    expect(pad).toContain('+ Team turnover');
    expect(pad).toContain('aria-label="Take back one team turnover from Bears"');
    await device.taken({ type: 'team-unturnover', side: 'away' });
    expect((await device.onServer()).teams.away.turnovers).toBe(0);
    expect(drawn(device.view())).toContain('>0 turnovers<');
  });
});

describe('swap colors (checklist D3)', () => {
  it('draws home light and away dark, swaps them, and the swap is saved with the game', async () => {
    const network = endpointNetwork();
    const device = await scoringDevice(network);
    await device.tipOff();
    const before = drawn(device.view());
    expect(tagWith(before, 'data-score="home"')).toContain('data-color="light"');
    expect(tagWith(before, 'data-score="away"')).toContain('data-color="dark"');
    await device.taken(swapColorsTap(device.shown()));
    const after = drawn(device.view());
    expect(tagWith(after, 'data-score="home"')).toContain('data-color="dark"');
    expect(tagWith(after, 'data-team-stage="set" aria-labelledby="court-team-away"')).toContain(
      'data-color="light"',
    );
    // Saved with the game: a second device that opens it sees the swap.
    await device.controller.leave();
    const second = await scoringDevice(network);
    expect(second.shown().colorsSwapped).toBe(true);
  });
});

describe('a refusal is said in a sentence from the message files (checklist I6)', () => {
  it('says why the rules refuse, and records nothing', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    const refused = async (input: TapInput) => {
      const result = await device.send(input);
      if (result.ok || result.reason !== 'engine') throw new Error('the engine took it');
      return refusalText(result.message, t);
    };
    expect(await refused({ type: 'sub', side: 'home', inId: h1, outId: h2 })).toBe(
      'That player is already on the court.',
    );
    expect(await refused({ type: 'unfoul', side: 'home', playerId: h1 })).toBe(
      'That player has no foul to take back.',
    );
    expect(await refused({ type: 'unturnover', side: 'away', playerId: b1 })).toBe(
      'That player has no turnover to take back.',
    );
    expect(await refused({ type: 'team-unturnover', side: 'away' })).toBe(
      'There is no team turnover to take back.',
    );
    expect(await refused({ type: 'lineup', side: 'home', playerIds: hawks })).toBe(
      'This team already has players on the court. Use substitutions.',
    );
    const server = await device.onServer();
    expect(server.teams.home.onCourt).toEqual(hawks);
    expect(device.controller.status().waiting).toEqual([]);
  });
});

describe('the frame (checklist A3, A4, A6, I7, T1; DESIGN.md section 7, line 11)', () => {
  it('names the game, keeps the scoreboard on top, and leaves the places for 2.36 and 2.37', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    const html = drawn(device.view());
    expect(html).toMatch(/<h1 class="court-title">.*Bears at Hawks.*Sat, 14 Nov, 7:00 PM.*<\/h1>/s);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/<main/g)).toHaveLength(1);
    // Team, score, clock, period and the saved line, in the header.
    const top = html.slice(html.indexOf('<header class="court-top"'), html.indexOf('</header>'));
    for (const piece of ['data-score="home"', 'data-clock=""', '>8:00<', '>H1<', 'All saved']) {
      expect(top).toContain(piece);
    }
    expect(tagWith(top, 'data-saved-banner=""')).toContain('role="status"');
    // The clock's row, which step 2.36 filled: Start and the way to the timeouts; what
    // step 2.37 adds (Undo, Redo) goes after them.
    const controls = html.slice(html.indexOf('data-slot="clock-controls"'));
    expect(controls.slice(0, controls.indexOf('</section>'))).toMatch(
      /^data-slot="clock-controls" aria-label="Clock and undo"><button[^>]*data-clock-toggle=""[^>]*>.*<button[^>]*data-timeouts-open=""[^>]*>Timeouts<span[^>]*><\/span><\/button>$/s,
    );
    // The places left: empty until the steps that own them.
    expect(html).toContain('data-slot="play-log" aria-label="Plays"></section>');
    expect(html).toContain('data-slot="pad-rest"></div>');
    // The hint, in four sentences (I7).
    const hint = html.slice(html.indexOf('data-hint=""'));
    expect(hint.slice(0, hint.indexOf('</div>')).match(/<p>/g)).toHaveLength(4);
    // No game's day and time: only the teams.
    expect(drawn(device.view(), { when: null })).not.toContain('court-title-when');
  });

  it('draws the account button of step 2.127 in the first row, before More (line 11)', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    const button = createElement('details', { 'data-account': '' }, 'S');
    const top = (html: string) =>
      html.slice(html.indexOf('<header class="court-top"'), html.indexOf('</header>'));
    const withIt = top(drawn(device.view(), { account: button }));
    expect(withIt).toContain('<div class="court-account"><details data-account="">S</details>');
    expect(withIt.indexOf('data-account')).toBeLessThan(withIt.indexOf('court-more-button'));
    expect(top(drawn(device.view()))).not.toContain('court-account');
  });

  it('draws what later steps hand it in the places left for them', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    const mark = (name: string) => createElement('i', { 'data-filled': name });
    const html = drawn(device.view(), {
      moreOpen: true,
      slots: {
        controls: mark('controls'),
        playLog: mark('log'),
        padRest: mark('rest'),
        teamHead: (side) => mark(`head-${side}`),
        more: mark('more'),
      },
    });
    for (const name of ['controls', 'log', 'rest', 'head-home', 'head-away', 'more']) {
      expect(html).toContain(`data-filled="${name}"`);
    }
  });

  it('keeps the buttons used once a game behind More, with the one way out (A4, S6)', async () => {
    const device = await scoringDevice();
    await device.tipOff();
    const closed = drawn(device.view());
    expect(closed).not.toContain('role="dialog"');
    expect(closed).not.toContain('Back to your games');
    expect(tagWith(closed, 'aria-haspopup="dialog"')).toContain('aria-expanded="false"');
    const open = drawn(device.view(), { moreOpen: true });
    const sheet = open.slice(open.indexOf('role="dialog"'));
    expect(sheet).toContain('aria-modal="true"');
    expect(sheet).toContain('Swap colors');
    expect(sheet).toMatch(/<a class="court-button" href="\/back">Back to your games<\/a>/);
    // The public page of the game opens beside the tracker, never in its place.
    expect(sheet).toMatch(/href="\/watch" target="_blank" rel="noopener"/);
    expect(sheet).toContain('Sign out on your account page');
    expect(sheet.match(/Back to your games/g)).toHaveLength(1);
  });

  it('says a team has no players, with the place for "Add players" (step 2.118)', async () => {
    const device = await scoringDevice();
    const empty = { ...rosters, away: { ...rosters.away, players: [] } };
    const html = drawn(scoringView(device.shown(), empty, noLineupPicks), {
      slots: { noPlayers: (side) => createElement('i', { 'data-add-players': side }) },
    });
    expect(html).toContain('No Bears players yet.');
    expect(html).toContain('data-add-players="away"');
  });
});
