// The parts of Season settings (step 2.47, P7 §1) and how each part's form turns into the
// season's name and dates or its rules document, and back. Pure: no words (the screen
// takes them from the message files by the keys named here, T-187) and nothing read or
// saved. Every rule a part changes is followed by the product today (step 2.138 follows
// this one): the roster limits, the lock date and the coin flip are not fields of any
// part (they are shown "not in use yet"), the team-foul reset is the admin's choice (each
// period, each half or once a game, which the tracker counts since step 2.123; S-106), and
// "last five" is not a column (nothing works it out).
//
// A part's form changes only its own part of the rules: the rest is the season's rules
// as read fresh when it is saved, so two admins saving two parts do not undo each other.
import {
  foulsWithReset,
  seasonRulesPreset,
  SeasonRules,
  teamFoulsCounted,
  type SeasonRulesPreset,
} from '@srleagues/contracts';
import type { TypedFields } from './part-form-state.ts';

type StandingsColumn = SeasonRules['standings']['columns'][number];
type Tiebreaker = SeasonRules['tiebreakers'][number];

export const seasonParts = ['name', 'game', 'recording', 'standings', 'rosters'] as const;
export type SeasonPart = (typeof seasonParts)[number];

export const isSeasonPart = (value: unknown): value is SeasonPart =>
  typeof value === 'string' && (seasonParts as readonly string[]).includes(value);

/** The place of a part on the page: its panel's id, which an address may end with. */
export const partAnchor = (part: SeasonPart): string => `season-${part}`;

/** The ticked value of a tick box. */
export const ticked = 'yes';

/** The presets a season's game rules start from (P7 §1: every setting has one). */
export const gamePresets: readonly Exclude<SeasonRulesPreset, 'custom'>[] = [
  'high-school',
  'rec-league',
];

/** The columns Season settings offers, in the table's usual order: "last five" is not. */
export const offeredColumns: readonly Exclude<StandingsColumn, 'last-five'>[] = [
  'played',
  'wins',
  'losses',
  'ties',
  'win-percentage',
  'points',
  'points-for',
  'points-against',
  'point-difference',
  'streak',
];

/** The tiebreakers offered: the coin flip is not, until step 2.138 records one. */
export const offeredTiebreakers: readonly Exclude<Tiebreaker, 'coin-flip'>[] = [
  'head-to-head',
  'point-difference',
  'points-scored',
  'fewest-points-allowed',
];

/** How many tiebreaker boxes the form has: one for each offered. */
export const tiebreakerBoxes = offeredTiebreakers.length;
export const tiebreakerField = (n: number): string => `tiebreaker${n + 1}`;
export const columnField = (column: string): string => `column-${column}`;

/** A number box's limits, and whether it may be left empty (for "none"). */
export type NumberLimits = {
  readonly min: number;
  readonly max: number;
  /** Minutes may be given in parts (7.5); every other box is a whole number. */
  readonly parts?: boolean;
  readonly empty?: boolean;
};

/** Every number box of the rules parts, with the limits the rules contract sets. */
export const numberBoxes = {
  periodMinutes: { min: 1, max: 60, parts: true },
  overtimeMinutes: { min: 1, max: 30, parts: true },
  lastMinutes: { min: 1, max: 10, parts: true, empty: true },
  mercyLead: { min: 1, max: 100, empty: true },
  bonusFouls: { min: 1, max: 30 },
  doubleBonusFouls: { min: 2, max: 40, empty: true },
  playerFoulLimit: { min: 1, max: 20, empty: true },
  fullTimeouts: { min: 0, max: 10 },
  shortTimeouts: { min: 0, max: 10 },
  overtimeTimeouts: { min: 0, max: 5 },
  pointsPerWin: { min: 0, max: 10 },
  pointsPerTie: { min: 0, max: 10 },
  pointsPerLoss: { min: 0, max: 10 },
  forfeitWinner: { min: 0, max: 200 },
  forfeitLoser: { min: 0, max: 200 },
} as const satisfies Record<string, NumberLimits>;
export type NumberBox = keyof typeof numberBoxes;

