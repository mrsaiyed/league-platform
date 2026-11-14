// The plan of the Al-Hadi transfer (step 2.58, F-7; P9 §3): for a chosen league and
// season, what it will do with every game the current tracker recorded, worked out
// before anything is written. Its teams are matched to the season's by name (those it
// cannot match are listed), the tracked team's players are found on its roster or are
// to be added with their numbers, and each recorded game is matched by the league's
// game number or by day and teams. Each game to transfer is then played through the
// engine here, as the platform's door will play it, and its box score lines and score
// are compared with the tracker's, so a dry run already shows any difference.
//
// A game is one of:
// - transfer: matched, ended in the tracker, and every line will match;
// - already: transferred before (every action is here and the game is ended), so a
//   second run leaves it alone and only compares its lines again (T-137);
// - skip: not played yet, or still being scored in the tracker;
// - blocked: ended in the tracker but not found here, or found but it cannot be
//   transferred as it is; the plan says why.
// The run starts only when no game is blocked, so a problem known beforehand never
// leaves the season half-transferred.
//
// The other team's players are not brought in unless asked for (`withOpponents`, F-12):
// the step brings in the tracked team's players, whether or not the tracker still lists
// them as active, and none is given a leaving date (F-15). A game whose actions name an
// opponent's player who is not already on that team's roster here is blocked until they
// are. So is a game that names a player who cannot be added (no name, or one word: a
// person needs a first and a last name), until they are put on the roster by hand
// (F-13); and a game here that already has a result entered by hand or imported, until
// it is reopened here (F-14). The tracked team's players who cannot be added are listed
// (`notBroughtOver`) even when no game names them.
//
// The roster is read as the door for the tracker reads it, so nothing the plan lets
// through is refused part-way through a game: only player and captain entries count, an
// action's players must be on the roster of its side's team, and a player's number is
// the one on the entry they had on the game's day.
import type { SeasonRules } from '@srleagues/contracts';
import { engineRulesOf } from '../games/index.ts';
import { compareLines, type ComparableLine, type LineDifference } from './tracker-lines.ts';
import {
  localDateOf,
  matchTrackerGame,
  matchTrackerPlayers,
  matchTrackerTeams,
  nameKey,
  playingRoles,
  type GameMatch,
  type PlayerMatch,
  type TeamMatch,
} from './tracker-matching.ts';
import {
  playersNamed,
  playersOf,
  readReplay,
  replaySteps,
  simulateReplay,
  type Replay,
  type Simulation,
} from './tracker-replay.ts';
import type {
  PlatformGameFact,
  RosterPersonFact,
  TrackerData,
  TrackerGame,
  TrackerPlayer,
  TrackerTransferReads,
} from './tracker-transfer-data.ts';
import { wrongSideRefusal } from './tracker-transfer-words.ts';

export type GameFormat = Replay['format'];

export type GameProblem =
  | { readonly kind: 'unreadable-action'; readonly seq: number }
  | { readonly kind: 'unreadable-state' }
  | { readonly kind: 'game-not-found' }
  /** Ended in the tracker, but no game of the season is it. */
  | {
      readonly kind: 'not-matched';
      readonly reason: Extract<GameMatch, { kind: 'unmatched' }>['reason'];
    }
  | { readonly kind: 'not-playable'; readonly status: string }
  | { readonly kind: 'result-entered' }
  | { readonly kind: 'scored-here' }
  | { readonly kind: 'format-differs'; readonly tracker: GameFormat; readonly here: GameFormat }
  | { readonly kind: 'refused'; readonly seq: number; readonly message: string }
  | { readonly kind: 'tie-not-allowed' }
  | { readonly kind: 'not-ended' }
  | {
      readonly kind: 'score-differs';
      readonly tracker: { readonly home: number; readonly away: number };
      readonly here: { readonly home: number; readonly away: number };
    }
  /**
   * Players the actions name who are not here and will not be added; of them, those
   * `withOpponents` would bring in (the rest cannot be added as they are).
   */
  | {
      readonly kind: 'players-not-here';
      readonly playerIds: readonly string[];
      readonly withOpponents: readonly string[];
    }
  | { readonly kind: 'lines-differ'; readonly differences: readonly LineDifference[] };

