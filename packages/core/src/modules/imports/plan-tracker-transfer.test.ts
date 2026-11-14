// The transfer's plan (step 2.58) on made-up data only: a made-up tracker backup and a
// made-up season, read through plain functions, so every way a game or a player can
// come out of the plan is tried without a database.
import { randomUUID } from 'node:crypto';
import { seasonRulesPreset } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { planTrackerTransfer, type PlanOptions } from './plan-tracker-transfer.ts';
import type {
  PlatformGameFact,
  RosterPersonFact,
  SeasonGameFact,
  TrackerData,
  TrackerGame,
  TrackerPlayer,
  TrackerTransferReads,
} from './tracker-transfer-data.ts';

type Input = Parameters<typeof basketball.apply>[1];

const homeId = '01900000-0000-7000-8000-0000000a0001';
const awayId = '01900000-0000-7000-8000-0000000a0002';
const gameUuid = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const start = Date.UTC(2026, 0, 5, 0, 30);

const player = (id: string, teamId: string, name: string, jersey: string): TrackerPlayer => ({
  id,
  teamId,
  name,
  jersey,
  active: true,
});
const sam = player(randomUUID(), 'owls', 'Sam Example', '4');
const kai = player(randomUUID(), 'owls', 'Kai Sample', '5');
const fox = player(randomUUID(), 'foxes', 'Fox One', '30');

/** A short game, as the tracker's server stores it: actions 20 seconds apart, then ended. */
function trackerGame(n: number, inputs: readonly Input[], over: Partial<TrackerGame> = {}) {
  let state = basketball.newGame(basketball.DEFAULT_RULES, start - 3_600_000);
  const events = inputs.map((input, k) => {
    const at = start + n * 86_400_000 + k * 20_000;
    const commandId = randomUUID();
    state = basketball.apply(state, input, { id: commandId, now: at });
    return {
      seq: k + 1,
      commandId,
      command: { at, input },
      acceptedAt: new Date(at).toISOString(),
    };
  });
  const derived = basketball.derive(state);
  const teamOf = (id: string) => (id === fox.id ? 'foxes' : 'owls');
  const jerseyOf = (id: string) => [sam, kai, fox].find((p) => p.id === id)?.jersey ?? '';
  const game: TrackerGame = {
    id: randomUUID(),
    homeTeamId: 'owls',
    awayTeamId: 'foxes',
    startsAt: new Date(start + n * 86_400_000).toISOString(),
    sourceRef: `made-up:${100 + n}`,
    status: state.status === 'final' ? 'final' : state.status === 'live' ? 'live' : 'scheduled',
    homeScore: derived.teams.home.score,
    awayScore: derived.teams.away.score,
    state,
    events,
    lines: Object.entries(derived.players).map(([playerId, line]) => ({
      playerId,
      teamId: teamOf(playerId),
      jersey: jerseyOf(playerId),
      appeared: line.appeared,
      points: line.points,
      fg1: line.fg1,
      fg2: line.fg2,
      fg3: line.fg3,
      fouls: line.fouls,
      turnovers: line.turnovers,
      ms: line.ms,
    })),
  };
  return { ...game, ...over };
}

const played = (scorer = sam): Input[] => [
  { type: 'lineup', side: 'home', playerIds: [sam.id, kai.id] },
  { type: 'lineup', side: 'away', playerIds: [fox.id] },
  { type: 'start' },
  { type: 'score', side: 'home', playerId: scorer.id, points: 2 },
  { type: 'pause' },
  { type: 'end' },
];

const data = (games: readonly TrackerGame[]): TrackerData => ({
  teams: [
    { id: 'owls', name: 'Riverside Owls', school: '', tracked: true },
    { id: 'foxes', name: 'Hillcrest Foxes', school: '', tracked: false },
  ],
  players: [sam, kai, fox],
  games,
});

const seasonGame = (n: number, over: Partial<SeasonGameFact> = {}): SeasonGameFact => ({
  id: gameUuid(n),
  number: 100 + n,
  localDate: new Date(start + n * 86_400_000 - 6 * 3_600_000).toISOString().slice(0, 10),
  homeTeamId: homeId,
  awayTeamId: awayId,
  status: 'scheduled',
  ...over,
});

type Season = {
  games?: readonly SeasonGameFact[];
  rosters?: Readonly<Record<string, readonly RosterPersonFact[]>>;
  facts?: Readonly<Record<string, Partial<PlatformGameFact>>>;
  offRoster?: Readonly<Record<string, readonly string[]>>;
  uniqueJerseys?: boolean;
};

function readsOf(season: Season = {}): TrackerTransferReads {
  return {
    timeZone: 'America/Chicago',
    teams: [
      { id: homeId, name: 'Riverside Owls' },
      { id: awayId, name: 'Hillcrest Foxes' },
    ],
    games: season.games ?? [seasonGame(1), seasonGame(2)],
    roster: async (teamId) => season.rosters?.[teamId] ?? [],
    game: async (gameId) => ({
      status: 'scheduled',
      version: 1,
      tracked: false,
      taken: new Set(),
      rules: seasonRulesPreset('high-school'),
      ...season.facts?.[gameId],
    }),
    lines: async () => [],
  };
}

const options: PlanOptions = { withOpponents: true, now: start + 100 * 86_400_000 };

describe('the transfer plan', () => {
  it('transfers a matched final game and adds the players it names', async () => {
    const plan = await planTrackerTransfer(data([trackerGame(1, played())]), readsOf(), options);
    expect(plan.ready).toBe(true);
    expect(plan.games.map((g) => g.outcome.kind)).toEqual(['transfer']);
    expect(plan.people.get(sam.id.toLowerCase())?.match).toMatchObject({
      kind: 'add',
      firstName: 'Sam',
      lastName: 'Example',
      jerseyNumber: '4',
    });
  });

  it('blocks the run on a final game it cannot find here, but skips one not ended', async () => {
    const lost = trackerGame(3, played(), { sourceRef: null });
    const live = trackerGame(4, played().slice(0, 4), { sourceRef: null });
    const plan = await planTrackerTransfer(
      data([trackerGame(1, played()), lost, live]),
      readsOf(),
      options,
    );
    expect(plan.games.map((g) => g.outcome)).toEqual([
      expect.objectContaining({ kind: 'transfer' }),
      { kind: 'blocked', gameId: null, problem: { kind: 'not-matched', reason: 'not-found' } },
      { kind: 'skip', reason: 'still-live' },
    ]);
    expect(plan.ready).toBe(false);
  });
});
