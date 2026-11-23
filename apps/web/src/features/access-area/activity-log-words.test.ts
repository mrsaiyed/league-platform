import type { ActivityRecord } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { logLineOf, type LogThingName } from './activity-log-view.ts';
import { logSentenceOf, whoChoicesOf } from './activity-log-words.ts';
import type { PersonLine } from './access-view.ts';

const team = '01900000-0000-7000-8000-0000000000a1';
const times = { locale: 'en', timeZone: 'America/Chicago' };
const line = (more: Partial<ActivityRecord>) =>
  logLineOf(
    {
      id: team,
      at: '2026-11-20T18:00:00.000Z',
      actorAccountId: null,
      action: 'teams.remove_team',
      targetType: 'team',
      targetId: team,
      summary: 'activity.teams.remove_team',
      details: {},
      ...more,
    },
    new Set(),
  );
const named = (...things: LogThingName[]) => new Map(things.map((thing) => [thing.id, thing]));

describe("the activity log's sentences (step 2.77)", () => {
  it('names the team as it is named now, written as text', () => {
    const found = named({ kind: 'team', id: team, name: 'Riverside <b>Hawks</b>' });
    expect(logSentenceOf(line({}), '', found, times)).toBe(
      'Moved the team Riverside <b>Hawks</b> to the bin',
    );
  });

  it('says the plain sentence when the thing was removed for good, or has no name', () => {
    expect(logSentenceOf(line({}), '', named(), times)).toBe('Moved a team to the bin');
    const nameless = named({ kind: 'person', id: team, firstName: ' ', lastName: '' });
    const person = line({
      action: 'people.remove_person',
      summary: 'activity.people.remove_person',
      targetType: 'person',
    });
    expect(logSentenceOf(person, '', nameless, times)).toBe('Moved a person to the bin');
    // A thing of another kind with the same id is not the one the entry means.
    const wrongKind = named({ kind: 'venue', id: team, name: 'North Gym' });
    expect(logSentenceOf(line({}), '', wrongKind, times)).toBe('Moved a team to the bin');
  });

  it("names a person as the People page does, and a game by its teams and its league's day", () => {
    const person = line({
      action: 'people.remove_person',
      summary: 'activity.people.remove_person',
      targetType: 'person',
    });
    const ada = named({ kind: 'person', id: team, firstName: 'Ada', lastName: 'Example' });
    expect(logSentenceOf(person, '', ada, times)).toBe('Moved the person Ada Example to the bin');
    const game = line({
      action: 'games.cancel_game',
      summary: 'activity.games.cancel_game',
      targetType: 'game',
    });
    const late = named({
      kind: 'game',
      id: team,
      homeName: 'Hawks',
      awayName: 'Owls',
      startsAt: '2026-12-06T03:00:00.000Z',
    });
    expect(logSentenceOf(game, '', late, times)).toBe(
      'Cancelled the game Hawks against Owls on Dec 5, 2026',
    );
  });

  it('gives every "Who" choice its roles, and numbers two that would read the same', () => {
    const person = (accountId: string, more: Partial<PersonLine>): PersonLine => ({
      accountId,
      name: null,
      isOwner: false,
      isYou: false,
      grants: [{ grantId: accountId, role: 'coach', program: false }],
      ...more,
    });
    const choices = whoChoicesOf(
      [
        person('a', { isOwner: true, grants: [], name: 'Robin Example', isYou: true }),
        person('b', {}),
        person('c', {}),
        person('d', { grants: [{ grantId: 'd', role: 'scheduler', program: false }] }),
      ],
      (role) => role,
    );
    const labels = choices.map((choice) => choice.label);
    expect(new Set(labels).size).toBe(4);
    expect(labels[0]).toContain('Robin Example');
    expect(labels[1]).toContain('coach');
    expect(labels[3]).toContain('scheduler');
  });
});
