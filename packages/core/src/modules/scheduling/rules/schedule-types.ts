// The shapes the schedule rules work on (P7 §4.3, §4.4; T3 §8). Pure data, no storage.

/** A game's place in the schedule. Dates are YYYY-MM-DD, times HH:MM (24-hour) or null. */
export type ScheduleSlot = {
  roundId: string | null;
  date: string;
  time: string | null;
  venueId: string | null;
  /** The canonical court name, compared exactly. */
  court: string | null;
};

export type ScheduleGame = ScheduleSlot & {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  /** Postponed and cancelled games hold no place, so they never clash. */
  status: 'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled' | 'forfeit';
};

export type ScheduleRound = {
  id: string;
  label: string;
  /** The round's date, or null when it has none. */
  date: string | null;
};

export type ScheduleState = {
  rounds: ScheduleRound[];
  games: ScheduleGame[];
};

export type DraftChange =
  | { kind: 'add-game'; game: ScheduleGame }
  | { kind: 'move-game'; gameId: string; to: ScheduleSlot }
  | { kind: 'swap-games'; gameId: string; otherGameId: string }
  | { kind: 'remove-game'; gameId: string }
  | { kind: 'rename-round'; roundId: string; label: string }
  | { kind: 'change-round-date'; roundId: string; date: string };

export type ChangeError =
  | { code: 'unknown-game'; gameId: string }
  | { code: 'unknown-round'; roundId: string }
  | { code: 'game-exists'; gameId: string }
  | { code: 'team-plays-itself'; gameId: string }
  | { code: 'swap-with-itself'; gameId: string }
  | { code: 'empty-round-label'; roundId: string };

export type Clash =
  | {
      kind: 'team-in-two-places';
      teamId: string;
      date: string;
      time: string;
      gameIds: string[];
    }
  | {
      kind: 'court-booked-twice';
      venueId: string | null;
      court: string;
      date: string;
      time: string;
      gameIds: string[];
    }
  | { kind: 'skipped-date'; gameId: string; date: string };
