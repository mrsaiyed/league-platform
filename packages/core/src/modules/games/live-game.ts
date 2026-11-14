// What applying the tracker's commands (step 2.29) needs besides the engine: reading a
// saved state, the box score lines a state gives, and the checks the platform makes on
// a command before the engine sees it. The engine (packages/sports) is used as it is
// (T-110); the Al-Hadi tracker's server makes the same player check (apps/live-stats).
import type { TrackerCommand } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import type { GamePlayer, GameRecord, LiveGameLine } from './ports.ts';

/** The engine's command as the tracker sends it (the current protocol's shape). */
export type TrackerInput = TrackerCommand['input'];

/**
 * A saved state, read as the engine's document. Only states this server wrote are
 * saved, so anything else is a fault, not a refusal.
 */
export function readState(stored: unknown): basketball.GameState {
  if (
    typeof stored !== 'object' ||
    stored === null ||
    (stored as { version?: unknown }).version !== 1 ||
    !Array.isArray((stored as { plays?: unknown }).plays)
  ) {
    throw new Error('A saved game state is not the engine’s version 1 document.');
  }
  return stored as basketball.GameState;
}

/**
 * Commands the platform takes through other doors, refused here with the reason:
 * the rules come from the league (S-1), and ending or reopening a game is a step of
 * its own that also settles the box score and the standings (step 2.30, T6 §7, §8).
 * Resetting is refused too: it wipes the plays and the lines and puts a live game back
 * to scheduled, which must leave a trace in the activity log, so a game is reset
 * through a later step's own command, not through the tracker's taps.
 */
export function platformProblem(input: TrackerInput): string | undefined {
  if (input.type === 'rules') return 'The game’s rules come from the league’s settings.';
  if (input.type === 'end') return 'Ending a game is not taken here yet.';
  if (input.type === 'reopen') return 'Reopening a game is not taken here yet.';
  if (input.type === 'reset') return 'Resetting a game is not taken here yet.';
  return undefined;
}

const lower = (id: string) => id.toLowerCase();

/**
 * The command with its player ids in lower case, as the database spells them. The
 * engine compares ids as text, so one player sent as `AB…` and as `ab…` would
 * otherwise count as two, and the second's line would replace the first's.
 */
export function withLowerIds(input: TrackerInput): TrackerInput {
  switch (input.type) {
    case 'lineup':
      return { ...input, playerIds: input.playerIds.map(lower) };
    case 'sub':
      return { ...input, inId: lower(input.inId), outId: lower(input.outId) };
    case 'score':
    case 'foul':
    case 'unfoul':
    case 'turnover':
    case 'unturnover':
      return { ...input, playerId: lower(input.playerId) };
    default:
      return input;
  }
}

/**
 * The game's rules put into a state that has not started (S-1): one that is still
 * scheduled and whose clock has never run holds only line-ups, so it takes the rules
 * the game has now, as if it were made today. The clock moves to the new first
 * period unless the scorer set it by hand. A state that has started keeps its rules.
 */
export function withCurrentRules(
  state: basketball.GameState,
  rules: basketball.Rules,
): basketball.GameState {
  if (state.status !== 'scheduled' || state.clock.running || state.clock.elapsedMs > 0) {
    return state;
  }
  const untouched = state.clock.remainingMs === basketball.periodMs(state.rules, 1);
  return {
    ...state,
    rules: { ...rules },
    clock: {
      ...state.clock,
      remainingMs: untouched ? basketball.periodMs(rules, 1) : state.clock.remainingMs,
    },
  };
}

/** The players a command names. A team's own play (a timeout, a team turnover) names none. */
function playersNamed(input: TrackerInput): readonly string[] {
  switch (input.type) {
    case 'lineup':
      return input.playerIds;
    case 'sub':
      return [input.inId, input.outId];
    case 'score':
    case 'foul':
    case 'unfoul':
    case 'turnover':
    case 'unturnover':
      return [input.playerId];
    default:
      return [];
  }
}

/** The team a side of the game is. */
export const teamOfSide = (game: GameRecord, side: basketball.Side) =>
  side === 'home' ? game.homeTeamId : game.awayTeamId;

/** A player key: one person on one team. */
const keyOf = (teamId: string, personId: string) => `${teamId}|${personId}`;

/** The game's players by team and person. */
export function rosterOf(players: readonly GamePlayer[]): ReadonlyMap<string, GamePlayer> {
  const byKey = new Map<string, GamePlayer>();
  for (const player of players) {
    const key = keyOf(player.teamId, player.personId.toLowerCase());
    // Listed with the current entry first (one who left and rejoined): keep that one.
    if (!byKey.has(key)) byKey.set(key, player);
  }
  return byKey;
}

/** Why a command naming someone not on that side's roster is refused, or undefined. */
export function playerProblem(
  game: GameRecord,
  roster: ReadonlyMap<string, GamePlayer>,
  input: TrackerInput,
): string | undefined {
  if (!('side' in input)) return undefined;
  const teamId = teamOfSide(game, input.side);
  const named = playersNamed(input);
  return named.some((id) => !roster.has(keyOf(teamId, id.toLowerCase())))
    ? 'That player is not on this team. Reload the roster.'
    : undefined;
}

/**
 * The box score lines a state gives, by person: whether they played, their time on
 * court in whole seconds, and the counts the Al-Hadi tracker keeps (T3 §8). The number
 * is the one on their roster entry.
 */
export function linesOf(
  game: GameRecord,
  roster: ReadonlyMap<string, GamePlayer>,
  state: basketball.GameState,
): ReadonlyMap<string, LiveGameLine> {
  const lines = new Map<string, LiveGameLine>();
  for (const [personId, line] of Object.entries(basketball.derive(state).players)) {
    const teamId = teamOfSide(game, line.side);
    lines.set(personId.toLowerCase(), {
      gameId: game.id,
      teamId,
      personId: personId.toLowerCase(),
      jerseyNumber: roster.get(keyOf(teamId, personId.toLowerCase()))?.jerseyNumber ?? null,
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

const sameLine = (a: LiveGameLine, b: LiveGameLine) => JSON.stringify(a) === JSON.stringify(b);

/** The lines to write (new or changed) and the people whose lines are gone (undone). */
export function changedLines(
  before: ReadonlyMap<string, LiveGameLine>,
  after: ReadonlyMap<string, LiveGameLine>,
): { readonly lines: LiveGameLine[]; readonly removed: string[] } {
  const lines = [...after.values()].filter((line) => {
    const old = before.get(line.personId);
    return old === undefined || !sameLine(old, line);
  });
  const removed = [...before.keys()].filter((personId) => !after.has(personId));
  return { lines, removed };
}

/** The score each side has in a state. */
export function scoreOf(state: basketball.GameState): { home: number; away: number } {
  const teams = basketball.derive(state).teams;
  return { home: teams.home.score, away: teams.away.score };
}
