// The four numbers a league's home page opens with: its teams, the games played, the games
// still to play (or, once none is left, the points scored) and the rounds of the season.
// Counted from what the page has already read; nothing here reads anything.
import type { PublicSchedule } from '@srleagues/core';
import type { StatStripItem } from '@srleagues/ui';
import { locale, t } from '../../server/messages.ts';

const played: readonly string[] = ['final', 'forfeit'];
const toPlay: readonly string[] = ['scheduled', 'live', 'postponed'];

export function buildHomeNumbers(
  schedule: PublicSchedule,
  /** How many teams the season's standings list. */
  teamCount: number,
): readonly StatStripItem[] {
  const games = [...schedule.rounds.flatMap((round) => round.games), ...schedule.unplacedGames];
  const count = (statuses: readonly string[]) =>
    games.filter((game) => statuses.includes(game.status)).length;
  const written = new Intl.NumberFormat(locale);
  const left = count(toPlay);
  // A finished season has no games to play, and "0" is no number to open a page with: its
  // third number is the points scored in it (every decided game's two scores).
  const scored = games
    .filter((game) => played.includes(game.status))
    .reduce((sum, game) => sum + (game.homeScore ?? 0) + (game.awayScore ?? 0), 0);
  return [
    { key: 'teams', label: t('home.number.teams'), value: written.format(teamCount) },
    { key: 'played', label: t('home.number.played'), value: written.format(count(played)) },
    left === 0 && scored > 0
      ? { key: 'scored', label: t('home.number.scored'), value: written.format(scored) }
      : { key: 'toPlay', label: t('home.number.toPlay'), value: written.format(left) },
    {
      key: 'rounds',
      label: t('home.number.rounds'),
      value: written.format(schedule.rounds.length),
    },
  ];
}