export type GameOutcome =
  | {
      readonly kind: 'transfer';
      readonly gameId: string;
      readonly replay: Replay;
      /** Some of its actions are here already (an earlier run stopped part-way). */
      readonly resume: boolean;
    }
  | { readonly kind: 'already'; readonly gameId: string; readonly replay: Replay }
  | { readonly kind: 'skip'; readonly reason: 'not-played' | 'still-live' }
  | { readonly kind: 'blocked'; readonly gameId: string | null; readonly problem: GameProblem };

export type PlannedGame = {
  readonly game: TrackerGame;
  readonly match: GameMatch;
  readonly outcome: GameOutcome;
};

export type PlannedPerson = {
  readonly player: TrackerPlayer;
  /** The team here the player's tracker team is. */
  readonly teamId: string;
  readonly tracked: boolean;
  readonly match: PlayerMatch;
};

export type TransferPlan = {
  /** Why nothing can be planned at all, or null. */
  readonly problem: 'no-tracked-team' | 'tracked-team-not-matched' | null;
  readonly trackedTeamId: string | null;
  readonly teams: ReadonlyMap<string, TeamMatch>;
  /** The players found here or to be added, by tracker player id in lower case. */
  readonly people: ReadonlyMap<string, PlannedPerson>;
  readonly games: readonly PlannedGame[];
  /**
   * The tracked team's players (tracker ids in lower case) who will not be brought over:
   * found on no roster here and they cannot be added as they are (`people` says why).
   * A game that names one is blocked; one no game names does not stop the run, but the
   * transfer is not complete until they are put on the roster by hand.
   */
  readonly notBroughtOver: readonly string[];
  /** True when the run may start: nothing is blocked. */
  readonly ready: boolean;
};

export type PlanOptions = {
  /** Bring in the other teams' players the transferred games name, too. */
  readonly withOpponents: boolean;
  /** The time the run happens at (ms): when a reopen between parts is made. */
  readonly now: number;
};

const isDecided = (status: string) => status === 'final' || status === 'forfeit';
const lower = (id: string) => id.toLowerCase();

/** The format the platform plays a game in, in the tracker's terms. */
const formatOf = (rules: SeasonRules): GameFormat => {
  const engine = engineRulesOf(rules);
  return {
    periods: engine.periods,
    periodSeconds: engine.periodSeconds,
    overtimeSeconds: engine.overtimeSeconds,
  };
};

const sameFormat = (a: GameFormat, b: GameFormat) =>
  a.periods === b.periods &&
  a.periodSeconds === b.periodSeconds &&
  a.overtimeSeconds === b.overtimeSeconds;

/** A game found and readable, before its players are known. */
type Candidate = {
  readonly game: TrackerGame;
  readonly match: Extract<GameMatch, { kind: 'matched' }>;
  readonly replay: Replay;
  readonly fact: PlatformGameFact;
  readonly already: boolean;
};

/** What the first look at a game came to: settled, or a candidate to check further. */
type FirstLook = PlannedGame | Candidate;
const isCandidate = (look: FirstLook): look is Candidate => 'replay' in look;

async function firstLook(
  game: TrackerGame,
  teams: ReadonlyMap<string, TeamMatch>,
  reads: TrackerTransferReads,
): Promise<FirstLook> {
  const match = matchTrackerGame(game, teams, reads.games, reads.timeZone);
  const settled = (outcome: GameOutcome): PlannedGame => ({ game, match, outcome });
  if (game.status === 'scheduled' && game.events.length === 0) {
    return settled({ kind: 'skip', reason: 'not-played' });
  }
  if (game.status !== 'final') return settled({ kind: 'skip', reason: 'still-live' });
  // A game the tracker ended is one the season played: not finding it here is a problem
  // to put right, never a game quietly left behind.
  if (match.kind !== 'matched') {
    return settled({
      kind: 'blocked',
      gameId: null,
      problem: { kind: 'not-matched', reason: match.reason },
    });
  }
  const blocked = (problem: GameProblem) =>
    settled({ kind: 'blocked', gameId: match.gameId, problem });
  const read = readReplay(game);
  if (!read.ok) return blocked(read.problem);
  const replay = read.replay;
  const ids = replaySteps(replay).map((step) => step.commandId);
  const fact = await reads.game(match.gameId, ids);
  if (fact === undefined) return blocked({ kind: 'game-not-found' });
  const taken = ids.filter((id) => fact.taken.has(id)).length;
  if (isDecided(fact.status) && taken === ids.length && fact.tracked) {
    return { game, match, replay, fact, already: true };
  }
  if (!isDecided(fact.status) && fact.status !== 'scheduled' && fact.status !== 'live') {
    return blocked({ kind: 'not-playable', status: fact.status });
  }
  if (isDecided(fact.status) && !fact.tracked) return blocked({ kind: 'result-entered' });
  if (fact.tracked && taken === 0) return blocked({ kind: 'scored-here' });
  const here = formatOf(fact.rules);
  if (!sameFormat(here, replay.format)) {
    return blocked({ kind: 'format-differs', tracker: replay.format, here });
  }
  return { game, match, replay, fact, already: false };
}

