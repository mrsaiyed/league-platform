// Step 2.200 (P7 §5.6, the numbers audit's M8): a final game that went to overtime says so
// on its own page and on its card, played on the made-up tracker by its own endpoints. Case
// 44: level after regulation, End refused, won in the first overtime: "Final, OT". Two
// overtimes: "Final, 2OT". A game reopened and ended again in regulation: "Final" alone,
// as a game ended in regulation always is.
import {
  defaultNamePolicy,
  publicViewer,
  readGamePage,
  readGameSnapshot,
  reopenGame,
} from '@srleagues/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { scoringSessionRequest } from '../../server/scoring-session-endpoint.ts';
import { standInPeople } from '../../server/stand-in-cast.ts';
import { sendTrackerCommands } from '../../server/tracker-commands-endpoint.ts';
import {
  bears,
  games,
  hawks,
  liveLeagueId,
  tap,
  trackerWorld,
} from '../../server/tracker-endpoints.test-helper.ts';
import { GameList, gameView } from '../schedule-pages/index.ts';
import {
  boardFinalPill,
  buildBoxScores,
  buildPlays,
  gameTitle,
  gameTruthOf,
  gameWords,
} from './build-game.ts';
import { GameContent, type GameView } from './game-content.tsx';
import { publicPlayerKey } from '../../server/player-key.ts';

type World = ReturnType<typeof trackerWorld>;
const viewing = {
  leagueId: liveLeagueId,
  viewer: publicViewer(liveLeagueId),
  audience: 'adult' as const,
  policy: defaultNamePolicy,
};
const addressee = { id: liveLeagueId, slug: 'north-valley', customDomain: null } as never;
const gameId = games.hawksBears;
const score = (side: 'home' | 'away', points: 1 | 2 | 3) => ({
  type: 'score',
  side,
  playerId: side === 'home' ? hawks[0] : bears[0],
  points,
});
/** The clock stopped, the next period picked, the clock started (Hawks v Bears plays halves). */
const periodTaps = (period: number) => [
  { type: 'pause' },
  { type: 'period', period },
  { type: 'start' },
];

/** The scorekeeper's tablet on Hawks v Bears: sends taps, and says what became of each. */
async function tablet(world: World) {
  const opened = await scoringSessionRequest(
    await world.contextAs('scorekeeper', 'live', ['games', gameId, 'session']),
    gameId,
    { type: 'open', deviceId: 'overtime-tablet' },
    world.tracker,
  );
  const { sessionId } = opened.body as { sessionId: string };
  return async (inputs: readonly unknown[]) => {
    const sent = await sendTrackerCommands(
      await world.contextAs('scorekeeper', 'live', ['games', gameId, 'commands']),
      gameId,
      { protocolVersion: 1, sessionId, commands: inputs.map((input) => tap(input)) },
      world.tracker,
      world.publishPlays,
    );
    const body = sent.answer.body as { results?: { status: string }[] };
    if (body.results === undefined) throw new Error(`taps refused: ${JSON.stringify(body)}`);
    return body.results.map((r) => r.status);
  };
}

/** Case 44: level 2 to 2 after both halves; End is refused; the Hawks win the first overtime. */
async function caseFortyFour(world: World) {
  const send = await tablet(world);
  const level = [
    { type: 'lineup', side: 'home', playerIds: hawks },
    { type: 'lineup', side: 'away', playerIds: bears },
    { type: 'start' },
    score('home', 2),
    score('away', 2),
    ...periodTaps(2),
  ];
  expect(await send([...level, { type: 'end' }])).toEqual([
    ...level.map(() => 'accepted'),
    'refused',
  ]);
  await send([...periodTaps(3), score('home', 3), { type: 'end' }]);
  return send;
}

/** The game's page as game-page.tsx draws it, from the same reads. */
async function pageHtml(world: World) {
  const store = world.tracker.snapshotStoreOf(liveLeagueId);
  const snapshot = await readGameSnapshot(store, { gameId }, viewing, Date.now(), publicPlayerKey);
  const page = await readGamePage(store, { gameId }, viewing);
  if (!snapshot.ok || !page.ok) throw new Error('no game');
  const view: GameView = {
    leagueId: liveLeagueId,
    title: gameTitle(page.value),
    status: page.value.game.status,
    truth: gameTruthOf(page.value, { now: new Date().toISOString(), today: '2000-01-01' }),
    start: null,
    corrected: null,
    snapshot: snapshot.value,
    snapshotAddress: '/snapshot',
    selfAddress: '/self',
    boxScores: snapshot.value.status === 'final' ? buildBoxScores(page.value) : null,
    plays: buildPlays(page.value, gameWords()),
    board: { colors: { home: null, away: null }, finalPill: boardFinalPill(page.value) },
  };
  return { html: renderToStaticMarkup(createElement(GameContent, { view })), page: page.value };
}