/** The fields of each part, in the order they are on the screen (for marking the first). */
export function fieldsOfPart(part: SeasonPart): readonly string[] {
  switch (part) {
    case 'name':
      return ['name', 'startsOn', 'endsOn'];
    case 'game':
      return [
        'periods',
        'periodMinutes',
        'overtimeMinutes',
        'clockMode',
        'lastMinutes',
        'stopClockScope',
        'mercyLead',
        'bonusFouls',
        'doubleBonusFouls',
        'playerFoulLimit',
        'teamFoulsReset',
        'fullTimeouts',
        'shortTimeouts',
        'timeoutsPer',
        'overtimeTimeouts',
        'timeoutsCarry',
      ];
    case 'recording':
      return ['recording', 'statistics'];
    case 'standings':
      return [
        'rankBy',
        'pointsPerWin',
        'pointsPerTie',
        'pointsPerLoss',
        'columns',
        ...offeredTiebreakers.map((_, n) => tiebreakerField(n)),
        'allowTies',
        'forfeitWinner',
        'forfeitLoser',
        'forfeitInDifference',
      ];
    case 'rosters':
      return ['uniqueJerseys'];
  }
}

/** A number as a box shows it: minutes from seconds keep their parts ("7.5"). */
const shown = (value: number | null): string => (value === null ? '' : String(value));
const minutes = (seconds: number | null): string =>
  seconds === null ? '' : String(Math.round((seconds / 60) * 100) / 100);
const tickField = (name: string, on: boolean): Record<string, string> =>
  on ? { [name]: ticked } : {};

/** The name and dates as the form shows them. */
export function nameFields(season: {
  readonly name: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
}): TypedFields {
  return { name: season.name, startsOn: season.startsOn ?? '', endsOn: season.endsOn ?? '' };
}

/** A part of the rules as its form shows it. */
export function rulesFields(part: Exclude<SeasonPart, 'name'>, rules: SeasonRules): TypedFields {
  switch (part) {
    case 'game':
      return {
        periods: String(rules.gameFormat.periods),
        periodMinutes: minutes(rules.gameFormat.periodSeconds),
        overtimeMinutes: minutes(rules.gameFormat.overtimeSeconds),
        clockMode: rules.clock.mode,
        lastMinutes: minutes(rules.clock.stopClockLastSeconds),
        stopClockScope: rules.clock.stopClockScope ?? 'half',
        mercyLead: shown(rules.clock.mercyLead),
        bonusFouls: shown(rules.fouls.bonusFouls),
        doubleBonusFouls: shown(rules.fouls.doubleBonusFouls),
        playerFoulLimit: shown(rules.fouls.playerFoulLimit),
        teamFoulsReset: teamFoulsCounted(rules),
        fullTimeouts: shown(rules.timeouts.full),
        shortTimeouts: shown(rules.timeouts.short),
        timeoutsPer: rules.timeouts.per,
        overtimeTimeouts: shown(rules.timeouts.overtime),
        ...tickField('timeoutsCarry', rules.timeouts.carry),
      };
    case 'recording':
      return { recording: rules.recording, statistics: rules.statistics };
    case 'standings': {
      const chosen = rules.tiebreakers.filter((tb) => tb !== 'coin-flip');
      return {
        rankBy: rules.standings.rankBy,
        pointsPerWin: shown(rules.standings.pointsPerWin),
        pointsPerTie: shown(rules.standings.pointsPerTie),
        pointsPerLoss: shown(rules.standings.pointsPerLoss),
        ...Object.fromEntries(
          offeredColumns
            .filter((column) => rules.standings.columns.includes(column))
            .map((column) => [columnField(column), ticked]),
        ),
        ...Object.fromEntries(
          offeredTiebreakers.map((_, n) => [tiebreakerField(n), chosen[n] ?? '']),
        ),
        allowTies: rules.allowTies ? 'yes' : 'no',
        forfeitWinner: shown(rules.forfeit.winnerScore),
        forfeitLoser: shown(rules.forfeit.loserScore),
        ...tickField('forfeitInDifference', rules.forfeit.countsInPointDifference),
      };
    }
    case 'rosters':
      return tickField('uniqueJerseys', rules.rosters.uniqueJerseys);
  }
}

/** A box the form marks, why (a key of `seasonSettings.wrong.*`), and what the words name. */
export type WrongField = {
  readonly field: string;
  readonly why: string;
  readonly params?: Readonly<Record<string, string | number>>;
};

