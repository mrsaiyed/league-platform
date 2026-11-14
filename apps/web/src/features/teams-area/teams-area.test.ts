// The Teams screens' small rules that need no server: how forms become command input,
// how an answer travels in the address, and how the words for it are chosen (step 2.51).
import { createTranslator } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { answerQuery, doneKey, doneNames, problemKey, refused, done } from './answer.ts';
import {
  changeEntryInput,
  changeTeamInput,
  markLeftInput,
  movedOrder,
  newTeamInput,
  shortNameFrom,
} from './form-input.ts';

const t = createTranslator('en');

describe('form input', () => {
  it('makes a short name from the name when none is typed', () => {
    expect(shortNameFrom('Blue Jays!')).toBe('blue-jays');
    expect(shortNameFrom('  Zoë & Friends ')).toBe('zoe-friends');
    expect(newTeamInput({ name: 'Blue Jays', shortName: '' }, 's').shortName).toBe('blue-jays');
    expect(newTeamInput({ name: 'Blue Jays', shortName: 'jays' }, 's').shortName).toBe('jays');
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

  it('takes a number away when it is emptied, and leaves today for an empty date', () => {
    expect(
      changeEntryInput({ entry: 'e', version: '2', jerseyNumber: ' ', role: 'coach' }),
    ).toEqual({
      rosterEntryId: 'e',
      version: 2,
      jerseyNumber: null,
      role: 'coach',
    });
    expect(markLeftInput({ entry: 'e', version: '2', leftOn: '' }, '2026-11-13').leftOn).toBe(
      '2026-11-13',
    );
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
    ];
    for (const [command, code] of codes) {
      const key = problemKey({ problem: `${command}.${code}` });
      expect(key).toBeDefined();
      expect(key && t(key)).not.toBe('That could not be done.');
    }
  });
});
