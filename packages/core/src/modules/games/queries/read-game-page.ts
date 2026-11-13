// A game's page as a visitor gets it (P7 §5.3, §8; S-22; T-29, T-87): the scoreboard,
// both box scores and the play-by-play. Where a team's player numbers are hidden from
// this viewer, its box score is its totals and no player lines, and its players' names,
// jerseys and ids drop out of the play-by-play. Scores and results are never hidden.
// Names come only through the one name function (T-81).
import { fail, ok, type Result } from '../../../command/index.ts';
import type { Audience } from '../../leagues/index.ts';
import {
  showName,
  statsShown,
  type NamePolicy,
  type TeamStatsSetting,
  type Viewer,
} from '../../people/index.ts';
import { recordingOf } from '../game-fields.ts';
import type {
  GamePageTeam,
  GamePersonRecord,
  GamePlayerLine,
  GamesReadStore,
} from '../read-ports.ts';

export type GameViewing = {
  /** The league the page is for. A viewer of another league sees only team totals. */
  readonly leagueId: string;
  readonly viewer: Viewer;
  readonly audience: Audience;
  readonly policy: NamePolicy;
};

type Side = 'home' | 'away';

export type PlayerRef = {
  readonly personId: string;
  /** Null when the person asked to be taken off or no name was recorded. */
  readonly name: string | null;
  readonly jersey: string | null;
};

export type BoxScorePlayer = PlayerRef & {
  readonly played: boolean;
  readonly seconds: number | null;
  readonly stats: Readonly<Record<string, number>>;
};

export type BoxScore = {
  readonly side: Side;
  readonly teamId: string;
  readonly name: string;
  readonly color: string | null;
  /** False: this viewer sees the team's totals and no player lines. */
  readonly playerLinesShown: boolean;
  /** Totals over the team's players; recorded games only (P7 §8). */
  readonly totals: Readonly<Record<string, number>>;
  readonly players: readonly BoxScorePlayer[];
};

export const playTypes = [
  'lineup',
  'score',
  'foul',
  'unfoul',
  'turnover',
  'unturnover',
  'team-turnover',
  'team-unturnover',
  'timeout',
  'untimeout',
  'sub',
  'period',
] as const;
export type PlayType = (typeof playTypes)[number];

export type PlayLine = {
  readonly number: number;
  readonly type: PlayType;
  readonly side: Side | null;
  readonly period: number | null;
  readonly clockMs: number | null;
  readonly points: 1 | 2 | 3 | null;
  readonly timeoutSeconds: 30 | 60 | null;
  /** Null for a hidden team's players, and for plays with no player. */
  readonly player: PlayerRef | null;
  /** A substitution: who came in and who went out. Only for a team whose lines are shown. */
  readonly playersIn: readonly PlayerRef[];
  readonly playersOut: readonly PlayerRef[];
  readonly score: { readonly home: number; readonly away: number };
};

export type GamePage = {
  readonly game: {
    readonly id: string;
    readonly seasonId: string;
    readonly status: string;
    /** final-score, box-score or live, as the season's rules spell it. */
    readonly recording: ReturnType<typeof recordingOf>;
    readonly startsAt: string | null;
    readonly finalizedAt: string | null;
    /** The date a final game was last corrected, never the reason (S-7). */
    readonly correctedOn: string | null;
  };
  readonly scoreboard: {
    readonly home: {
      readonly teamId: string;
      readonly name: string;
      readonly score: number | null;
    };
    readonly away: {
      readonly teamId: string;
      readonly name: string;
      readonly score: number | null;
    };
    readonly period: number | null;
    readonly periods: 2 | 4 | null;
    /** As the live messages carry it (T-121); null when there is no live state. */
    readonly clock:
      | { readonly state: 'running'; readonly remainingMs: number; readonly asOf: number }
      | { readonly state: 'stopped'; readonly remainingMs: number }
      | null;
  };
  readonly boxScores: readonly [BoxScore, BoxScore];
  readonly plays: readonly PlayLine[];
};

export type ReadGamePageError = { readonly code: 'game-not-found' };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const sideOf = (v: unknown): Side | null => (v === 'home' || v === 'away' ? v : null);
const idsOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function countsOf(document: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(document)) return out;
  for (const [key, value] of Object.entries(document)) {
    const n = count(value);
    if (n !== null) out[key] = n;
  }
  return out;
}

