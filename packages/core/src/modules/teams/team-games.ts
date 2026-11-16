// What a team has of games, as the admin is told before it goes to the bin (A-17): how many
// it has played (a final or forfeited result) and how many it still has to play (scheduled,
// postponed or live), in the published schedule or in its season's schedule draft. A
// cancelled game counts for neither, so it never holds a team.
import { parseDraftDocument } from '../scheduling/index.ts';
import type { TeamGamesRecord, TeamRecord, TeamsTx } from './ports.ts';

export type TeamGames = {
  /** Games with a final or forfeited result. */
  readonly played: number;
  /** Games still to play, published or only in the draft. */
  readonly toPlay: number;
};

const toPlayStates: readonly string[] = ['scheduled', 'postponed', 'live'];

/**
 * The games still to play: the published ones, and those the draft adds for the team and
 * does not remove again. A published game the draft removes still counts: the public sees
 * it until the draft is published. A game the draft removes and puts back is counted once.
 * A draft this code cannot read adds none.
 */
export function gamesToPlay(stored: TeamGamesRecord, teamId: string): number {
  const ids = new Set(stored.toPlayIds);
  const document =
    stored.draftChanges === null ? undefined : parseDraftDocument(stored.draftChanges);
  const added = new Set<string>();
  for (const change of document?.changes ?? []) {
    if (change.kind === 'remove-game') added.delete(change.gameId);
    if (change.kind !== 'add-game') continue;
    const { game } = change;
    const plays = game.homeTeamId === teamId || game.awayTeamId === teamId;
    if (plays && toPlayStates.includes(game.status)) added.add(game.id);
  }
  for (const id of added) ids.add(id);
  return ids.size;
}

/** What the team has of games, read in the command's own transaction. */
export async function teamGamesOf(tx: TeamsTx, team: TeamRecord): Promise<TeamGames> {
  const stored = await tx.teams.games(team.id, team.seasonId);
  return { played: stored.played, toPlay: gamesToPlay(stored, team.id) };
}
