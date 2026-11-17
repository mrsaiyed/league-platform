// What a team has of games, as the admin is told before it goes to the bin (A-17): how many
// it has played (a final or forfeited result) and which still have no result (scheduled,
// postponed, or being played now), in the published schedule or in its season's schedule
// draft. A cancelled game counts for neither, so it never holds a team.
import { parseDraftDocument } from '../scheduling/index.ts';
import type { TeamGamesRecord, TeamRecord, TeamsTx } from './ports.ts';

/** A game without a result yet, as the panel names it: its day and round where known. */
export type GameWithoutResult = { readonly date: string | null; readonly round: number | null };

export type TeamGames = {
  /** Games with a final or forfeited result. */
  readonly played: number;
  /** Games without a result yet, published or only in the draft. */
  readonly toPlay: number;
  /**
   * Of those, published games the draft removes: still public, and still holding the team,
   * until the draft is published.
   */
  readonly removedInDraft: number;
  /** The games without a result yet, by day (those with no day last). */
  readonly which: readonly GameWithoutResult[];
};

const toPlayStates: readonly string[] = ['scheduled', 'postponed', 'live'];

const byDay = (a: GameWithoutResult, b: GameWithoutResult) =>
  (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.round ?? 0) - (b.round ?? 0);

/**
 * The games without a result: the published ones, and those the draft adds for the team and
 * does not remove again. A published game the draft removes still counts (the public sees it
 * until the draft is published) and is counted as removed in the draft. A game the draft
 * removes and puts back is counted once. A draft this code cannot read adds nothing.
 */
export function gamesToPlay(stored: TeamGamesRecord, teamId: string): Omit<TeamGames, 'played'> {
  const document =
    stored.draftChanges === null ? undefined : parseDraftDocument(stored.draftChanges);
  const added = new Map<string, GameWithoutResult>();
  const removed = new Set<string>();
  for (const change of document?.changes ?? []) {
    if (change.kind === 'remove-game') {
      added.delete(change.gameId);
      removed.add(change.gameId);
    }
    if (change.kind !== 'add-game') continue;
    const { game } = change;
    removed.delete(game.id);
    const plays = game.homeTeamId === teamId || game.awayTeamId === teamId;
    if (plays && toPlayStates.includes(game.status)) {
      added.set(game.id, { date: game.date === '' ? null : game.date, round: null });
    }
  }
  const published = new Set(stored.toPlay.map((g) => g.id));
  const which = [
    ...stored.toPlay.map(({ date, round }) => ({ date, round })),
    ...[...added].filter(([id]) => !published.has(id)).map(([, game]) => game),
  ].sort(byDay);
  return {
    toPlay: which.length,
    removedInDraft: stored.toPlay.filter((g) => removed.has(g.id)).length,
    which,
  };
}

/** What the team has of games, read in the command's own transaction. */
export async function teamGamesOf(tx: TeamsTx, team: TeamRecord): Promise<TeamGames> {
  const stored = await tx.teams.games(team.id, team.seasonId);
  return { played: stored.played, ...gamesToPlay(stored, team.id) };
}
