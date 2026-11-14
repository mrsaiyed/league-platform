import { GameSnapshot, LiveMessage } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import {
  defaultNamePolicy,
  findPrivateFields,
  privateValuesOf,
  publicViewer,
  type Viewer,
} from '../../people/index.ts';
import type { GameSnapshotStore } from '../read-ports.ts';
import type { GameViewing } from './read-game-page.ts';
import { liveMessageOf, readGameSnapshot } from './read-game-snapshot.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const gameId = '01900000-0000-7000-8000-0000000b0001';
const home = '01900000-0000-7000-8000-0000000a0001';
const away = '01900000-0000-7000-8000-0000000a0002';
const player = (n: number) => `01900000-0000-7000-8000-00000000f${n.toString().padStart(3, '0')}`;
const homeIds = [1, 2, 3, 4, 5].map(player);
const awayIds = [11, 12, 13, 14, 15].map(player);
const bench = player(6);
const now = 1_800_000_000_000;

/** A game tracked on the engine: line-ups, tip-off, a home basket and an away foul. */
function playedState(): basketball.GameState {
  let state = basketball.newGame(basketball.QUARTERS, 0);
  let n = 0;
  const tap = (command: basketball.Command, at: number) => {
    n += 1;
    state = basketball.apply(state, command, { id: `c${n}`, now: at });
  };
  tap({ type: 'lineup', side: 'home', playerIds: homeIds }, 1000);
  tap({ type: 'lineup', side: 'away', playerIds: awayIds }, 1000);
  tap({ type: 'start' }, 2000);
  tap({ type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 3 }, 5000);
  tap({ type: 'foul', side: 'away', playerId: awayIds[0] ?? '' }, 6000);
  return state;
}

const person = (id: string) => ({
  id,
  firstName: homeIds.includes(id) || id === bench ? 'Hana' : 'Avery',
  lastName: id === homeIds[0] ? 'Shooter' : 'Fouler',
  isMinor: false,
  visibility: 'none',
});

function store(
  over: { status?: string; awayVisibility?: string; state?: unknown } = {},
): GameSnapshotStore {
  const state = 'state' in over ? over.state : playedState();
  return {
    findGame: async (id) =>
      id === gameId
        ? {
            id,
            seasonId: 's',
            homeTeamId: home,
            awayTeamId: away,
            startsAt: null,
            status: over.status ?? 'live',
            captureMode: 'live',
            homeScore: 3,
            awayScore: 0,
            finalizedAt: null,
            binned: false,
          }
        : undefined,
    teams: async () => [
      { id: home, name: 'Home', slug: 'h', color: null, statsVisibility: 'everyone' },
      {
        id: away,
        name: 'Away',
        slug: 'a',
        color: null,
        statsVisibility: over.awayVisibility ?? 'staff',
      },
    ],
    state: async () => state,
    savedState: async () => (state === undefined ? undefined : { seq: 5, state }),
    lines: async () => [
      ...homeIds.map((personId, i) => ({
        teamId: home,
        personId,
        jerseyNumber: String(i + 4),
        played: true,
        secondsPlayed: 3,
        stats: {},
      })),
      ...awayIds.map((personId, i) => ({
        teamId: away,
        personId,
        jerseyNumber: String(i + 20),
        played: true,
        secondsPlayed: 3,
        stats: {},
      })),
    ],
    people: async (ids) => ids.map(person),
    correctedOn: async () => undefined,
  };
}

const viewing = (viewer: Viewer): GameViewing => ({
  leagueId,
  viewer,
  audience: 'adult',
  policy: defaultNamePolicy,
});
const visitor = viewing(publicViewer(leagueId));

async function snapshot(s: GameSnapshotStore, v: GameViewing = visitor) {
  const result = await readGameSnapshot(s, { gameId }, v, now);
  if (!result.ok) throw new Error('expected a snapshot');
  return result.value;
}

