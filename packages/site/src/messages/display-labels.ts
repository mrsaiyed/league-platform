// The words the shared display pieces in packages/ui need, taken from the message file
// (T-187). packages/ui holds no words of its own, so a page passes these in. The shapes
// match packages/ui's label types; the web app checks that when it passes them.
import type { Translate } from './messages.ts';

/**
 * What a final game's pill says when it went to overtime (P7 §5.6): "Final, OT" for one,
 * "Final, 2OT" for two. Undefined for a game ended in regulation (0) and one whose
 * overtime is not known (null): those say "Final" alone.
 */
export function finalPillText(
  t: Translate,
  overtimePeriods: number | null | undefined,
): string | undefined {
  return overtimePeriods === null || overtimePeriods === undefined || overtimePeriods < 1
    ? undefined
    : t.plural('display.finalOvertime', overtimePeriods);
}

/**
 * The same as a card's link says it to a screen reader, in place of "final": "final after
 * overtime", "final after 2 overtimes". Undefined where the pill says "Final" alone.
 */
export function finalLinkState(
  t: Translate,
  overtimePeriods: number | null | undefined,
): string | undefined {
  return overtimePeriods === null || overtimePeriods === undefined || overtimePeriods < 1
    ? undefined
    : t.plural('schedule.link.finalOvertime', overtimePeriods);
}

export function displayLabels(t: Translate) {
  return {
    game: {
      live: t('display.live'),
      final: t('display.final'),
      forfeit: t('display.forfeit'),
      postponed: t('display.postponed'),
      cancelled: t('display.cancelled'),
      versus: t('display.versus'),
      winner: t('display.winner'),
      viewBoxScore: t('display.viewBoxScore'),
    },
    scoreboard: {
      scoreboard: t('display.scoreboard'),
      home: t('display.home'),
      away: t('display.away'),
      live: t('display.live'),
      final: t('display.final'),
      winner: t('display.winner'),
    },
    standings: {
      seed: t('display.seed'),
      team: t('display.team'),
      note: t('display.note'),
      notes: t('display.notes'),
    },
    boxScore: {
      jersey: t('display.jersey'),
      jerseyShort: t('display.jerseyShort'),
      player: t('display.player'),
      total: t('display.total'),
      team: t('display.team'),
      noValue: t('display.noValue'),
    },
    stats: { sortBy: t('display.sortBy'), noValue: t('display.noValue') },
    live: t('display.live'),
    round: t('display.round'),
    season: t('display.season'),
    show: t('display.show'),
    filters: t('display.filters'),
  };
}
