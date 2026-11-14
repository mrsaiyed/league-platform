// Comparing a game's box score lines with the tracker's (step 2.58): every line the
// tracker kept must be here with the same team, number, minutes and counts. Time is
// compared in whole seconds, as the platform keeps it (record 030). A line here that
// the tracker has no line for is fine only as a "did not play" line, which the platform
// gives everyone on either roster who never entered (T6 §7); anything else is a
// difference. Names are never compared or copied: a line holds ids only (T-220).
import type { TrackerLine } from './tracker-transfer-data.ts';

/** The counts the tracker keeps, in the order a report lists them. */
export const trackerStatKeys = ['points', 'fg1', 'fg2', 'fg3', 'fouls', 'turnovers'] as const;
export type TrackerStatKey = (typeof trackerStatKeys)[number];

/** A line here, as compared: its platform team, number, time and counts. */
export type ComparableLine = {
  readonly teamId: string;
  readonly jerseyNumber: string | null;
  readonly played: boolean;
  /** Null when time was not recorded. */
  readonly secondsPlayed: number | null;
  /** A missing key: not recorded. */
  readonly stats: Readonly<Record<string, number>>;
};

export type LineDifference = {
  /** The tracker player the line is for, or null for a line here that is no one's there. */
  readonly playerId: string | null;
  readonly what: 'missing' | 'extra' | 'team' | 'number' | 'played' | 'seconds' | TrackerStatKey;
  /** The value in the tracker and here, as plain text; '' when there is none. */
  readonly tracker: string;
  readonly here: string;
};

type Value = string | number | boolean | null | undefined;

const shown = (value: Value) => (value === null || value === undefined ? '' : String(value));

/** A "did not play" line: never entered, no time and no counts. */
const isDidNotPlay = (line: ComparableLine) =>
  !line.played && (line.secondsPlayed ?? 0) === 0 && Object.keys(line.stats).length === 0;

/**
 * The differences between the tracker's lines of a game and the lines here. `here` holds
 * the lines of the people the tracker's players are, by tracker player id; `others` the
 * lines here of anyone who is no tracker player. `teamOf` gives a tracker team's team here.
 */
export function compareLines(
  tracker: readonly TrackerLine[],
  here: ReadonlyMap<string, ComparableLine>,
  others: readonly ComparableLine[],
  teamOf: (trackerTeamId: string) => string | undefined,
): LineDifference[] {
  const differences: LineDifference[] = [];
  const seen = new Set<string>();
  for (const old of tracker) {
    const playerId = old.playerId.toLowerCase();
    seen.add(playerId);
    const line = here.get(playerId);
    if (line === undefined) {
      differences.push({ playerId, what: 'missing', tracker: '', here: '' });
      continue;
    }
    const differ = (what: LineDifference['what'], a: Value, b: Value) => {
      if (a !== b) differences.push({ playerId, what, tracker: shown(a), here: shown(b) });
    };
    differ('team', teamOf(old.teamId) ?? null, line.teamId);
    differ('number', old.jersey === '' ? null : old.jersey, line.jerseyNumber);
    differ('played', old.appeared, line.played);
    differ('seconds', Math.floor(old.ms / 1000), line.secondsPlayed);
    for (const key of trackerStatKeys) differ(key, old[key], line.stats[key]);
  }
  for (const [playerId, line] of here) {
    if (!seen.has(playerId) && !isDidNotPlay(line)) {
      differences.push({ playerId, what: 'extra', tracker: '', here: '' });
    }
  }
  for (const line of others) {
    if (!isDidNotPlay(line))
      differences.push({ playerId: null, what: 'extra', tracker: '', here: '' });
  }
  return differences;
}
