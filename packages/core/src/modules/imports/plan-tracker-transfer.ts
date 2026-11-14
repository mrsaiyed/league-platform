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
// - skip: not played yet, still being scored in the tracker, or not found here;
// - blocked: found, but it cannot be transferred as it is; the plan says why.
// The run starts only when no game is blocked, so a problem known beforehand never
// leaves the season half-transferred.
//
// The other team's players are not brought in unless asked for (`withOpponents`): the
// step brings in the tracked team's players. A game whose actions name an opponent's
// player who is not already on that team's roster here is blocked until they are.
import type { SeasonRules } from '@srleagues/contracts';
import { engineRulesOf } from '../games/index.ts';
import { compareLines, type ComparableLine, type LineDifference } from './tracker-lines.ts';
import {
  matchTrackerGame,
  matchTrackerPlayers,
  matchTrackerTeams,
  type GameMatch,
  type PlayerMatch,
  type TeamMatch,
} from './tracker-matching.ts';
import {
  playersNamed,
  readReplay,
  replaySteps,
  simulateReplay,
  type Replay,
  type Simulation,
} from './tracker-replay.ts';
import type {
  PlatformGameFact,
  TrackerData,
  TrackerGame,
  TrackerPlayer,
  TrackerTransferReads,
} from './tracker-transfer-data.ts';

export type GameFormat = Replay['format'];

export type GameProblem =
  | { readonly kind: 'unreadable-action'; readonly seq: number }
  | { readonly kind: 'unreadable-state' }
  | { readonly kind: 'game-not-found' }
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
  /** Players the actions name who are not here and will not be added. */
  | { readonly kind: 'players-not-here'; readonly playerIds: readonly string[] }
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
  | { readonly kind: 'skip'; readonly reason: 'not-played' | 'still-live' | 'not-matched' }
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
  if (match.kind !== 'matched') return settled({ kind: 'skip', reason: 'not-matched' });
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

/** The person a planned player is or will be: their roster number here. */
const jerseyOfMatch = (match: PlayerMatch | undefined) =>
  match?.kind === 'on-roster' || match?.kind === 'add' ? match.jerseyNumber : null;

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
  for (const [trackerTeamId, players] of byTeam) {
    const team = teams.get(trackerTeamId);
    if (team?.kind !== 'matched') continue;
    const matches = matchTrackerPlayers(players, await reads.roster(team.teamId));
    for (const player of players) {
      const match = matches.get(player.id);
      if (match === undefined) continue;
      const isTracked = trackerTeamId === trackedTeam.id;
      people.set(lower(player.id), { player, teamId: team.teamId, tracked: isTracked, match });
    }
  }
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
    if (missing.length > 0) return blocked({ kind: 'players-not-here', playerIds: missing });
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
    const homeTeam = teams.get(game.homeTeamId);
    const awayTeam = teams.get(game.awayTeamId);
    const teamOf = (trackerTeamId: string) => {
      const found = teams.get(trackerTeamId);
      return found?.kind === 'matched' ? found.teamId : undefined;
    };
    const lines = simulatedLines(
      simulation,
      homeTeam?.kind === 'matched' ? homeTeam.teamId : '',
      awayTeam?.kind === 'matched' ? awayTeam.teamId : '',
      (id) => jerseyOfMatch(people.get(id)?.match),
    );
    const differences = compareLines(game.lines, lines, [], teamOf);
    if (differences.length > 0) return blocked({ kind: 'lines-differ', differences });
    const outcome: GameOutcome = look.already
      ? { kind: 'already', gameId: match.gameId, replay }
      : { kind: 'transfer', gameId: match.gameId, replay, resume: fact.tracked };
    return { game, match, outcome };
  });

  return {
    problem: null,
    trackedTeamId: trackedMatch.teamId,
    teams,
    people,
    games,
    ready: games.every((planned) => planned.outcome.kind !== 'blocked'),
  };
}
