// A game's page drawn from the made-up stand-in (step 2.45): the live game with its
// scoreboard, latest play and players, a staff-only team's names nowhere (S-22, T-87), a
// finished game's box scores, and "corrected" with the date and never the reason (S-7).
import {
  defaultNamePolicy,
  publicViewer,
  readGamePage,
  readGameSnapshot,
  type GamePage,
} from '@srleagues/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { scoringSessionRequest } from '../../server/scoring-session-endpoint.ts';
import { sendTrackerCommands } from '../../server/tracker-commands-endpoint.ts';
import {
  bears,
  bearsNames,
  games,
  hawks,
  liveLeagueId,
  tap,
  trackerWorld,
} from '../../server/tracker-endpoints.test-helper.ts';
import {
  buildBoxScores,
  buildPlays,
  correctedText,
  gameTitle,
  gameWords,
  startText,
} from './build-game.ts';
import { GameContent, type GameView } from './game-content.tsx';

const viewing = {
  leagueId: liveLeagueId,
  viewer: publicViewer(liveLeagueId),
  audience: 'adult' as const,
  policy: defaultNamePolicy,
};

async function scoreHawksBears(world: ReturnType<typeof trackerWorld>) {
  const sessionContext = await world.contextAs('scorekeeper', 'live', [
    'games',
    games.hawksBears,
    'session',
  ]);
  const opened = await scoringSessionRequest(
    sessionContext,
    games.hawksBears,
    { type: 'open', deviceId: 'tablet-1' },
    world.tracker,
  );
  const { sessionId } = opened.body as { sessionId: string };
  const context = await world.contextAs('scorekeeper', 'live', [
    'games',
    games.hawksBears,
    'commands',
  ]);
  await sendTrackerCommands(
    context,
    games.hawksBears,
    {
      protocolVersion: 1,
      sessionId,
      commands: [
        tap({ type: 'lineup', side: 'home', playerIds: hawks }),
        tap({ type: 'lineup', side: 'away', playerIds: bears }),
        tap({ type: 'start' }),
        tap({ type: 'score', side: 'home', playerId: hawks[0], points: 3 }),
        tap({ type: 'score', side: 'away', playerId: bears[0], points: 2 }),
        tap({ type: 'foul', side: 'away', playerId: bears[1] }),
      ],
    },
    world.tracker,
    world.publishPlays,
  );
}

async function viewOf(world: ReturnType<typeof trackerWorld>, gameId: string) {
  const store = world.tracker.snapshotStoreOf(liveLeagueId);
  const snapshot = await readGameSnapshot(store, { gameId }, viewing, Date.now());
  const page = await readGamePage(store, { gameId }, viewing);
  if (!snapshot.ok || !page.ok) throw new Error('no game');
  const view: GameView = {
    leagueId: liveLeagueId,
    title: gameTitle(page.value),
    status: page.value.game.status,
    start: startText(page.value.game.startsAt, 'UTC', page.value.game.status),
    corrected: correctedText(snapshot.value.correctedOn),
    snapshot: snapshot.value,
    snapshotAddress: '/snapshot',
    selfAddress: '/self',
    boxScores: snapshot.value.status === 'final' ? buildBoxScores(page.value) : null,
    plays: buildPlays(page.value, gameWords()),
  };
  return { view, page: page.value };
}

const draw = (view: GameView) => renderToStaticMarkup(createElement(GameContent, { view }));

