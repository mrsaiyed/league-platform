// Turns the published schedule (step 2.39) into what the home and schedule pages draw:
// each game's words and address, the rounds with their open or closed state, the team
// and round choices, and the home page's recent and upcoming lists. Every word comes from
// the message file (T-187); nothing here reads anything.
import {
  leagueUrl,
  type LeagueAddressee,
  type PublicGame,
  type PublicSchedule,
} from '@srleagues/core';
import type { GameStatus } from '@srleagues/ui';
import type { LeagueClock } from '../../server/public-schedule.ts';
import { locale, t } from '../../server/messages.ts';

export type GameView = {
  readonly id: string;
  readonly home: {
    readonly name: string;
    readonly score: number | null;
    readonly color: string | null;
  };
  readonly away: {
    readonly name: string;
    readonly score: number | null;
    readonly color: string | null;
  };
  readonly status: GameStatus;
  readonly whenText: string;
  /** Where the game is played; left out for a game with no place yet. */
  readonly placeText?: string;
  readonly numberText?: string;
  /**
   * The game's own page, which its card leads to in every state (live, still to play,
   * postponed, cancelled, decided): docs/build/DESIGN.md, section 4, line 11.
   */
  readonly detailsHref: string;
  readonly teamSlugs: readonly string[];
  /**
   * Still marked to be played, but its start has passed (or, with a day and no time, its
   * day is over): it is not still to come and it is not decided, and its card says so in
   * a quiet word of its own instead of standing among the coming games as one of them.
   */
  readonly awaiting?: boolean;
};

export type RoundView = {
  readonly key: string;
  readonly number: number | null;
  readonly title: string;
  readonly phase: 'past' | 'current' | 'upcoming' | null;
  /**
   * What a finished round's mark does not say: that it still holds a game waiting for a new
   * day ("1 game postponed"). Left out for every other round.
   */
  readonly note?: string | undefined;
  readonly summary: string;
  readonly open: boolean;
  readonly games: readonly GameView[];
};

const statuses: readonly GameStatus[] = [
  'scheduled',
  'live',
  'final',
  'forfeit',
  'postponed',
  'cancelled',
];
const statusOf = (value: string): GameStatus => statuses.find((s) => s === value) ?? 'scheduled';

/** How many games the home page lists in each of its two lists. */
export const homeListSize = 5;

function dayText(day: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}

/** The league's own day a game is on (yyyy-mm-dd); null for a game with no day yet. */
function dayOf(game: PublicGame, clock: LeagueClock): string | null {
  if (game.localDate !== null) return game.localDate;
  if (game.startsAt === null) return null;
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: clock.timeZone,
  }).format(new Date(game.startsAt));
}

/** "Oct 31": a day without its weekday, short enough to sit on a card's first line. */
function shortDayText(day: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}

function whenOf(game: PublicGame, clock: LeagueClock): string {
  // A postponed game has no day to come: its old day is said as the day it was postponed
  // from, never bare, as if the game were still on it.
  if (game.status === 'postponed') {
    const day = dayOf(game, clock);
    return day === null
      ? t('schedule.postponedNoDate')
      : t('schedule.postponedFrom', { date: shortDayText(day) });
  }
  if (game.startsAt !== null) {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: clock.timeZone,
    }).format(new Date(game.startsAt));
  }
  return game.localDate !== null
    ? t('schedule.dateAndTimeToBeSet', { date: dayText(game.localDate) })
    : t('schedule.dateToBeSet');
}

/** The venue, and the court when the game has one; undefined for a game with no place yet. */
export function placeOf(game: Pick<PublicGame, 'venue' | 'courtName'>): string | undefined {
  if (game.venue === null) return undefined;
  return game.courtName === null
    ? game.venue.name
    : t('schedule.venueCourt', { venue: game.venue.name, court: game.courtName });
}

