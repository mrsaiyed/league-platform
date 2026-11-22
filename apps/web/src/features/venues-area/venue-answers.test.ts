import { describe, expect, it } from 'vitest';
import { venueProblemKey, wrongVenueBox, wrongVenueFields } from './venue-answers.ts';

describe('a refused change to a venue or court', () => {
  it('finds the box the command would refuse, by its limits', () => {
    expect(wrongVenueBox({ name: '  ' })).toBe('name');
    expect(wrongVenueBox({ name: 'Gym', address: 'x'.repeat(301) })).toBe('address');
    expect(wrongVenueBox({ name: 'Gym', mapLink: 'http://maps.example.test' })).toBe('mapLink');
    expect(wrongVenueBox({ name: 'Gym', mapLink: 'https://maps.example.test/a' })).toBeUndefined();
  });
  it('marks that box and says why beside it', () => {
    const typed = { name: 'Gym', mapLink: 'javascript:alert(1)' };
    expect(wrongVenueFields('invalid-input', 'venue', typed)).toEqual(['mapLink']);
    expect(venueProblemKey('invalid-input', 'venue', typed)).toBe(
      'adminVenues.problem.invalid-map-link',
    );
    expect(wrongVenueFields('court-name-taken', 'court', {})).toEqual(['name']);
    expect(venueProblemKey('invalid-input', 'court')).toBe('adminVenues.problem.invalid-court');
  });
  it('tells someone putting one back to rename the other, and never shows a code', () => {
    expect(venueProblemKey('court-name-taken', 'other', {}, true)).toBe(
      'adminVenues.problem.restore-court-name-taken',
    );
    expect(venueProblemKey('court-has-games-to-come', 'other')).toBe(
      'adminVenues.problem.court-has-games-to-come',
    );
    expect(venueProblemKey('nothing-we-know', 'other')).toBe('adminVenues.problem.unknown');
  });
});
