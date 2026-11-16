// Who may score a game (P4 §4, P7 §5.1). Scoring needs `games.score` at the game's
// program. The league's setting then decides for the scorekeeper role: any game, or
// only the games the scorekeeper is assigned to. The owner, admins and schedulers
// score any game they reach whatever the setting says, as P4 §4 gives them the
// whole of Games. Everything here is read in the command's own transaction, on
// every call, so a role removed or an assignment taken away a moment ago is gone (T-75).
import {
  allows,
  covers,
  roleHasPermission,
  type AccessHolder,
  type Scope,
} from '../access/index.ts';
import { lookupSetting, whoMayScore, type whoMayScoreChoices } from '../leagues/index.ts';
import type { GamesTx, ScoringReach } from './ports.ts';

export type ScoringRule = (typeof whoMayScoreChoices)[number];

/** The league's choice of who may score, or the starting value when it has made none. */
export async function scoringRuleOf(tx: GamesTx): Promise<ScoringRule> {
  return lookupSetting(whoMayScore, await tx.games.leagueSettingRows(whoMayScore.key)).value;
}

/**
 * Whether `holder` scores any game at `scope` without being assigned: the owner, or
 * a role other than scorekeeper that scores there (an admin, a scheduler).
 */
export function scoresWithoutAssignment(holder: AccessHolder, scope: Scope): boolean {
  if (holder.isOwner) return true;
  return holder.grants.some(
    (grant) =>
      grant.accountId === holder.accountId &&
      grant.revokedAt === null &&
      grant.role !== 'scorekeeper' &&
      roleHasPermission(grant.role, 'games.score') &&
      covers(grant.scope, scope),
  );
}

/**
 * May `holder` score a game at `scope`, under `rule`, being assigned to it or not?
 * The one rule both the policy and the scorekeeper's list of games follow.
 */
export function mayScoreUnder(
  holder: AccessHolder,
  scope: Scope,
  rule: ScoringRule,
  assigned: boolean,
): boolean {
  if (!allows(holder, 'games.score', scope)) return false;
  return scoresWithoutAssignment(holder, scope) || rule === 'anyScorekeeper' || assigned;
}

/** The programs these scopes reach: 'all' for a league scope (club and team scopes reach none). */
const programsOf = (scopes: readonly Scope[]): ScoringReach['every'] =>
  scopes.some((scope) => scope.type === 'league')
    ? 'all'
    : [...new Set(scopes.flatMap((scope) => (scope.type === 'program' ? [scope.id] : [])))];

/**
 * The games `holder` may score under `rule`, as the store filters them (ScoringReach), by
 * the same rule as mayScoreUnder: every game where a role other than scorekeeper scores
 * (or any scorekeeper may), and the assigned games wherever they hold `games.score`.
 */
export function scoringReachOf(holder: AccessHolder, rule: ScoringRule): ScoringReach {
  if (holder.isOwner) return { every: 'all', assigned: 'all' };
  const scoring = holder.grants.filter(
    (grant) =>
      grant.accountId === holder.accountId &&
      grant.revokedAt === null &&
      roleHasPermission(grant.role, 'games.score'),
  );
  const every = scoring.filter(
    (grant) => grant.role !== 'scorekeeper' || rule === 'anyScorekeeper',
  );
  return {
    every: programsOf(every.map((grant) => grant.scope)),
    assigned: programsOf(scoring.map((grant) => grant.scope)),
  };
}

/** Whether a game of `programId`, assigned to the person or not, is in `reach`. */
export function inScoringReach(
  reach: ScoringReach,
  entry: { readonly programId: string; readonly assigned: boolean },
): boolean {
  const reaches = (programs: ScoringReach['every']) =>
    programs === 'all' || programs.includes(entry.programId);
  return reaches(reach.every) || (entry.assigned && reaches(reach.assigned));
}
