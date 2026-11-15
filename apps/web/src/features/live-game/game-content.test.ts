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
import { readFileSync } from 'node:fs';
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
import { standInLeagues } from '../../server/stand-in-ports.ts';
import { standInSeasonIds } from '../../server/stand-in-public-stats.ts';
import {
  boardStateText,
  boardWhen,
  buildBoxScores,
  buildPlays,
  correctedText,
  gameTitle,
  gameWords,
  startText,
  titleLine,
} from './build-game.ts';
import { GameContent, type GameView } from './game-content.tsx';
import { latestPlayText, redrawsFor } from './live-game-view.tsx';
import type { ViewerGame } from './viewer-state.ts';

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
    expect(html).toContain('aria-label="The game, live"');
    // The spoken update carries the score, not only the play.
    expect(html).toMatch(
      /role="status"[^>]*><span class="ui-visually-hidden">Bears 2, Hawks 3\. <\/span>/,
    );
    expect(html).toContain('Max Hawkins');
    expect(html).toContain('scored 3 for Hawks');
    expect(html).toContain('Only this team&#x27;s total is shown.');
    expect(html).toContain('These are the plays up to when you opened this page.');
    // "Show newer plays" lands on the play-by-play, not the top of the page.
    expect(html).toContain('<a href="/self#game-plays">Show newer plays</a>');
    expect(html).toContain('<h2 id="game-plays">');
    for (const name of bearsNames) expect(html).not.toContain(name);
  });

  it('opens every game the home and schedule pages show: one set of made-up games', async () => {
    const world = trackerWorld();
    const seasons = [
      [liveLeagueId, standInSeasonIds.adultFall],
      [liveLeagueId, standInSeasonIds.adultSpring],
      [standInLeagues.other.id, standInSeasonIds.youthWinter],
    ] as const;
    let opened = 0;
    for (const [leagueId, seasonId] of seasons) {
      const { today } = await world.ports.publicSchedule.clockOf(leagueId);
      const schedule = await world.ports.publicSchedule.scheduleOf(leagueId, seasonId, today);
      const listed = [
        ...(schedule?.rounds.flatMap((r) => r.games) ?? []),
        ...(schedule?.unplacedGames ?? []),
      ];
      expect(listed.length).toBeGreaterThan(0);
      const store = world.tracker.snapshotStoreOf(leagueId);
      const as = { ...viewing, leagueId, viewer: publicViewer(leagueId) };
      for (const game of listed) {
        const shot = await readGameSnapshot(store, { gameId: game.id }, as, Date.now());
        const page = await readGamePage(store, { gameId: game.id }, as);
        if (!shot.ok || !page.ok) throw new Error(`no page for ${game.id}`);
        expect(page.value.scoreboard.home.name).toBe(game.homeTeam.name);
        expect(page.value.scoreboard.away.name).toBe(game.awayTeam.name);
        expect(page.value.game.status).toBe(game.status);
        expect(shot.value.score.home).toBe(game.homeScore ?? 0);
        // Their seasons play halves: no quarter is shown before a tracker has the game.
        expect(shot.value.periods).toBe(2);
        opened += 1;
      }
    }
    expect(opened).toBe(20);
  });

  it('says a game has not started yet', async () => {
    const world = trackerWorld();
    const { view } = await viewOf(world, games.lionsTigers);
    const html = draw(view);
    expect(html).toContain('This game has not started yet.');
    expect(html).toContain('aria-label="The game"');
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

  it('says when a game under way was scheduled for, and a decided one was played, never that it starts', () => {
    const when = '2026-11-20T18:00:00Z';
    // The time it was set for, not a real start the page does not have.
    expect(startText(when, 'UTC', 'live')).toMatch(/^Scheduled for /);
    expect(startText(when, 'UTC', 'final')).toMatch(/^Played /);
    expect(startText(when, 'UTC', 'forfeit')).toMatch(/^Played /);
    for (const status of ['live', 'final', 'forfeit']) {
      expect(startText(null, 'UTC', status)).toBeNull();
    }
  });

  it('puts no line under the title of a game under way, or of one with no day: the board says it', async () => {
    const when = '2026-11-20T18:00:00Z';
    // A live game: the time it was set for is not when it started, and the board has the clock.
    expect(titleLine(when, 'UTC', 'live')).toBeNull();
    // No day yet: the board says "Date to be announced", once.
    expect(titleLine(null, 'UTC', 'scheduled')).toBeNull();
    expect(boardWhen(null, 'UTC', 'scheduled')).toEqual({ day: 'Date to be announced' });
    // Every other game keeps its line.
    expect(titleLine(when, 'UTC', 'scheduled')).toBe(startText(when, 'UTC', 'scheduled'));
    expect(titleLine(when, 'UTC', 'final')).toMatch(/^Played /);
    expect(titleLine(when, 'UTC', 'postponed')).toMatch(/^It was set for /);
    // Drawn: a live game's page has its title and then the board, nothing between.
    const world = trackerWorld();
    await scoreHawksBears(world);
    const { view } = await viewOf(world, games.hawksBears);
    const html = draw({ ...view, start: titleLine(when, 'UTC', 'live') });
    expect(html).not.toContain('Scheduled for');
    expect(html).not.toContain('ui-page-sub');
    expect(html).toContain('Half 1 20:00');
  });

  it("reads only its own game's place and number, never a whole season's schedule", async () => {
    const world = trackerWorld();
    const { publicSchedule } = world.ports;
    const { today } = await publicSchedule.clockOf(liveLeagueId);
    const season = standInSeasonIds.adultFall;
    const schedule = await publicSchedule.scheduleOf(liveLeagueId, season, today);
    const listed = schedule?.rounds.flatMap((r) => r.games)[0];
    if (listed === undefined) throw new Error('no listed game');
    expect(await publicSchedule.gameFactsOf(liveLeagueId, season, listed.id)).toEqual({
      number: listed.number,
      venue: listed.venue,
      courtName: listed.courtName,
      season: { slug: 'fall-2026', isCurrent: true },
    });
    // An earlier season says so, so the way back leads to that season's schedule.
    const earlier = standInSeasonIds.adultSpring;
    const old = (await publicSchedule.scheduleOf(liveLeagueId, earlier, today))?.rounds[0]
      ?.games[0];
    expect(
      (await publicSchedule.gameFactsOf(liveLeagueId, earlier, old?.id ?? ''))?.season,
    ).toEqual({ slug: 'spring-2026', isCurrent: false });
    // A game the schedule does not list, or another league's, has none.
    expect(
      await publicSchedule.gameFactsOf(liveLeagueId, season, games.hawksBears),
    ).toBeUndefined();
    expect(
      await publicSchedule.gameFactsOf(standInLeagues.other.id, season, listed.id),
    ).toBeUndefined();
    // The page asks for that and nothing wider: it is read again at every "Show newer plays".
    const page = readFileSync(new URL('./game-page.tsx', import.meta.url), 'utf8');
    expect(page).toContain('publicSchedule.gameFactsOf(');
    expect(page).not.toContain('scheduleOf(');
  });

  it('is drawn again from the server when its game starts, ends or is reopened, and only then', () => {
    const at = (status: 'scheduled' | 'live' | 'final', sequence: number) => ({
      status,
      sequence,
    });
    expect(redrawsFor(at('scheduled', 0), at('live', 3))).toBe(true);
    expect(redrawsFor(at('scheduled', 0), at('final', 9))).toBe(true);
    expect(redrawsFor(at('live', 4), at('final', 9))).toBe(true);
    expect(redrawsFor(at('live', 4), at('live', 9))).toBe(false);
    expect(redrawsFor(at('scheduled', 0), at('scheduled', 0))).toBe(false);
    expect(redrawsFor(at('final', 9), at('final', 9))).toBe(false);
    // The page drawn again arrives with the change: nothing newer, so no second drawing.
    expect(redrawsFor(at('live', 3), at('live', 3))).toBe(false);
    expect(redrawsFor(at('final', 9), at('final', 10))).toBe(false);
    // A final game the scorekeeper reopens is drawn again as live.
    expect(redrawsFor(at('final', 9), at('live', 10))).toBe(true);
  });

  it('shows no latest play after a clock tap, an undo or a lineup', () => {
    const game = (latestPlay: ViewerGame['latestPlay']): ViewerGame => ({
      gameId: games.hawksBears,
      sequence: 3,
      sentAt: 0,
      status: 'live',
      score: { home: 3, away: 0 },
      period: 1,
      clock: { state: 'stopped', remainingMs: 480_000 },
      teamFouls: { home: 0, away: 0 },
      latestPlay,
      teams: {
        home: { name: 'Hawks', statsVisible: true },
        away: { name: 'Bears', statsVisible: true },
      },
    });
    const labels = { latestPlay: 'Latest play: {play}' };
    const play = { side: 'home', playerName: null, jersey: null } as const;
    expect(latestPlayText(game({ ...play, type: 'other' }), gameWords(), labels)).toBe('');
    expect(latestPlayText(game(null), gameWords(), labels)).toBe('');
    expect(latestPlayText(game({ ...play, type: 'timeout' }), gameWords(), labels)).toBe(
      'Latest play: Timeout, Hawks',
    );
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
    expect(html).toContain('aria-label="The game"');
    expect(html).not.toContain('The game, live');
    // Only the final score was kept: no empty play-by-play section.
    expect(html).not.toContain('Play by play');
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
            // Added at the scorer's table by number only (S-34): "#12", not a name withheld.
            {
              personId: 'q',
              name: null,
              jersey: '12',
              unnamed: true,
              played: true,
              seconds: null,
              stats: { mystery_stat: 0 },
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
    expect(built.tables[1]?.players?.map((p) => p.name)).toEqual(['Name not shown', '#12']);
    expect(built.tables[0]?.columns.map((c) => c.label)).toEqual(['PTS']);
  });

  it('draws the play-by-play as a table a period: clock, team mark, and the score after a basket', async () => {
    const world = trackerWorld();
    await scoreHawksBears(world);
    const { view, page } = await viewOf(world, games.hawksBears);
    const plays = buildPlays(page, gameWords());
    // Newest first, under the period they were played in.
    expect(plays.map((period) => period.title)).toEqual(['Half 1']);
    const rows = plays[0]?.rows ?? [];
    expect(rows[0]?.text).toBe('Foul on Bears');
    expect(rows[0]?.clock).toBe('20:00');
    // Only a basket carries the score, away team first as on the scoreboard.
    expect(rows.filter((row) => row.score !== undefined).map((row) => row.score?.text)).toEqual([
      '2–3',
      '0–3',
    ]);
    expect(rows.find((row) => row.score !== undefined)?.score?.spoken).toBe('Bears 2, Hawks 3');
    // Every play of a team has that team's mark.
    expect(rows.every((row) => row.team !== undefined)).toBe(true);
    const html = draw(view);
    expect(html).toContain('<table class="ui-table ui-plays"><caption dir="auto">Half 1</caption>');
    expect(html).toContain('<td class="ui-num">20:00</td>');
    // No browser list anywhere on the page, and every table in the table frame.
    expect(html).not.toMatch(/<ol|<ul/);
    expect(html.match(/<table/g)?.length).toBe(html.match(/class="ui-table-frame"/g)?.length);
    // The players' tables of a game under way sit under their own heading.
    expect(html).toContain('<h2 id="game-players">Points and fouls</h2>');
  });

  it('draws a game still to play as a finished board: teams, when, where, and one sentence', async () => {
    const world = trackerWorld();
    const { view } = await viewOf(world, games.lionsTigers);
    const when = '2026-11-21T16:00:00Z';
    const html = draw({
      ...view,
      scheduleAddress: '/north-valley/schedule',
      numberText: 'Game 8',
      board: {
        colors: { home: '#c8862a', away: null },
        when: boardWhen(when, 'UTC', 'scheduled'),
        placeText: 'Central Gym, Court 1',
      },
    });
    expect(html).toContain('<a href="/north-valley/schedule">Schedule</a>');
    expect(html).toContain('<p class="ui-eyebrow">Game 8</p>');
    expect(html).toContain('aria-label="Scoreboard" data-state="other"');
    expect(html).toContain('<span class="ui-scoreboard-day">Sat, Nov 21</span>');
    expect(html).toContain('<span class="ui-scoreboard-time">4:00 PM</span>');
    expect(html).toContain('Central Gym, Court 1');
    expect(html).toContain('--team-color:#c8862a');
    expect(html).toContain('<p class="ui-scoreboard-note">This game has not started yet.</p>');
    expect(html).not.toContain('ui-scoreboard-score');
    // A game with no date says so where the time would be.
    expect(boardWhen(null, 'UTC', 'scheduled')).toEqual({ day: 'Date to be announced' });
  });

  it('never draws the old date of a game not going ahead as if it were coming', async () => {
    const world = trackerWorld();
    const { view } = await viewOf(world, games.lionsTigers);
    const when = '2026-10-31T19:00:00Z';
    for (const [status, pill] of [
      ['postponed', 'Postponed'],
      ['cancelled', 'Cancelled'],
    ] as const) {
      expect(boardWhen(when, 'UTC', status)).toBeUndefined();
      const html = draw({
        ...view,
        status,
        start: startText(when, 'UTC', status),
        board: { colors: { home: null, away: null } },
      });
      expect(html).toContain(`<span class="ui-game-state">${pill}</span>`);
      expect(html).not.toContain('ui-scoreboard-when');
    }
    expect(boardWhen(when, 'UTC', 'final')).toBeUndefined();
    expect(boardStateText('forfeit')).toBe('Forfeit');
    expect(boardStateText('final')).toBeUndefined();
  });

  it('shows the latest play only while the game is played', async () => {
    const world = trackerWorld();
    await scoreHawksBears(world);
    const { view } = await viewOf(world, games.hawksBears);
    expect(draw(view)).toContain('<p role="status" aria-live="polite" class="game-latest-play">');
    const { view: decided } = await viewOf(world, games.decided);
    const html = draw(decided);
    expect(html).not.toContain('Latest play');
    // The spoken result is still there for a screen reader.
    expect(html).toMatch(
      /<p role="status" aria-live="polite" class="game-latest-play ui-visually-hidden"><span class="ui-visually-hidden">Lions 50, Bears 44\. <\/span><\/p>/,
    );
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
