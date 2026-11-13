import type { Clash, ScheduleGame } from './schedule-types.ts';

/**
 * Every clash among the games (P7 §4.3): a team in two places at once, a court booked twice,
 * a game on a skipped date. Games with no time are not compared for the first two kinds,
 * because two untimed games on one day may not overlap. Court names are compared exactly.
 * With `onlyGameIds`, only clashes that involve one of those games are returned.
 */
export function findClashes(
  games: readonly ScheduleGame[],
  skippedDates: readonly string[],
  onlyGameIds?: ReadonlySet<string>,
): Clash[] {
  const holding = games.filter((g) => g.status !== 'postponed' && g.status !== 'cancelled');
  const clashes: Clash[] = [];
  const skipped = new Set(skippedDates);

  const teamSlots = new Map<string, ScheduleGame[]>();
  const courtSlots = new Map<string, ScheduleGame[]>();
  for (const game of holding) {
    if (skipped.has(game.date)) {
      clashes.push({ kind: 'skipped-date', gameId: game.id, date: game.date });
    }
    if (game.time === null) continue;
    for (const teamId of new Set([game.homeTeamId, game.awayTeamId])) {
      push(teamSlots, JSON.stringify([teamId, game.date, game.time]), game);
    }
    if (game.court !== null) {
      push(courtSlots, JSON.stringify([game.venueId, game.court, game.date, game.time]), game);
    }
  }

  for (const [key, group] of teamSlots) {
    if (group.length < 2) continue;
    const [teamId, date, time] = JSON.parse(key) as [string, string, string];
    clashes.push({ kind: 'team-in-two-places', teamId, date, time, gameIds: ids(group) });
  }
  for (const [key, group] of courtSlots) {
    if (group.length < 2) continue;
    const [venueId, court, date, time] = JSON.parse(key) as [string | null, string, string, string];
    clashes.push({ kind: 'court-booked-twice', venueId, court, date, time, gameIds: ids(group) });
  }

  if (!onlyGameIds) return clashes;
  return clashes.filter((c) =>
    c.kind === 'skipped-date'
      ? onlyGameIds.has(c.gameId)
      : c.gameIds.some((id) => onlyGameIds.has(id)),
  );
}

function push(map: Map<string, ScheduleGame[]>, key: string, game: ScheduleGame): void {
  const list = map.get(key);
  if (list) list.push(game);
  else map.set(key, [game]);
}

function ids(games: ScheduleGame[]): string[] {
  return games.map((g) => g.id).sort();
}
