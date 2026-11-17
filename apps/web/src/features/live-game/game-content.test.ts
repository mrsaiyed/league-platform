// A game's page drawn from the made-up stand-in (step 2.45): the live game with its
// scoreboard, latest play and players, a staff-only team's names nowhere (S-22, T-87), a
// finished game's box scores, and "corrected" with the date and never the reason (S-7).
import {
  defaultNamePolicy,
  publicViewer,
  readGamePage,
  readGameSnapshot,
  readStatisticsTable,
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
  forfeitNote,
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
    // It stands beside the play-by-play's title, drawn as every way on is.
    expect(html).toContain(
      '<h2 id="game-plays">Play by play</h2><a class="ui-more" href="/self#game-plays">Show newer plays</a>',
    );
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
    // The games of a day before today still with no result: shown awaiting it.
    const unscored: string[] = [];
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
        if (game.status === 'scheduled' && game.localDate !== null && game.localDate < today) {
          unscored.push(`${game.awayTeam.name} against ${game.homeTeam.name}`);
        }
      }
    }
    // Fall 2026's 23 (the tracked games among them, and the game played three days ago
    // whose score nobody entered, step 2.156), Spring 2026's 2 and the youth league's 5.
    expect(opened).toBe(30);
    expect(unscored).toEqual(['Badgers against Herons']);
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
    // A game still to come says its day once, on the board between the teams, and has no
    // line over the board (step 2.147 part 3: it said the day twice, 60 apart).
    expect(titleLine(when, 'UTC', 'scheduled')).toBeNull();
    expect(boardWhen(when, 'UTC', 'scheduled')).toEqual({ day: 'Fri, Nov 20', time: '6:00 PM' });
    // Every other game keeps its line.
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
    // A game the schedule does not list (one of a season still being set up), or another
    // league's, has none.
    expect(
      await publicSchedule.gameFactsOf(liveLeagueId, season, games.draftSeason),
    ).toBeUndefined();
    expect(
      await publicSchedule.gameFactsOf(standInLeagues.other.id, season, listed.id),
    ).toBeUndefined();
    // The page asks for that and nothing wider: it is read again at every "Show newer plays".
    const page = readFileSync(new URL('./game-page.tsx', import.meta.url), 'utf8');
    expect(page).toContain('publicSchedule.gameFactsOf(');
    expect(page).not.toContain('scheduleOf(');
  });

  it('is drawn again from the server when its game starts, ends, is reopened or is marked not started, and only then', () => {
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
    // A live game marked not started (S-40) is drawn again as scheduled, its plays gone.
    expect(redrawsFor(at('live', 4), at('scheduled', 5))).toBe(true);
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
    // The note names who forfeited (step 2.147 part 3): the team with the loser's score.
    const { score, teams } = view.snapshot;
    expect(score.home).not.toBe(score.away);
    const loser = score.home < score.away ? teams.home.name : teams.away.name;
    const html = draw({ ...view, status: 'forfeit' });
    expect(html).toContain(`<p class="ui-scoreboard-note">${loser} forfeited this game.</p>`);
    expect(forfeitNote({ name: 'Otters', score: 0 }, { name: 'Badgers', score: 20 })).toBe(
      'Otters forfeited this game.',
    );
    expect(forfeitNote({ name: 'Otters', score: 20 }, { name: 'Badgers', score: 0 })).toBe(
      'Badgers forfeited this game.',
    );
    // With the scores level it cannot be told: the sentence only says it was a forfeit.
    expect(forfeitNote({ name: 'Otters', score: 0 }, { name: 'Badgers', score: 0 })).toBe(
      'This game was decided by forfeit.',
    );
    expect(draw({ ...view, status: 'final' })).not.toContain('forfeit');
  });

  it('ends the page of a game still to come, or put off, with its two teams and the way to the schedule', async () => {
    const world = trackerWorld();
    const { view } = await viewOf(world, games.lionsTigers);
    const card = (slug: string, name: string) => ({
      slug,
      name,
      color: null,
      href: `/x/teams/${slug}`,
      seedText: '2',
      recordText: '1-1',
      divisionName: 'West',
    });
    const teams = [card('lions', 'Lions'), card('tigers', 'Tigers')];
    for (const status of ['scheduled', 'postponed']) {
      const html = draw({ ...view, status, scheduleAddress: '/x/schedule', teams });
      expect(html).toContain('<h2>The two teams</h2>');
      expect(html).toContain('<a class="ui-more" href="/x/schedule">See the full schedule</a>');
      // Each team is one link to its own page, under the section's title: level three.
      expect(html.match(/<h3 class="ui-team-card-name"><a href="\/x\/teams\//g)).toHaveLength(2);
      expect(html.indexOf('/x/teams/lions')).toBeLessThan(html.indexOf('/x/teams/tigers'));
      expect(html).toContain('Record</span> 1-1');
    }
    // A game with a result has its box scores to end with, and no such section.
    expect(draw({ ...view, status: 'final', teams })).not.toContain('The two teams');
    expect(draw({ ...view, status: 'scheduled' })).not.toContain('The two teams');
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
      game: { recording: 'live', statKeys: ['points', 'mystery_stat', 'fouls'] },
      boxScores: [
        {
          side: 'home',
          name: 'Hawks',
          playerLinesShown: true,
          totals: { points: 5, mystery_stat: 1 },
          playersPoints: 5,
          teamTurnovers: 0,
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
          playersPoints: 2,
          teamTurnovers: 0,
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
    // The game's number is a kicker, with its short rule, as on every other page's head.
    expect(html).toContain('<p class="ui-kicker">Game 8</p>');
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

  describe("a box score's Total counts everything the team did (step 2.196)", () => {
    /** A finished game's page with these lines for the home team, as core reads it. */
    const pageWith = (
      statKeys: readonly string[],
      home: Partial<GamePage['boxScores'][number]>,
    ): GamePage =>
      ({
        game: { recording: 'live', statKeys },
        boxScores: [
          {
            side: 'home',
            name: 'Hawks',
            playerLinesShown: true,
            totals: {},
            playersPoints: null,
            teamTurnovers: 0,
            players: [],
            ...home,
          },
          {
            side: 'away',
            name: 'Bears',
            playerLinesShown: true,
            totals: { points: 2, fouls: 0, fg1: 0, fg3: 0, turnovers: 0 },
            playersPoints: 2,
            teamTurnovers: 0,
            players: [],
          },
        ],
      }) as unknown as GamePage;
    const player = (stats: Record<string, number>) => ({
      personId: 'p1',
      name: 'Pia',
      jersey: '9',
      unnamed: false,
      played: true,
      seconds: 60,
      stats,
    });
    const tracked = { points: 3, fg1: 1, fg3: 0, fg2: 1, fouls: 1, turnovers: 1 };
    const tables = (built: ReturnType<typeof buildBoxScores>) => {
      if (built.kind !== 'tables') throw new Error(built.kind);
      return built.tables;
    };
    const standard = ['points', 'fg3', 'fg1', 'fouls'];
    const full = [...standard, 'rebounds', 'assists', 'steals', 'blocks', 'turnovers'];

    it('draws the columns the season keeps, in its order: no TO in a standard season, TO in a full one', () => {
      const home = { totals: tracked, playersPoints: 3, players: [player(tracked)] };
      const labels = (keys: readonly string[]) =>
        tables(buildBoxScores(pageWith(keys, home)))[1]?.columns.map((c) => c.label);
      expect(labels(standard)).toEqual(['PTS', '3PM', 'FTM', 'PF']);
      // A full season's columns this game recorded: rebounds and the rest were not.
      expect(labels(full)).toEqual(['PTS', '3PM', 'FTM', 'PF', 'TO']);
      // The statistics a season names itself, as the statistics page shows them.
      expect(labels(['points', 'rebounds', 'fouls'])).toEqual(['PTS', 'PF']);
    });

    it("case 18 in a full season: the Total's 2 turnovers, and a sentence for the team's own", () => {
      const lines = { points: 0, fouls: 0, fg1: 0, fg3: 0, turnovers: 1 };
      const built = buildBoxScores(
        pageWith(full, {
          totals: { ...lines, turnovers: 2 },
          playersPoints: 0,
          teamTurnovers: 1,
          players: [player(lines)],
        }),
      );
      const hawks = tables(built)[1];
      expect(hawks?.totals['turnovers']).toBe(2);
      expect(hawks?.notes).toEqual([
        'The Total includes 1 turnover charged to the team, not to a player.',
      ]);
      expect(tables(built)[0]?.notes).toEqual([]);
      // In a standard season there is no TO column, so nothing to explain.
      const quiet = buildBoxScores(
        pageWith(standard, {
          totals: { ...lines, turnovers: 2 },
          playersPoints: 0,
          teamTurnovers: 1,
          players: [player(lines)],
        }),
      );
      expect(tables(quiet)[1]?.notes).toEqual([]);
      expect(
        buildBoxScores(
          pageWith(full, {
            totals: { ...lines, turnovers: 4 },
            teamTurnovers: 3,
            playersPoints: 0,
            players: [player(lines)],
          }),
        ),
      ).toMatchObject({
        tables: [
          {},
          { notes: ['The Total includes 3 turnovers charged to the team, not to a player.'] },
        ],
      });
    });

    it('case 40: the Total shows the typed 50, and one sentence says the players add to 48', async () => {
      const built = buildBoxScores(
        pageWith(standard, {
          totals: { points: 50, fouls: 2 },
          playersPoints: 48,
          players: [
            player({ points: 30, fouls: 1 }),
            { ...player({ points: 18, fouls: 1 }), personId: 'p2' },
          ],
        }),
      );
      const hawks = tables(built)[1];
      expect(hawks?.totals['points']).toBe(50);
      expect(hawks?.notes).toEqual([
        "The players' points add to 48. The final score was entered as 50.",
      ]);
      // Drawn on the page under the table, and no "Team" row is made up for the 2 points:
      // the Hawks' table has its two players and its Total, nothing else.
      const { view } = await viewOf(trackerWorld(), games.decided);
      const html = draw({ ...view, boxScores: built });
      const hawksTable = html.slice(html.lastIndexOf('<table'), html.lastIndexOf('</table>'));
      expect(hawksTable).toContain('<caption dir="auto">Hawks</caption>');
      expect(hawksTable.match(/<tr>/g)).toHaveLength(1 + 2 + 1);
      expect(html.slice(html.lastIndexOf('</table>'))).toContain(
        '<p class="ui-table-notice" dir="auto">The players&#x27; points add to 48. The final score was entered as 50.</p>',
      );
    });

    it('says it as plainly when the players add to more than the score entered', () => {
      const built = buildBoxScores(
        pageWith(standard, {
          totals: { points: 40 },
          playersPoints: 44,
          players: [player({ points: 44 })],
        }),
      );
      expect(tables(built)[1]?.notes).toEqual([
        "The players' points add to 44. The final score was entered as 40.",
      ]);
    });

    it('leaves out the table of a team nothing was recorded for, with one sentence, not a Total of dashes', async () => {
      // A box score typed for the Hawks only: the Bears' score is on the board.
      const built = buildBoxScores({
        ...pageWith(standard, {
          totals: { points: 50 },
          playersPoints: 50,
          players: [player({ points: 50 })],
        }),
        boxScores: [
          {
            side: 'home',
            name: 'Hawks',
            playerLinesShown: true,
            totals: { points: 50 },
            playersPoints: 50,
            teamTurnovers: 0,
            players: [player({ points: 50 })],
          },
          {
            side: 'away',
            name: 'Bears',
            playerLinesShown: true,
            totals: {},
            playersPoints: null,
            teamTurnovers: 0,
            players: [],
          },
        ],
      } as unknown as GamePage);
      const [bears, hawks] = tables(built);
      expect(bears?.nothingRecorded).toBe('No player numbers were recorded for this team.');
      expect(hawks?.nothingRecorded).toBeNull();
      const { view } = await viewOf(trackerWorld(), games.decided);
      const html = draw({ ...view, boxScores: built });
      expect(html.match(/<table class="ui-table ui-box-score"/g)).toHaveLength(1);
      expect(html).toContain(
        '<div class="ui-empty"><p class="ui-empty-title">Bears</p><p>No player numbers were recorded for this team.</p></div>',
      );
    });

    it('says nothing where the players are hidden: there is no column to add up', () => {
      const built = buildBoxScores(
        pageWith(full, {
          playerLinesShown: false,
          totals: { points: 50, turnovers: 2 },
          playersPoints: 48,
          teamTurnovers: 1,
        }),
      );
      expect(tables(built)[1]?.notes).toEqual([]);
    });

    it("a game scored on the tablet with a team turnover: every Total adds up from the page, and the season's team totals count it", async () => {
      const world = trackerWorld();
      const teamTurnoversOf = async (seasonId: string) =>
        world.ports.publicStats.statisticsOf(liveLeagueId, async ({ store }) => {
          const table = await readStatisticsTable(store, { seasonId, viewing });
          if (!table.ok) throw new Error('no statistics');
          return table.value.teams.find((team) => team.name === 'Hawks')?.stats['turnovers'];
        });
      const context = (part: string) =>
        world.contextAs('scorekeeper', 'live', ['games', games.hawksBears, part]);
      const opened = await scoringSessionRequest(
        await context('session'),
        games.hawksBears,
        { type: 'open', deviceId: 'tablet-1' },
        world.tracker,
      );
      const { sessionId } = opened.body as { sessionId: string };
      const sent = await sendTrackerCommands(
        await context('commands'),
        games.hawksBears,
        {
          protocolVersion: 1,
          sessionId,
          commands: [
            tap({ type: 'lineup', side: 'home', playerIds: hawks }),
            tap({ type: 'lineup', side: 'away', playerIds: bears }),
            tap({ type: 'start' }),
            tap({ type: 'score', side: 'home', playerId: hawks[0], points: 3 }),
            // The audit's case 18: one charged to the team, one to a player.
            tap({ type: 'team-turnover', side: 'home' }),
            tap({ type: 'turnover', side: 'home', playerId: hawks[2] }),
            tap({ type: 'score', side: 'away', playerId: bears[0], points: 2 }),
            tap({ type: 'end' }),
          ],
        },
        world.tracker,
        world.publishPlays,
      );
      expect(sent.answer.status).toBe(200);
      const { page } = await viewOf(world, games.hawksBears);
      expect(page.game.status).toBe('final');
      const hawksBox = page.boxScores.find((box) => box.name === 'Hawks');
      expect(hawksBox?.teamTurnovers).toBe(1);
      expect(hawksBox?.totals['turnovers']).toBe(2);
      // The season's team totals count the same 2 (the made-up season's other games
      // recorded no turnovers).
      expect(await teamTurnoversOf(page.game.seasonId)).toMatchObject({ total: 2 });
      // The page's own builder: each Total it shows is its column added up, or a sentence
      // under the table says why.
      for (const table of tables(buildBoxScores(page))) {
        if (table.players === null) continue;
        for (const column of table.columns) {
          const sum = table.players.reduce((n, p) => n + Number(p.cells[column.key] ?? 0), 0);
          if (sum !== table.totals[column.key]) expect(table.notes.length).toBeGreaterThan(0);
        }
      }
    });
  });

  it('leaves out a statistic with no words, and has no stats if that was all', () => {
    const page = {
      game: { recording: 'box-score', statKeys: ['odd', 'points'] },
      boxScores: [
        { side: 'home', name: 'Hawks', playerLinesShown: true, totals: { odd: 1 }, players: [] },
        { side: 'away', name: 'Bears', playerLinesShown: true, totals: {}, players: [] },
      ],
    } as unknown as GamePage;
    expect(buildBoxScores(page)).toEqual({ kind: 'no-stats' });
  });
});