export function gameView(
  game: PublicGame,
  clock: LeagueClock,
  league: LeagueAddressee,
  seasonSlug: string,
): GameView {
  const status = statusOf(game.status);
  const place = placeOf(game);
  const day = dayOf(game, clock);
  const awaiting =
    status === 'scheduled' &&
    (game.startsAt !== null
      ? Date.parse(game.startsAt) <= Date.parse(clock.now)
      : day !== null && day < clock.today);
  return {
    id: game.id,
    home: { name: game.homeTeam.name, score: game.homeScore, color: game.homeTeam.color },
    away: { name: game.awayTeam.name, score: game.awayScore, color: game.awayTeam.color },
    status,
    whenText: whenOf(game, clock),
    ...(place === undefined ? {} : { placeText: place }),
    ...(game.number === null
      ? {}
      : { numberText: t('schedule.gameNumber', { number: game.number }) }),
    // Every game has a page, whatever its state, and its card leads there.
    detailsHref: leagueUrl(league, 'game', { game: game.id, season: seasonSlug }),
    teamSlugs: [game.homeTeam.slug, game.awayTeam.slug],
    ...(awaiting ? { awaiting: true } : {}),
  };
}

export type ScheduleChoices = {
  /** A team's short name (`?team=`), or undefined for every team. */
  readonly team?: string | undefined;
  /** A round's number (`?round=`), or undefined for every round. */
  readonly round?: number | undefined;
};

/** The round number a `?round=` value names; undefined for anything else. */
export function parseRound(value: string | undefined): number | undefined {
  return value !== undefined && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : undefined;
}

export const roundTitle = (round: { number: number; label: string | null }): string =>
  round.label ?? t('schedule.roundName', { number: round.number });

export type ScheduleView = {
  readonly rounds: readonly RoundView[];
  /** Every round of the season, for the round picker. */
  readonly roundOptions: readonly { readonly value: string; readonly label: string }[];
  /** Every team that plays, for the team filter. */
  readonly teamOptions: readonly { readonly value: string; readonly label: string }[];
  /** The season has no published game at all. */
  readonly seasonIsEmpty: boolean;
};

export function buildScheduleView(
  schedule: PublicSchedule,
  clock: LeagueClock,
  league: LeagueAddressee,
  choices: ScheduleChoices,
): ScheduleView {
  const everyGame = [...schedule.rounds.flatMap((r) => r.games), ...schedule.unplacedGames];
  const teams = new Map<string, string>();
  for (const g of everyGame) {
    teams.set(g.homeTeam.slug, g.homeTeam.name);
    teams.set(g.awayTeam.slug, g.awayTeam.name);
  }
  const keep = (g: PublicGame) =>
    choices.team === undefined ||
    g.homeTeam.slug === choices.team ||
    g.awayTeam.slug === choices.team;
  const views = (games: readonly PublicGame[]) =>
    games.filter(keep).map((g) => gameView(g, clock, league, schedule.season.slug));
  const oneRound = schedule.rounds.some((r) => r.number === choices.round)
    ? choices.round
    : undefined;
  const rounds: RoundView[] = [];
  for (const round of schedule.rounds) {
    if (oneRound !== undefined && round.number !== oneRound) continue;
    const games = views(round.games);
    // A team's filter hides the rounds it does not play in; an empty round stays so the
    // round list matches the league's own.
    if (choices.team !== undefined && games.length === 0) continue;
    const dateText = round.date === null ? null : dayText(round.date);
    // A finished round that still holds a game waiting for a new day is not finished for
    // that game's teams: it says so beside its mark, and is not folded shut.
    const waiting =
      round.phase === 'past' ? games.filter((g) => g.status === 'postponed').length : 0;
    rounds.push({
      key: round.id,
      number: round.number,
      title: roundTitle(round),
      phase: round.phase,
      ...(waiting === 0 ? {} : { note: t.plural('schedule.postponedCount', waiting) }),
      summary:
        dateText === null
          ? t.plural('schedule.gamesNoDate', games.length)
          : t.plural('schedule.games', games.length, { date: dateText }),
      open: oneRound !== undefined || round.phase !== 'past' || waiting > 0,
      games,
    });
  }
  const unplaced = oneRound === undefined ? views(schedule.unplacedGames) : [];
  if (unplaced.length > 0) {
    rounds.push({
      key: 'other-games',
      number: null,
      title: t('schedule.otherGames'),
      phase: null,
      summary: t.plural('schedule.gamesNoDate', unplaced.length),
      open: true,
      games: unplaced,
    });
  }
  return {
    rounds,
    roundOptions: [
      { value: '', label: t('schedule.allRounds') },
      ...schedule.rounds.map((r) => ({ value: String(r.number), label: roundTitle(r) })),
    ],
    teamOptions: [
      { value: '', label: t('schedule.allTeams') },
      ...[...teams]
        .sort((a, b) => a[1].localeCompare(b[1], locale))
        .map(([value, label]) => ({ value, label })),
    ],
    seasonIsEmpty: everyGame.length === 0,
  };
}

