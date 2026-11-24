// One game's format in the message files' words (step 2.119; S-39, T-187): every rule as
// the start confirmation lists it, the clock mode included, and the one line said back
// once a format is saved (checklist B4).
import type { FormatFact, GameFormatRefusal, GameFormatRules } from '@srleagues/contracts';
import type { Translate } from '@srleagues/site';

const minutesOf = (seconds: number, locale: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(seconds / 60);

/** One rule's line; a rule that is "none" says so. */
export function factLine(fact: FormatFact, t: Translate, locale: string): string {
  const { value } = fact;
  const count = typeof value === 'number' ? value : 0;
  const k = 'tracker.formatChange.fact';
  switch (fact.fact) {
    case 'periods':
      return t(value === 4 ? `${k}.quarters` : `${k}.halves`);
    case 'periodSeconds':
      return t(`${k}.length`, { minutes: minutesOf(count, locale) });
    case 'overtimeSeconds':
      return t('tracker.format.overtime', { minutes: minutesOf(count, locale) });
    case 'clockMode':
      return t(value === 'running' ? 'tracker.format.clock.running' : 'tracker.format.clock.stop');
    case 'stopClockLastSeconds':
      return value === null ? t(`${k}.stop.none`) : t(`${k}.stop`, { count });
    case 'stopClockScope':
      return value === 'game'
        ? t(`${k}.scope.game`)
        : value === 'period'
          ? t(`${k}.scope.period`)
          : t(`${k}.scope.half`);
    case 'mercyLead':
      return value === null ? t(`${k}.mercy.none`) : t(`${k}.mercy`, { count });
    case 'teamFoulsReset':
      return value === 'game'
        ? t(`${k}.reset.game`)
        : value === 'half'
          ? t(`${k}.reset.half`)
          : t(`${k}.reset.period`);
    case 'bonusFouls':
      return t(`${k}.bonus`, { count });
    case 'doubleBonusFouls':
      return value === null ? t(`${k}.double.none`) : t(`${k}.double`, { count });
    case 'playerFoulLimit':
      return value === null ? t(`${k}.fouled.none`) : t(`${k}.fouled`, { count });
    case 'fullTimeouts':
      return t(`${k}.full`, { count });
    case 'shortTimeouts':
      return t(`${k}.short`, { count });
    case 'timeoutsPer':
      return t(value === 'half' ? `${k}.timeouts.half` : `${k}.timeouts.game`);
    case 'overtimeTimeouts':
      return t(`${k}.overtimeouts`, { count });
    case 'timeoutsCarry':
      return t(value === true ? `${k}.carry.yes` : `${k}.carry.no`);
  }
}

/**
 * Every rule that says something: a "where" that has no last seconds to place (null) is
 * left out, as the read leaves its value out.
 */
export function factLines(facts: readonly FormatFact[], t: Translate, locale: string): string[] {
  return facts
    .filter((f) => !(f.fact === 'stopClockScope' && f.value === null))
    .map((f) => factLine(f, t, locale));
}

/** The one line said back (B4): periods and their length, the clock, the bonus. */
export function summaryOf(format: GameFormatRules, t: Translate, locale: string): string {
  const k = 'tracker.formatChange';
  return t(`${k}.summary`, {
    periods: t(format.gameFormat.periods === 4 ? `${k}.fact.quarters` : `${k}.fact.halves`),
    minutes: minutesOf(format.gameFormat.periodSeconds, locale),
    clock: t(format.clock.mode === 'running' ? `${k}.summary.running` : `${k}.summary.stop`),
    bonus: format.fouls.bonusFouls,
  });
}

/** The words for a refusal of a change; null when the screen says nothing more than it does. */
export function refusalText(code: GameFormatRefusal, t: Translate): string {
  const k = 'tracker.formatChange';
  if (code === 'under-way') return t(`${k}.underway`);
  if (code === 'setting-off') return t(`${k}.refused.setting`);
  if (code === 'changed-since-read') return t(`${k}.refused.changed`);
  return t(`${k}.refused.other`);
}
