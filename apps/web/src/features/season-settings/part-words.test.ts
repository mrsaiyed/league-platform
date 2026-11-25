// Season settings' words for when team fouls start again (step 2.123): the form offers all
// three choices the tracker follows, and the settings page says the one chosen in plain words.
import { defaultSeasonRules, type SeasonRules } from '@srleagues/contracts';
import type { SeasonView } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { partFacts, partGroups } from './part-words.ts';

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
  fouls: { ...base.fouls, teamFoulsReset },
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
});
