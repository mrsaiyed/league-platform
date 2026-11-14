// The words the shared display pieces in packages/ui need, taken from the message file
// (T-187). packages/ui holds no words of its own, so a page passes these in. The shapes
// match packages/ui's label types; the web app checks that when it passes them.
import type { Translate } from './messages.ts';

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
      player: t('display.player'),
      total: t('display.total'),
    },
    stats: { sortBy: t('display.sortBy') },
    live: t('display.live'),
    round: t('display.round'),
    season: t('display.season'),
    show: t('display.show'),
    filters: t('display.filters'),
  };
}