describe('a game page', () => {
  it('draws a live game as it stands, with no staff-only names', async () => {
    const world = trackerWorld();
    await scoreHawksBears(world);
    const { view } = await viewOf(world, games.hawksBears);
    const html = draw(view);
    expect(html).toContain('Bears at Hawks');
    expect(html).toContain('Live');
    expect(html).toContain('data-live-status="live"');
    expect(html).toContain('Half 1 20:00');
    expect(html).toContain('Team fouls this period: Bears 1, Hawks 0');
    expect(html).toContain('Latest play: Foul on Bears');
    expect(html).toContain('Max Hawkins');
    expect(html).toContain('scored 3 for Hawks');
    expect(html).toContain('Only this team&#x27;s total is shown.');
    expect(html).toContain('These are the plays up to when you opened this page.');
    for (const name of bearsNames) expect(html).not.toContain(name);
  });

  it('says a game has not started yet', async () => {
    const world = trackerWorld();
    const { view } = await viewOf(world, games.lionsTigers);
    const html = draw(view);
    expect(html).toContain('This game has not started yet.');
    expect(html).not.toContain('Play by play');
  });

  it('says a postponed or cancelled game is not going ahead, not that it starts', async () => {
    const world = trackerWorld();
    const { view } = await viewOf(world, games.lionsTigers);
    const when = '2026-11-20T18:00:00Z';
    for (const [status, says] of [
      ['postponed', 'This game has been postponed.'],
      ['cancelled', 'This game has been cancelled.'],
    ] as const) {
      const html = draw({ ...view, status, start: startText(when, 'UTC', status) });
      expect(html).toContain(says);
      expect(html).toContain('It was set for');
      expect(html).not.toContain('This game has not started yet.');
      expect(html).not.toContain('Starts ');
      expect(startText(null, 'UTC', status)).toBeNull();
    }
    expect(startText(null, 'UTC', 'scheduled')).toBe('Date to be announced');
    expect(startText(when, 'UTC', 'scheduled')).toContain('Starts ');
  });

  it('notes a forfeit under the result', async () => {
    const world = trackerWorld();
    const { view } = await viewOf(world, games.decided);
    expect(draw({ ...view, status: 'forfeit' })).toContain('This game was decided by forfeit.');
    expect(draw({ ...view, status: 'final' })).not.toContain('forfeit');
  });

  it('draws a finished game with its result and how it was recorded', async () => {
    const world = trackerWorld();
    const { view } = await viewOf(world, games.decided);
    const html = draw(view);
    expect(html).toContain('Lions at Bears');
    expect(html).toContain('Final');
    expect(html).toContain('Box scores');
    expect(html).toContain('Only the final score was recorded for this game.');
    expect(html).toContain('data-live-status="final"');
  });

  it('shows "corrected" with the date only (S-7)', async () => {
    const world = trackerWorld();
    const { view } = await viewOf(world, games.decided);
    const html = draw({ ...view, corrected: correctedText('2026-11-14') });
    expect(html).toContain('Corrected on Nov 14, 2026');
    expect(correctedText(undefined)).toBeNull();
    expect(correctedText('not a date')).toBeNull();
  });

  it('lists the box scores of a tracked final game, away team first', () => {
    const page = {
      game: { recording: 'live' },
      boxScores: [
        {
          side: 'home',
          name: 'Hawks',
          playerLinesShown: true,
          totals: { points: 5, mystery_stat: 1 },
          players: [
            {
              personId: 'p',
              name: null,
              jersey: '4',
              played: true,
              seconds: null,
              stats: { mystery_stat: 1 },
            },
          ],
        },
        {
          side: 'away',
          name: 'Bears',
          playerLinesShown: false,
          totals: { points: 2 },
          players: [],
        },
      ],
    } as unknown as GamePage;
    const built = buildBoxScores(page);
    if (built.kind !== 'tables') throw new Error(built.kind);
    expect(built.tables.map((x) => x.teamName)).toEqual(['Bears', 'Hawks']);
    expect(built.tables[0]?.players).toBeNull();
    expect(built.tables[1]?.players?.[0]?.name).toBe('Name not shown');
    expect(built.tables[0]?.columns.map((c) => c.label)).toEqual(['PTS']);
  });

  it('leaves out a statistic with no words, and has no stats if that was all', () => {
    const page = {
      game: { recording: 'box-score' },
      boxScores: [
        { side: 'home', name: 'Hawks', playerLinesShown: true, totals: { odd: 1 }, players: [] },
        { side: 'away', name: 'Bears', playerLinesShown: true, totals: {}, players: [] },
      ],
    } as unknown as GamePage;
    expect(buildBoxScores(page)).toEqual({ kind: 'no-stats' });
  });
});
