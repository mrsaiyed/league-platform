import { describe, expect, it } from 'vitest';
import {
  planNewLeague,
  seasonPartOf,
  seasonSlugOf,
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
        city: 'Springfield',
        timeZone: 'America/Chicago',
        contactEmail: 'hello@example.test',
        ownerEmail: 'Owner@Example.test',
        season: { name: 'Fall 2026', slug: 'fall-2026' },
      },
    });
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

  it('takes a short name that is a word the checks use, such as "invalid"', () => {
    const result = planNewLeague({ ...answers, shortName: 'invalid' });
    expect(result.ok && result.plan.slug).toBe('invalid');
  });

  it('tells every missing answer at once', () => {
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
    ]);
  });

  it.each([
    ['shortName', 'ab', 'invalid'],
    ['shortName', 'has space', 'invalid'],
    ['shortName', 'admin', 'blocked'],
    ['sport', 'curling', 'invalid'],
    ['timeZone', 'Mars/Olympus', 'invalid'],
    ['contactEmail', 'not-an-email', 'invalid'],
    ['ownerEmail', 'someone@erased.invalid', 'invalid'],
    ['name', 'x'.repeat(121), 'invalid'],
    ['city', 'x'.repeat(101), 'invalid'],
  ] as const)('refuses %s %j as %s', (field, value, problem) => {
    expect(planNewLeague({ ...answers, [field]: value })).toEqual({
      ok: false,
      problems: [{ field, problem }],
    });
  });
});

describe('seasonPartOf', () => {
  it.each([
    ['2026-11-14', 'fall', 2026],
    ['2026-03-01', 'spring', 2026],
    ['2026-07-31', 'summer', 2026],
    ['2026-01-10', 'winter', 2026],
    ['2026-12-05', 'winter', 2026],
  ] as const)('%s is %s %i', (day, part, year) => {
    expect(seasonPartOf(day)).toEqual({ part, year });
  });
});

describe('seasonSlugOf', () => {
  it.each([
    ['Fall 2026', 'fall-2026'],
    ['  Été — 2027 ', 'ete-2027'],
    ['2025-26', '2025-26'],
    ['!!!', 'season'],
  ])('%j becomes %s', (name, slug) => {
    expect(seasonSlugOf(name)).toBe(slug);
  });
});