/** The game's card as the schedule, the home page and a team's page draw it. */
async function cardHtml(world: World, seasonId: string) {
  const clock = await world.ports.publicSchedule.clockOf(liveLeagueId);
  const schedule = await world.ports.publicSchedule.scheduleOf(liveLeagueId, seasonId, clock.today);
  const game = schedule?.rounds.flatMap((r) => r.games).find((g) => g.id === gameId);
  if (schedule === undefined || game === undefined) throw new Error('no card');
  const view = gameView(game, clock, addressee, schedule.season.slug);
  return renderToStaticMarkup(
    createElement(GameList, { leagueId: liveLeagueId, games: [view], layout: 'board' }),
  );
}

/** The pill of the one card or board drawn. */
/**
 * The pill of the one card or board drawn: its drawn letters, and what a screen reader is
 * told in their place ("Final" alone is both).
 */
const pillOf = (html: string) => {
  const marked =
    /<span class="ui-game-state"><span aria-hidden="true">([^<]*)<\/span><span class="ui-visually-hidden">([^<]*)<\/span><\/span>/.exec(
      html,
    );
  if (marked !== null) return marked[1];
  return /<span class="ui-game-state">([^<]*)<\/span>/.exec(html)?.[1];
};
const saidOf = (html: string) =>
  /<span class="ui-game-state"><span aria-hidden="true">[^<]*<\/span><span class="ui-visually-hidden">([^<]*)<\/span>/.exec(
    html,
  )?.[1];

describe('overtime on the result (step 2.200)', () => {
  it('case 44 reads "Final, OT" on its page and on its card', async () => {
    const world = trackerWorld();
    await caseFortyFour(world);
    const { html, page } = await pageHtml(world);
    expect(page.game).toMatchObject({ status: 'final', overtimePeriods: 1 });
    expect(page.scoreboard.home.score).toBe(5);
    // The big board: as quiet as a plain "Final".
    expect(html).toContain('data-state="final" data-pill="quiet"');
    expect(pillOf(html)).toBe('Final, OT');
    // A screen reader is told the words, on the board as on the card.
    expect(saidOf(html)).toBe('Final after overtime');
    // Its card, and the words its link says to a screen reader.
    const card = await cardHtml(world, page.game.seasonId);
    expect(pillOf(card)).toBe('Final, OT');
    expect(saidOf(card)).toBe('Final after overtime');
    expect(card).toContain('data-status="final"');
    expect(card).toContain('Bears against Hawks, final after overtime, 2 to 5');
  });

  it('two overtimes read "Final, 2OT"', async () => {
    const world = trackerWorld();
    const send = await tablet(world);
    await send([
      { type: 'lineup', side: 'home', playerIds: hawks },
      { type: 'lineup', side: 'away', playerIds: bears },
      { type: 'start' },
      ...periodTaps(2),
      ...periodTaps(3),
      score('away', 2),
      score('home', 2),
      ...periodTaps(4),
      score('away', 3),
      { type: 'end' },
    ]);
    const { html, page } = await pageHtml(world);
    expect(page.game.overtimePeriods).toBe(2);
    expect(pillOf(html)).toBe('Final, 2OT');
    const card = await cardHtml(world, page.game.seasonId);
    expect(pillOf(card)).toBe('Final, 2OT');
    expect(saidOf(card)).toBe('Final after 2 overtimes');
    expect(card).toContain('Bears against Hawks, final after 2 overtimes, 5 to 2');
  });

  it('a game reopened and ended again in regulation loses the mark', async () => {
    const world = trackerWorld();
    const send = await caseFortyFour(world);
    const owner = standInPeople.owner.accountId;
    const version = (await world.ports.games.deps.transaction(
      { leagueId: liveLeagueId, accountId: owner, requestId: 'r' },
      async (tx) => (await tx.games.find(gameId))?.version,
    )) as number;
    const reopened = await reopenGame(
      { leagueId: liveLeagueId, accountId: owner, requestId: 'r-reopen' },
      { gameId, version, reason: 'The last basket came after the horn of the second half' },
      world.ports.games.deps,
    );
    expect(reopened).toMatchObject({ ok: true });
    // While it is reopened it is not final: no mark anywhere.
    let { html, page } = await pageHtml(world);
    expect(page.game).toMatchObject({ status: 'live', overtimePeriods: null });
    expect(html).not.toContain('OT<');
    // The overtime and its basket undone; the winning basket was the second half's.
    await send([{ type: 'undo' }, { type: 'undo' }, score('home', 3), { type: 'end' }]);
    ({ html, page } = await pageHtml(world));
    expect(page.game).toMatchObject({ status: 'final', overtimePeriods: 0 });
    expect(page.scoreboard.home.score).toBe(5);
    expect(pillOf(html)).toBe('Final');
    const card = await cardHtml(world, page.game.seasonId);
    expect(pillOf(card)).toBe('Final');
    expect(card).toContain('Bears against Hawks, final, 2 to 5');
    expect(card).not.toContain('overtime');
  });
});
