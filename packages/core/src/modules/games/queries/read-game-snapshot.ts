// A game as it stands at one sequence number (T6 §6; T-117, T-118, T-119): what a
// viewer's page adopts on arriving, on finding a gap, or when it cannot hold a live
// connection, and what every live message is cut from (liveMessageOf). Names come only
// through the one name function and the team's statistics setting (T-81, T-87, S-22):
// a team whose player lines this viewer may not see has no players here, and the
// latest play names nobody unless both teams' lines are shown, because one live
// channel carries it to every viewer (the contract's LatestPlay).
//
// The web app reads it as a visitor (publicViewer), so it is the same for everyone
// and may be cached for two seconds (T-119, record 039); a richer view belongs to the
// signed-in game page (readGamePage).
import type {
  ClockReference,
  GameSnapshot,
  GameStatus,
  LatestPlay,
  LiveMessage,
} from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { fail, ok, type Result } from '../../../command/index.ts';
import { showName, statsShown, type TeamStatsSetting } from '../../people/index.ts';
import type { GamePageTeam, GamePersonRecord, GameSnapshotStore } from '../read-ports.ts';
import type { GameViewing } from './read-game-page.ts';

export type ReadGameSnapshotError = { readonly code: 'game-not-found' };

type Side = basketball.Side;
const sides: readonly Side[] = ['home', 'away'];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const jerseyPattern = /^(?:0|00|[1-9][0-9]?)$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const short = (text: string) => text.slice(0, 120);

/**
 * The saved state as the engine's document, or undefined when there is none or it is
 * not one the engine can read: the snapshot then stands on the game's own row.
 */
function engineState(stored: unknown): basketball.GameState | undefined {
  if (!isRecord(stored) || stored['version'] !== 1 || !Array.isArray(stored['plays'])) {
    return undefined;
  }
  const rules = stored['rules'];
  const clock = stored['clock'];
  if (!isRecord(rules) || typeof rules['periods'] !== 'number') return undefined;
  if (!isRecord(clock) || typeof clock['remainingMs'] !== 'number') return undefined;
  return stored as basketball.GameState;
}

function derived(state: basketball.GameState | undefined): basketball.Derived | undefined {
  if (state === undefined) return undefined;
  try {
    return basketball.derive(state);
  } catch {
    return undefined;
  }
}

/** The three statuses a viewer knows: a decided game is final, anything not begun is scheduled. */
function statusOf(status: string): GameStatus {
  if (status === 'live') return 'live';
  if (status === 'final' || status === 'forfeit') return 'final';
  return 'scheduled';
}

function clockOf(state: basketball.GameState | undefined): ClockReference {
  if (state === undefined) return { state: 'stopped', remainingMs: 0 };
  const remainingMs = whole(state.clock.remainingMs);
  return state.clock.running
    ? { state: 'running', remainingMs, asOf: whole(state.clock.anchorAt) }
    : { state: 'stopped', remainingMs };
}

const playTypeOf = (type: string): LatestPlay['type'] => {
  switch (type) {
    case 'score':
    case 'foul':
    case 'turnover':
    case 'timeout':
    case 'sub':
    case 'period':
      return type;
    case 'team-turnover':
      return 'turnover';
    default:
      return 'other';
  }
};

/** The one player a latest play is about, if any: the scorer, the fouler, who came in. */
function playerOf(play: basketball.LoggedPlay): string | undefined {
  switch (play.type) {
    case 'score':
    case 'foul':
    case 'turnover':
      return play.playerId;
    case 'sub':
      return play.inId;
    default:
      return undefined;
  }
}

