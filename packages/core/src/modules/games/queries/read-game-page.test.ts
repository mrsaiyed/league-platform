import { describe, expect, it } from 'vitest';
import { defaultNamePolicy, publicViewer, type Viewer } from '../../people/index.ts';
import type { GamesReadStore } from '../read-ports.ts';
import { readGamePage, type GameViewing } from './read-game-page.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const gameId = '01900000-0000-7000-8000-0000000b0001';
const home = '01900000-0000-7000-8000-0000000a0001';
const away = '01900000-0000-7000-8000-0000000a0002';
const homePlayer = '01900000-0000-7000-8000-00000000f001';
const awayPlayer = '01900000-0000-7000-8000-00000000f002';

const store = (over: Partial<GamesReadStore> = {}): GamesReadStore => ({
  findGame: async (id) =>
    id === gameId
      ? {
          id,
          seasonId: 's',
          homeTeamId: home,
          awayTeamId: away,
          startsAt: '2026-12-06T18:00:00.000Z',
          status: 'final',
          captureMode: 'live',
          homeScore: 52,
          awayScore: 48,
          finalizedAt: '2026-12-06T19:30:00.000Z',
          binned: false,
        }
      : undefined,
  teams: async () => [
    { id: home, name: 'Home', slug: 'h', color: null, statsVisibility: 'everyone' },
    { id: away, name: 'Away', slug: 'a', color: null, statsVisibility: 'staff' },
  ],
  state: async () => ({
    version: 1,
    status: 'final',
    rules: { periods: 4 },
    clock: { remainingMs: 0, running: false, anchorAt: 0 },
    plays: [
      { type: 'period', period: 1 },
      { type: 'score', side: 'home', playerId: homePlayer, points: 2, period: 1, clockMs: 400000 },
      { type: 'score', side: 'away', playerId: awayPlayer, points: 3, period: 1, clockMs: 390000 },
      { type: 'foul', side: 'away', playerId: awayPlayer },
      { type: 'sub', side: 'away', inId: awayPlayer, outId: awayPlayer },
      { type: 'secret-new-kind', side: 'home' },
    ],
  }),
  lines: async () => [
    {
      teamId: home,
      personId: homePlayer,
      jerseyNumber: '4',
      played: true,
      secondsPlayed: 600,
      stats: { points: 2 },
    },
    {
      teamId: away,
      personId: awayPlayer,
      jerseyNumber: '31',
      played: true,
      secondsPlayed: 700,
      stats: { points: 41, fouls: 1 },
    },
  ],
  people: async (ids) =>
    ids.map((id) => ({
      id,
      firstName: id === homePlayer ? 'Hana' : 'Avery',
      lastName: 'Player',
      isMinor: false,
      visibility: 'none',
    })),
  correctedOn: async () => '2026-12-07',
  ...over,
});

const viewing = (viewer: Viewer): GameViewing => ({
  leagueId,
  viewer,
  audience: 'adult',
  policy: defaultNamePolicy,
});

describe('readGamePage', () => {
  it("shows a visitor the staff-only team's totals, no player lines, and no names in the plays", async () => {
    const result = await readGamePage(store(), { gameId }, viewing(publicViewer(leagueId)));
    if (!result.ok) throw new Error('expected a page');
    const page = result.value;
    expect(page.scoreboard.home.score).toBe(52);
    const [homeBox, awayBox] = page.boxScores;
    expect(homeBox.players.map((p) => p.name)).toEqual(['Hana Player']);
    expect(awayBox.playerLinesShown).toBe(false);
    expect(awayBox.players).toEqual([]);
    expect(awayBox.totals).toEqual({ points: 41, fouls: 1 });
    const text = JSON.stringify(page);
    expect(text).not.toContain(awayPlayer);
    expect(text).not.toContain('Avery');
    expect(text).not.toContain('"31"');
    // Their points still count in the team's score and the plays stay, nameless.
    const away3 = page.plays.find((p) => p.side === 'away' && p.type === 'score');
    expect(away3).toMatchObject({ points: 3, player: null, score: { home: 2, away: 3 } });
    expect(page.plays.some((p) => p.type === 'sub')).toBe(false);
    expect(page.plays.some((p) => p.player?.name === 'Hana Player')).toBe(true);
    expect(page.game.correctedOn).toBe('2026-12-07');
    expect(page.game.recording).toBe('live');
    expect(page.scoreboard.clock).toEqual({ state: 'stopped', remainingMs: 0 });
  });

  it("shows the team's coach and an admin the player lines, and another team's coach does not get them", async () => {
    const withLines = async (viewer: Viewer) => {
      const r = await readGamePage(store(), { gameId }, viewing(viewer));
      return r.ok && r.value.boxScores[1].players.map((p) => p.name);
    };
    expect(await withLines({ leagueId, leagueAdmin: false, staffOfTeamIds: [away] })).toEqual([
      'Avery Player',
    ]);
    expect(await withLines({ leagueId, leagueAdmin: true, staffOfTeamIds: [] })).toEqual([
      'Avery Player',
    ]);
    expect(await withLines({ leagueId, leagueAdmin: false, staffOfTeamIds: [home] })).toEqual([]);
  });

  it('keeps a person who asked to be removed nameless and finds no binned or missing game', async () => {
    const removed = store({
      people: async (ids) =>
        ids.map((id) => ({
          id,
          firstName: 'A',
          lastName: 'B',
          isMinor: false,
          visibility: 'removed',
        })),
    });
    const r = await readGamePage(removed, { gameId }, viewing(publicViewer(leagueId)));
    expect(r.ok && r.value.boxScores[0].players[0]).toMatchObject({ name: null, jersey: '4' });
    expect(await readGamePage(store(), { gameId: 'x' }, viewing(publicViewer(leagueId)))).toEqual({
      ok: false,
      error: { code: 'game-not-found' },
    });
  });

  it('shows a game with no live state and no lines as a score only', async () => {
    const bare = store({ state: async () => undefined, lines: async () => [] });
    const r = await readGamePage(bare, { gameId }, viewing(publicViewer(leagueId)));
    expect(r.ok && r.value.plays).toEqual([]);
    expect(r.ok && r.value.scoreboard.period).toBeNull();
  });
});
