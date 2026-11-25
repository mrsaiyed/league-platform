// Season settings' words for when team fouls start again (step 2.123): the form offers all
// three choices the tracker follows, and the settings page says the one chosen in plain words.
import { defaultSeasonRules, foulsWithReset, type SeasonRules } from '@srleagues/contracts';
import type { SeasonView } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { partFacts, partGroups, teamFoulsLine } from './part-words.ts';

const base = defaultSeasonRules();
const seasonWith = (rules: SeasonRules): SeasonView => ({
  id: 'season-1',
  slug: 'made-up-season',
  name: 'Made-up season',
  startsOn: null,
  endsOn: null,
  status: 'active',
  isCurrent: true,
  rules,
  rulesSaved: true,
  rulesWarnings: [],
  version: 1,
});
const withReset = (
  periods: 2 | 4,
  teamFoulsReset: SeasonRules['fouls']['teamFoulsReset'],
): SeasonRules => ({
  ...base,
  gameFormat: { ...base.gameFormat, periods },
  fouls: foulsWithReset(base.fouls, teamFoulsReset),
});
const foulsLine = (rules: SeasonRules): string =>
  partFacts('game', seasonWith(rules)).find((fact) => fact.term === 'Fouls')?.value ?? '';

describe('when team fouls start again', () => {
  it('offers each period, each half and once a game, with quarters too', () => {
    const fields = partGroups('game', withReset(4, 'period')).flatMap((group) => group.fields);
    const reset = fields.find((field) => 'name' in field && field.name === 'teamFoulsReset');
    expect(reset).toMatchObject({
      kind: 'radios',
      label: 'Team fouls start again',
      options: [
        { value: 'period', label: 'Each half or quarter' },
        { value: 'half', label: 'Each half, also with quarters' },
        { value: 'game', label: 'Never: they count for the whole game' },
      ],
    });
  });

  it('says the choice on the settings page', () => {
    expect(foulsLine(withReset(4, 'period'))).toMatch(/Team fouls start again each quarter\.$/);
    expect(foulsLine(withReset(4, 'half'))).toMatch(/Team fouls start again each half\.$/);
    expect(foulsLine(withReset(2, 'period'))).toMatch(/Team fouls start again each half\.$/);
    expect(foulsLine(withReset(4, 'game'))).toMatch(/Team fouls count for the whole game\.$/);
  });

  it('says each quarter for a season saved before this step with quarters and "half" (T-422)', () => {
    const old = {
      ...withReset(4, 'period'),
      fouls: { ...base.fouls, teamFoulsReset: 'half' as const },
    };
    expect(foulsLine(old)).toMatch(/Team fouls start again each quarter\.$/);
    expect(teamFoulsLine(old)).toBe('Team fouls start again each quarter.');
  });

  it('says in the help line what the team fouls do now, and what a change of periods does', () => {
    const helpOf = (rules: SeasonRules) => {
      const field = partGroups('game', rules)
        .flatMap((group) => group.fields)
        .find((f) => 'name' in f && f.name === 'teamFoulsReset');
      return field !== undefined && 'help' in field ? field.help : undefined;
    };
    expect(helpOf(withReset(4, 'half'))).toMatch(/^Team fouls start again each half\. /);
    expect(helpOf(withReset(4, 'period'))).toMatch(/^Team fouls start again each quarter\. /);
    expect(helpOf(withReset(2, 'game'))).toMatch(/^Team fouls count for the whole game\. /);
    expect(helpOf(base)).toMatch(
      /Never stays as it is .*; leave any other choice as it is, and it becomes each half or quarter\.$/,
    );
  });
});

describe('the clock in words, with the mercy rule and the last minutes (step 2.248, S-113)', () => {
  const clockLine = (clock: SeasonRules['clock']): string =>
    partFacts('game', seasonWith({ ...base, clock })).find((fact) => fact.term === 'Clock')
      ?.value ?? '';
  const last = { stopClockLastSeconds: 120, stopClockScope: 'half' } as const;

  it('says each phase of a stop clock with both, and each rule alone', () => {
    expect(clockLine({ mode: 'stop', ...last, mercyLead: 15 })).toBe(
      'Stop clock, then a running clock once a team leads by 15, but a stop clock again in the last 2 minutes of each half',
    );
    expect(clockLine({ mode: 'stop', ...last, mercyLead: null })).toBe(
      'Stop clock; if it is switched to running, it stops again in the last 2 minutes of each half',
    );
    expect(clockLine({ mode: 'stop', stopClockLastSeconds: null, mercyLead: 15 })).toBe(
      'Stop clock, then a running clock once a team leads by 15',
    );
    expect(clockLine({ mode: 'running', ...last, mercyLead: null })).toBe(
      'Running clock, with a stop clock in the last 2 minutes of each half',
    );
  });

  it('puts the last-minutes field beside the mercy rule', () => {
    const names = partGroups('game', base)
      .flatMap((group) => group.fields)
      .map((field) => ('name' in field ? field.name : ''));
    const at = (name: string) => names.indexOf(name);
    expect(at('lastMinutes')).toBe(at('mercyLead') + 1);
  });
});
