// Each game publishing would add, move or remove, with where it was and where it goes, so
// the publish summary can name them (P7 §4.4, A-7; step 2.53). Read from the same summary
// the count is, so the list and the number always agree.
import type { ScheduleGame, ScheduleSlot, ScheduleState } from './schedule-types.ts';
import type { PublishSummary } from './summarize-publish.ts';

export type PublishGameChange = {
  readonly gameId: string;
  readonly kind: 'added' | 'moved' | 'removed';
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  /** Where it is in the published schedule; null for a game the draft adds. */
  readonly before: ScheduleSlot | null;
  /** Where publishing puts it; null for a game the draft removes. */
  readonly after: ScheduleSlot | null;
};

const kinds = { added: 0, moved: 1, removed: 2 } as const;

const slotOf = (g: ScheduleGame): ScheduleSlot => ({
  roundId: g.roundId,
  date: g.date,
  time: g.time,
  venueId: g.venueId,
  court: g.court,
});

const whenOf = (c: PublishGameChange): string => {
  const slot = c.after ?? c.before;
  return `${slot?.date ?? ''} ${slot?.time ?? ''}`;
};

/** Added games first, then moved, then removed; each kind in the order of its (new) time. */
export function publishGameChanges(
  published: ScheduleState,
  result: ScheduleState,
  summary: Pick<PublishSummary, 'gamesAdded' | 'gamesMoved' | 'gamesRemoved'>,
): PublishGameChange[] {
  const before = new Map(published.games.map((g) => [g.id, g]));
  const after = new Map(result.games.map((g) => [g.id, g]));
  const changes: PublishGameChange[] = [];
  const add = (id: string, kind: PublishGameChange['kind']): void => {
    const old = before.get(id);
    const now = after.get(id);
    const teams = now ?? old;
    if (teams === undefined) return;
    changes.push({
      gameId: id,
      kind,
      homeTeamId: teams.homeTeamId,
      awayTeamId: teams.awayTeamId,
      before: kind === 'added' || old === undefined ? null : slotOf(old),
      after: kind === 'removed' || now === undefined ? null : slotOf(now),
    });
  };
  summary.gamesAdded.forEach((id) => add(id, 'added'));
  summary.gamesMoved.forEach((id) => add(id, 'moved'));
  summary.gamesRemoved.forEach((id) => add(id, 'removed'));
  return changes.sort(
    (a, b) =>
      kinds[a.kind] - kinds[b.kind] ||
      whenOf(a).localeCompare(whenOf(b)) ||
      a.gameId.localeCompare(b.gameId),
  );
}
