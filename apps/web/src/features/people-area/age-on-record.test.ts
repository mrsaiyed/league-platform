import { describe, expect, it } from 'vitest';
import { tickKeepsAChild, unlikelyYears, yearsOld } from './age-on-record.ts';

describe('yearsOld', () => {
  it('counts whole years, a birthday not yet come this year counting one fewer', () => {
    expect(yearsOld('2008-11-17', '2026-11-17')).toBe(18);
    expect(yearsOld('2008-11-18', '2026-11-17')).toBe(17);
    expect(yearsOld('2008-02-29', '2026-02-28')).toBe(17);
  });
  it('reads no age from a date that is not one', () => {
    expect(yearsOld('2008-02-30', '2026-11-17')).toBeUndefined();
    expect(yearsOld('', '2026-11-17')).toBeUndefined();
  });
});

describe('tickKeepsAChild (R-28 as changed on 2026-11-17)', () => {
  const today = '2026-11-17';
  it('is true when the tick says a child and the date says an adult: the tick wins', () => {
    expect(tickKeepsAChild({ birthDate: '1990-01-01', child: 'child' }, today)).toBe(true);
  });
  it('is false whenever they do not disagree that way', () => {
    expect(tickKeepsAChild({ birthDate: '2015-01-01', child: 'child' }, today)).toBe(false);
    expect(tickKeepsAChild({ birthDate: '', child: 'child' }, today)).toBe(false);
    expect(tickKeepsAChild({ birthDate: '1990-01-01', child: 'adult' }, today)).toBe(false);
    expect(tickKeepsAChild({ birthDate: '1990-01-01', child: '' }, today)).toBe(false);
  });
});

describe('unlikelyYears', () => {
  const today = '2026-11-17';
  it('gives the age of a very young or very old player, to be shown back before saving', () => {
    expect(unlikelyYears('2024-06-01', today)).toBe(2);
    expect(unlikelyYears('1926-01-01', today)).toBe(100);
    expect(unlikelyYears('1946-11-17', today)).toBe(80);
  });
  it('asks nothing for an ordinary age, a date in the future or one that is not a date', () => {
    expect(unlikelyYears('2014-06-01', today)).toBeUndefined();
    expect(unlikelyYears('1950-01-01', today)).toBeUndefined();
    expect(unlikelyYears('2999-01-01', today)).toBeUndefined();
    expect(unlikelyYears('nonsense', today)).toBeUndefined();
  });
});
