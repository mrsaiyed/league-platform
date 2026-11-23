// readTeamsBeyondPublic (step 2.46, T-287): which teams' player lines a viewer sees that
// the public does not. Nothing for a visitor, another team's coach or a season with
// nothing hidden, so the signed-in request cannot tell those apart.
import { describe, expect, it } from 'vitest';
import { publicViewer, type Viewer } from '../../people/index.ts';
import {
  leagueId,
  memoryStandingsRead,
  openTeam,
  seasonId,
  staffTeam,
} from '../memory-standings-read.test-helper.ts';
import type { StandingsReadStore } from '../read-ports.ts';
import { readTeamsBeyondPublic } from './read-teams-beyond-public.ts';

const coach: Viewer = { leagueId, leagueAdmin: false, staffOfTeamIds: [staffTeam] };
const otherCoach: Viewer = { leagueId, leagueAdmin: false, staffOfTeamIds: [openTeam] };
const admin: Viewer = { leagueId, leagueAdmin: true, staffOfTeamIds: [] };

/** The same season with every team's numbers public. */
function nothingHidden(): StandingsReadStore {
  const base = memoryStandingsRead();
  return {
    ...base,
    teams: async (id) =>
      (await base.teams(id)).map((team) => ({ ...team, statsVisibility: 'everyone' })),
  };
}

describe('readTeamsBeyondPublic (S-22, T-87)', () => {
  it('names the staff-only team to its coach and to an admin, and only it', async () => {
    for (const viewer of [coach, admin]) {
      expect(
        await readTeamsBeyondPublic(memoryStandingsRead(), { seasonId }, { leagueId, viewer }),
      ).toEqual({
        ok: true,
        value: [staffTeam],
      });
    }
  });

  it("names nothing to a visitor or another team's coach, as for a season with nothing hidden", async () => {
    const none = { ok: true, value: [] };
    for (const viewer of [publicViewer(leagueId), otherCoach]) {
      expect(
        await readTeamsBeyondPublic(memoryStandingsRead(), { seasonId }, { leagueId, viewer }),
      ).toEqual(none);
    }
    for (const viewer of [publicViewer(leagueId), otherCoach, coach, admin]) {
      expect(
        await readTeamsBeyondPublic(nothingHidden(), { seasonId }, { leagueId, viewer }),
      ).toEqual(none);
    }
  });

  it('names nothing to a viewer of another league, whatever its roles', async () => {
    const foreign: Viewer = {
      leagueId: '01900000-0000-7000-8000-000000000002',
      leagueAdmin: true,
      staffOfTeamIds: [staffTeam],
    };
    expect(
      await readTeamsBeyondPublic(
        memoryStandingsRead(),
        { seasonId },
        { leagueId, viewer: foreign },
      ),
    ).toEqual({
      ok: true,
      value: [],
    });
  });

  it('reads a level it does not know as totals only for everyone, so it names no team', async () => {
    const base = memoryStandingsRead();
    const store: StandingsReadStore = {
      ...base,
      teams: async (id) =>
        (await base.teams(id)).map((team) => ({ ...team, statsVisibility: 'members' })),
    };
    expect(await readTeamsBeyondPublic(store, { seasonId }, { leagueId, viewer: admin })).toEqual({
      ok: true,
      value: [],
    });
  });

  it('says a season that is not there is not found, and refuses what is not an id', async () => {
    expect(
      await readTeamsBeyondPublic(
        memoryStandingsRead(),
        { seasonId: '01900000-0000-7000-8000-00000000ffff' },
        { leagueId, viewer: admin },
      ),
    ).toEqual({ ok: false, error: { code: 'season-not-found' } });
    expect(
      await readTeamsBeyondPublic(
        memoryStandingsRead(),
        { seasonId: 'x' },
        { leagueId, viewer: admin },
      ),
    ).toEqual({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });
});
