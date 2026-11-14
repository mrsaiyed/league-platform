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
  readonly detailsHref?: string;
  /** The game's page, kept for a game that finishes while the page is open. */
  readonly gameHref: string;
  readonly teamSlugs: readonly string[];
};

export type RoundView = {
  readonly key: string;
  readonly number: number | null;
  readonly title: string;
  readonly phase: 'past' | 'current' | 'upcoming' | null;
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

function whenOf(game: PublicGame, clock: LeagueClock): string {
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
function placeOf(game: PublicGame): string | undefined {
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
  const decided = status === 'final' || status === 'forfeit';
  const gameHref = leagueUrl(league, 'game', { game: game.id, season: seasonSlug });
  const place = placeOf(game);
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
    gameHref,
    ...(decided ? { detailsHref: gameHref } : {}),
    teamSlugs: [game.homeTeam.slug, game.awayTeam.slug],
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
    rounds.push({
      key: round.id,
      number: round.number,
      title: roundTitle(round),
      phase: round.phase,
      summary:
        dateText === null
          ? t.plural('schedule.gamesNoDate', games.length)
          : t.plural('schedule.games', games.length, { date: dateText }),
      open: oneRound !== undefined || round.phase !== 'past',
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
};

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
 * The home page's lists: the latest finished games, newest first; and the games still to
 * play, a live one first, then by start time, games with no time last.
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
  const rank = (g: PublicGame) => (g.status === 'live' ? 0 : 1);
  const upcoming = everyGame
    .filter((g) => g.status === 'live' || g.status === 'scheduled' || g.status === 'postponed')
    .sort((a, b) => rank(a) - rank(b) || nextTime(a) - nextTime(b))
    .slice(0, homeListSize)
    .map(view);
  return { recent, upcoming };
}