/** The lines the simulation gives, as they will be saved here. */
function simulatedLines(
  simulation: Extract<Simulation, { ok: true }>,
  homeTeamId: string,
  awayTeamId: string,
  jerseyOf: (playerId: string) => string | null,
): ReadonlyMap<string, ComparableLine> {
  const lines = new Map<string, ComparableLine>();
  for (const [playerId, line] of simulation.lines) {
    lines.set(playerId, {
      teamId: line.side === 'home' ? homeTeamId : awayTeamId,
      jerseyNumber: jerseyOf(playerId),
      played: line.appeared,
      secondsPlayed: Math.floor(line.ms / 1000),
      stats: {
        points: line.points,
        fg1: line.fg1,
        fg2: line.fg2,
        fg3: line.fg3,
        fouls: line.fouls,
        turnovers: line.turnovers,
      },
    });
  }
  return lines;
}

/** Whether the run adds this player as a person on their team's roster. */
export const isToAdd = (person: PlannedPerson, options: Pick<PlanOptions, 'withOpponents'>) =>
  person.match.kind === 'add' && (person.tracked || options.withOpponents);

/** Whether the player is a person here, or will be once the run has added people. */
const willBeHere = (person: PlannedPerson, options: Pick<PlanOptions, 'withOpponents'>) =>
  person.match.kind === 'on-roster' || isToAdd(person, options);

/** Whether a roster entry is on the team on a day (YYYY-MM-DD), as list-game-players reads it. */
const isOnTeamOn = (entry: RosterPersonFact, day: string) =>
  (entry.joinedOn === null || entry.joinedOn <= day) &&
  (entry.leftOn === null || day < entry.leftOn);

/**
 * A planned player's number in a game played on `day`, as the door for the tracker gives
 * it: of the person's player or captain entries on the team, the one on the team that
 * day, else the one with no leaving date, else the first to leave, which is the order
 * games.apply_tracker_commands reads a roster in (list-game-players, rosterOf). One to
 * be added has the number they are added with.
 */
function numberOnDay(
  person: PlannedPerson | undefined,
  roster: readonly RosterPersonFact[],
  day: string,
): string | null {
  const match = person?.match;
  if (match?.kind === 'add') return match.jerseyNumber;
  if (match?.kind !== 'on-roster') return null;
  const entries = roster.filter(
    (entry) => lower(entry.personId) === lower(match.personId) && playingRoles.has(entry.role),
  );
  const rank = (entry: RosterPersonFact) => (isOnTeamOn(entry, day) ? 0 : 1);
  const leaving = (entry: RosterPersonFact) => entry.leftOn ?? '';
  const [first] = [...entries].sort(
    (a, b) => rank(a) - rank(b) || leaving(a).localeCompare(leaving(b)),
  );
  return first?.jerseyNumber ?? null;
}

/**
 * The first action the door would refuse because it names a player on the other side:
 * it takes a player only on the roster of the team the action's side is (playerProblem).
 */
function sideProblem(
  replay: Replay,
  people: ReadonlyMap<string, PlannedPerson>,
  sides: { readonly home: string; readonly away: string },
): GameProblem | undefined {
  for (const step of replaySteps(replay)) {
    const input = step.input;
    if (!('side' in input)) continue;
    const teamId = sides[input.side];
    const wrong = playersOf(input).some((id) => people.get(lower(id))?.teamId !== teamId);
    if (wrong) {
      return { kind: 'refused', seq: step.seq, message: wrongSideRefusal };
    }
  }
  return undefined;
}

