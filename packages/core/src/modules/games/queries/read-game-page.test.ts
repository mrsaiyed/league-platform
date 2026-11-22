import { defaultSeasonRules } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { defaultNamePolicy, publicViewer, type Viewer } from '../../people/index.ts';
import { engineRulesOf } from '../engine-rules.ts';
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
          rules: null,
        }
      : undefined,
  seasonStatistics: async (id) => (id === 's' ? { statKeys: [], rules: null } : undefined),
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
    // The Total's points are the game's score, 48 (S-26 as changed by step 2.196). What
    // the hidden players' points add to (41) is not handed to this visitor; the team's
    // coach gets it, below, where the lines show.
    expect(awayBox.totals).toEqual({ points: 48, fouls: 1 });
    expect(awayBox.playersPoints).toBeNull();
    expect(JSON.stringify(page)).not.toContain('41');
    expect(awayBox.teamTurnovers).toBe(0);
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
    // The team's coach sees the lines, so is told what they add to beside the score's 48.
    const coach = await readGamePage(
      store(),
      { gameId },
      viewing({ leagueId, leagueAdmin: false, staffOfTeamIds: [away] }),
    );
    expect(coach.ok && coach.value.boxScores[1]).toMatchObject({
      totals: { points: 48 },
      playersPoints: 41,
    });
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

  it("counts case 18's turnover charged to the team in the team's Total: 2, not 1", async () => {
    const full = { ...defaultSeasonRules(), statistics: 'full' as const };
    const taps: basketball.Command[] = [
      { type: 'lineup', side: 'home', playerIds: [homePlayer] },
      { type: 'lineup', side: 'away', playerIds: [awayPlayer] },
      { type: 'start' },
      { type: 'score', side: 'home', playerId: homePlayer, points: 2 },
      { type: 'team-turnover', side: 'away' },
      { type: 'turnover', side: 'away', playerId: awayPlayer },
      { type: 'end' },
    ];
    const state = taps.reduce(
      (s, command, i) => basketball.apply(s, command, { id: `c${i}`, now: 1_000 * (i + 1) }),
      basketball.newGame(engineRulesOf(full)),
    );
    // The lines the server saves from that state: its players' only (live-game.ts, linesOf).
    const lines = Object.entries(basketball.derive(state).players).map(([personId, line]) => ({
      teamId: line.side === 'home' ? home : away,
      personId,
      jerseyNumber: null,
      played: line.appeared,
      secondsPlayed: Math.floor(line.ms / 1000),
      stats: { points: line.points, fouls: line.fouls, turnovers: line.turnovers },
    }));
    const played = store({
      findGame: async (id) =>
        id === gameId
          ? {
              id,
              seasonId: 's',
              homeTeamId: home,
              awayTeamId: away,
              startsAt: null,
              status: 'final',
              captureMode: 'live',
              homeScore: 2,
              awayScore: 0,
              finalizedAt: '2026-12-06T19:30:00.000Z',
              binned: false,
              rules: full,
            }
          : undefined,
      seasonStatistics: async () => ({ statKeys: [], rules: full }),
      state: async () => state,
      lines: async () => lines,
    });
    const r = await readGamePage(played, { gameId }, viewing(publicViewer(leagueId)));
    if (!r.ok) throw new Error('expected a page');
    const awayBox = r.value.boxScores[1];
    // The engine counts 2; the player's line holds 1; the team's own is the other.
    expect(basketball.derive(state).teams.away.turnovers).toBe(2);
    expect(lines.reduce((sum, l) => sum + l.stats.turnovers, 0)).toBe(1);
    expect(awayBox.teamTurnovers).toBe(1);
    expect(awayBox.totals).toMatchObject({ turnovers: 2, points: 0 });
    expect(r.value.boxScores[0].totals).toMatchObject({ turnovers: 0, points: 2 });
    // A season keeping the full set keeps turnovers, so the page may show the column.
    expect(r.value.game.statKeys).toContain('turnovers');
    expect(r.value.plays.filter((p) => p.type === 'team-turnover')).toHaveLength(1);
  });

  it("shows case 40's typed score as the Total's points, and what the players' points add to", async () => {
    const boxScore = store({
      findGame: async (id) =>
        id === gameId
          ? {
              id,
              seasonId: 's',
              homeTeamId: home,
              awayTeamId: away,
              startsAt: null,
              status: 'final',
              captureMode: 'box',
              homeScore: 50,
              awayScore: 45,
              finalizedAt: '2026-12-06T19:30:00.000Z',
              binned: false,
              rules: null,
            }
          : undefined,
      state: async () => undefined,
      lines: async () =>
        [20, 16, 12].map((points, i) => ({
          teamId: home,
          personId: `01900000-0000-7000-8000-00000000f10${i}`,
          jerseyNumber: String(i + 1),
          played: true,
          secondsPlayed: null,
          stats: { points, fouls: 1 },
        })),
    });
    const r = await readGamePage(boxScore, { gameId }, viewing(publicViewer(leagueId)));
    if (!r.ok) throw new Error('expected a page');
    const homeBox = r.value.boxScores[0];
    expect(r.value.scoreboard.home.score).toBe(50);
    expect(homeBox.totals).toEqual({ points: 50, fouls: 3 });
    expect(homeBox.playersPoints).toBe(48);
    // The other team has no lines: no Total to explain, and none made up.
    expect(r.value.boxScores[1].totals).toEqual({});
    expect(r.value.boxScores[1].playersPoints).toBeNull();
  });

  it("gives the statistics the season keeps today, as the statistics page does, not the game's own fixed rules", async () => {
    const full = { ...defaultSeasonRules(), statistics: 'full' as const };
    const keysWith = async (seasonRules: unknown, statKeys: readonly string[]) => {
      const base = store();
      const s = store({
        // The game kept the full set when it was played (S-1); the season may differ now.
        findGame: async (id) => {
          const found = await base.findGame(id);
          return found === undefined ? undefined : { ...found, rules: full };
        },
        seasonStatistics: async () => ({ statKeys, rules: seasonRules }),
      });
      const r = await readGamePage(s, { gameId }, viewing(publicViewer(leagueId)));
      return r.ok ? r.value.game.statKeys : undefined;
    };
    expect(await keysWith(defaultSeasonRules(), [])).toEqual(['points', 'fg3', 'fg1', 'fouls']);
    expect(await keysWith(full, [])).toContain('turnovers');
    expect(await keysWith(null, ['points', 'rebounds'])).toEqual(['points', 'rebounds']);
  });

  it("keeps a live game's Total at the score its plays add to", async () => {
    const live = store({
      findGame: async (id) => {
        const found = await store().findGame(id);
        return found === undefined
          ? undefined
          : { ...found, status: 'live', homeScore: null, awayScore: null };
      },
    });
    const r = await readGamePage(live, { gameId }, viewing(publicViewer(leagueId)));
    if (!r.ok) throw new Error('expected a page');
    expect(r.value.scoreboard.home.score).toBe(2);
    expect(r.value.boxScores[0].totals['points']).toBe(2);
    expect(r.value.boxScores[1].totals['points']).toBe(3);
  });

  it('shows a game with no live state and no lines as a score only', async () => {
    const bare = store({ state: async () => undefined, lines: async () => [] });
    const r = await readGamePage(bare, { gameId }, viewing(publicViewer(leagueId)));
    expect(r.ok && r.value.plays).toEqual([]);
    expect(r.ok && r.value.scoreboard.period).toBeNull();
  });
});
