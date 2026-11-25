// The words of Season settings' parts (step 2.47), all from the message files (T-187):
// what each part is set to, in a few lines for the season's settings page; each part's
// form, field by field; the sentence beside a box that is wrong; and, before a change that
// moves the standings is saved, each team that moves and how (S-1, step 2.25). A league
// with one program never reads the word "program" here (U-3): nothing here names one.
import { teamFoulsCounted, type SeasonRules } from '@srleagues/contracts';
import type { SeasonView, TeamMove } from '@srleagues/core';
import { locale, t, type TextKey } from '../../server/messages.ts';
import type { FormGroup, PartFormTexts } from './part-form-state.ts';
import {
  columnField,
  gamePresets,
  numberBoxes,
  offeredColumns,
  offeredTiebreakers,
  presetOf,
  tiebreakerField,
  type NumberBox,
  type SeasonPart,
  type WrongField,
} from './season-parts.ts';

/** A key put together from its parts; every one is in the message files (a test reads them). */
const say = (key: string, params?: Readonly<Record<string, string | number>>): string =>
  t(key as TextKey, params);

const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
const signed = new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' });
const day = new Intl.DateTimeFormat(locale, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayText = (iso: string): string => day.format(new Date(`${iso}T00:00:00Z`));
const minutesOf = (seconds: number): string => whole.format(seconds / 60);

/** One line of what a part is set to: its name, its value, and a pill when it does nothing. */
export type PartFact = { readonly term: string; readonly value: string; readonly unused?: string };

/** The tiebreakers in words: "Head-to-head, then point difference". */
function tiebreakersText(tiebreakers: SeasonRules['tiebreakers']): string {
  if (tiebreakers.length === 0) return say('seasonSettings.value.noTiebreakers');
  const words = tiebreakers.map((tb) => say(`standings.tiebreaker.${tb}`));
  const text = words.join(say('standings.level.tiebreakerJoin'));
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** What each part is set to now, as the season's settings page lists it. */
export function partFacts(part: SeasonPart, season: SeasonView): readonly PartFact[] {
  const r = season.rules;
  switch (part) {
    case 'name': {
      const { startsOn: from, endsOn: to } = season;
      const dates =
        from !== null && to !== null
          ? say('seasonSettings.value.dates', { from: dayText(from), to: dayText(to) })
          : from !== null
            ? say('seasonSettings.value.datesFrom', { from: dayText(from) })
            : to !== null
              ? say('seasonSettings.value.datesTo', { to: dayText(to) })
              : say('seasonSettings.value.datesNone');
      return [
        { term: say('seasonSettings.term.name'), value: season.name },
        { term: say('seasonSettings.term.dates'), value: dates },
      ];
    }
    case 'game': {
      const preset = presetOf(r);
      const { mode, stopClockLastSeconds: last, mercyLead } = r.clock;
      const lastWords =
        last === null
          ? undefined
          : {
              minutes: minutesOf(last),
              scope: say(
                `seasonSettings.option.stopClockScope.${r.clock.stopClockScope ?? 'half'}`,
              ).toLocaleLowerCase(locale),
            };
      // Under a stop clock the last minutes matter once it runs (S-123), by the mercy rule.
      const clock =
        mode === 'running'
          ? lastWords === undefined
            ? say('seasonSettings.value.clock.running')
            : say('seasonSettings.value.clock.runningLast', lastWords)
          : mercyLead === null
            ? lastWords === undefined
              ? say('seasonSettings.value.clock.stop')
              : say('seasonSettings.value.clock.stopLast', lastWords)
            : lastWords === undefined
              ? say('seasonSettings.value.clock.stopMercy', { lead: mercyLead })
              : say('seasonSettings.value.clock.stopMercyLast', { lead: mercyLead, ...lastWords });
      const { bonusFouls, doubleBonusFouls, playerFoulLimit } = r.fouls;
      const timeouts = r.timeouts;
      return [
        {
          term: say('seasonSettings.term.preset'),
          value:
            preset === undefined
              ? say('seasonSettings.value.presetNone')
              : say(`seasonSettings.preset.${preset}`),
        },
        {
          term: say('seasonSettings.term.format'),
          value: say(`seasonSettings.value.format.${r.gameFormat.periods}`, {
            minutes: minutesOf(r.gameFormat.periodSeconds),
            overtime: minutesOf(r.gameFormat.overtimeSeconds),
          }),
        },
        { term: say('seasonSettings.term.clock'), value: clock },
        {
          term: say('seasonSettings.term.fouls'),
          value: `${say('seasonSettings.value.fouls', {
            bonus: bonusFouls,
            double:
              doubleBonusFouls === null
                ? say('seasonSettings.value.fouls.noDouble')
                : say('seasonSettings.value.fouls.double', { double: doubleBonusFouls }),
            limit:
              playerFoulLimit === null
                ? say('seasonSettings.value.fouls.noLimit')
                : say('seasonSettings.value.fouls.limit', { limit: playerFoulLimit }),
          })}. ${teamFoulsLine(r)}`,
        },
        {
          term: say('seasonSettings.term.timeouts'),
          value: say('seasonSettings.value.timeouts', {
            full: timeouts.full,
            short: timeouts.short,
            per: say(`seasonSettings.value.timeouts.per.${timeouts.per}`),
            overtime: timeouts.overtime,
            carry: say(
              timeouts.carry
                ? 'seasonSettings.value.timeouts.carry'
                : 'seasonSettings.value.timeouts.noCarry',
            ),
          }),
        },
      ];
    }
    case 'recording':
      return [
        {
          term: say('seasonSettings.term.recording'),
          value: say(`seasonSettings.option.recording.${r.recording}`),
        },
        {
          term: say('seasonSettings.term.statistics'),
          value: say(`seasonSettings.option.statistics.${r.statistics}`),
        },
      ];
    case 'standings': {
      const s = r.standings;
      const columns = s.columns
        .filter((c) => (offeredColumns as readonly string[]).includes(c))
        .map((c) => say(`seasonSettings.column.${c}`));
      return [
        {
          term: say('seasonSettings.term.rankBy'),
          value:
            s.rankBy === 'points'
              ? say('seasonSettings.value.rankBy.points', {
                  win: s.pointsPerWin,
                  tie: s.pointsPerTie,
                  loss: s.pointsPerLoss,
                })
              : say('seasonSettings.option.rankBy.win-percentage'),
        },
        { term: say('seasonSettings.term.columns'), value: columns.join(', ') },
        { term: say('seasonSettings.term.tiebreakers'), value: tiebreakersText(r.tiebreakers) },
        {
          term: say('seasonSettings.term.ties'),
          value: say(
            r.allowTies
              ? 'seasonSettings.option.allowTies.yes'
              : 'seasonSettings.option.allowTies.no',
          ),
        },
        {
          term: say('seasonSettings.term.forfeits'),
          value: say('seasonSettings.value.forfeits', {
            winner: r.forfeit.winnerScore,
            loser: r.forfeit.loserScore,
            counted: say(
              r.forfeit.countsInPointDifference
                ? 'seasonSettings.value.forfeits.counted'
                : 'seasonSettings.value.forfeits.notCounted',
            ),
          }),
        },
        ...(r.tiebreakers.includes('coin-flip')
          ? [
              {
                term: say('seasonSettings.term.coinFlip'),
                value: say('seasonSettings.coinFlipKept'),
                unused: say('seasonSettings.notInUse'),
              },
            ]
          : []),
      ];
    }
    case 'rosters': {
      const { minSize: min, maxSize: max, locksOn, uniqueJerseys } = r.rosters;
      const limits =
        min !== null && max !== null
          ? say('seasonSettings.value.rosterLimits', { min, max })
          : min !== null
            ? say('seasonSettings.value.rosterMin', { min })
            : max !== null
              ? say('seasonSettings.value.rosterMax', { max })
              : say('seasonSettings.value.noLimits');
      return [
        {
          term: say('seasonSettings.term.uniqueJerseys'),
          value: say(uniqueJerseys ? 'seasonSettings.value.yes' : 'seasonSettings.value.no'),
        },
        {
          term: say('seasonSettings.term.rosterLimits'),
          value: limits,
          unused: say('seasonSettings.notInUse'),
        },
        {
          term: say('seasonSettings.term.rosterLock'),
          value: locksOn === null ? say('seasonSettings.value.noLock') : dayText(locksOn),
          unused: say('seasonSettings.notInUse'),
        },
      ];
    }
  }
}

/**
 * When team fouls start again, as they are counted (step 2.123, T-422): the admin's choice,
 * or each period when none was saved. With halves a period is a half.
 */
export function teamFoulsLine(rules: SeasonRules): string {
  const reset = teamFoulsCounted(rules);
  return say(
    reset === 'game'
      ? 'seasonSettings.teamFouls.game'
      : reset === 'period' && rules.gameFormat.periods === 4
        ? 'seasonSettings.teamFouls.quarter'
        : 'seasonSettings.teamFouls.half',
  );
}

const label = (name: string): string => say(`seasonSettings.field.${name}`);
const help = (key: string): { readonly help: string } => ({ help: say(key) });
const number = (name: NumberBox, more: { readonly help?: string } = {}) => ({
  kind: 'number' as const,
  name,
  label: label(name),
  ...('parts' in numberBoxes[name] ? { parts: true } : {}),
  ...more,
});
const radios = (
  name: string,
  values: readonly string[],
  more: { readonly help?: string } = {},
) => ({
  kind: 'radios' as const,
  name,
  label: label(name),
  options: values.map((value) => ({ value, label: say(`seasonSettings.option.${name}.${value}`) })),
  ...more,
});

/** A part's form, field by field, with its words. */
export function partGroups(part: SeasonPart, rules: SeasonRules): readonly FormGroup[] {
  switch (part) {
    case 'name':
      return [
        {
          fields: [
            { kind: 'text', name: 'name', label: label('name'), maxLength: 120 },
            { kind: 'date', name: 'startsOn', label: label('startsOn') },
            {
              kind: 'date',
              name: 'endsOn',
              label: label('endsOn'),
              ...help('seasonSettings.field.datesHelp'),
            },
          ],
        },
      ];
    case 'game':
      return [
        {
          fields: [
            radios('periods', ['2', '4']),
            number('periodMinutes'),
            number('overtimeMinutes'),
          ],
        },
        {
          fields: [
            radios('clockMode', ['running', 'stop']),
            // The mercy rule and the last minutes side by side (S-113): what runs the clock,
            // then where it stops again.
            number('mercyLead', help('seasonSettings.field.mercyLead.help')),
            number('lastMinutes', help('seasonSettings.field.lastMinutes.help')),
            radios('stopClockScope', ['period', 'half', 'game']),
          ],
        },
        {
          legend: say('seasonSettings.legend.fouls'),
          fields: [
            number('bonusFouls'),
            number('doubleBonusFouls', help('seasonSettings.field.doubleBonusFouls.help')),
            number('playerFoulLimit', help('seasonSettings.field.playerFoulLimit.help')),
            radios('teamFoulsReset', ['period', 'half', 'game'], {
              help: `${teamFoulsLine(rules)} ${say('seasonSettings.field.teamFoulsReset.help')}`,
            }),
          ],
        },
        {
          legend: say('seasonSettings.legend.timeouts'),
          fields: [
            number('fullTimeouts'),
            number('shortTimeouts'),
            radios('timeoutsPer', ['game', 'half']),
            number('overtimeTimeouts'),
            { kind: 'tick', name: 'timeoutsCarry', label: label('timeoutsCarry') },
          ],
        },
      ];
    case 'recording':
      return [
        {
          fields: [
            radios(
              'recording',
              ['live', 'box-score', 'final-score'],
              help('seasonSettings.field.recording.help'),
            ),
            radios(
              'statistics',
              ['points-only', 'points-fouls', 'standard', 'standard-turnovers', 'full'],
              help('seasonSettings.field.statistics.help'),
            ),
          ],
        },
      ];
    case 'standings':
      return [
        {
          fields: [
            radios('rankBy', ['win-percentage', 'points']),
            number('pointsPerWin', help('seasonSettings.field.points.help')),
            number('pointsPerTie'),
            number('pointsPerLoss'),
          ],
        },
        {
          fields: [
            {
              kind: 'ticks',
              name: 'columns',
              label: label('columns'),
              ...help('seasonSettings.field.columns.help'),
              options: offeredColumns.map((column) => ({
                name: columnField(column),
                label: say(`seasonSettings.column.${column}`),
              })),
            },
          ],
        },
        {
          legend: label('tiebreakers'),
          fields: [
            { kind: 'note', text: say('seasonSettings.field.tiebreakers.help') },
            ...offeredTiebreakers.map((_, n) => ({
              kind: 'select' as const,
              name: tiebreakerField(n),
              label: label(tiebreakerField(n)),
              options: [
                { value: '', label: say('seasonSettings.tiebreaker.none') },
                ...offeredTiebreakers.map((tb) => ({
                  value: tb,
                  label: say(`seasonSettings.tiebreaker.${tb}`),
                })),
              ],
            })),
            ...(rules.tiebreakers.includes('coin-flip')
              ? [{ kind: 'note' as const, text: say('seasonSettings.coinFlipKept') }]
              : []),
          ],
        },
        { fields: [radios('allowTies', ['no', 'yes'])] },
        {
          legend: say('seasonSettings.legend.forfeits'),
          fields: [
            number('forfeitWinner'),
            number('forfeitLoser'),
            { kind: 'tick', name: 'forfeitInDifference', label: label('forfeitInDifference') },
          ],
        },
      ];
    case 'rosters':
      return [
        {
          fields: [
            {
              kind: 'tick',
              name: 'uniqueJerseys',
              label: label('uniqueJerseys'),
              ...help('seasonSettings.field.uniqueJerseys.help'),
            },
          ],
        },
      ];
  }
}

/** The words around a part's form: its buttons, and the presets of the game rules. */
export function partTexts(part: SeasonPart, rules: SeasonRules): PartFormTexts {
  const preset = presetOf(rules);
  return {
    save: say(`seasonSettings.part.${part}.save`),
    cancel: say('seasonSettings.cancel'),
    ask: { yes: say('seasonSettings.ask.yes'), no: say('seasonSettings.ask.no') },
    ...(part === 'game'
      ? {
          presets: {
            title: say('seasonSettings.presets'),
            help: say('seasonSettings.presets.help'),
            now:
              preset === undefined
                ? say('seasonSettings.preset.own')
                : say('seasonSettings.preset.now', {
                    preset: say(`seasonSettings.preset.${preset}`),
                  }),
            choices: gamePresets.map((value) => ({
              value,
              label: say('seasonSettings.preset.use', {
                preset: say(`seasonSettings.preset.${value}`),
              }),
              about: say(`seasonSettings.preset.${value}.about`),
            })),
          },
        }
      : {}),
  };
}

/** The sentence beside a box that is wrong, naming the box. */
export function wrongSaid(wrong: WrongField): string {
  const name = wrong.field === '' ? '' : label(wrong.field);
  return say(`seasonSettings.wrong.${wrong.why}`, { label: name, ...wrong.params });
}

/** A team that would move, as the question before saving names it. */
export type MovedTeam = { readonly name: string; readonly division: string | undefined };

const moveValue = (field: TeamMove['changes'][number]['field'], value: number | null): string =>
  value === null ? '–' : field === 'pointDifference' ? signed.format(value) : whole.format(value);

/** One line for each team a change moves: "Falcons (East): place 2 to 1, seed 2 to 1." */
export function moveLines(
  moves: readonly TeamMove[],
  teamOf: (teamId: string) => MovedTeam | undefined,
): string[] {
  return moves.map((move) => {
    const team = teamOf(move.teamId);
    const rank = move.changes.find((c) => c.field === 'rank');
    const changes = move.changes
      // A seed that moves with the place, the same way, says nothing more.
      .filter(
        (c) =>
          !(c.field === 'seed' && rank !== undefined && rank.from === c.from && rank.to === c.to),
      )
      .map((c) =>
        say(`seasonSettings.move.${c.field}`, {
          from: moveValue(c.field, c.from),
          to: moveValue(c.field, c.to),
        }),
      )
      .join(say('seasonSettings.move.join'));
    const name = team?.name ?? move.teamId;
    return team?.division === undefined
      ? say('seasonSettings.move.line', { team: name, changes })
      : say('seasonSettings.move.lineDivision', { team: name, division: team.division, changes });
  });
}

/** The question before a change that moves the standings is saved. */
export function askHeading(count: number, season: string): string {
  return t.plural('seasonSettings.ask.moves', count, { season });
}
