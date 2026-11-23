// The teams of a season whose players' numbers this viewer sees and the public does not
// (step 2.46; S-22, T-87, T-287): what the signed-in request after a public page (T-95)
// asks first. None means the page as everyone gets it is already all this viewer may see,
// and the request answers exactly as for a season with nothing hidden, so it never tells
// anyone that hidden numbers exist. Team ids only: no name, no number, no person.
import { z } from 'zod';
import { fail, ok, type Result } from '../../../command/index.ts';
import {
  publicViewer,
  statsShown,
  type TeamStatsSetting,
  type Viewer,
} from '../../people/index.ts';
import type { StandingsReadStore } from '../read-ports.ts';

export const teamsBeyondPublicInput = z.object({ seasonId: z.uuid() });

export type ReadTeamsBeyondPublicError = {
  readonly code: 'season-not-found' | 'invalid-input';
};

/** The season's teams (none in the bin) this viewer sees more of than anyone, by id. */
export async function readTeamsBeyondPublic(
  store: StandingsReadStore,
  input: z.input<typeof teamsBeyondPublicInput>,
  viewing: {
    /** The league the page is for: the store's own. A viewer of another league sees nothing more. */
    readonly leagueId: string;
    readonly viewer: Viewer;
  },
): Promise<Result<readonly string[], ReadTeamsBeyondPublicError>> {
  const parsed = teamsBeyondPublicInput.safeParse(input);
  if (!parsed.success) return fail({ code: 'invalid-input' });
  const season = await store.findSeason(parsed.data.seasonId);
  if (season === undefined) return fail({ code: 'season-not-found' });
  const { leagueId, viewer } = viewing;
  const everyone = publicViewer(leagueId);
  const teams = await store.teams(season.id);
  return ok(
    teams
      .filter((team) => {
        // A value the settings do not know is read by statsShown as "totals only".
        const setting: TeamStatsSetting = {
          leagueId,
          teamId: team.id,
          statsVisibility: team.statsVisibility as TeamStatsSetting['statsVisibility'],
        };
        return (
          statsShown(setting, viewer) === 'player_lines' &&
          statsShown(setting, everyone) === 'team_totals'
        );
      })
      .map((team) => team.id)
      .sort(),
  );
}