describe('readGameSnapshot', () => {
  it('gives the game as it stands, in the contract shape', async () => {
    const shot = await snapshot(store({ awayVisibility: 'everyone' }));
    expect(GameSnapshot.parse(shot)).toEqual(shot);
    expect(shot).toMatchObject({
      gameId,
      sequence: 5,
      sentAt: now,
      status: 'live',
      score: { home: 3, away: 0 },
      period: 1,
      teamFouls: { home: 0, away: 1 },
      periods: 4,
      latestPlay: { type: 'foul', side: 'away', playerName: 'Avery Fouler', jersey: '20' },
    });
    expect(shot.clock).toMatchObject({ state: 'stopped' });
    expect(shot.players).toHaveLength(10);
    expect(shot.players[0]).toMatchObject({
      playerId: homeIds[0],
      name: 'Hana Shooter',
      jersey: '4',
      points: 3,
      onCourt: true,
    });
  });

  it('gives a visitor no player of a staff-only team, and names nobody in the latest play', async () => {
    const shot = await snapshot(store());
    expect(shot.teams.away).toEqual({ name: 'Away', statsVisible: false });
    expect(shot.players.every((p) => p.side === 'home')).toBe(true);
    // The foul is the away team's: who committed it does not travel.
    expect(shot.latestPlay).toEqual({ type: 'foul', side: 'away', playerName: null, jersey: null });
    const text = JSON.stringify(shot);
    for (const id of awayIds) expect(text).not.toContain(id);
    expect(text).not.toContain('Avery');
    const privateValues = awayIds.flatMap((id) => {
      const p = person(id);
      // Shown nowhere: every form of the name is private here.
      return privateValuesOf(
        { firstName: p.firstName, lastName: p.lastName, nameRequest: 'removed' },
        { shown: false, why: 'restricted' },
      );
    });
    expect(findPrivateFields(liveMessageOf(shot), { privateValues })).toEqual([]);
  });

  it('names nobody in the latest play while either team is hidden, even the open team’s scorer', async () => {
    const state = playedState();
    const scored = basketball.apply(
      state,
      { type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 2 },
      { id: 'c9', now: 7000 },
    );
    const shot = await snapshot(store({ state: scored }));
    expect(shot.latestPlay).toEqual({
      type: 'score',
      side: 'home',
      playerName: null,
      jersey: null,
      points: 2,
    });
    // The open team's own lines are still there.
    expect(shot.players.find((p) => p.playerId === homeIds[0])?.points).toBe(5);
  });

  it("shows the staff-only team's players to the league's admin", async () => {
    const admin = viewing({ leagueId, leagueAdmin: true, staffOfTeamIds: [] });
    const shot = await snapshot(store(), admin);
    expect(shot.teams.away.statsVisible).toBe(true);
    expect(shot.players.filter((p) => p.side === 'away')).toHaveLength(5);
    expect(shot.latestPlay?.playerName).toBe('Avery Fouler');
  });

  it("shows another league's viewer only the totals", async () => {
    const other = viewing({
      leagueId: '01900000-0000-7000-8000-000000000002',
      leagueAdmin: true,
      staffOfTeamIds: [],
    });
    const shot = await snapshot(store({ awayVisibility: 'everyone' }), other);
    expect(shot.players).toEqual([]);
    expect(shot.latestPlay?.playerName).toBeNull();
  });

  it('stands on the game row when there is no saved state', async () => {
    const shot = await snapshot(store({ state: undefined, status: 'final' }));
    expect(GameSnapshot.parse(shot)).toEqual(shot);
    expect(shot).toMatchObject({
      sequence: 0,
      status: 'final',
      score: { home: 3, away: 0 },
      period: 1,
      clock: { state: 'stopped', remainingMs: 0 },
      latestPlay: null,
      players: [],
    });
  });

  it('reads a state the engine cannot as no state', async () => {
    const shot = await snapshot(store({ state: { version: 1, status: 'final', plays: [] } }));
    expect(shot.players).toEqual([]);
    expect(shot.latestPlay).toBeNull();
  });

  it('answers game-not-found for a game that is not in this league', async () => {
    const result = await readGameSnapshot(
      store(),
      { gameId: '01900000-0000-7000-8000-0000000b0009' },
      visitor,
      now,
    );
    expect(result).toEqual({ ok: false, error: { code: 'game-not-found' } });
  });

  it('cuts the live message from the snapshot, in the contract shape', async () => {
    const message = liveMessageOf(await snapshot(store()));
    expect(LiveMessage.parse(message)).toEqual(message);
    expect(Object.keys(message)).not.toContain('players');
  });
});
