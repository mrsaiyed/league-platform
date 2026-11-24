// Moves a team to the bin (A-5): its row stays, with `deleted_at` set, and so does
// everything that points at it (its roster, its games), so bringing it back brings
// them back (step 2.76). Its name and short name are free for another team meanwhile.
//
// A team with games is not moved (A-17): its results are part of other teams' records, and
// a game still to play would stay on the public schedule with a team nobody can open. A
// result is said first, since removing games to come would not free such a team; a team
// with neither (cancelled games hold none) goes to the bin as before.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangeTeams, teamScope } from '../policy.ts';
import type { TeamsTx } from '../ports.ts';
import { teamGamesOf } from '../team-games.ts';
import { teamInArchivedSeason } from '../archived-season.ts';

export type RemoveTeamError =
  | { readonly code: 'team-not-found' }
  /** It has a final or forfeited result in this many games. */
  | { readonly code: 'team-has-results'; readonly played: number }
  /** It still has this many games to play, published or in the draft. */
  | { readonly code: 'team-has-games-to-play'; readonly toPlay: number };

export const removeTeam = defineCommand({
  name: 'teams.remove_team',
  permission: 'teams.manage',
  refusedInArchivedSeason: teamInArchivedSeason,
  input: z.object({ teamId: z.uuid() }),
  allowed: async (context, input, tx: TeamsTx) =>
    mayChangeTeams(context, tx, await teamScope(tx, input.teamId)),
  run: async ({ context, input, tx }): Promise<Result<{ teamId: string }, RemoveTeamError>> => {
    const team = await tx.teams.find(input.teamId);
    if (team === undefined || team.binned) return fail({ code: 'team-not-found' });
    const games = await teamGamesOf(tx, team);
    if (games.played > 0) return fail({ code: 'team-has-results', played: games.played });
    if (games.toPlay > 0) return fail({ code: 'team-has-games-to-play', toPlay: games.toPlay });
    await tx.teams.setBinned(team.id, true);
    await recordActivity(tx, context, {
      action: 'teams.remove_team',
      target: { type: 'team', id: team.id },
    });
    return ok({ teamId: team.id });
  },
});
