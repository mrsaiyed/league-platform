import { describe, expect, it } from 'vitest';
import {
  childDisagreement,
  treatedAsChild,
  treatmentOf,
  unlikelyYears,
  yearsOld,
} from './age-on-record.ts';

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

describe("childDisagreement (core's isMinorOn, R-28 as changed on 2026-11-17)", () => {
  const today = '2026-11-17';
  it('says the tick keeps a child when the date says adult', () => {
    expect(childDisagreement({ birthDate: '1990-01-01', child: 'child' }, today)).toBe(
      'tick-keeps-child',
    );
  });
  it('says the date makes a child when they are marked as an adult', () => {
    expect(childDisagreement({ birthDate: '2015-01-01', child: 'adult' }, today)).toBe(
      'date-makes-child',
    );
    // The day before their 18th birthday, on the league's today, they are still a child.
    expect(childDisagreement({ birthDate: '2008-11-18', child: 'adult' }, today)).toBe(
      'date-makes-child',
    );
  });
  it('says nothing when the date and the choice agree, or there is no date or no choice', () => {
    expect(childDisagreement({ birthDate: '2015-01-01', child: 'child' }, today)).toBeUndefined();
    expect(childDisagreement({ birthDate: '2008-11-17', child: 'adult' }, today)).toBeUndefined();
    expect(childDisagreement({ birthDate: '', child: 'child' }, today)).toBeUndefined();
    expect(childDisagreement({ birthDate: '1990-01-01', child: '' }, today)).toBeUndefined();
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

describe('treatmentOf', () => {
  const today = '2026-11-17';
  const child = '2015-03-01';
  const adult = '1990-01-01';
  it('says what makes someone a child: the date, the choice, both, or a youth league that does not know', () => {
    expect(treatmentOf({ birthDate: child, child: 'child' }, today, 'adult')).toBe('child-by-both');
    expect(treatmentOf({ birthDate: child, child: '' }, today, 'adult')).toBe('child-by-date');
    expect(treatmentOf({ birthDate: child, child: 'adult' }, today, 'adult')).toBe('child-by-date');
    expect(treatmentOf({ birthDate: '', child: 'child' }, today, 'adult')).toBe('child-by-choice');
    expect(treatmentOf({ birthDate: adult, child: 'child' }, today, 'adult')).toBe(
      'child-by-choice-over-date',
    );
    expect(treatmentOf({ birthDate: '', child: '' }, today, 'youth')).toBe('child-not-recorded');
    expect(treatmentOf({ birthDate: '', child: '' }, today, 'mixed')).toBe('child-not-recorded');
  });
  it('and what makes someone an adult', () => {
    expect(treatmentOf({ birthDate: adult, child: 'adult' }, today, 'youth')).toBe('adult-by-both');
    expect(treatmentOf({ birthDate: adult, child: '' }, today, 'youth')).toBe('adult-by-date');
    expect(treatmentOf({ birthDate: '', child: 'adult' }, today, 'youth')).toBe('adult-by-choice');
    expect(treatmentOf({ birthDate: '', child: '' }, today, 'adult')).toBe('adult-not-recorded');
  });
  // S-136 as amended in step 2.146's fix round: the record of a walk-up with no age says why
  // they are shown as a child, in an adult league too, until an admin marks them.
  it('says a walk-up with no age is a child for being added at the scorer’s table', () => {
    for (const audience of ['adult', 'youth', 'mixed'] as const) {
      expect(treatmentOf({ birthDate: '', child: '', walkUp: true }, today, audience)).toBe(
        'child-walk-up',
      );
    }
    expect(treatmentOf({ birthDate: '', child: 'adult', walkUp: true }, today, 'adult')).toBe(
      'adult-by-choice',
    );
    expect(treatmentOf({ birthDate: adult, child: '', walkUp: true }, today, 'adult')).toBe(
      'adult-by-date',
    );
    expect(treatedAsChild('child-walk-up')).toBe(true);
  });
  it('turns 18 on the birthday itself, on the league’s today', () => {
    expect(treatmentOf({ birthDate: '2008-11-17', child: '' }, today, 'youth')).toBe(
      'adult-by-date',
    );
    expect(treatmentOf({ birthDate: '2008-11-18', child: '' }, today, 'adult')).toBe(
      'child-by-date',
    );
    expect(treatedAsChild('child-not-recorded')).toBe(true);
    expect(treatedAsChild('adult-by-date')).toBe(false);
  });
});
