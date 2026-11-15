import { describe, expect, it } from 'vitest';
import { namedTimeZone } from './time-zone.ts';

describe('namedTimeZone', () => {
  it.each([
    ['America/Chicago', 'America/Chicago'],
    ['  america/chicago ', 'America/Chicago'],
    ['Australia/Sydney', 'Australia/Sydney'],
    ['US/Central', 'America/Chicago'],
    ['UTC', 'UTC'],
    ['Etc/UTC', 'UTC'],
  ])('keeps %j as %j', (given, kept) => {
    expect(namedTimeZone(given)).toBe(kept);
  });

  it.each([
    // Offsets: PostgreSQL would read these with the opposite sign.
    '+05:00',
    '-06:00',
    'UTC+5',
    'Etc/GMT+5',
    'Etc/GMT-3',
    // Abbreviations, even those the runtime maps to a place.
    'EST',
    'CST6CDT',
    'GMT',
    'CST',
    // Not known, or not a zone at all.
    'Mars/Olympus',
    '',
    'x'.repeat(65),
  ])('refuses %j', (given) => {
    expect(namedTimeZone(given)).toBeUndefined();
  });
});