export type PartReading<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly wrong: readonly WrongField[] };

/** Reads one number box: undefined for an empty box that may be, else the number or wrong. */
function readNumber(
  fields: TypedFields,
  name: NumberBox,
  wrong: WrongField[],
): number | null | undefined {
  const limits: NumberLimits = numberBoxes[name];
  const text = (fields[name] ?? '').trim();
  if (text === '' && limits.empty === true) return null;
  const pattern = limits.parts === true ? /^\d{1,4}(\.\d{1,2})?$/ : /^\d{1,4}$/;
  const value = Number(text);
  if (!pattern.test(text) || value < limits.min || value > limits.max) {
    wrong.push({
      field: name,
      why: `${limits.parts === true ? 'minutes' : 'number'}${limits.empty === true ? 'OrEmpty' : ''}`,
      params: { min: limits.min, max: limits.max },
    });
    return undefined;
  }
  return value;
}

const seconds = (value: number): number => Math.round(value * 60);

/** One of the choices given, or wrong. */
function readChoice<T extends string>(
  fields: TypedFields,
  name: string,
  choices: readonly T[],
  wrong: WrongField[],
): T | undefined {
  const value = choices.find((choice) => choice === fields[name]);
  if (value === undefined) wrong.push({ field: name, why: 'choice' });
  return value;
}

const has = (fields: TypedFields, name: string): boolean => fields[name] === ticked;

/**
 * The season's new rules from one part's form: the rules as read fresh with that part
 * changed. What the form cannot say is refused by box, in the boxes' own terms; then the
 * whole document is checked against the rules contract, whose findings are put on the box
 * they are about (contractWrong).
 */
