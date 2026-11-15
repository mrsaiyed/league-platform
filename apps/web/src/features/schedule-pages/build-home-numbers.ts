// The four numbers a league's home page opens with: its teams, the games played, the games
// still to play and the rounds of the season. Counted from what the page has already read;
// nothing here reads anything.
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
  return [
    { key: 'teams', label: t('home.number.teams'), value: written.format(teamCount) },
    { key: 'played', label: t('home.number.played'), value: written.format(count(played)) },
    { key: 'toPlay', label: t('home.number.toPlay'), value: written.format(count(toPlay)) },
    {
      key: 'rounds',
      label: t('home.number.rounds'),
      value: written.format(schedule.rounds.length),
    },
  ];
}
