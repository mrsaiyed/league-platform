// What the public schedule page and a team's page are given (P7 §4, P2 §4, T-29): each
// shape is built field by field by its query, so nothing private reaches a visitor
// until someone adds it here. Only published games are in it (T3 §8: a game row is a
// published game; the draft lives elsewhere). It holds no person's name: players
// appear only through the one name function (T-81).

/** A season a visitor can pick (P2 §4, `?season=`). A season still being set up is not offered. */
export type PublicSeasonChoice = {
  readonly slug: string;
  readonly name: string;
  /** The program's short name; the sports pages of a league with several programs sit under it. */
  readonly programSlug: string;
  readonly status: 'active' | 'completed';
  /** The program's current season: what the address shows without `?season=`. */
  readonly isCurrent: boolean;
  /** yyyy-mm-dd or null. */
  readonly startsOn: string | null;
  readonly endsOn: string | null;
};

/** A team as a game names it. */
export type PublicGameTeam = {
  readonly id: string;
  /** The short name its address is built from. */
  readonly slug: string;
  readonly name: string;
  readonly color: string | null;
};

/** A published game, as the schedule and team pages show it. */
export type PublicGame = {
  readonly id: string;
  readonly number: number | null;
  /** The moment it starts, as an ISO time, or null when it has no time yet. */
  readonly startsAt: string | null;
  /** The day it starts on in the league's own time zone (yyyy-mm-dd), or null. */
  readonly localDate: string | null;
  /** 'scheduled', 'live', 'final', 'postponed', 'cancelled' or 'forfeit'. */
  readonly status: string;
  readonly homeTeam: PublicGameTeam;
  readonly awayTeam: PublicGameTeam;
  /** Null until the game is decided (or while it is live and only final scores are kept). */
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly divisionName: string | null;
  /** A venue is public: where to turn up. */
  readonly venue: {
    readonly name: string;
    readonly address: string | null;
    readonly mapLink: string | null;
  } | null;
  readonly courtName: string | null;
};

/** Where a round is in time (P7 §4): finished, the one open now, or still to come. */
export type RoundPhase = 'past' | 'current' | 'upcoming';

export type PublicRound = {
  readonly id: string;
  readonly number: number;
  /** "Week 5, Rivalry Week", or null for just the number. */
  readonly label: string | null;
  /** yyyy-mm-dd or null. */
  readonly date: string | null;
  readonly phase: RoundPhase;
  readonly games: readonly PublicGame[];
};

/** The season's schedule and results by round, in round order, games in time order. */
export type PublicSchedule = {
  readonly season: PublicSeasonChoice;
  readonly rounds: readonly PublicRound[];
  /** Published games with no round, in time order (those with no time last). */
  readonly unplacedGames: readonly PublicGame[];
};

/** A round before its phase is known. */
export type RoundToPlace = {
  readonly id: string;
  readonly number: number;
  readonly label: string | null;
  readonly date: string | null;
  readonly games: readonly PublicGame[];
};

/**
 * A round's last day: the latest of its own date and its games' days. A round with no
 * day at all has none yet.
 */
function lastDayOf(round: RoundToPlace): string | null {
  const days = [round.date, ...round.games.map((game) => game.localDate)].filter(
    (day): day is string => day !== null,
  );
  return days.length === 0 ? null : days.reduce((a, b) => (a >= b ? a : b));
}

/**
 * Marks each round past, current or upcoming as of `today` (yyyy-mm-dd, the league's
 * own day). A round is past once its last day has gone; the current one is the first
 * round, in round order, that is not past and is not still without a day, or, when every
 * dated round is past, none; the rest are upcoming. Rounds come back in round order.
 */
export function placeRounds(rounds: readonly RoundToPlace[], today: string): PublicRound[] {
  const ordered = [...rounds].sort((a, b) => a.number - b.number);
  let currentTaken = false;
  return ordered.map((round) => {
    const last = lastDayOf(round);
    let phase: RoundPhase;
    if (last !== null && last < today) phase = 'past';
    else if (last !== null && !currentTaken) {
      currentTaken = true;
      phase = 'current';
    } else phase = 'upcoming';
    return { ...round, phase };
  });
}
