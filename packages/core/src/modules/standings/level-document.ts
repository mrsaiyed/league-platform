// How a set of level teams was ordered, as each of their standings rows keeps it (step
// 2.198; migration 0022; S-74): the engine's LevelTeams written as a versioned document
// (T-44, T-50), and read back. Whoever stores a row writes it with levelDocument, so the
// database and the made-up world keep the same thing; readLevel takes only a document
// it can read whole, and anything else is "not known", never a guess.
import type { LevelTeams, Tiebreaker, TiebreakPlace, TiebreakStep } from '@srleagues/sports';

/** The stored document, version 1. Plain data: every array and object is its own. */
export type LevelDocument = {
  version: 1;
  teamIds: string[];
  steps: {
    tiebreaker: Tiebreaker;
    applied: boolean;
    teams: {
      teamId: string;
      place: number;
      value: number | null;
      record: { wins: number; losses: number; ties: number } | null;
    }[];
  }[];
};

/** The document for a row, field by field; null for a team level with nobody. */
export function levelDocument(level: LevelTeams | null): LevelDocument | null {
  if (level === null) return null;
  return {
    version: 1,
    teamIds: [...level.teamIds],
    steps: level.steps.map((step) => ({
      tiebreaker: step.tiebreaker,
      applied: step.applied,
      teams: step.teams.map((team) => ({
        teamId: team.teamId,
        place: team.place,
        value: team.value,
        record:
          team.record === null
            ? null
            : { wins: team.record.wins, losses: team.record.losses, ties: team.record.ties },
      })),
    })),
  };
}

const tiebreakers: readonly Tiebreaker[] = [
  'head-to-head',
  'point-difference',
  'points-scored',
  'fewest-points-allowed',
  'coin-flip',
];

type Fields = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isWhole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

const isTiebreaker = (value: unknown): value is Tiebreaker =>
  tiebreakers.some((tiebreaker) => tiebreaker === value);

function placeOf(value: unknown, members: ReadonlySet<string>): TiebreakPlace | undefined {
  if (!isObject(value)) return undefined;
  const { teamId, place, value: figure, record } = value;
  if (typeof teamId !== 'string' || !members.has(teamId)) return undefined;
  if (!isCount(place) || place < 1) return undefined;
  if (figure !== null && !isWhole(figure)) return undefined;
  if (record === null) return { teamId, place, value: figure, record: null };
  if (!isObject(record)) return undefined;
  const { wins, losses, ties } = record;
  if (!isCount(wins) || !isCount(losses) || !isCount(ties)) return undefined;
  return { teamId, place, value: figure, record: { wins, losses, ties } };
}

function stepOf(value: unknown, members: ReadonlySet<string>): TiebreakStep | undefined {
  if (!isObject(value)) return undefined;
  const { tiebreaker, applied, teams } = value;
  if (!isTiebreaker(tiebreaker) || typeof applied !== 'boolean' || !Array.isArray(teams)) {
    return undefined;
  }
  const places: TiebreakPlace[] = [];
  for (const team of teams) {
    const place = placeOf(team, members);
    if (place === undefined) return undefined;
    places.push(place);
  }
  // Two or more teams, each once, best first: places never go down.
  if (places.length < 2 || new Set(places.map((p) => p.teamId)).size !== places.length) {
    return undefined;
  }
  if (places.some((p, i) => i > 0 && p.place < (places[i - 1]?.place ?? 0))) return undefined;
  // Head-to-head gives a record and no figure; the rest a figure or nothing, no record.
  const headToHead = tiebreaker === 'head-to-head';
  if (places.some((p) => (p.record !== null) !== headToHead)) return undefined;
  return { tiebreaker, applied, teams: places };
}

/** The engine's LevelTeams from a stored document, or null when it is none or unreadable. */
export function readLevel(value: unknown): LevelTeams | null {
  if (!isObject(value) || value['version'] !== 1) return null;
  const { teamIds, steps } = value;
  if (!Array.isArray(teamIds) || !Array.isArray(steps)) return null;
  const ids: string[] = [];
  for (const id of teamIds) {
    if (typeof id !== 'string') return null;
    ids.push(id);
  }
  const members = new Set(ids);
  if (ids.length < 2 || members.size !== ids.length) return null;
  const read: TiebreakStep[] = [];
  for (const step of steps) {
    const one = stepOf(step, members);
    if (one === undefined) return null;
    read.push(one);
  }
  return { teamIds: ids, steps: read };
}
