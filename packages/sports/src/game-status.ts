// A game's status, as the games table holds it (T3 §8). Shared by the standings and
// the statistics, which each decide which statuses count for them.
export type GameStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled' | 'forfeit';
