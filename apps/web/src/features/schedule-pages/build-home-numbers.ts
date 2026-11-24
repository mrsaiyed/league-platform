// The four numbers a league's home page opens with: its teams, the games played, the games
// still to play (or, once none is left, the points scored) and the rounds of the season.
// Counted from what the page has already read; nothing here reads anything. Each game is
// counted as its own page shows it (publicGameState, step 2.159): a game whose start has
// passed and waits for its score was played, and a game being corrected was played, with
// its result as it stood.
import type { PublicGameState, PublicSchedule } from '@srleagues/core';
import type { StatStripItem } from '@srleagues/ui';
import { locale, t } from '../../server/messages.ts';
import type { LeagueClock } from '../../server/public-schedule.ts';
import { gameTruth } from './build-schedule.ts';

const played: readonly PublicGameState[] = [
  'final',
  'forfeit',
  'being-corrected',
  'awaiting-score',
];
const toPlay: readonly PublicGameState[] = ['upcoming', 'live', 'postponed'];

export function buildHomeNumbers(
  schedule: PublicSchedule,
  clock: LeagueClock,
  /** How many teams the season's standings list. */
  teamCount: number,
): readonly StatStripItem[] {
  const truths = [
    ...schedule.rounds.flatMap((round) => round.games),
    ...schedule.unplacedGames,
  ].map((game) => gameTruth(game, clock));
  const count = (states: readonly PublicGameState[]) =>
    truths.filter((truth) => states.includes(truth.state)).length;
  const written = new Intl.NumberFormat(locale);
  const left = count(toPlay);
  // A finished season has no games to play, and "0" is no number to open a page with: its
  // third number is the points scored in it: the two scores of every game that was played
  // to its end. A forfeit counts as a game played, but its score is one the league fixed,
  // not points anybody scored, so it adds nothing here. A game being corrected adds the
  // result its page shows, as it stood. (The word "points" is one sport's:
  // it sits in the message file beside the same sport's other words, "PTS" and "points
  // scored" among them, because a sport has no words of its own to take it from yet.)
  const scored = truths.reduce(
    (sum, { result }) =>
      result === null || result.decided !== 'final' ? sum : sum + result.home + result.away,
    0,
  );
  return [
    { key: 'teams', label: t('home.number.teams'), value: written.format(teamCount) },
    { key: 'played', label: t('home.number.played'), value: written.format(count(played)) },
    left === 0 && scored > 0
      ? { key: 'scored', label: t('home.number.scored'), value: written.format(scored) }
      : { key: 'toPlay', label: t.plural('home.number.toPlay', left), value: written.format(left) },
    {
      key: 'rounds',
      label: t('home.number.rounds'),
      value: written.format(schedule.rounds.length),
    },
  ];
}