export type HomeGames = {
  readonly recent: readonly GameView[];
  readonly upcoming: readonly GameView[];
  /**
   * Games still marked to be played whose start has passed, latest first: the home page
   * lists them with its results, each saying it is waiting for one, and never among the
   * games to come.
   */
  readonly awaiting: readonly GameView[];
};

/** How many games waiting for a result the home page lists above its results. */
export const homeAwaitingSize = 2;

/** When a game is, for ordering: its start, else noon of its day, else nothing (undefined). */
const timeOf = (g: PublicGame): number | undefined =>
  g.startsAt !== null
    ? Date.parse(g.startsAt)
    : g.localDate !== null
      ? Date.parse(`${g.localDate}T12:00:00Z`)
      : undefined;
/** Games with no time sort last among the finished ones, and last among the coming ones. */
const lastTime = (g: PublicGame): number => timeOf(g) ?? Number.NEGATIVE_INFINITY;
const nextTime = (g: PublicGame): number => timeOf(g) ?? Number.POSITIVE_INFINITY;

/**
 * The order of games still to play, so that the first one listed is the next one a
 * visitor can go to:
 * 1. a game under way;
 * 2. games still to start, soonest first: a start time later than now, or, for a game
 *    with a day and no time yet, a day from today on (after that day's timed games);
 * 3. games whose start has passed with no result, today's included, latest first;
 * 4. games with no day yet;
 * 5. postponed games, which have no day to come until they are given a new one.
 * "Now" and "today" are the league's own (its clock), so a game late on the league's
 * evening is still tonight's when the date has already changed elsewhere.
 */
export function comingOrder(clock: LeagueClock): (a: PublicGame, b: PublicGame) => number {
  const now = Date.parse(clock.now);
  /** Still to start: its time is ahead, or it has only a day and that day is not over. */
  const ahead = (g: PublicGame, day: string): boolean =>
    g.startsAt !== null ? Date.parse(g.startsAt) > now : day >= clock.today;
  const rank = (g: PublicGame): number => {
    if (g.status === 'live') return 0;
    if (g.status === 'postponed') return 4;
    const day = dayOf(g, clock);
    if (day === null) return 3;
    return ahead(g, day) ? 1 : 2;
  };
  return (a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    if (ra !== rb) return ra - rb;
    if (ra === 1) {
      // By day; within a day the games with a time first, by that time.
      const [da, db] = [dayOf(a, clock) ?? '', dayOf(b, clock) ?? ''];
      if (da !== db) return da < db ? -1 : 1;
      if ((a.startsAt === null) !== (b.startsAt === null)) return a.startsAt === null ? 1 : -1;
      return nextTime(a) - nextTime(b);
    }
    // Passed with no result: the latest first. Everything else: earliest first.
    return ra === 2 ? lastTime(b) - lastTime(a) : nextTime(a) - nextTime(b);
  };
}

/**
 * The home page's lists: the latest finished games, newest first; and the games still to
 * play in the order a visitor needs them (comingOrder), followed by the postponed ones
 * still waiting for a new day, which never take a coming game's place in the list.
 */
export function buildHomeGames(
  schedule: PublicSchedule,
  clock: LeagueClock,
  league: LeagueAddressee,
): HomeGames {
  const everyGame = [...schedule.rounds.flatMap((r) => r.games), ...schedule.unplacedGames];
  const view = (g: PublicGame) => gameView(g, clock, league, schedule.season.slug);
  const recent = everyGame
    .filter((g) => g.status === 'final' || g.status === 'forfeit')
    .sort((a, b) => lastTime(b) - lastTime(a))
    .slice(0, homeListSize)
    .map(view);
  const order = comingOrder(clock);
  const coming = everyGame
    .filter((g) => g.status === 'live' || g.status === 'scheduled')
    .sort(order)
    .slice(0, homeListSize);
  const postponed = everyGame
    .filter((g) => g.status === 'postponed')
    .sort(order)
    .slice(0, homeListSize);
  const awaiting = everyGame
    .filter((g) => g.status === 'scheduled')
    .sort((a, b) => lastTime(b) - lastTime(a))
    .map(view)
    .filter((g) => g.awaiting === true)
    .slice(0, homeAwaitingSize);
  return { recent, upcoming: [...coming, ...postponed].map(view), awaiting };
}
