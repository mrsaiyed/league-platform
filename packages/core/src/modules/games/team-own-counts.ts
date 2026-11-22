// What a team did that is in no player's line (step 2.196, P7 §5.3; S-26 as changed): a
// turnover charged to the team itself, which the scoring screen offers in every season.
// The engine counts it in the team's turnovers and in no player's (packages/sports,
// `derive`, `teamTurnovers`); the lines a game saves are its players' only (live-game.ts,
// `linesOf`). So the team's own count is read here, by the engine, from the game's saved
// plays: nothing stores it twice, and Undo, Redo and "taken back" are the engine's own.
// A game's page and the season's team totals both read it from here, so the two agree.
import { basketball } from '@srleagues/sports';

export type TeamOwnCount = {
  /** Turnovers charged to the team rather than to a player, as they stand. */
  readonly turnovers: number;
  /** Some player of this team came on: the team has a line the game's totals count. */
  readonly playersPlayed: boolean;
};

export type TeamOwnCounts = { readonly home: TeamOwnCount; readonly away: TeamOwnCount };

const none: TeamOwnCount = { turnovers: 0, playersPlayed: false };
const nothing: TeamOwnCounts = { home: none, away: none };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The engine's document, or undefined for anything it did not write: a game with no
 * saved state (a final score, a box score) has no team plays of its own.
 */
function engineState(stored: unknown): basketball.GameState | undefined {
  return isRecord(stored) &&
    stored['version'] === 1 &&
    Array.isArray(stored['plays']) &&
    Array.isArray(stored['redo']) &&
    isRecord(stored['clock']) &&
    isRecord(stored['rules'])
    ? (stored as basketball.GameState)
    : undefined;
}

/** Each team's own count in a game's saved state; nothing for a state the engine did not write. */
export function teamOwnCounts(stored: unknown): TeamOwnCounts {
  const state = engineState(stored);
  if (state === undefined) return nothing;
  const derived = basketball.derive(state);
  const played = (side: basketball.Side) =>
    Object.values(derived.players).some((line) => line.side === side && line.appeared);
  return {
    home: { turnovers: derived.teams.home.teamTurnovers, playersPlayed: played('home') },
    away: { turnovers: derived.teams.away.teamTurnovers, playersPlayed: played('away') },
  };
}
