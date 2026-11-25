import type { RosterLine } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import type { SavedNotice } from '../../server/saved-notice.ts';
import {
  doneAtOf,
  doneKey,
  done,
  leavingAtOf,
  problemKey,
  refused,
  removeRefusalOf,
} from './answer.ts';
import { answerHolds, answerQueryOf, teamsAnswerSaid, teamsListThing } from './answer-notice.ts';

const team = '01900000-0000-7000-8000-00000000aa01';
const entry = '01900000-0000-7000-8000-0000000e0002';
const left = (said: string, thing: string = team): SavedNotice => ({
  screen: 'teams',
  thing,
  said,
});
const line = (leftOn: string | null): RosterLine => ({
  id: entry,
  teamId: team,
  personId: 'p',
  jerseyNumber: '11',
  role: 'player',
  joinedOn: null,
  leftOn,
  sort: 0,
  version: 2,
  firstName: 'Marcus',
  lastName: 'Oyelaran',
  publicName: null,
});

describe("a Teams answer travels in the server's notice, not the address (T-435)", () => {
  it('is read back as the page read it from the address, on the line it was about', () => {
    const { said, anchor } = teamsAnswerSaid(done('left', { entry }));
    expect(said).toBe(`?done=left&entry=${entry}`);
    expect(anchor).toBe(`#entry-${entry}`);
    expect(doneAtOf(answerQueryOf(left(said), team))).toEqual({ done: 'left', at: { entry } });
    const typed = teamsAnswerSaid(
      refused('teams.mark_left', 'left-after-today', { entry, leftOn: '2027-11-15' }),
    );
    expect(leavingAtOf(answerQueryOf(left(typed.said), team))).toEqual({
      entry,
      leftOn: '2027-11-15',
    });
    expect(problemKey(answerQueryOf(left(typed.said), team))).toBe(
      problemKey({ problem: 'teams.mark_left.left-after-today' }),
    );
    const removing = teamsAnswerSaid(refused('teams.remove_team', 'has-games'));
    expect(removing.anchor).toBe('#remove-team');
    expect(removeRefusalOf(answerQueryOf(left(removing.said), team))).toBe('has-games');
    const removed = teamsAnswerSaid(done('removed'));
    expect(doneKey(answerQueryOf(left(removed.said, teamsListThing), teamsListThing))).toBe(
      'adminTeams.done.removed',
    );
  });

  it('says nothing to another page, another screen, or a notice it did not leave', () => {
    const { said } = teamsAnswerSaid(done('moved'));
    expect(answerQueryOf(undefined, team)).toEqual({});
    expect(answerQueryOf(left(said), teamsListThing)).toEqual({});
    expect(answerQueryOf(left(said, teamsListThing), team)).toEqual({});
    expect(answerQueryOf({ screen: 'bin', thing: team, said }, team)).toEqual({});
    expect(answerQueryOf(left('created'), team)).toEqual({});
  });

  it('gives a kept answer again only while it is still true', () => {
    const now = (leftOn: string | null, teamLeft?: boolean) => ({
      lines: [line(leftOn)],
      team: teamLeft === undefined ? undefined : { left: teamLeft },
    });
    expect(answerHolds(done('left', { entry }), now('2026-11-13', false))).toBe(true);
    expect(answerHolds(done('left', { entry }), now(null, false))).toBe(false);
    expect(answerHolds(done('putBack', { entry }), now(null, false))).toBe(true);
    expect(answerHolds(done('putBack', { entry }), now('2026-11-13', false))).toBe(false);
    expect(answerHolds(done('putBack', { entry }), { lines: undefined, team: undefined })).toBe(
      false,
    );
    expect(answerHolds(done('teamLeft'), now(null, true))).toBe(true);
    expect(answerHolds(done('teamLeft'), now(null, false))).toBe(false);
    expect(answerHolds(done('teamBack'), now(null, false))).toBe(true);
    expect(answerHolds(done('removed'), now(null))).toBe(true);
    expect(answerHolds(done('removed'), now(null, false))).toBe(false);
    expect(answerHolds(done('moved'), now(null, false))).toBe(false);
  });

  it('gives a kept move again while the roster is in the order it left (fix round of part 6)', () => {
    const other = { ...line(null), id: '01900000-0000-7000-8000-0000000e0003', sort: 1 };
    const moved = { openOrder: [other.id, entry] };
    const roster = (lines: readonly RosterLine[]) => ({ lines, team: { left: false } });
    expect(answerHolds(done('moved'), roster([other, line(null)]), moved)).toBe(true);
    // Moved back since, or the player since marked as left: run again, answered as now.
    expect(answerHolds(done('moved'), roster([line(null), other]), moved)).toBe(false);
    expect(answerHolds(done('moved'), roster([other, line('2026-11-13')]), moved)).toBe(false);
    expect(answerHolds(done('moved'), { lines: undefined, team: undefined }, moved)).toBe(false);
  });
});