export function rulesFromPart(
  part: Exclude<SeasonPart, 'name'>,
  base: SeasonRules,
  fields: TypedFields,
): PartReading<SeasonRules> {
  const wrong: WrongField[] = [];
  let rules: SeasonRules = base;
  switch (part) {
    case 'game': {
      const periods = readChoice(fields, 'periods', ['2', '4'] as const, wrong);
      const periodMinutes = readNumber(fields, 'periodMinutes', wrong);
      const overtimeMinutes = readNumber(fields, 'overtimeMinutes', wrong);
      const mode = readChoice(fields, 'clockMode', ['stop', 'running'] as const, wrong);
      const lastMinutes = readNumber(fields, 'lastMinutes', wrong);
      const scope = readChoice(
        fields,
        'stopClockScope',
        ['period', 'half', 'game'] as const,
        wrong,
      );
      const mercyLead = readNumber(fields, 'mercyLead', wrong);
      const bonusFouls = readNumber(fields, 'bonusFouls', wrong);
      const doubleBonusFouls = readNumber(fields, 'doubleBonusFouls', wrong);
      const playerFoulLimit = readNumber(fields, 'playerFoulLimit', wrong);
      const reset = readChoice(
        fields,
        'teamFoulsReset',
        ['period', 'half', 'game'] as const,
        wrong,
      );
      const full = readNumber(fields, 'fullTimeouts', wrong);
      const short = readNumber(fields, 'shortTimeouts', wrong);
      const per = readChoice(fields, 'timeoutsPer', ['game', 'half'] as const, wrong);
      const overtime = readNumber(fields, 'overtimeTimeouts', wrong);
      if (
        wrong.length > 0 ||
        periods === undefined ||
        periodMinutes == null ||
        overtimeMinutes == null ||
        mode === undefined ||
        lastMinutes === undefined ||
        scope === undefined ||
        mercyLead === undefined ||
        bonusFouls == null ||
        doubleBonusFouls === undefined ||
        playerFoulLimit === undefined ||
        reset === undefined ||
        full == null ||
        short == null ||
        per === undefined ||
        overtime == null
      ) {
        return { ok: false, wrong };
      }
      const periodCount = periods === '4' ? 4 : 2;
      // The last-minutes stop clock is for a running clock and the mercy lead for a stop
      // clock: the one the clock chosen does not use is not kept (the form says so).
      const last = mode === 'running' && lastMinutes !== null ? seconds(lastMinutes) : null;
      rules = {
        ...base,
        gameFormat: {
          periods: periodCount,
          periodSeconds: seconds(periodMinutes),
          overtimeSeconds: seconds(overtimeMinutes),
        },
        clock: {
          mode,
          stopClockLastSeconds: last,
          ...(last === null ? {} : { stopClockScope: scope }),
          mercyLead: mode === 'stop' ? mercyLead : null,
        },
        fouls: teamFoulsSaved(base, periodCount, reset, {
          bonusFouls,
          doubleBonusFouls,
          playerFoulLimit,
        }),
        timeouts: { full, short, per, overtime, carry: has(fields, 'timeoutsCarry') },
      };
      break;
    }
    case 'recording': {
      const recording = readChoice(
        fields,
        'recording',
        ['final-score', 'box-score', 'live'] as const,
        wrong,
      );
      const statistics = readChoice(
        fields,
        'statistics',
        ['points-only', 'points-fouls', 'standard', 'standard-turnovers', 'full'] as const,
        wrong,
      );
      if (recording === undefined || statistics === undefined) return { ok: false, wrong };
      rules = { ...base, recording, statistics };
      break;
    }
    case 'standings': {
      const rankBy = readChoice(fields, 'rankBy', ['win-percentage', 'points'] as const, wrong);
      const pointsPerWin = readNumber(fields, 'pointsPerWin', wrong);
      const pointsPerTie = readNumber(fields, 'pointsPerTie', wrong);
      const pointsPerLoss = readNumber(fields, 'pointsPerLoss', wrong);
      const allowTies = readChoice(fields, 'allowTies', ['yes', 'no'] as const, wrong);
      const winnerScore = readNumber(fields, 'forfeitWinner', wrong);
      const loserScore = readNumber(fields, 'forfeitLoser', wrong);
      // The tiebreakers in the order of their boxes, empty boxes left out; each once.
      const tiebreakers: Exclude<Tiebreaker, 'coin-flip'>[] = [];
      offeredTiebreakers.forEach((_, n) => {
        const name = tiebreakerField(n);
        const value = fields[name] ?? '';
        if (value === '') return;
        const known = offeredTiebreakers.find((tb) => tb === value);
        if (known === undefined) wrong.push({ field: name, why: 'choice' });
        else if (tiebreakers.includes(known)) wrong.push({ field: name, why: 'tiebreakerTwice' });
        else tiebreakers.push(known);
      });
      const columns = offeredColumns.filter((column) => has(fields, columnField(column)));
      if (columns.length === 0) wrong.push({ field: 'columns', why: 'noColumns' });
      if (
        wrong.length > 0 ||
        rankBy === undefined ||
        pointsPerWin == null ||
        pointsPerTie == null ||
        pointsPerLoss == null ||
        allowTies === undefined ||
        winnerScore == null ||
        loserScore == null
      ) {
        return { ok: false, wrong };
      }
      // A coin flip the season already has stays last: it is not offered, and not lost.
      const coinFlip = base.tiebreakers.includes('coin-flip') ? (['coin-flip'] as const) : [];
      rules = {
        ...base,
        standings: { rankBy, pointsPerWin, pointsPerTie, pointsPerLoss, columns },
        tiebreakers: [...tiebreakers, ...coinFlip],
        allowTies: allowTies === 'yes',
        forfeit: {
          winnerScore,
          loserScore,
          countsInPointDifference: has(fields, 'forfeitInDifference'),
        },
      };
      break;
    }
    case 'rosters':
      rules = {
        ...base,
        rosters: { ...base.rosters, uniqueJerseys: has(fields, 'uniqueJerseys') },
      };
      break;
  }
  const checked = SeasonRules.safeParse(rules);
  if (!checked.success) return { ok: false, wrong: contractWrong(checked.error.issues) };
  return { ok: true, value: checked.data };
}

/**
 * The fouls a save of the game rules keeps (T-422). The team-foul choice as it was (the
 * radio shows how the season counts) and the periods as they were: the stored value is
 * kept as it is, so a season saved before step 2.123 keeps counting each period until its
 * admin chooses otherwise. Periods changed and the choice left as it was: it becomes the
 * natural one for the new periods, each half or quarter, as the help line says. Any
 * other choice is saved, marked as chosen when it is not each period.
 */