export async function readGamePage(
  store: GamesReadStore,
  input: { readonly gameId: string },
  viewing: GameViewing,
): Promise<Result<GamePage, ReadGamePageError>> {
  const game = await store.findGame(input.gameId);
  if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
  const [teamRows, state, lines, correctedOn] = await Promise.all([
    store.teams([game.homeTeamId, game.awayTeamId]),
    store.state(game.id),
    store.lines(game.id),
    store.correctedOn(game.id),
  ]);
  const team = (id: string): GamePageTeam | undefined => teamRows.find((t) => t.id === id);
  const home = team(game.homeTeamId);
  const away = team(game.awayTeamId);
  if (home === undefined || away === undefined) return fail({ code: 'game-not-found' });
  const teamOf: Record<Side, GamePageTeam> = { home, away };
  const settingOf = (t: GamePageTeam): TeamStatsSetting => ({
    leagueId: viewing.leagueId,
    teamId: t.id,
    statsVisibility: t.statsVisibility as TeamStatsSetting['statsVisibility'],
  });
  const shown: Record<Side, boolean> = {
    home: statsShown(settingOf(home), viewing.viewer) === 'player_lines',
    away: statsShown(settingOf(away), viewing.viewer) === 'player_lines',
  };

  // Everyone whose name may be needed: the lines and the plays of teams that are shown.
  const plays =
    isRecord(state) && Array.isArray(state['plays']) ? (state['plays'] as unknown[]) : [];
  const needed = new Set<string>();
  for (const line of lines) {
    if (shown[line.teamId === home.id ? 'home' : 'away']) needed.add(line.personId);
  }
  for (const play of plays) {
    if (!isRecord(play)) continue;
    const side = sideOf(play['side']);
    if (side === null || !shown[side]) continue;
    for (const id of [play['playerId'], play['inId'], play['outId'], ...idsOf(play['playerIds'])]) {
      if (typeof id === 'string') needed.add(id);
    }
  }
  const people = await store.people([...needed]);
  const personOf = new Map<string, GamePersonRecord>(people.map((p) => [p.id, p]));
  const jerseyOf = new Map<string, string | null>(
    lines.map((l: GamePlayerLine) => [l.personId, l.jerseyNumber]),
  );
  const refOf = (side: Side, personId: string): PlayerRef => {
    const person = personOf.get(personId);
    const name =
      person === undefined
        ? null
        : showName(
            {
              firstName: person.firstName,
              lastName: person.lastName,
              isMinor: person.isMinor,
              nameRequest: person.visibility as 'none' | 'initials' | 'removed',
            },
            {
              audience: viewing.audience,
              policy: viewing.policy,
              viewer: viewing.viewer,
              statsOf: settingOf(teamOf[side]),
            },
          );
    return {
      personId,
      name: name !== null && name.shown ? name.text : null,
      jersey: jerseyOf.get(personId) ?? null,
    };
  };

  // Box scores.
  const boxOf = (side: Side): BoxScore => {
    const t = teamOf[side];
    const own = lines.filter((l) => l.teamId === t.id);
    const totals: Record<string, number> = {};
    for (const line of own) {
      if (!line.played) continue;
      for (const [key, value] of Object.entries(countsOf(line.stats))) {
        totals[key] = (totals[key] ?? 0) + value;
      }
    }
    const players: BoxScorePlayer[] = shown[side]
      ? [...own]
          .sort(
            (a, b) =>
              Number(a.jerseyNumber ?? '999') - Number(b.jerseyNumber ?? '999') ||
              a.personId.localeCompare(b.personId),
          )
          .map((line) => ({
            ...refOf(side, line.personId),
            played: line.played,
            seconds: line.secondsPlayed,
            stats: countsOf(line.stats),
          }))
      : [];
    return {
      side,
      teamId: t.id,
      name: t.name,
      color: t.color,
      playerLinesShown: shown[side],
      totals,
      players,
    };
  };

  // Play-by-play from the engine's saved plays, with a running score.
  const running = { home: 0, away: 0 };
  const playLines: PlayLine[] = [];
  let period: number | null = null;
  for (const raw of plays) {
    if (!isRecord(raw)) continue;
    const type = playTypes.find((t) => t === raw['type']);
    if (type === undefined) continue;
    const side = sideOf(raw['side']);
    const points =
      raw['points'] === 1 || raw['points'] === 2 || raw['points'] === 3 ? raw['points'] : null;
    if (type === 'score' && side !== null && points !== null) running[side] += points;
    if (type === 'period' && count(raw['period']) !== null) period = raw['period'] as number;
    const open = side === null || shown[side];
    // A hidden team's substitutions and line-ups say only who played: left out.
    if (side !== null && !open && (type === 'sub' || type === 'lineup')) continue;
    const playerId = typeof raw['playerId'] === 'string' ? raw['playerId'] : null;
    playLines.push({
      number: playLines.length + 1,
      type,
      side,
      period: count(raw['period']) ?? period,
      clockMs: count(raw['clockMs']),
      points: type === 'score' ? points : null,
      timeoutSeconds: raw['seconds'] === 30 || raw['seconds'] === 60 ? raw['seconds'] : null,
      player: side !== null && open && playerId !== null ? refOf(side, playerId) : null,
      playersIn:
        side !== null && open
          ? [
              ...(typeof raw['inId'] === 'string' ? [raw['inId']] : []),
              ...(type === 'lineup' ? idsOf(raw['playerIds']) : []),
            ].map((id) => refOf(side, id))
          : [],
      playersOut:
        side !== null && open && typeof raw['outId'] === 'string'
          ? [refOf(side, raw['outId'])]
          : [],
      score: { home: running.home, away: running.away },
    });
  }

  // The scoreboard: a live game's score from its plays, otherwise the game's own.
  const live = game.status === 'live' && plays.length > 0;
  const clockDoc = isRecord(state) && isRecord(state['clock']) ? state['clock'] : null;
  const remaining = clockDoc === null ? null : count(clockDoc['remainingMs']);
  const anchor = clockDoc === null ? null : count(clockDoc['anchorAt']);
  const periodsRaw = isRecord(state) && isRecord(state['rules']) ? state['rules']['periods'] : null;
  return ok({
    game: {
      id: game.id,
      seasonId: game.seasonId,
      status: game.status,
      recording: recordingOf(game.captureMode),
      startsAt: game.startsAt,
      finalizedAt: game.finalizedAt,
      correctedOn: correctedOn ?? null,
    },
    scoreboard: {
      home: { teamId: home.id, name: home.name, score: live ? running.home : game.homeScore },
      away: { teamId: away.id, name: away.name, score: live ? running.away : game.awayScore },
      period: plays.length > 0 ? (period ?? 1) : null,
      periods: periodsRaw === 2 || periodsRaw === 4 ? periodsRaw : null,
      clock:
        remaining === null
          ? null
          : clockDoc !== null && clockDoc['running'] === true && anchor !== null
            ? { state: 'running', remainingMs: remaining, asOf: anchor }
            : { state: 'stopped', remainingMs: remaining },
    },
    boxScores: [boxOf('home'), boxOf('away')],
    plays: playLines,
  });
}
