import { describe, expect, it } from 'vitest';
import { fixtureFileLimits, readFixtureSheet, type SeasonNames } from './index.ts';

const season: SeasonNames = {
  teams: [
    { id: 't-lions', name: 'Lions', shortName: 'LIO' },
    { id: 't-hawks', name: 'Hawks' },
    { id: 't-st', name: 'St. Mary, East' },
    { id: 't-cubs', name: 'Cubs' },
  ],
  venues: [
    { id: 'v-main', name: 'Main Gym', courts: ['Court 1', 'Court 2'] },
    { id: 'v-north', name: 'North Hall' },
  ],
};

const header = 'Date,Time,Home,Away,Venue,Court,Round,Game #,Reference,Home Score,Away Score';

describe('fixture spreadsheet reader (step 2.10)', () => {
  it('reads good rows, with scores on some', () => {
    const csv = [
      'Date,Time,Home Team,Visitor,Location,Court,Week,Game Number,Outside Reference,Home Score,Away Score',
      '2026-11-02,7:30 PM,Lions,Hawks,Main Gym,Court 2,Week 1,1,X-1,,',
      '11/9/2026,19:00,hawks,LIO,north hall,,Week 2,2,X-2,55,48',
    ].join('\n');
    const report = readFixtureSheet(csv, season);
    expect(report.fileProblem).toBeNull();
    expect(report.problems).toEqual([]);
    expect(report.rowsRead).toBe(2);
    expect(report.fixtures[0]).toMatchObject({
      rowNumber: 2,
      date: '2026-11-02',
      time: '19:30',
      homeTeamId: 't-lions',
      awayTeamId: 't-hawks',
      venueId: 'v-main',
      court: 'Court 2',
      round: 'Week 1',
      gameNumber: 1,
      outsideReference: 'X-1',
      finalScore: null,
    });
    expect(report.fixtures[1]).toMatchObject({
      date: '2026-11-09',
      time: '19:00',
      homeTeamId: 't-hawks',
      awayTeamId: 't-lions',
      venueId: 'v-north',
      finalScore: { home: 55, away: 48 },
    });
  });

  it('copes with a byte-order mark, Windows line endings, blank lines and quoted commas', () => {
    const csv = `﻿${header}\r\n2026-11-02,7:30 PM,"St. Mary, East",Cubs,Main Gym,,,,,,\r\n\r\n2026-11-03,,Cubs,"St. Mary, East",,,,,,,\r\n`;
    const report = readFixtureSheet(csv, season);
    expect(report.fileProblem).toBeNull();
    expect(report.problems).toEqual([]);
    expect(report.fixtures.map((f) => [f.homeTeamId, f.awayTeamId, f.time])).toEqual([
      ['t-st', 't-cubs', '19:30'],
      ['t-cubs', 't-st', null],
    ]);
    expect(report.fixtures[1]?.rowNumber).toBe(4);
  });

  it('keeps a quoted cell with a doubled quote and a line break on one row', () => {
    const csv = `${header}\n2026-11-02,7:30 PM,Lions,Hawks,Main Gym,,"Week ""1""\nopener",,,,\n2026-11-03,7:30 PM,Cubs,Hawks,,,,,,,`;
    const report = readFixtureSheet(csv, season);
    expect(report.fixtures[0]?.round).toBe('Week "1"\nopener');
    expect(report.fixtures[1]?.rowNumber).toBe(4);
  });

  it('reads semicolon files', () => {
    const csv = 'Date;Home;Away\n2026-11-02;Lions;Hawks';
    expect(readFixtureSheet(csv, season).fixtures).toHaveLength(1);
  });

  it('reports unknown teams and venues in plain words, and drops those rows', () => {
    const csv = [
      header,
      '2026-11-02,7:30 PM,Lionz,Hawks,Main Gym,,,,,,',
      '2026-11-02,7:30 PM,Lions,Hawks,Moon Base,,,,,,',
    ].join('\n');
    const report = readFixtureSheet(csv, season);
    expect(report.fixtures).toEqual([]);
    expect(report.problems).toHaveLength(2);
    expect(report.problems[0]?.message).toContain('home team "Lionz" is not a team in this season');
    expect(report.problems[1]?.message).toContain('venue "Moon Base" is not a venue');
  });

  it('reports bad dates, times, numbers, scores and same-team games', () => {
    const csv = [
      header,
      '2026-02-30,7:30 PM,Lions,Hawks,,,,,,,',
      '13/1/2026,7:30 PM,Lions,Hawks,,,,,,,',
      ',7:30 PM,Lions,Hawks,,,,,,,',
      '2026-11-02,25:00,Lions,Hawks,,,,,,,',
      '2026-11-02,7,Lions,Hawks,,,,,,,',
      '2026-11-02,7:30 PM,Lions,Lions,,,,,,,',
      '2026-11-02,7:30 PM,Lions,Hawks,,,,0,,,',
      '2026-11-02,7:30 PM,Lions,Hawks,,,,,,55,',
      '2026-11-02,7:30 PM,Lions,Hawks,,,,,,fifty,40',
      '2026-11-02,7:30 PM,Lions,Hawks,,Court 1,,,,,',
      '2026-11-02,7:30 PM,Lions,Hawks,Main Gym,Court 9,,,,,',
    ].join('\n');
    const report = readFixtureSheet(csv, season);
    expect(report.fixtures).toEqual([]);
    expect(report.problems.map((p) => p.rowNumber)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const text = report.problems.map((p) => p.message).join('\n');
    expect(text).toContain('"2026-02-30" is not a date');
    expect(text).toContain('"13/1/2026" is not a date');
    expect(text).toContain('The date is empty');
    expect(text).toContain('"25:00" is not a time');
    expect(text).toContain('"7" is not a time');
    expect(text).toContain('same team');
    expect(text).toContain('game number "0"');
    expect(text).toContain('Only one of the two final scores');
    expect(text).toContain('must be whole numbers');
    expect(text).toContain('court is given without a venue');
    expect(text).toContain('"Court 9" is not one of that venue');
  });

  it('flags duplicate games, game numbers and outside references on the later row', () => {
    const csv = [
      header,
      '2026-11-02,7:30 PM,Lions,Hawks,,,,1,A,,',
      '2026-11-02,19:30,Lions,Hawks,,,,,,,',
      '2026-11-03,7:30 PM,Cubs,Hawks,,,,1,,,',
      '2026-11-04,7:30 PM,Cubs,Lions,,,,2,a,,',
      '2026-11-05,7:30 PM,Cubs,Lions,,,,3,B,,',
    ].join('\n');
    const report = readFixtureSheet(csv, season);
    expect(report.fixtures.map((f) => f.rowNumber)).toEqual([2, 6]);
    expect(report.problems.map((p) => p.rowNumber)).toEqual([3, 4, 5]);
    expect(report.problems[0]?.message).toContain('same game as row 2');
    expect(report.problems[1]?.message).toContain('Game number 1 is already used on row 2');
    expect(report.problems[2]?.message).toContain('outside reference "a" is already used on row 2');
  });

  it('rejects whole files that cannot be used', () => {
    expect(readFixtureSheet('', season).fileProblem).toContain('empty');
    expect(readFixtureSheet('﻿\n\n', season).fileProblem).toContain('empty');
    expect(readFixtureSheet('Date,Home\n2026-11-02,Lions', season).fileProblem).toContain(
      'away team',
    );
    expect(readFixtureSheet('Date,Home,Away', season).fileProblem).toContain('no games');
    expect(readFixtureSheet('Date,Home,Away,Home Score\n', season).fileProblem).toContain(
      'score columns',
    );
    expect(readFixtureSheet('Date,Date,Home,Away\n', season).fileProblem).toContain(
      'more than one',
    );
    expect(
      readFixtureSheet('Date,Home,Away\n2026-11-02,"Lions,Hawks', season).fileProblem,
    ).toContain('never closed');
  });

  it('enforces the size and row limits (T-80)', () => {
    const rows = Array.from(
      { length: fixtureFileLimits.maxRows + 1 },
      () => '2026-11-02,Lions,Hawks',
    );
    const tooMany = readFixtureSheet(['Date,Home,Away', ...rows].join('\n'), season);
    expect(tooMany.fileProblem).toContain('rows');
    expect(tooMany.fixtures).toEqual([]);

    const big = readFixtureSheet('x'.repeat(fixtureFileLimits.maxCharacters + 1), season);
    expect(big.fileProblem).toContain('too large');

    const longCell = `Date,Home,Away,Round\n2026-11-02,Lions,Hawks,${'r'.repeat(1000)}`;
    expect(readFixtureSheet(longCell, season).problems[0]?.message).toContain('too long');
  });

  it('accepts the row limit exactly and handles 300 games', () => {
    const rows = Array.from(
      { length: 300 },
      (_, i) =>
        `2027-01-${String((i % 28) + 1).padStart(2, '0')},${i % 2 === 0 ? 'Lions' : 'Hawks'},Cubs,${String(Math.floor(i / 28)).padStart(2, '0')}:00,${i + 1}`,
    );
    const report = readFixtureSheet(
      ['Date,Home,Away,Time,Game Number', ...rows].join('\n'),
      season,
    );
    expect(report.fixtures).toHaveLength(300);
  });

  it('reads written-out dates', () => {
    const csv =
      'Date,Home,Away\nNov 2, 2026,Lions,Hawks\n"Nov 3, 2026",Cubs,Hawks\n4 November 2026,Cubs,Lions';
    const report = readFixtureSheet(csv, season);
    // The first row has an unquoted comma, so it is split wrongly: that is a row problem, not a crash.
    expect(report.problems.map((p) => p.rowNumber)).toEqual([2]);
    expect(report.fixtures.map((f) => f.date)).toEqual(['2026-11-03', '2026-11-04']);
  });
});
