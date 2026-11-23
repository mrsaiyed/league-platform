import { describe, expect, it } from 'vitest';
import { shownTeamNames } from './shown-team-names.ts';

describe('the team names the games list shows', () => {
  it('marks a team in the bin as removed, and leaves the others', () => {
    const shown = shownTeamNames({
      teams: { a: 'Owls', b: 'Otters' },
      removedTeams: ['b'],
      scorekeepers: {},
      seasons: {},
      people: {},
    });
    expect(shown.teams).toEqual({ a: 'Owls', b: 'Otters (removed)' });
  });
});
