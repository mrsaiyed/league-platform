// The Teams screens' small rules that need no server: how forms become command input,
// how an answer travels in the address, and how the words for it are chosen (step 2.51).
import { createTranslator } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import {
  answerQuery,
  doneKey,
  doneNames,
  leavingAtOf,
  problemKey,
  refused,
  done,
} from './answer.ts';
import {
  changeEntryInput,
  changeTeamInput,
  markLeftInput,
  movedOrder,
  newTeamInput,
  shortNameFrom,
  shortNameNeeded,
} from './form-input.ts';
import { hasName, numbersWornTwice, rosterName } from './roster-name.ts';

const t = createTranslator('en');

describe('form input', () => {
  it('makes a short name from the name when none is typed', () => {
    expect(shortNameFrom('Blue Jays!')).toBe('blue-jays');
    expect(shortNameFrom('  Zoë & Friends ')).toBe('zoe-friends');
    expect(newTeamInput({ name: 'Blue Jays', shortName: '' }, 's').shortName).toBe('blue-jays');
    expect(newTeamInput({ name: 'Blue Jays', shortName: 'jays' }, 's').shortName).toBe('jays');
  });

  it('asks for a short name when none can be made from the name', () => {
    expect(shortNameFrom('فرج')).toBe('');
    expect(shortNameNeeded(newTeamInput({ name: 'فرج' }, 's'))).toBe(true);
    expect(shortNameNeeded(newTeamInput({ name: 'فرج', shortName: 'stars' }, 's'))).toBe(false);
    expect(shortNameNeeded(newTeamInput({ name: 'Blue Jays' }, 's'))).toBe(false);
    // No name at all is the command's to refuse, not a short-name question.
    expect(shortNameNeeded(changeTeamInput({ name: '' }))).toBe(false);
  });

  it('leaves out what was not given, and takes the color only when not using the own colors', () => {
    expect(newTeamInput({ name: 'A', useOwnColors: 'on', color: '#ff0000' }, 's')).toEqual({
      seasonId: 's',
      name: 'A',
      shortName: 'a',
    });
    expect(newTeamInput({ name: 'A', color: '#ff0000', divisionId: 'd' }, 's')).toMatchObject({
      color: '#ff0000',
      divisionId: 'd',
    });
  });

  it('puts back the league colors and no division when the form says so', () => {
    expect(changeTeamInput({ team: 't', version: '3', name: 'A', useOwnColors: 'on' })).toEqual({
      teamId: 't',
      version: 3,
      name: 'A',
      shortName: 'a',
      color: null,
      divisionId: null,
    });
  });

  it('takes a number away when it is emptied, and never guesses a leaving date', () => {
    expect(
      changeEntryInput({ entry: 'e', version: '2', jerseyNumber: ' ', role: 'coach' }),
    ).toEqual({
      rosterEntryId: 'e',
      version: 2,
      jerseyNumber: null,
      role: 'coach',
    });
    expect(markLeftInput({ entry: 'e', version: '2', leftOn: '' }).leftOn).toBe('');
  });

  it('moves one place and stops at the ends', () => {
    const ids = ['a', 'b', 'c'];
    expect(movedOrder(ids, 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(movedOrder(ids, 'b', 'down')).toEqual(['a', 'c', 'b']);
    expect(movedOrder(ids, 'a', 'up')).toEqual(ids);
    expect(movedOrder(ids, 'c', 'down')).toEqual(ids);
    expect(movedOrder(ids, 'x', 'down')).toEqual(ids);
  });
});

describe('words the screens build from parts', () => {
  it('takes the name order and the division brackets from the message file', () => {
    expect(t('adminTeams.personName', { firstName: 'Ali', lastName: 'Test' })).toBe('Ali Test');
    expect(t('adminTeams.inDivision', { division: 'North' })).toBe(' (North)');
  });
});

describe('a player added at the scorer’s table by number only (S-34)', () => {
  it('is "#12" on the admin’s roster and box score grid, never a blank name', () => {
    expect(rosterName({ firstName: '', lastName: '', jerseyNumber: '12' })).toBe('#12');
    expect(rosterName({ firstName: 'Yusuf', lastName: '', jerseyNumber: '12' })).toBe('Yusuf');
    expect(rosterName({ firstName: 'Ada', lastName: 'Lionel', jerseyNumber: null })).toBe(
      'Ada Lionel',
    );
    expect(rosterName({ firstName: '', lastName: '', jerseyNumber: null })).toBe('No name yet');
    expect(rosterName({ firstName: '', lastName: '' })).toBe('No name yet');
    expect(hasName({ firstName: '', lastName: ' ' })).toBe(false);
    expect(hasName({ firstName: 'Yusuf', lastName: '' })).toBe(true);
  });

  it('has words for the mark that a player waits for review', () => {
    expect(t('adminTeams.roster.toReview')).toMatch(/review/);
  });

  it('marks a number worn by two players now, on both, for the admin (S-44)', () => {
    const line = (jerseyNumber: string | null, leftOn: string | null = null) => ({
      jerseyNumber,
      leftOn,
    });
    expect([
      ...numbersWornTwice([line('5'), line('5'), line('7'), line(null), line(null)]),
    ]).toEqual(['5']);
    expect([...numbersWornTwice([line('5'), line('5', '2026-10-01')])]).toEqual([]);
    expect(t('adminTeams.roster.numberTwice', { number: '5' })).toBe('(#5 is worn by two players)');
  });
});

describe('answers in the address', () => {
  it('carries what went well and picks its words', () => {
    expect(answerQuery(done('left'))).toBe('?done=left');
    const key = doneKey({ done: 'left' });
    expect(key && t(key)).toBe('The player was marked as having left.');
    expect(doneKey({ done: 'anything-else' })).toBeUndefined();
  });

  it('has words for every thing that can go well', () => {
    for (const name of doneNames) expect(doneKey({ done: name })).toBeDefined();
  });

  it('carries a refused leaving date to its line, with the date typed and nothing else (step 2.161)', () => {
    const entry = '01900000-0000-7000-8000-0000000e0001';
    const query = answerQuery(
      refused('teams.mark_left', 'left-after-today', { entry, leftOn: '2027-11-15' }),
    );
    expect(query).toBe(
      `?problem=teams.mark_left.left-after-today&entry=${entry}&leftOn=2027-11-15#entry-${entry}`,
    );
    expect(
      leavingAtOf({ problem: 'teams.mark_left.left-after-today', entry, leftOn: '2027-11-15' }),
    ).toEqual({ entry, leftOn: '2027-11-15' });
    // Not a date: the field is drawn empty. Not an entry, or no refusal: nothing is said beside.
    expect(answerQuery(refused('teams.mark_left', 'x', { entry, leftOn: '<b>' }))).toContain(
      'leftOn=#',
    );
    expect(leavingAtOf({ problem: 'p', entry, leftOn: 'soon' })).toEqual({ entry, leftOn: '' });
    expect(leavingAtOf({ problem: 'p', entry: 'nope', leftOn: '2027-11-15' })).toBeUndefined();
    expect(leavingAtOf({ entry, leftOn: '2027-11-15' })).toBeUndefined();
    expect(answerQuery(refused('teams.mark_left', 'x', { entry: 'nope', leftOn: '' }))).toBe(
      '?problem=teams.mark_left.x',
    );
  });

  it('promises no way back from the bin that no screen offers (step 2.161)', () => {
    for (const key of [
      'adminTeams.remove.body',
      'adminTeams.done.removed',
      'adminTeams.done.personRemoved',
    ] as const) {
      expect(t(key)).toContain('kept for 30 days; the screen to bring');
      expect(t(key)).not.toMatch(/can be brought back|restore/i);
    }
    expect(t.plural('adminTeams.remove.roster', 2)).toBe(
      '2 people are on its roster now. Once the team is removed, they can be taken off the league list.',
    );
  });

  it('carries a refusal and picks the command’s own words, then the code’s, then a general one', () => {
    expect(answerQuery(refused('people.remove_person', 'person-on-a-roster'))).toBe(
      '?problem=people.remove_person.person-on-a-roster',
    );
    const own = problemKey({ problem: 'people.remove_person.person-on-a-roster' });
    expect(own && t(own)).toContain('still on a roster');
    const byCode = problemKey({ problem: 'teams.update_team.changed-since-read' });
    expect(byCode && t(byCode)).toContain('Someone else changed this');
    const general = problemKey({ problem: 'teams.update_team.something-new' });
    expect(general && t(general)).toBe('That could not be done.');
    expect(problemKey({})).toBeUndefined();
  });

  it('has words for every refusal the screens can meet', () => {
    const codes: readonly [string, string][] = [
      ['teams.create_team', 'team-short-name-taken'],
      ['teams.create_team', 'team-name-taken'],
      ['teams.update_team', 'team-name-taken'],
      ['teams.set_stats_visibility', 'teams-may-not-choose'],
      ['teams.add_to_roster', 'jersey-taken'],
      ['teams.mark_left', 'already-left'],
      ['teams.reorder_roster', 'roster-incomplete'],
      ['people.remove_person', 'person-on-a-roster'],
      ['teams.add_to_roster', 'invalid-input'],
      ['teams.add_to_roster', 'not-allowed'],
      ['teams.add_new_person', 'not-undone'],
      ['teams.list_roster', 'team-not-found'],
      ['teams.reorder_roster', 'invalid-input'],
      ['teams.create_team', 'short-name-needed'],
      ['teams.update_team', 'short-name-needed'],
      ['teams.mark_left', 'left-after-today'],
      ['teams.put_back_on_roster', 'not-left'],
      ['teams.put_back_on_roster', 'person-not-found'],
      ['teams.put_back_on_roster', 'already-on-team'],
      ['teams.put_back_on_roster', 'jersey-taken'],
      ['teams.put_back_on_roster', 'roster-entry-not-found'],
    ];
    for (const [command, code] of codes) {
      const key = problemKey({ problem: `${command}.${code}` });
      expect(key).toBeDefined();
      expect(key && t(key)).not.toBe('That could not be done.');
    }
  });
});
