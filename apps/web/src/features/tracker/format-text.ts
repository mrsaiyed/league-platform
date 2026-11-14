// The game format as the scorekeeper is asked to confirm it (P7 §1, §5.1), in the
// message files' words (T-187): the periods and their length, overtime, and the clock.
import type { Translate } from '@srleagues/site';
import type { GameFormat } from './opened-game-storage.ts';

export function formatLines(format: GameFormat, t: Translate, locale: string): readonly string[] {
  const minutes = (seconds: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(seconds / 60);
  return [
    t(format.periods === 2 ? 'tracker.format.halves' : 'tracker.format.quarters', {
      minutes: minutes(format.periodSeconds),
    }),
    t('tracker.format.overtime', { minutes: minutes(format.overtimeSeconds) }),
    t(
      format.clockMode === 'running' ? 'tracker.format.clock.running' : 'tracker.format.clock.stop',
    ),
  ];
}
