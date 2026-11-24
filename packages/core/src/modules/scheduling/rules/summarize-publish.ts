import type { ScheduleGame, ScheduleState } from './schedule-types.ts';

export type PublishSummary = {
  gamesAdded: string[];
  gamesRemoved: string[];
  /** Games whose round, date, time, venue or court differ. */
  gamesMoved: string[];
  /** Games whose recording mode differs and that did not move (a moved game is already counted). */
  gamesRecordingChanged: string[];
  roundsRenamed: string[];
  roundsDateChanged: string[];
  /** Rounds the draft adds (a round added and removed again in the draft is in neither list). */
  roundsAdded: string[];
  roundsRemoved: string[];
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
  const gamesRecordingChanged: string[] = [];
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
    } else if (!sameSlot(old, g) || (old.status === 'postponed' && g.status === 'scheduled')) {
      // A postponed game given its own old slot as the new date is played again on its
      // date: publishing makes it scheduled, so it is a change like a move (step 2.53).
      gamesMoved.push(id);
      addTeams(old);
      addTeams(g);
    } else if (g.recording !== null && g.recording !== undefined && old.recording !== g.recording) {
      // Only a recording the draft names is written (publish-schedule.ts): a draft's empty
      // one leaves the game as it is, so it changes nothing (step 2.185).
      gamesRecordingChanged.push(id);
    }
  }
  for (const [id, g] of before) {
    if (!after.has(id)) {
      gamesRemoved.push(id);
      addTeams(g);
    }
  }

  const oldRounds = new Map(published.rounds.map((r) => [r.id, r]));
  const newRounds = new Set(draft.rounds.map((r) => r.id));
  const roundsRenamed: string[] = [];
  const roundsDateChanged: string[] = [];
  const roundsAdded: string[] = [];
  const roundsRemoved = published.rounds.filter((r) => !newRounds.has(r.id)).map((r) => r.id);
  for (const r of draft.rounds) {
    const old = oldRounds.get(r.id);
    if (!old) {
      roundsAdded.push(r.id);
      continue;
    }
    if (old.label !== r.label) roundsRenamed.push(r.id);
    // A round never loses its date through a draft (a date change always names a date), and
    // publishing never clears one, so a missing date is not counted as a change.
    if (r.date !== null && old.date !== r.date) roundsDateChanged.push(r.id);
  }

  return {
    gamesAdded: gamesAdded.sort(),
    gamesRemoved: gamesRemoved.sort(),
    gamesMoved: gamesMoved.sort(),
    gamesRecordingChanged: gamesRecordingChanged.sort(),
    roundsRenamed: roundsRenamed.sort(),
    roundsDateChanged: roundsDateChanged.sort(),
    roundsAdded: roundsAdded.sort(),
    roundsRemoved: roundsRemoved.sort(),
    teamsAffected: [...teams].sort(),
  };
}

/**
 * How many things publishing would change: games added, removed, moved or re-recorded,
 * and rounds renamed, re-dated, added or removed. Zero is "nothing to publish". The
 * schedule grid's "changes not yet published" and the publish box both count by this,
 * so they cannot disagree (step 2.161): a game removed and put back as it was is none.
 */
export function publishChangeCount(summary: PublishSummary): number {
  return (
    summary.gamesAdded.length +
    summary.gamesRemoved.length +
    summary.gamesMoved.length +
    summary.gamesRecordingChanged.length +
    summary.roundsRenamed.length +
    summary.roundsDateChanged.length +
    summary.roundsAdded.length +
    summary.roundsRemoved.length
  );
}
