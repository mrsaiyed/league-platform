// The format form's fields (checklist B1, step 2.119) as the page holds them, typed text
// and choices, and back: a format the contract takes, or null when the fields do not make
// one (the same checks as a season's rules, GameFormatRules). Minutes on the screen,
// seconds in the format.
import { GameFormatRules, GAME_FORMAT_VERSION } from '@srleagues/contracts';

export type FormatValues = {
  readonly periods: '2' | '4';
  readonly minutes: string;
  readonly overtimeMinutes: string;
  readonly clockMode: 'stop' | 'running';
  readonly stopLastSeconds: string;
  readonly stopScope: 'period' | 'half' | 'game';
  readonly mercyLead: string;
  readonly teamFoulsReset: 'period' | 'half' | 'game';
  readonly bonusFouls: string;
  readonly doubleBonusFouls: string;
  readonly playerFoulLimit: string;
  readonly fullTimeouts: string;
  readonly shortTimeouts: string;
  readonly timeoutsPer: 'game' | 'half';
  readonly overtimeTimeouts: string;
  readonly timeoutsCarry: boolean;
};

const text = (n: number | null) => (n === null ? '' : String(n));
const minutes = (seconds: number) => String(Math.round((seconds / 60) * 100) / 100);

export function valuesOf(format: GameFormatRules): FormatValues {
  const { gameFormat: g, clock: c, fouls: f, timeouts: t } = format;
  return {
    periods: g.periods === 4 ? '4' : '2',
    minutes: minutes(g.periodSeconds),
    overtimeMinutes: minutes(g.overtimeSeconds),
    clockMode: c.mode,
    stopLastSeconds: text(c.stopClockLastSeconds),
    stopScope: c.stopClockScope ?? 'half',
    mercyLead: text(c.mercyLead),
    teamFoulsReset: f.teamFoulsReset,
    bonusFouls: String(f.bonusFouls),
    doubleBonusFouls: text(f.doubleBonusFouls),
    playerFoulLimit: text(f.playerFoulLimit),
    fullTimeouts: String(t.full),
    shortTimeouts: String(t.short),
    timeoutsPer: t.per,
    overtimeTimeouts: String(t.overtime),
    timeoutsCarry: t.carry,
  };
}

/** A whole number typed in a field; NaN for anything else, which the checks refuse. */
const whole = (typed: string) => (/^\s*\d+\s*$/.test(typed) ? Number(typed) : Number.NaN);
const wholeOrNone = (typed: string) => (typed.trim() === '' ? null : whole(typed));
const seconds = (typed: string) =>
  /^\s*\d+([.,]\d+)?\s*$/.test(typed) ? Math.round(Number(typed.replace(',', '.')) * 60) : NaN;

/** The format the fields make, or null when they do not make one. */
export function formatOfValues(values: FormatValues): GameFormatRules | null {
  const parsed = GameFormatRules.safeParse({
    version: GAME_FORMAT_VERSION,
    gameFormat: {
      periods: values.periods === '4' ? 4 : 2,
      periodSeconds: seconds(values.minutes),
      overtimeSeconds: seconds(values.overtimeMinutes),
    },
    clock: {
      mode: values.clockMode,
      stopClockLastSeconds: wholeOrNone(values.stopLastSeconds),
      stopClockScope: values.stopScope,
      mercyLead: wholeOrNone(values.mercyLead),
    },
    fouls: {
      teamFoulsReset: values.teamFoulsReset,
      bonusFouls: whole(values.bonusFouls),
      doubleBonusFouls: wholeOrNone(values.doubleBonusFouls),
      playerFoulLimit: wholeOrNone(values.playerFoulLimit),
    },
    timeouts: {
      full: whole(values.fullTimeouts),
      short: whole(values.shortTimeouts),
      per: values.timeoutsPer,
      overtime: whole(values.overtimeTimeouts),
      carry: values.timeoutsCarry,
    },
  });
  return parsed.success ? parsed.data : null;
}