export async function readGameSnapshot(
  store: GameSnapshotStore,
  input: { readonly gameId: string },
  viewing: GameViewing,
  /** The server's time now (ms), sent as `sentAt`. */
  now: number,
): Promise<Result<GameSnapshot, ReadGameSnapshotError>> {
  const game = await store.findGame(input.gameId);
  if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
  const [teamRows, saved, lines, correctedOn] = await Promise.all([
    store.teams([game.homeTeamId, game.awayTeamId]),
    store.savedState(game.id),
    store.lines(game.id),
    store.correctedOn(game.id),
  ]);
  const teamOf = (id: string): GamePageTeam | undefined => teamRows.find((t) => t.id === id);
  const home = teamOf(game.homeTeamId);
  const away = teamOf(game.awayTeamId);
  if (home === undefined || away === undefined) return fail({ code: 'game-not-found' });
  const team: Record<Side, GamePageTeam> = { home, away };
  const settingOf = (t: GamePageTeam): TeamStatsSetting => ({
    leagueId: viewing.leagueId,
    teamId: t.id,
    statsVisibility: t.statsVisibility as TeamStatsSetting['statsVisibility'],
  });
  const shown: Record<Side, boolean> = {
    home: statsShown(settingOf(home), viewing.viewer) === 'player_lines',
    away: statsShown(settingOf(away), viewing.viewer) === 'player_lines',
  };

  const state = engineState(saved?.state);
  const view = derived(state);
  const latest = state?.plays.at(-1);
  const latestPlayer = latest === undefined ? undefined : playerOf(latest);
  // One channel carries the latest play to everyone: it names someone only if both
  // teams' player lines are shown.
  const latestNamed = shown.home && shown.away && latestPlayer !== undefined;

  const playersOf = (side: Side) =>
    view === undefined || !shown[side]
      ? []
      : Object.entries(view.players)
          .filter(([personId, line]) => line.side === side && uuidPattern.test(personId))
          .map(([personId, line]) => ({ personId, line }));
  const listed = sides.flatMap((side) => playersOf(side).map((p) => ({ side, ...p })));
  const needed = new Set(listed.map((p) => p.personId));
  if (latestNamed) needed.add(latestPlayer);
  const people = needed.size === 0 ? [] : await store.people([...needed]);
  const personOf = new Map<string, GamePersonRecord>(people.map((p) => [p.id, p]));
  const jerseyOf = new Map<string, string>();
  for (const line of lines) {
    if (line.jerseyNumber !== null && jerseyPattern.test(line.jerseyNumber)) {
      jerseyOf.set(line.personId, line.jerseyNumber);
    }
  }
  const nameOf = (side: Side, personId: string): string | null => {
    const person = personOf.get(personId);
    if (person === undefined) return null;
    const name = showName(
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
        statsOf: settingOf(team[side]),
      },
    );
    return name.shown ? short(name.text) : null;
  };

  const onCourt = (side: Side) => new Set(view?.teams[side].onCourt ?? []);
  const court: Record<Side, ReadonlySet<string>> = { home: onCourt('home'), away: onCourt('away') };
  const players = listed
    .map(({ side, personId, line }) => ({
      playerId: personId,
      side,
      name: nameOf(side, personId),
      jersey: jerseyOf.get(personId) ?? null,
      points: line.points,
      fouls: line.fouls,
      onCourt: court[side].has(personId),
    }))
    .sort(
      (a, b) =>
        (a.side === b.side ? 0 : a.side === 'home' ? -1 : 1) ||
        Number(a.jersey ?? '999') - Number(b.jersey ?? '999') ||
        a.playerId.localeCompare(b.playerId),
    )
    .slice(0, 200);

  let latestPlay: LatestPlay | null = null;
  if (latest !== undefined) {
    const side = 'side' in latest ? latest.side : undefined;
    const named = latestNamed && side !== undefined ? latestPlayer : undefined;
    latestPlay = {
      type: playTypeOf(latest.type),
      ...(side === undefined ? {} : { side }),
      playerName: named === undefined || side === undefined ? null : nameOf(side, named),
      jersey: named === undefined ? null : (jerseyOf.get(named) ?? null),
      ...(latest.type === 'score' ? { points: latest.points } : {}),
    };
  }

  const live = game.status === 'live' && view !== undefined;
  const period = Math.min(20, Math.max(1, Math.round(view?.period ?? 1)));
  return ok({
    gameId: game.id.toLowerCase(),
    sequence: whole(saved?.seq),
    sentAt: whole(now),
    status: statusOf(game.status),
    score: live
      ? { home: whole(view.teams.home.score), away: whole(view.teams.away.score) }
      : { home: whole(game.homeScore), away: whole(game.awayScore) },
    period,
    clock: clockOf(state),
    teamFouls: {
      home: whole(view?.teams.home.periodFouls),
      away: whole(view?.teams.away.periodFouls),
    },
    latestPlay,
    periods: state?.rules.periods === 2 ? 2 : 4,
    teams: {
      home: { name: short(home.name), statsVisible: shown.home },
      away: { name: short(away.name), statsVisible: shown.away },
    },
    players,
    ...(correctedOn !== undefined && datePattern.test(correctedOn) ? { correctedOn } : {}),
  });
}

/** The live message a snapshot gives (T-117): the same facts, without the players. */
export function liveMessageOf(snapshot: GameSnapshot): LiveMessage {
  const { gameId, sequence, sentAt, status, score, period, clock, teamFouls, latestPlay } =
    snapshot;
  return { gameId, sequence, sentAt, status, score, period, clock, teamFouls, latestPlay };
}
