// What a team page's "your team" part draws (step 2.168): nothing of the device's choice
// shown until the private read has answered or failed, so a coach never sees "Make this my
// team" flash on their own team's page; and a member's line on the current season only.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TeamMine, teamMineShows } from './my-team-marks.tsx';
import type { MyTeamReply } from './my-team-read.ts';

const words = {
  yours: 'This is your team.',
  opensHere: 'This is your team. The league opens here for you.',
  mark: 'Your team',
};
const coach: MyTeamReply = {
  teams: ['rockets'],
  startsOn: 'rockets',
  marked: [{ slug: 'rockets', name: 'Rockets', color: null, href: '/harbor-city/teams/rockets' }],
  words,
};
const signedOut: MyTeamReply = { teams: [], startsOn: null, marked: [] };
const parent: MyTeamReply = { ...signedOut, marked: coach.marked, words };

describe('TeamMine', () => {
  it('keeps the device choice unseen while the read is out, in the page for scripts off', () => {
    expect(teamMineShows(undefined, 'rockets', true)).toBe('waiting');
    // As the page arrives (before any script), the choice is there inside the wrapper the
    // style sheet hides only where scripts run.
    const drawn = renderToStaticMarkup(
      createElement(
        TeamMine,
        { address: '/api/v1/leagues/x/my-team', slug: 'rockets', isCurrent: true },
        createElement('button', { type: 'submit' }, 'Make this my team'),
      ),
    );
    expect(drawn).toBe(
      '<div class="team-mine-wait"><button type="submit">Make this my team</button></div>',
    );
  });

  it('shows the choice to a signed-out visitor, a parent with no team, and after a failed read', () => {
    expect(teamMineShows(signedOut, 'rockets', true)).toBe('choice');
    expect(teamMineShows(parent, 'rockets', true)).toBe('choice');
    expect(teamMineShows(null, 'rockets', true)).toBe('choice');
  });

  it('tells a coach it is their team, and never offers them the choice on any team', () => {
    expect(teamMineShows(coach, 'rockets', true)).toEqual({ line: words.opensHere });
    expect(teamMineShows({ ...coach, startsOn: null }, 'rockets', true)).toEqual({
      line: words.yours,
    });
    expect(teamMineShows(coach, 'comets', true)).toBe('nothing');
  });

  it("says nothing of theirs on a past season's page of a team with the same short name", () => {
    expect(teamMineShows(coach, 'rockets', false)).toBe('nothing');
  });
});
