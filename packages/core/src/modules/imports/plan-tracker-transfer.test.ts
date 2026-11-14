// The transfer's plan (step 2.58) on made-up data only: a made-up tracker backup and a
// made-up season, read through plain functions, so every way a game or a player can
// come out of the plan is tried without a database.
import { randomUUID } from 'node:crypto';
import { seasonRulesPreset } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { planTrackerTransfer, type PlanOptions } from './plan-tracker-transfer.ts';
import type {
  ListedPersonFact,
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
  offRoster?: readonly ListedPersonFact[];
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
      homeScore: null,
      awayScore: null,
      tracked: false,
      taken: new Set(),
      rules: seasonRulesPreset('high-school'),
      ...season.facts?.[gameId],
    }),
    lines: async () => [],
    uniqueJerseys: season.uniqueJerseys ?? false,
    peopleOffRosters: async (name) =>
      (season.offRoster ?? []).filter((p) =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(name.toLowerCase()),
      ),
  };
}

const rosterEntry = (
  personId: string,
  name: string,
  jerseyNumber: string | null,
  over: Partial<RosterPersonFact> = {},
): RosterPersonFact => {
  const [firstName = '', lastName = ''] = name.split(' ');
  return {
    personId,
    firstName,
    lastName,
    publicName: null,
    jerseyNumber,
    role: 'player',
    joinedOn: null,
    leftOn: null,
    ...over,
  };
};

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
      personId: null,
    });
  });

  it('lists the tracked team’s players it cannot bring over, even when no game names them', async () => {
    // One the tracker knows only by number, and one with a single name: neither plays.
    const numberOnly = player(randomUUID(), 'owls', '', '12');
    const oneName = player(randomUUID(), 'owls', 'Prince', '13');
    const backup = {
      ...data([trackerGame(1, played())]),
      players: [sam, kai, fox, numberOnly, oneName],
    };
    const plan = await planTrackerTransfer(backup, readsOf(), options);
    // The games go through, but the plan says who is not brought over.
    expect(plan.ready).toBe(true);
    expect(plan.games.map((g) => g.outcome.kind)).toEqual(['transfer']);
    expect([...plan.notBroughtOver].sort()).toEqual(
      [numberOnly.id.toLowerCase(), oneName.id.toLowerCase()].sort(),
    );
    const nothingLeft = await planTrackerTransfer(
      data([trackerGame(1, played())]),
      readsOf(),
      options,
    );
    expect(nothingLeft.notBroughtOver).toEqual([]);
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

  it('puts on the roster a person an earlier run added to the list but not to the team', async () => {
    const orphan = gameUuid(900);
    const twin = gameUuid(901);
    const plan = await planTrackerTransfer(
      data([trackerGame(1, played())]),
      readsOf({
        offRoster: [
          { personId: orphan, firstName: 'Sam', lastName: 'Example' },
          // Only a whole name is the player's: a longer one is someone else.
          { personId: twin, firstName: 'Sam', lastName: 'Examples' },
        ],
      }),
      options,
    );
    expect(plan.ready).toBe(true);
    expect(plan.people.get(sam.id.toLowerCase())?.match).toMatchObject({
      kind: 'add',
      personId: orphan,
    });
    expect(plan.people.get(kai.id.toLowerCase())?.match).toMatchObject({ personId: null });
  });

  it('gives one listed person to one player only, however many share the name', async () => {
    const otherSam = player(randomUUID(), 'foxes', 'Sam Example', '31');
    const inputs: Input[] = [
      ...played().slice(0, 1),
      { type: 'lineup', side: 'away', playerIds: [fox.id, otherSam.id] },
      ...played().slice(2),
    ];
    const backup = { ...data([trackerGame(1, inputs)]), players: [sam, kai, fox, otherSam] };
    const orphan = gameUuid(900);
    const plan = await planTrackerTransfer(
      backup,
      readsOf({ offRoster: [{ personId: orphan, firstName: 'Sam', lastName: 'Example' }] }),
      options,
    );
    const taken = [sam, otherSam].map((p) => {
      const match = plan.people.get(p.id.toLowerCase())?.match;
      return match?.kind === 'add' ? match.personId : 'not added';
    });
    expect(taken.filter((id) => id === orphan)).toHaveLength(1);
    expect(taken.filter((id) => id === null)).toHaveLength(1);
  });

  it('blocks a player whose number someone on the team wears, when numbers must be unique', async () => {
    const rosters = {
      [homeId]: [
        rosterEntry(gameUuid(800), 'Pat Other', '5'),
        // Someone who left wore 4: that number is free again.
        rosterEntry(gameUuid(801), 'Lee Gone', '4', { leftOn: '2025-12-01' }),
      ],
    };
    const unique = await planTrackerTransfer(
      data([trackerGame(1, played())]),
      readsOf({ rosters, uniqueJerseys: true }),
      options,
    );
    expect(unique.people.get(kai.id.toLowerCase())?.match).toEqual({
      kind: 'problem',
      reason: 'number-taken',
    });
    expect(unique.people.get(sam.id.toLowerCase())?.match.kind).toBe('add');
    expect(unique.games[0]?.outcome).toMatchObject({
      kind: 'blocked',
      problem: { kind: 'players-not-here', playerIds: [kai.id.toLowerCase()] },
    });
    expect(unique.ready).toBe(false);
    // Where the season does not ask for unique numbers, two may wear one.
    const shared = await planTrackerTransfer(
      data([trackerGame(1, played())]),
      readsOf({ rosters }),
      options,
    );
    expect(shared.ready).toBe(true);
  });

  it('blocks two players to be added with one number, and a number a roster cannot hold', async () => {
    const twin = player(randomUUID(), 'owls', 'Ari Madeup', '4');
    const odd = player(randomUUID(), 'owls', 'Jo Testing', '123');
    const backup = { ...data([trackerGame(1, played())]), players: [sam, kai, fox, twin, odd] };
    const plan = await planTrackerTransfer(backup, readsOf({ uniqueJerseys: true }), options);
    const reason = (p: TrackerPlayer) => {
      const match = plan.people.get(p.id.toLowerCase())?.match;
      return match?.kind === 'problem' ? match.reason : match?.kind;
    };
    expect([sam, twin, odd, kai].map(reason)).toEqual([
      'number-taken',
      'number-taken',
      'number-not-allowed',
      'add',
    ]);
    expect(plan.ready).toBe(false);
  });

  it('takes the roster as the door does: players only, with the number worn on the game’s day', async () => {
    const samHere = gameUuid(700);
    // Sam wore 4 until 10 January, then 14: the game on the 5th has them as 4.
    const rosters = {
      [homeId]: [
        rosterEntry(samHere, 'Sam Example', '14', { joinedOn: '2026-01-10' }),
        rosterEntry(samHere, 'Sam Example', '4', { leftOn: '2026-01-10' }),
      ],
    };
    const plan = await planTrackerTransfer(
      data([trackerGame(1, played())]),
      readsOf({ rosters }),
      options,
    );
    expect(plan.games[0]?.outcome.kind).toBe('transfer');
    // The same game a week later is played with 14 on, so the tracker's 4 would differ.
    const later = await planTrackerTransfer(
      data([trackerGame(1, played())]),
      readsOf({ rosters, games: [seasonGame(1, { localDate: '2026-01-12' })] }),
      options,
    );
    expect(later.games[0]?.outcome).toMatchObject({
      kind: 'blocked',
      problem: { kind: 'lines-differ' },
    });
    // On the roster only as a coach, Sam is not a player the door takes.
    const coach = await planTrackerTransfer(
      data([trackerGame(1, played())]),
      readsOf({
        rosters: { [homeId]: [rosterEntry(samHere, 'Sam Example', null, { role: 'coach' })] },
      }),
      options,
    );
    expect(coach.people.get(sam.id.toLowerCase())?.match).toEqual({
      kind: 'problem',
      reason: 'not-a-player',
    });
    expect(coach.games[0]?.outcome).toMatchObject({
      kind: 'blocked',
      problem: { kind: 'players-not-here' },
    });
  });

  it('blocks a game whose action puts a player on the other side, as the door would refuse it', async () => {
    const inputs: Input[] = [
      { type: 'lineup', side: 'home', playerIds: [sam.id] },
      { type: 'lineup', side: 'away', playerIds: [fox.id, kai.id] },
      ...played().slice(2),
    ];
    const plan = await planTrackerTransfer(data([trackerGame(1, inputs)]), readsOf(), options);
    expect(plan.games[0]?.outcome).toMatchObject({
      kind: 'blocked',
      problem: { kind: 'refused', seq: 2 },
    });
    expect(plan.ready).toBe(false);
  });
});
