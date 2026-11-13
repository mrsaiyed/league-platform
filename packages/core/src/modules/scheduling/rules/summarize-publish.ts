import type { ScheduleGame, ScheduleState } from './schedule-types.ts';

export type PublishSummary = {
  gamesAdded: string[];
  gamesRemoved: string[];
  /** Games whose round, date, time, venue or court differ. */
  gamesMoved: string[];
  roundsRenamed: string[];
  roundsDateChanged: string[];
  /** Every team in an added, removed or moved game. The caller finds the people from these. */
  teamsAffected: string[];
};

const sameSlot = (a: ScheduleGame, b: ScheduleGame): boolean =>
  a.roundId === b.roundId &&
  a.date === b.date &&
  a.time === b.time &&
  a.venueId === b.venueId &&
  a.court === b.court;

/** What publishing would change (P7 §4.4): the difference between the published schedule and the draft's result. */
export function summarizePublish(published: ScheduleState, draft: ScheduleState): PublishSummary {
  const before = new Map(published.games.map((g) => [g.id, g]));
  const after = new Map(draft.games.map((g) => [g.id, g]));
  const gamesAdded: string[] = [];
  const gamesRemoved: string[] = [];
  const gamesMoved: string[] = [];
  const teams = new Set<string>();
  const addTeams = (g: ScheduleGame): void => {
    teams.add(g.homeTeamId);
    teams.add(g.awayTeamId);
  };

  for (const [id, g] of after) {
    const old = before.get(id);
    if (!old) {
      gamesAdded.push(id);
      addTeams(g);
    } else if (!sameSlot(old, g)) {
      gamesMoved.push(id);
      addTeams(old);
      addTeams(g);
    }
  }
  for (const [id, g] of before) {
    if (!after.has(id)) {
      gamesRemoved.push(id);
      addTeams(g);
    }
  }

  const oldRounds = new Map(published.rounds.map((r) => [r.id, r]));
  const roundsRenamed: string[] = [];
  const roundsDateChanged: string[] = [];
  for (const r of draft.rounds) {
    const old = oldRounds.get(r.id);
    if (!old) continue;
    if (old.label !== r.label) roundsRenamed.push(r.id);
    if (old.date !== r.date) roundsDateChanged.push(r.id);
  }

  return {
    gamesAdded: gamesAdded.sort(),
    gamesRemoved: gamesRemoved.sort(),
    gamesMoved: gamesMoved.sort(),
    roundsRenamed: roundsRenamed.sort(),
    roundsDateChanged: roundsDateChanged.sort(),
    teamsAffected: [...teams].sort(),
  };
}