export function teamFoulsSaved(
  base: SeasonRules,
  periods: 2 | 4,
  reset: SeasonRules['fouls']['teamFoulsReset'],
  numbers: Pick<SeasonRules['fouls'], 'bonusFouls' | 'doubleBonusFouls' | 'playerFoulLimit'>,
): SeasonRules['fouls'] {
  const fouls = { ...base.fouls, ...numbers };
  const left = reset === teamFoulsCounted(base);
  if (left && periods === base.gameFormat.periods) return fouls;
  return foulsWithReset(fouls, left ? 'period' : reset);
}

/** Where on the form each finding of the rules contract is said, by its path. */
export function contractWrong(
  issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): WrongField[] {
  const found: WrongField[] = [];
  for (const issue of issues) {
    const path = issue.path.map(String).join('.');
    const at = (field: string, why: string) => found.push({ field, why });
    if (path === 'fouls.doubleBonusFouls') at('doubleBonusFouls', 'doubleBonusAfterBonus');
    else if (path === 'forfeit.winnerScore') at('forfeitWinner', 'forfeitWinnerMore');
    else if (path === 'standings.pointsPerWin') at('pointsPerWin', 'pointsOrder');
    else if (path === 'clock.stopClockLastSeconds') at('lastMinutes', 'lastMinutesLong');
    else if (path === 'statistics') at('statistics', 'liveNeedsFouls');
    else if (path === 'standings.columns' && issue.message.startsWith('Only a table')) {
      at('columns', 'pointsColumnUnranked');
    } else if (path === 'standings.columns' && issue.message.includes('points')) {
      at('columns', 'pointsColumn');
    } else if (path === 'standings.columns' && issue.message.includes('ties')) {
      at('columns', 'tiesColumn');
    } else at('', 'rules');
  }
  return found;
}

/** The name and dates from their form, or the boxes that are wrong. */
export function nameFromPart(fields: TypedFields): PartReading<{
  readonly name: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
}> {
  const wrong: WrongField[] = [];
  const name = (fields['name'] ?? '').trim();
  if (name === '' || name.length > 120) wrong.push({ field: 'name', why: 'name' });
  const day = (field: string): string | null | undefined => {
    const text = (fields[field] ?? '').trim();
    if (text === '') return null;
    const at = new Date(`${text}T00:00:00Z`);
    const real =
      /^\d{4}-\d{2}-\d{2}$/.test(text) &&
      !Number.isNaN(at.getTime()) &&
      at.toISOString().slice(0, 10) === text;
    if (real) return text;
    wrong.push({ field, why: 'date' });
    return undefined;
  };
  const startsOn = day('startsOn');
  const endsOn = day('endsOn');
  if (wrong.length > 0 || startsOn === undefined || endsOn === undefined) {
    return { ok: false, wrong };
  }
  if (startsOn !== null && endsOn !== null && endsOn < startsOn) {
    return { ok: false, wrong: [{ field: 'endsOn', why: 'datesOrder' }] };
  }
  return { ok: true, value: { name, startsOn, endsOn } };
}

/** The game rules of a preset: its game format, clock, fouls and timeouts. */
export function presetGameRules(preset: (typeof gamePresets)[number], base: SeasonRules) {
  const from = seasonRulesPreset(preset);
  return {
    ...base,
    gameFormat: from.gameFormat,
    clock: from.clock,
    fouls: from.fouls,
    timeouts: from.timeouts,
  };
}

/** The preset whose game rules a season's are, if any. */
export function presetOf(rules: SeasonRules): (typeof gamePresets)[number] | undefined {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return gamePresets.find((preset) => {
    const from = seasonRulesPreset(preset);
    return (
      same(from.gameFormat, rules.gameFormat) &&
      same(from.clock, rules.clock) &&
      same(from.fouls, rules.fouls) &&
      same(from.timeouts, rules.timeouts)
    );
  });
}

/** The game part's form filled with a preset, the rest of what was typed kept. */
export function withPreset(
  preset: (typeof gamePresets)[number],
  base: SeasonRules,
  typed: TypedFields,
): TypedFields {
  const game = rulesFields('game', presetGameRules(preset, base));
  const kept = Object.fromEntries(
    Object.entries(typed).filter(([name]) => !fieldsOfPart('game').includes(name)),
  );
  return { ...kept, ...game };
}

export const isGamePreset = (value: string): value is (typeof gamePresets)[number] =>
  (gamePresets as readonly string[]).includes(value);