/**
 * Each player to be added who is already a person in the league's list, on no roster:
 * the one an earlier run added just before it was cut off, so a rerun puts them on the
 * team rather than adding them twice. Only the whole first and last name is theirs, and
 * each listed person goes to one player only, in the plan's order; anyone over is added.
 * Someone the league added by hand with the same full name and put on no team is taken
 * to be the player too (F-16, decided for the founder): the dry run says so for each.
 */
async function findListedPeople(
  people: Map<string, PlannedPerson>,
  reads: TrackerTransferReads,
  options: Pick<PlanOptions, 'withOpponents'>,
): Promise<void> {
  const used = new Set<string>();
  for (const person of people.values()) {
    if (person.match.kind === 'on-roster') used.add(lower(person.match.personId));
  }
  const listed = new Map<string, string[]>();
  for (const [id, person] of people) {
    const match = person.match;
    if (match.kind !== 'add' || !isToAdd(person, options)) continue;
    const key = nameKey(`${match.firstName} ${match.lastName}`);
    let free = listed.get(key);
    if (free === undefined) {
      free = (await reads.peopleOffRosters(`${match.firstName} ${match.lastName}`))
        .filter((p) => nameKey(`${p.firstName} ${p.lastName}`) === key)
        .map((p) => lower(p.personId))
        .sort();
      listed.set(key, free);
    }
    const personId = free.find((candidate) => !used.has(candidate));
    if (personId === undefined) continue;
    used.add(personId);
    people.set(id, { ...person, match: { ...match, personId } });
  }
}

/**
 * Where the season asks for unique jersey numbers, a player to be added with a number
 * someone on the team here wears now, or another player to be added on the team has
 * too, cannot be: the roster would refuse them after they were made a person (0008).
 */
function checkNumbers(
  people: Map<string, PlannedPerson>,
  rosters: ReadonlyMap<string, readonly RosterPersonFact[]>,
  uniqueJerseys: boolean,
  options: Pick<PlanOptions, 'withOpponents'>,
): void {
  if (!uniqueJerseys) return;
  const wearers = new Map<string, number>();
  const count = (teamId: string, jersey: string) => {
    const key = `${teamId}:${jersey}`;
    wearers.set(key, (wearers.get(key) ?? 0) + 1);
  };
  for (const [teamId, roster] of rosters) {
    for (const entry of roster) {
      if (entry.leftOn === null && entry.jerseyNumber !== null) count(teamId, entry.jerseyNumber);
    }
  }
  const adding = [...people].filter(([, person]) => isToAdd(person, options));
  for (const [, person] of adding) {
    if (person.match.kind === 'add' && person.match.jerseyNumber !== null) {
      count(person.teamId, person.match.jerseyNumber);
    }
  }
  for (const [id, person] of adding) {
    const jersey = person.match.kind === 'add' ? person.match.jerseyNumber : null;
    if (jersey !== null && (wearers.get(`${person.teamId}:${jersey}`) ?? 0) > 1) {
      people.set(id, { ...person, match: { kind: 'problem', reason: 'number-taken' } });
    }
  }
}

