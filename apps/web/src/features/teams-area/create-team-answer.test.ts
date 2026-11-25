import { catalogs } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { createTeamRefusal } from './create-team-answer.ts';

const english = catalogs['en'] ?? {};

describe('a refused "Add team" (step 2.155)', () => {
  it('marks the short name a check refused, and names it', () => {
    const refusal = createTeamRefusal('invalid-input', [{ path: 'shortName' }]);
    expect(refusal.wrong).toEqual(['shortName']);
    expect(english[refusal.said]).toMatch(/^The short name /);
  });

  it('marks every box refused, in the order on the screen, and speaks of the first', () => {
    const refusal = createTeamRefusal('invalid-input', [{ path: 'color' }, { path: 'name' }]);
    expect(refusal.wrong).toEqual(['name', 'color']);
    expect(english[refusal.said]).toMatch(/^The team's name /);
  });

  it('names the box of a refusal of the command itself', () => {
    expect(createTeamRefusal('team-short-name-taken').wrong).toEqual(['shortName']);
    expect(createTeamRefusal('team-name-taken').wrong).toEqual(['name']);
    expect(createTeamRefusal('short-name-needed')).toEqual({
      wrong: ['shortName'],
      said: 'error.short-name-needed',
    });
    expect(createTeamRefusal('division-not-found').said).toBe(
      'error.teams.create_team.division-not-found',
    );
  });

  it('says a refusal about no box beside the button, in words that exist', () => {
    const refusal = createTeamRefusal('not-allowed');
    expect(refusal.wrong).toEqual([]);
    expect(Object.hasOwn(english, refusal.said)).toBe(true);
    expect(createTeamRefusal('invalid-input', [{ path: 'seasonId' }])).toEqual({
      wrong: [],
      said: 'error.invalid-input',
    });
  });
});
