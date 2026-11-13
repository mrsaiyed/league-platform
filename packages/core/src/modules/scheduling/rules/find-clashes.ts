import type { Clash, ScheduleGame } from './schedule-types.ts';

/**
 * Every clash among the games (P7 §4.3): a team in two places at once, a court booked twice,
 * a game on a skipped date. Games with no time are not compared for the first two kinds,
 * because two untimed games on one day may not overlap.
 *
 * Two games clash only when they hold exactly the same date and time: the spec gives no game
 * length, so overlapping but different start times are not compared. The court is compared
 * exactly, by the canonical name the caller passes in; the caller (step 2.20) must map court
 * ids to canonical names before calling. With `onlyGameIds`, only clashes that involve one of
 * those games are returned, so the clashes `applyDraftChange` reports cover touched games only.
 */
export function findClashes(
  games: readonly ScheduleGame[],
  skippedDates: readonly string[],
  onlyGameIds?: ReadonlySet<string>,
): Clash[] {
  const holding = games.filter((g) => g.status !== 'postponed' && g.status !== 'cancelled');
  const clashes: Clash[] = [];
  const skipped = new Set(skippedDates);

  const teamSlots = new Grouping<[string, string, string]>();
  const courtSlots = new Grouping<[string | null, string, string, string]>();
  for (const game of holding) {
    if (skipped.has(game.date)) {
      clashes.push({ kind: 'skipped-date', gameId: game.id, date: game.date });
    }
    if (game.time === null) continue;
    for (const teamId of new Set([game.homeTeamId, game.awayTeamId])) {
      teamSlots.add([teamId, game.date, game.time], game);
    }
    if (game.court !== null) {
      courtSlots.add([game.venueId, game.court, game.date, game.time], game);
    }
  }

  for (const [[teamId, date, time], group] of teamSlots.entries()) {
    if (group.length < 2) continue;
    clashes.push({ kind: 'team-in-two-places', teamId, date, time, gameIds: ids(group) });
  }
  for (const [[venueId, court, date, time], group] of courtSlots.entries()) {
    if (group.length < 2) continue;
    clashes.push({ kind: 'court-booked-twice', venueId, court, date, time, gameIds: ids(group) });
  }

  if (!onlyGameIds) return clashes;
  return clashes.filter((c) =>
    c.kind === 'skipped-date'
      ? onlyGameIds.has(c.gameId)
      : c.gameIds.some((id) => onlyGameIds.has(id)),
  );
}

/** Games grouped by a tuple key, using nested maps so no key text has to be built or parsed. */
class Grouping<K extends readonly (string | null)[]> {
  private readonly root = new Map<string | null, unknown>();

  add(key: K, game: ScheduleGame): void {
    let level = this.root;
    key.forEach((part, i) => {
      if (i === key.length - 1) {
        const list = (level.get(part) as ScheduleGame[] | undefined) ?? [];
        list.push(game);
        level.set(part, list);
      } else {
        let next = level.get(part) as Map<string | null, unknown> | undefined;
        if (!next) {
          next = new Map();
          level.set(part, next);
        }
        level = next;
      }
    });
  }

  entries(): [K, ScheduleGame[]][] {
    const out: [K, ScheduleGame[]][] = [];
    const walk = (level: Map<string | null, unknown>, prefix: (string | null)[]): void => {
      for (const [part, value] of level) {
        const path = [...prefix, part];
        if (Array.isArray(value)) out.push([path as unknown as K, value as ScheduleGame[]]);
        else walk(value as Map<string | null, unknown>, path);
      }
    };
    walk(this.root, []);
    return out;
  }
}

function ids(games: readonly ScheduleGame[]): string[] {
  return games.map((g) => g.id).sort();
}
