import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  dayIn,
  planNewLeague,
  seasonPartOf,
  seasonSlugOf,
  suggestedSeason,
  type NewLeagueAnswers,
} from './new-league-plan.ts';

const answers: NewLeagueAnswers = {
  name: '  Made-up Hoops ',
  shortName: ' Made-Up-Hoops ',
  sport: 'Basketball',
  whoPlays: 'adults',
  city: ' Springfield ',
  timeZone: 'America/Chicago',
  contactEmail: 'hello@example.test',
  ownerEmail: ' Owner@Example.test ',
  seasonName: 'Fall 2026',
  staffEmail: ' Staff@Example.test ',
};

const problemsOf = (change: NewLeagueAnswers) => {
  const result = planNewLeague({ ...answers, ...change });
  return result.ok ? [] : result.problems;
};

describe('planNewLeague', () => {
  it('reads every answer, trimmed, into a plan', () => {
    expect(planNewLeague(answers)).toEqual({
      ok: true,
      plan: {
        name: 'Made-up Hoops',
        slug: 'made-up-hoops',
        sportKey: 'basketball',
        audience: 'adult',
        listed: true,
        listedChosen: false,
        city: 'Springfield',
        timeZone: 'America/Chicago',
        contactEmail: 'hello@example.test',
        ownerEmail: 'Owner@Example.test',
        staffEmail: 'Staff@Example.test',
        season: { name: 'Fall 2026', slug: 'fall-2026', startsOn: null, endsOn: null },
        design: { startingDesign: 'crest', chosen: false, colors: {} },
        gameRules: { clockMode: 'running', mercyLead: null },
      },
    });
  });

  it('takes the clock and the mercy rule asked, the defaults when left (S-106, step 2.245)', () => {
    const rules = (change: NewLeagueAnswers) => {
      const result = planNewLeague({ ...answers, ...change });
      return result.ok ? result.plan.gameRules : result.problems;
    };
    expect(rules({ clock: ' Stop ', mercyLead: '20' })).toEqual({
      clockMode: 'stop',
      mercyLead: 20,
    });
    expect(rules({ clock: 'stop', mercyLead: 'none' })).toEqual({
      clockMode: 'stop',
      mercyLead: null,
    });
    expect(rules({ clock: 'running' })).toEqual({ clockMode: 'running', mercyLead: null });
    expect(rules({ clock: 'sometimes' })).toEqual([{ field: 'clock', problem: 'invalid' }]);
    for (const mercyLead of ['0', '101', '2.5', 'lots']) {
      expect(rules({ clock: 'stop', mercyLead })).toEqual([
        { field: 'mercyLead', problem: 'invalid' },
      ]);
    }
    // A pair the season's settings refuse is refused here too (S-113).
    expect(rules({ mercyLead: '20' })).toEqual([{ field: 'mercyLead', problem: 'invalid' }]);
  });

  it('takes when team fouls start again only when answered (after step 2.123, T-422)', () => {
    const rules = (change: NewLeagueAnswers) => {
      const result = planNewLeague({ ...answers, ...change });
      return result.ok ? result.plan.gameRules : result.problems;
    };
    expect(rules({ teamFoulsReset: ' Half ' })).toEqual({
      clockMode: 'running',
      mercyLead: null,
      teamFoulsReset: 'half',
    });
    expect(rules({ teamFoulsReset: 'game' })).toMatchObject({ teamFoulsReset: 'game' });
    expect(rules({ teamFoulsReset: 'period' })).toMatchObject({ teamFoulsReset: 'period' });
    // Left alone, no answer is carried, so the first season writes no choice.
    expect(rules({})).toEqual({ clockMode: 'running', mercyLead: null });
    for (const teamFoulsReset of ['quarter', 'never', '2']) {
      expect(rules({ teamFoulsReset })).toEqual([{ field: 'teamFoulsReset', problem: 'invalid' }]);
    }
  });

  it('takes a starting design by its key and the colors chosen, or the first one, never the neutral one (step 2.187, C-16)', () => {
    const of = (change: NewLeagueAnswers) => {
      const result = planNewLeague({ ...answers, ...change });
      return result.ok ? result.plan.design : result.problems;
    };
    expect(
      of({ design: ' Crest ', mainColor: '#0A3D62', accentColor: ' #b77d8c ', highlightColor: '' }),
    ).toEqual({
      startingDesign: 'crest',
      chosen: true,
      colors: { primary: '#0a3d62', accent: '#b77d8c' },
    });
    expect(of({ mainColor: '#123456' })).toEqual({
      startingDesign: 'crest',
      chosen: false,
      colors: { primary: '#123456' },
    });
    expect(of({ design: 'clean-court' })).toEqual({
      startingDesign: 'clean-court',
      chosen: true,
      colors: {},
    });
    expect(of({ design: 'no-such-design' })).toEqual([{ field: 'design', problem: 'invalid' }]);
    expect(of({ design: 'toString' })).toEqual([{ field: 'design', problem: 'invalid' }]);
    for (const value of [
      'red; } body { display:none',
      '</style>',
      'url(http://x.test)',
      '#12345',
    ]) {
      expect(of({ mainColor: value, accentColor: value, highlightColor: value })).toEqual([
        { field: 'mainColor', problem: 'invalid' },
        { field: 'accentColor', problem: 'invalid' },
        { field: 'highlightColor', problem: 'invalid' },
      ]);
    }
  });

  it('maps who plays to the audience, listing only adult leagues by default (U-10)', () => {
    const of = (whoPlays: string) => {
      const result = planNewLeague({ ...answers, whoPlays });
      return result.ok ? [result.plan.audience, result.plan.listed] : result.problems;
    };
    expect(of('adults')).toEqual(['adult', true]);
    expect(of('Under-18s')).toEqual(['youth', false]);
    expect(of('both')).toEqual(['mixed', false]);
    expect(of('constructor')).toEqual([{ field: 'whoPlays', problem: 'invalid' }]);
  });

  it('lets the answers choose the listing, and says they chose it', () => {
    const of = (whoPlays: string, listed: string) => {
      const result = planNewLeague({ ...answers, whoPlays, listed });
      return result.ok ? [result.plan.listed, result.plan.listedChosen] : result.problems;
    };
    expect(of('under-18s', 'yes')).toEqual([true, true]);
    expect(of('adults', ' NO ')).toEqual([false, true]);
    expect(of('adults', 'maybe')).toEqual([{ field: 'listed', problem: 'invalid' }]);
  });

  it('takes a short name that is a word the checks use, such as "invalid"', () => {
    const result = planNewLeague({ ...answers, shortName: 'invalid' });
    expect(result.ok && result.plan.slug).toBe('invalid');
  });

  it('tells every missing answer at once, and asks for none of the optional ones', () => {
    const result = planNewLeague({ name: 'Made-up Hoops', city: '   ' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.map((p) => [p.field, p.problem])).toEqual([
      ['shortName', 'missing'],
      ['sport', 'missing'],
      ['whoPlays', 'missing'],
      ['city', 'missing'],
      ['timeZone', 'missing'],
      ['contactEmail', 'missing'],
      ['ownerEmail', 'missing'],
      ['seasonName', 'missing'],
      ['staffEmail', 'missing'],
    ]);
  });

  it.each([
    ['shortName', 'ab', 'invalid'],
    ['shortName', 'has space', 'invalid'],
    ['shortName', 'admin', 'blocked'],
    ['shortName', 'shit-hoops', 'offensive'],
    ['shortName', 'raghead-hoops', 'offensive'],
    ['sport', 'curling', 'invalid'],
    ['timeZone', 'Mars/Olympus', 'invalid'],
    ['contactEmail', 'not-an-email', 'invalid'],
    ['ownerEmail', 'someone@erased.invalid', 'invalid'],
    ['staffEmail', 'not-an-email', 'invalid'],
    ['staffEmail', 'Staff@Example.INVALID', 'invalid'],
    ['name', 'x'.repeat(121), 'invalid'],
    ['city', 'x'.repeat(101), 'invalid'],
  ] as const)('refuses %s %j as %s', (field, value, problem) => {
    expect(planNewLeague({ ...answers, [field]: value })).toEqual({
      ok: false,
      problems: [{ field, problem }],
    });
  });

  it('accepts only a named time zone, kept by its canonical name', () => {
    const zoneOf = (timeZone: string) => {
      const result = planNewLeague({ ...answers, timeZone });
      return result.ok ? result.plan.timeZone : result.problems;
    };
    expect(zoneOf('america/chicago')).toBe('America/Chicago');
    expect(zoneOf('Etc/UTC')).toBe('UTC');
    for (const refused of ['+05:00', '-06:00', 'Etc/GMT+5', 'EST', 'CST6CDT']) {
      expect(zoneOf(refused)).toEqual([{ field: 'timeZone', problem: 'invalid' }]);
    }
  });

  it('takes rough dates for the season, both optional, and shows them back', () => {
    const seasonOf = (seasonStartsOn?: string, seasonEndsOn?: string) => {
      const result = planNewLeague({ ...answers, seasonStartsOn, seasonEndsOn });
      return result.ok ? result.plan.season : result.problems;
    };
    expect(seasonOf('2026-09-01', '2027-02-28')).toMatchObject({
      startsOn: '2026-09-01',
      endsOn: '2027-02-28',
    });
    expect(seasonOf('2026-09-01')).toMatchObject({ startsOn: '2026-09-01', endsOn: null });
    expect(seasonOf(undefined, ' 2027-02-28 ')).toMatchObject({
      startsOn: null,
      endsOn: '2027-02-28',
    });
    expect(seasonOf('2026-09-01', '2026-09-01')).toMatchObject({ endsOn: '2026-09-01' });
  });

  it('refuses dates that are not real calendar days, and an end before the start', () => {
    expect(problemsOf({ seasonStartsOn: '2026-02-30' })).toEqual([
      { field: 'seasonStartsOn', problem: 'invalid' },
    ]);
    expect(problemsOf({ seasonStartsOn: '2028-02-29', seasonEndsOn: '2027-02-29' })).toEqual([
      { field: 'seasonEndsOn', problem: 'invalid' },
    ]);
    expect(problemsOf({ seasonStartsOn: '9/1/2026' })).toEqual([
      { field: 'seasonStartsOn', problem: 'invalid' },
    ]);
    expect(problemsOf({ seasonStartsOn: '2026-9-1' })).toEqual([
      { field: 'seasonStartsOn', problem: 'invalid' },
    ]);
    expect(problemsOf({ seasonStartsOn: '2026-09-01', seasonEndsOn: '2026-08-31' })).toEqual([
      { field: 'seasonEndsOn', problem: 'before-start' },
    ]);
  });
});

describe('seasonPartOf', () => {
  it.each([
    ['2026-11-14', 'fall', [2026]],
    ['2026-03-01', 'spring', [2026]],
    ['2026-07-31', 'summer', [2026]],
    ['2026-12-05', 'winter', [2026, 2027]],
    ['2027-01-10', 'winter', [2026, 2027]],
    ['2027-02-28', 'winter', [2026, 2027]],
  ] as const)('%s is %s %j', (day, part, years) => {
    expect(seasonPartOf(day)).toEqual({ part, years });
  });
});

describe('suggestedSeason', () => {
  // 03:00 on 1 December in UTC is the evening of 30 November in Chicago.
  const evening = Date.UTC(2026, 11, 1, 3, 0);

  it("goes by the league's own date, not the date in UTC", () => {
    expect(dayIn('America/Chicago', evening)).toBe('2026-11-30');
    expect(dayIn('UTC', evening)).toBe('2026-12-01');
    expect(suggestedSeason(evening, 'America/Chicago')).toEqual({ part: 'fall', years: [2026] });
    expect(suggestedSeason(evening, 'Asia/Tokyo')).toEqual({
      part: 'winter',
      years: [2026, 2027],
    });
  });
});

describe('seasonSlugOf', () => {
  it.each([
    ['Fall 2026', 'fall-2026'],
    ['Winter 2026–2027', 'winter-2026-2027'],
    ['  Été — 2027 ', 'ete-2027'],
    ['2025-26', '2025-26'],
    ['!!!', 'season'],
  ])('%j becomes %s', (name, slug) => {
    expect(seasonSlugOf(name)).toBe(slug);
  });

  it('writes the accents it drops as escapes, not as invisible characters', () => {
    const source = readFileSync(new URL('./new-league-plan.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/[\u0300-\u036f]/);
  });
});
