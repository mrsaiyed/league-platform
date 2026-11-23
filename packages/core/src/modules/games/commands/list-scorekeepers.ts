// Admin → Games → Scorekeepers (step 2.56; P4 §3 "Games: assign scorekeepers", P7 §5.1):
// a season's games still to be decided, each with who is assigned to score it, and the
// people who may be assigned to them (assign-scorekeeper.ts takes only those). Who may be
// assigned is the one rule the assigning checks: `games.score` at the season's program,
// so the owner, and every grant in force whose role scores there. Whether a person scores
// every game anyway (the owner, an admin, a scheduler, or any scorekeeper in a league that
// lets every scorekeeper score) is said beside them, so the screen can say what an
// assignment does for them. Only for someone who manages the season's games; it reads
// only, in any state of the league, as taking someone off must always work. Accounts are
// given by id: the page reads their names apart, as the games list does.
import { z } from 'zod';
import { allows, hasPermission, type AccessHolder, type Grant } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { seasonScope } from '../policy.ts';
import type { ScorekeepersTx } from '../ports.ts';
import { scoresWithoutAssignment, scoringRuleOf, type ScoringRule } from '../scoring-access.ts';

export type ListScorekeepersError = { readonly code: 'season-not-found' };

/** One game still to be decided, with who is assigned to score it. */
export type GameScorekeepers = {
  readonly gameId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly startsAt: string | null;
  readonly status: string;
  /** Assigned, in the order they were; someone who has since lost their role stays here. */
  readonly assigned: readonly string[];
};

/** Someone who may be assigned to the season's games. */
export type PossibleScorekeeper = {
  readonly accountId: string;
  /** They score every one of these games whether assigned or not. */
  readonly scoresEveryGame: boolean;
};

export type SeasonScorekeepers = {
  /** The league's setting: every scorekeeper scores any game, or only assigned ones. */
  readonly rule: ScoringRule;
  readonly games: readonly GameScorekeepers[];
  readonly people: readonly PossibleScorekeeper[];
};

function holdersOf(grants: readonly Grant[]): AccessHolder[] {
  const byAccount = new Map<string, Grant[]>();
  for (const grant of grants) {
    if (grant.revokedAt !== null) continue;
    byAccount.set(grant.accountId, [...(byAccount.get(grant.accountId) ?? []), grant]);
  }
  return [...byAccount].map(([accountId, held]) => ({ accountId, isOwner: false, grants: held }));
}

export const listScorekeepers = defineCommand({
  name: 'games.list_scorekeepers',
  permission: 'games.manage',
  input: z.object({ seasonId: z.uuid() }),
  allowed: async (context, input, tx: ScorekeepersTx) =>
    hasPermission(context, tx, 'games.manage', await seasonScope(tx, input.seasonId)),
  run: async ({ input, tx }): Promise<Result<SeasonScorekeepers, ListScorekeepersError>> => {
    if ((await tx.games.findSeason(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    const scope = await seasonScope(tx, input.seasonId);
    const [listed, grants, ownerId, rule] = await Promise.all([
      tx.games.listSeasonAssignments(input.seasonId),
      tx.access.listGrants(),
      tx.access.ownerAccountId(),
      scoringRuleOf(tx),
    ]);
    const holders: AccessHolder[] = [
      ...(ownerId === undefined ? [] : [{ accountId: ownerId, isOwner: true, grants: [] }]),
      ...holdersOf(grants).filter((h) => h.accountId !== ownerId),
    ];
    const people = holders
      .filter((holder) => allows(holder, 'games.score', scope))
      .map((holder) => ({
        accountId: holder.accountId,
        scoresEveryGame: rule === 'anyScorekeeper' || scoresWithoutAssignment(holder, scope),
      }));
    const games = listed.games.map((game) => ({
      gameId: game.id,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      startsAt: game.startsAt,
      status: game.status,
      assigned: listed.assignments.filter((a) => a.gameId === game.id).map((a) => a.accountId),
    }));
    return ok({ rule, games, people });
  },
});