/** Works out the whole transfer, reading the platform but writing nothing. */
export async function planTrackerTransfer(
  data: TrackerData,
  reads: TrackerTransferReads,
  options: PlanOptions,
): Promise<TransferPlan> {
  const teams = matchTrackerTeams(data.teams, reads.teams);
  const tracked = data.teams.filter((team) => team.tracked);
  const trackedTeam = tracked.length === 1 ? tracked[0] : undefined;
  const trackedMatch = trackedTeam === undefined ? undefined : teams.get(trackedTeam.id);
  const nothing = (problem: TransferPlan['problem']): TransferPlan => ({
    problem,
    trackedTeamId: null,
    teams,
    people: new Map(),
    games: [],
    notBroughtOver: [],
    ready: false,
  });
  if (trackedTeam === undefined) return nothing('no-tracked-team');
  if (trackedMatch?.kind !== 'matched') return nothing('tracked-team-not-matched');

  const looks: FirstLook[] = [];
  for (const game of data.games) looks.push(await firstLook(game, teams, reads));
  const candidates = looks.filter(isCandidate);

  // The players to find: the tracked team's, and anyone the candidates' actions name.
  const playerById = new Map(data.players.map((player) => [lower(player.id), player]));
  const wanted = new Map<string, TrackerPlayer>();
  for (const player of data.players) {
    if (player.teamId === trackedTeam.id) wanted.set(lower(player.id), player);
  }
  for (const candidate of candidates) {
    for (const id of playersNamed(candidate.replay)) {
      const player = playerById.get(id);
      if (player !== undefined) wanted.set(id, player);
    }
  }
  const people = new Map<string, PlannedPerson>();
  const byTeam = new Map<string, TrackerPlayer[]>();
  for (const player of wanted.values()) {
    byTeam.set(player.teamId, [...(byTeam.get(player.teamId) ?? []), player]);
  }
  const rosters = new Map<string, readonly RosterPersonFact[]>();
  for (const [trackerTeamId, players] of byTeam) {
    const team = teams.get(trackerTeamId);
    if (team?.kind !== 'matched') continue;
    const roster = await reads.roster(team.teamId);
    rosters.set(team.teamId, roster);
    const matches = matchTrackerPlayers(players, roster);
    for (const player of players) {
      const match = matches.get(player.id);
      if (match === undefined) continue;
      const isTracked = trackerTeamId === trackedTeam.id;
      people.set(lower(player.id), { player, teamId: team.teamId, tracked: isTracked, match });
    }
  }
  await findListedPeople(people, reads, options);
  checkNumbers(people, rosters, reads.uniqueJerseys, options);
  /** Whether a player will be a person here once the people are added. */
  const usable = (id: string) => {
    const person = people.get(id);
    return person !== undefined && willBeHere(person, options);
  };

  const games = looks.map((look): PlannedGame => {
    if (!isCandidate(look)) return look;
    const { game, match, replay, fact } = look;
    const blocked = (problem: GameProblem): PlannedGame => ({
      game,
      match,
      outcome: { kind: 'blocked', gameId: match.gameId, problem },
    });
    const missing = [...playersNamed(replay)].filter((id) => !usable(id));
    if (missing.length > 0) {
      const addable = missing.filter((id) => people.get(id)?.match.kind === 'add');
      return blocked({ kind: 'players-not-here', playerIds: missing, withOpponents: addable });
    }
    const homeTeam = teams.get(game.homeTeamId);
    const awayTeam = teams.get(game.awayTeamId);
    const sides = {
      home: homeTeam?.kind === 'matched' ? homeTeam.teamId : '',
      away: awayTeam?.kind === 'matched' ? awayTeam.teamId : '',
    };
    const wrongSide = sideProblem(replay, people, sides);
    if (wrongSide !== undefined) return blocked(wrongSide);
    const simulation = simulateReplay(
      replay,
      engineRulesOf(fact.rules),
      fact.rules.allowTies,
      options.now,
    );
    if (!simulation.ok) return blocked(simulation.problem);
    if (simulation.status !== 'final') return blocked({ kind: 'not-ended' });
    if (simulation.score.home !== game.homeScore || simulation.score.away !== game.awayScore) {
      return blocked({
        kind: 'score-differs',
        tracker: { home: game.homeScore, away: game.awayScore },
        here: simulation.score,
      });
    }
    const teamOf = (trackerTeamId: string) => {
      const found = teams.get(trackerTeamId);
      return found?.kind === 'matched' ? found.teamId : undefined;
    };
    // The game's day here, as the door judges the roster by it: a game with no time yet
    // is judged by the league's today.
    const day =
      reads.games.find((g) => g.id === match.gameId)?.localDate ??
      localDateOf(new Date(options.now).toISOString(), reads.timeZone) ??
      '';
    const lines = simulatedLines(simulation, sides.home, sides.away, (id) => {
      const person = people.get(id);
      return numberOnDay(person, rosters.get(person?.teamId ?? '') ?? [], day);
    });
    const differences = compareLines(game.lines, lines, [], teamOf);
    if (differences.length > 0) return blocked({ kind: 'lines-differ', differences });
    const outcome: GameOutcome = look.already
      ? { kind: 'already', gameId: match.gameId, replay }
      : { kind: 'transfer', gameId: match.gameId, replay, resume: fact.tracked };
    return { game, match, outcome };
  });

  const notBroughtOver = [...people]
    .filter(([, person]) => person.tracked && person.match.kind === 'problem')
    .map(([id]) => id);
  return {
    problem: null,
    trackedTeamId: trackedMatch.teamId,
    teams,
    people,
    games,
    notBroughtOver,
    ready: games.every((planned) => planned.outcome.kind !== 'blocked'),
  };
}
