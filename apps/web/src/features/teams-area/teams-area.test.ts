// The Teams screens' small rules that need no server: how forms become command input,
// how an answer travels in the address, and how the words for it are chosen (step 2.51).
import { createTranslator } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import {
  answerQuery,
  doneAtOf,
  doneKey,
  doneNames,
  leavingAtOf,
  problemKey,
  refused,
  removeRefusalOf,
  removeTeamAnchor,
  done,
} from './answer.ts';
import { removePanel, tapRefusal } from './remove-team-words.ts';
import { removeTeamPanelAnchor } from '../schedule-builder/back-to-team.ts';
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
import { offTheLeagueList, putBackOffer } from './put-back-offer.ts';
import { saidOnLine } from './said-on-line.ts';

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

  it('says a player put back without their number on their own line, naming both (R-32)', () => {
    const entry = '01900000-0000-7000-8000-0000000e0001';
    const answer = done('putBackNoNumber', { entry, number: '11' });
    const query = answerQuery(answer);
    expect(query).toBe(`?done=putBackNoNumber&entry=${entry}&number=11#entry-${entry}`);
    const found = doneAtOf({ done: 'putBackNoNumber', entry, number: '11' });
    expect(found).toEqual({ done: 'putBackNoNumber', at: { entry, number: '11' } });
    const line = (id: string, first: string, last: string, jerseyNumber: string | null) => ({
      id,
      teamId: 't',
      personId: `p-${id}`,
      jerseyNumber,
      role: 'player',
      joinedOn: null,
      leftOn: null,
      sort: 0,
      version: 1,
      firstName: first,
      lastName: last,
      publicName: null,
    });
    const lines = [line(entry, 'Marcus', 'Oyelaran', null), line('e2', 'Dana', 'Whitfield', '11')];
    expect(saidOnLine(found, lines, 'Falcons')).toEqual({
      entry,
      text: 'Marcus Oyelaran is back on the roster with no number: 11 is now worn by Dana Whitfield. Give them a number.',
    });
    // Nobody wears it now: still true words, and no wearer named.
    expect(saidOnLine(found, [lines[0] ?? line(entry, '', '', null)], 'Falcons')?.text).toBe(
      'Marcus Oyelaran is back on the roster with no number: someone else on the team now wears 11. Give them a number.',
    );
    // A number that is not a jersey number is never carried; an entry not on the page says nothing.
    expect(doneAtOf({ done: 'putBackNoNumber', entry, number: '<b>' })?.at).toEqual({ entry });
    expect(saidOnLine(doneAtOf({ done: 'putBack', entry: 'x' }), lines, 'Falcons')).toBeUndefined();
    // An address carrying the mark on a line that has a number says nothing about having none.
    const numbered = [
      line(entry, 'Marcus', 'Oyelaran', '7'),
      line('e2', 'Dana', 'Whitfield', '11'),
    ];
    expect(saidOnLine(found, numbered, 'Falcons')).toBeUndefined();
  });

  it('names who left and which team, on their "left" line', () => {
    const entry = '01900000-0000-7000-8000-0000000e0002';
    const left = {
      id: entry,
      teamId: 't',
      personId: 'p',
      jerseyNumber: '11',
      role: 'player',
      joinedOn: null,
      leftOn: '2026-11-13',
      sort: 0,
      version: 2,
      firstName: 'Marcus',
      lastName: 'Oyelaran',
      publicName: null,
    };
    expect(answerQuery(done('left', { entry }))).toBe(`?done=left&entry=${entry}#entry-${entry}`);
    expect(saidOnLine(doneAtOf({ done: 'left', entry }), [left], 'Falcons')).toEqual({
      entry,
      text: 'Marcus Oyelaran was marked as having left Falcons.',
    });
    // Not said if the line no longer shows them as left.
    expect(
      saidOnLine(doneAtOf({ done: 'left', entry }), [{ ...left, leftOn: null }], 'Falcons'),
    ).toBeUndefined();
  });

  it('offers "Put back" only where it can work, and says why not in words', () => {
    const list = (ids: string[], complete = true) => ({ ids: new Set(ids), complete });
    expect(putBackOffer('p1', new Set(), list(['p1']))).toBe('offer');
    // On the team again by a later entry.
    expect(putBackOffer('p1', new Set(['p1']), list(['p1']))).toBe('back');
    // Taken off the league list, known because the whole list was read.
    expect(putBackOffer('p1', new Set(), list(['p2']))).toBe('off-the-list');
    // A list cut short, or not read: never claims they were taken off.
    expect(putBackOffer('p1', new Set(), list(['p2'], false))).toBe('offer');
    expect(putBackOffer('p1', new Set(), undefined)).toBe('offer');
    expect(t('adminTeams.roster.offTheList')).toContain('taken off the league list');
  });

  it('marks a roster line whose person is in the bin, only when the whole list was read (S-84)', () => {
    const list = (ids: string[], complete = true) => ({ ids: new Set(ids), complete });
    expect(offTheLeagueList('p1', list(['p2']))).toBe(true);
    expect(offTheLeagueList('p1', list(['p1']))).toBe(false);
    expect(offTheLeagueList('p1', list(['p2'], false))).toBe(false);
    expect(offTheLeagueList('p1', undefined)).toBe(false);
    expect(t('adminTeams.roster.notOnTheList')).toContain('not on the league list');
  });

  it('says a removal moved it to the bin, whose screen brings it back (steps 2.161, 2.77)', () => {
    expect(t('adminTeams.remove.body')).toContain('kept for 30 days.');
    for (const key of ['adminTeams.done.removed', 'adminTeams.done.personRemoved'] as const) {
      expect(t(key)).toMatch(/^Moved to the bin/);
      expect(t(key)).toContain('30 days.');
      expect(t(key)).not.toMatch(/not ready/i);
    }
    // Putting back a cancelled game whose team, venue or court is in the bin: the bin is
    // where that is brought back, not "ask the league's owner" (polish list, 2.140).
    for (const key of [
      'admin.games.error.game-part-in-bin',
      'error.leagues.restore_game.game-part-in-bin',
    ] as const) {
      expect(t(key)).toContain('Bring that back first, from the bin in League settings.');
      expect(t(key)).not.toMatch(/ask the league’s owner|not ready|for now/i);
    }
    expect(t.plural('adminTeams.remove.roster', 2)).toBe(
      '2 people are on its roster now. Once the team is removed, they can be taken off the league list.',
    );
  });

  describe('"Remove this team" says what is true now (A-17)', () => {
    const at = (date: string, round: number | null = 6) => ({ date, round });
    const has = (
      played: number,
      which: { date: string | null; round: number | null }[],
      removedInDraft = 0,
    ) => ({ played, toPlay: which.length, removedInDraft, which });
    const ways = (panel: ReturnType<typeof removePanel>) =>
      panel.kind === 'held' ? panel.ways.map((w) => w.anchor ?? w.area) : [];

    it('a team with no games, or whose games could not be read, has the tick and the button', () => {
      expect(removePanel('Wrens', has(0, []))).toEqual({
        kind: 'free',
        lines: ['This team has played no games.', 'It has no game without a result.'],
      });
      expect(removePanel('Wrens', undefined)).toMatchObject({ kind: 'free' });
    });

    it('a team with results cannot be removed this season; advice only when it has games to come', () => {
      const panel = removePanel('Badgers', has(3, [at('2026-11-22'), at('2026-11-29', 7)]));
      expect(panel).toMatchObject({
        kind: 'held',
        why: 'Badgers cannot be removed this season: its results are part of other teams’ records.',
        lines: [
          'This team has played 3 games.',
          'It has 2 games without a result yet: Round 6, Sun, Nov 22; Round 7, Sun, Nov 29.',
          'If the team has left the league, mark it so above, under “If this team leaves the league”: it stays, with the games it played, and its games still to come are yours to forfeit or cancel in Games.',
        ],
      });
      expect(ways(panel)).toEqual(['games', 'schedule']);
      // No games to come: no advice to forfeit them, and no way on.
      const done = removePanel('Badgers', has(1, []));
      expect(done).toMatchObject({
        kind: 'held',
        lines: ['This team has played 1 game.', 'It has no game without a result.'],
      });
      expect(ways(done)).toEqual([]);
    });

    it('a team with only games without a result cannot be removed yet: remove or cancel, never forfeit', () => {
      const panel = removePanel('Kestrels', has(0, [at('2026-11-22'), at('2026-11-22')]));
      expect(panel).toMatchObject({
        kind: 'held',
        why: 'Kestrels cannot be removed yet: it has games without a result.',
        lines: [
          'This team has played no games.',
          'It has 2 games without a result yet: Round 6, Sun, Nov 22; Round 6, Sun, Nov 22.',
          'Remove them from the schedule in Schedule, or cancel this week’s in Games. Do not record them as forfeited: a forfeit is a result, and a team with a result cannot be removed.',
        ],
      });
      expect(ways(panel)).toEqual(['schedule', 'games']);
      // Many games: counted, not named one by one.
      const many = removePanel(
        'Kestrels',
        has(
          0,
          [1, 2, 3, 4].map(() => at('2026-11-22')),
        ),
      );
      expect(many.kind === 'held' && many.lines[1]).toBe('It has 4 games without a result yet.');
      expect(t('adminTeams.remove.noDay')).toBe('no day yet');
    });

    it('games removed in the draft and not yet published: say so, and lead to publishing', () => {
      const all = removePanel('Kestrels', has(0, [at('2026-11-22'), at('2026-11-29')], 2));
      expect(all).toMatchObject({
        kind: 'held',
        lines: [
          'This team has played no games.',
          'It has 2 games without a result yet: Round 6, Sun, Nov 22; Round 6, Sun, Nov 29.',
          '2 of them are removed in the draft, which is not published yet: publish the schedule to finish.',
        ],
      });
      expect(ways(all)).toEqual(['publish']);
      const some = removePanel('Kestrels', has(0, [at('2026-11-22'), at('2026-11-29')], 1));
      expect(some.kind === 'held' && some.lines).toContain(
        '1 of them is removed in the draft, which is not published yet: publish the schedule to finish.',
      );
      expect(ways(some)).toEqual(['schedule', 'games', 'publish']);
    });

    it('never draws a refusal for games or results from the address: only a tap’s own', () => {
      const address = answerQuery(refused('teams.remove_team', 'team-has-games-to-play'));
      expect(address).toBe('?problem=teams.remove_team.team-has-games-to-play#remove-team');
      expect(removeRefusalOf({ problem: 'teams.remove_team.team-has-results' })).toBe(
        'team-has-results',
      );
      expect(removeRefusalOf({ problem: 'teams.mark_left.already-left' })).toBeUndefined();
      expect(tapRefusal('team-has-games-to-play')).toBeUndefined();
      expect(tapRefusal('team-has-results')).toBeUndefined();
      expect(tapRefusal('not-confirmed')).toBe(
        'Tick the box to confirm first. Nothing was changed.',
      );
      expect(tapRefusal('team-not-found')).toBe('That team is not there.');
    });

    it('the way back from Schedule lands on this panel', () => {
      expect(removeTeamPanelAnchor).toBe(removeTeamAnchor);
    });
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
      ['teams.remove_team', 'team-has-games-to-play'],
      ['teams.remove_team', 'team-has-results'],
      ['teams.remove_team', 'not-confirmed'],
    ];
    for (const [command, code] of codes) {
      const key = problemKey({ problem: `${command}.${code}` });
      expect(key).toBeDefined();
      expect(key && t(key)).not.toBe('That could not be done.');
    }
  });
});
