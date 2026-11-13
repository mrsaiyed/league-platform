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

const header = 'Date,Time,Home,Away,Venue,Court,Round,Game Number,Reference,Home Score,Away Score';

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
    expect(report.fixtures[1]?.rowNumber).toBe(3); // the multi-line cell is one spreadsheet row
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
    expect(report.fixtures.map((f) => f.rowNumber)).toEqual([2, 4, 6]);
    expect(report.problems.map((p) => p.rowNumber)).toEqual([3, 5]);
    expect(report.problems[0]?.message).toContain('same game as row 2');
    expect(report.problems[1]?.message).toContain('outside reference "a" is already used on row 2');
    // A repeated game number is only a warning: the row is still used.
    expect(report.warnings.map((w) => w.message)).toEqual([
      expect.stringContaining('game number 1 is also used on row 2'),
    ]);
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
    expect(readFixtureSheet(longCell, season).problems[0]?.message).toContain('round cell');
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

  it('uses the first of two columns for one field and warns about the other', () => {
    const report = readFixtureSheet('Date,Date,Home,Away\n2026-11-02,x,Lions,Hawks', season);
    expect(report.fileProblem).toBeNull();
    expect(report.fixtures).toHaveLength(1);
    expect(report.warnings[0]?.message).toContain('ignored the column "Date"');
  });

  it('does not treat day, ref, game, number or no as column names', () => {
    const csv = 'Day,Date,Home,Away,Ref,Game,Number,No\n,2026-11-02,Lions,Hawks,a,b,c,d';
    const report = readFixtureSheet(csv, season);
    expect(report.fileProblem).toBeNull();
    expect(report.columnsFound).toEqual(['date', 'home team', 'away team']);
    expect(report.fixtures[0]?.gameNumber).toBeNull();
  });

  it('matches names in other scripts', () => {
    const other: SeasonNames = {
      teams: [
        { id: 'a', name: 'النمور' },
        { id: 'b', name: 'Динамо' },
        { id: 'c', name: '东方队' },
      ],
      venues: [],
    };
    const csv = 'Date,Home,Away\n2026-11-02,النمور,Динамо\n2026-11-03,东方队,динамо';
    const report = readFixtureSheet(csv, other);
    expect(report.problems).toEqual([]);
    expect(report.fixtures.map((f) => [f.homeTeamId, f.awayTeamId])).toEqual([
      ['a', 'b'],
      ['c', 'b'],
    ]);
  });

  it('counts only non-blank rows toward the limit and rowsRead', () => {
    const rows = Array.from({ length: fixtureFileLimits.maxRows }, () => '2026-11-02,Lions,Hawks');
    const blanks = Array.from({ length: 50 }, () => ',,');
    const report = readFixtureSheet(['Date,Home,Away', ...rows, ...blanks].join('\n'), season);
    expect(report.fileProblem).toBeNull();
    expect(report.rowsRead).toBe(fixtureFileLimits.maxRows);
  });

  it('numbers rows as a spreadsheet shows them, blank lines included', () => {
    const csv = 'Date,Home,Away\n\n2026-11-02,Lions,Hawks\n\n2026-11-03,Lions,Nobody';
    const report = readFixtureSheet(csv, season);
    expect(report.fixtures[0]?.rowNumber).toBe(3);
    expect(report.problems[0]?.rowNumber).toBe(5);
    const open = readFixtureSheet('Date,Home,Away\n2026-11-02,Lions,Hawks\n\n"x', season);
    expect(open.fileProblem).toContain('opened on row 4');
  });

  it('checks cell length only on used columns and names the column', () => {
    const long = 'z'.repeat(1000);
    const ok = readFixtureSheet(`Date,Home,Away,Notes\n2026-11-02,Lions,Hawks,${long}`, season);
    expect(ok.problems).toEqual([]);
    const bad = readFixtureSheet(`Date,Home,Away\n2026-11-02,Lions,${long}`, season);
    expect(bad.problems[0]?.message).toContain('away team cell');
  });

  it('shortens echoed values, strips control characters and caps the problem list', () => {
    const csv = `Date,Home,Away\n2026-11-02,Li\u0007ons${'x'.repeat(100)},Hawks`;
    const message = readFixtureSheet(csv, season).problems[0]?.message ?? '';
    expect(message).not.toContain('\u0007');
    expect(message.length).toBeLessThan(200);
    const many = Array.from({ length: 250 }, () => '2026-11-02,Nobody,Hawks');
    const report = readFixtureSheet(['Date,Home,Away', ...many].join('\n'), season);
    expect(report.problems).toHaveLength(fixtureFileLimits.maxProblemsListed);
    expect(report.omittedProblems).toBe(50);
    expect(report.problemsNote).toContain('50 more rows have problems');
  });

  it('matches a bare court number and returns the venue court name', () => {
    const csv = [
      'Date,Home,Away,Venue,Court',
      '2026-11-02,Lions,Hawks,Main Gym,2',
      '2026-11-03,Lions,Hawks,Main Gym,court 1',
    ].join('\n');
    const report = readFixtureSheet(csv, season);
    expect(report.problems).toEqual([]);
    expect(report.fixtures.map((f) => f.court)).toEqual(['Court 2', 'Court 1']);
  });

  it('reads two-digit years, Sept and weekday dates, and warns when day and month are unclear', () => {
    const csv = [
      'Date,Home,Away',
      '3/4/26,Lions,Hawks',
      '"Sept 5, 2026",Cubs,Hawks',
      '"Tuesday, November 03, 2026",Cubs,Lions',
      '13/1/2026,Lions,Cubs',
      '5/5/2026,Hawks,Cubs',
    ].join('\n');
    const report = readFixtureSheet(csv, season);
    expect(report.fixtures.map((f) => f.date)).toEqual([
      '2026-03-04',
      '2026-09-05',
      '2026-11-03',
      '2026-05-05',
    ]);
    expect(report.problems.map((p) => p.rowNumber)).toEqual([5]);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]?.message).toContain('month first');
  });

  it('tells the user to save as CSV for Excel, UTF-16 and unreadable files', () => {
    const bad = [
      'PK\u0003\u0004abc',
      'D\u0000a\u0000t\u0000e\u0000',
      'Date,Home,Away\n2026-11-02,L�ons,Hawks',
    ];
    for (const text of bad) {
      expect(readFixtureSheet(text, season).fileProblem).toContain('CSV (UTF-8)');
    }
  });

  it('treats a space before an opening quote as a quote and skips leading blank lines for the separator', () => {
    const csv = '\n\nDate;Home;Away\n2026-11-02; "Lions" ;Hawks';
    const report = readFixtureSheet(csv, season);
    expect(report.problems).toEqual([]);
    expect(report.fixtures).toHaveLength(1);
    const quoted = readFixtureSheet('Date,Home,Away\n2026-11-02, "St. Mary, East",Cubs', season);
    expect(quoted.problems).toEqual([]);
  });
});
