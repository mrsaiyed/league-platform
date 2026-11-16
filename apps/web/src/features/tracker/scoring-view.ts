// What the scoring screen shows (step 2.35), worked out from the engine's state and the
// rosters the device keeps, with no drawing. Every number here is the engine's own
// (`basketball.derive`): the screen keeps no second copy of the game. The words are in
// the message files; this holds none.
import { basketball } from '@srleagues/sports';
import type { DevicePlayer, DeviceRosters, LineupPicks } from './opened-game-storage.ts';

export type Side = basketball.Side;

/** Home is drawn light and away dark unless the scorekeeper swapped them (checklist D3). */
export type TeamColor = 'light' | 'dark';

export const teamColor = (side: Side, swapped: boolean): TeamColor =>
  (side === 'home') !== swapped ? 'light' : 'dark';

/** One player as a tile shows them. */
export type PlayerTile = {
  readonly id: string;
  readonly side: Side;
  readonly player: DevicePlayer;
  /** The jersey number, or null for a player with none (drawn as a faint dash). */
  readonly number: string | null;
  /** The name under the number on a small tile: the first name, else the last. */
  readonly shortName: string;
  /**
   * The engine has this player in the game and this device's rosters do not (yet): no
   * name and no number are known here, and the tile says so.
   */
  readonly unlisted: boolean;
  readonly onCourt: boolean;
  readonly points: number;
  readonly fouls: number;
  readonly turnovers: number;
  /** Time on the court, in milliseconds of game clock. */
  readonly ms: number;
  /** At the league's foul limit (`Line.fouledOut`): marked, still tappable (D10). */
  readonly fouledOut: boolean;
  /** Tapped as a starter while the lineup is being picked. */
  readonly picked: boolean;
};

/** One timeout a team took that still stands (checklist G7). */
export type TakenTimeout = {
  /** The id of the play. */
  readonly id: string;
  readonly period: number;
  /** The game clock it was called at, in milliseconds. */
  readonly clockMs: number;
  readonly seconds: 60 | 30;
};

/** A team's timeouts (checklist G3 to G7): the engine's own count, by length. */
export type TeamTimeouts = {
  /** Full (60-second) timeouts left now; never below zero here. */
  readonly full: number;
  /** 30-second timeouts left now; never below zero here. */
  readonly short: number;
  /** Both lengths together: what the team's chip says. */
  readonly left: number;
  /** The format has 30-second timeouts, or one was taken anyway: the button is offered. */
  readonly offersShort: boolean;
  /** Those taken and still standing, oldest first. */
  readonly taken: readonly TakenTimeout[];
};

/** One team's panel. */
export type TeamPanel = {
  readonly side: Side;
  readonly name: string;
  readonly color: TeamColor;
  readonly score: number;
  /**
   * `no-players`: nobody to show; `picking`: its starters are being tapped;
   * `set`: its lineup is set and it is scored.
   */
  readonly stage: 'no-players' | 'picking' | 'set';
  /** The players on the court, in the order the engine holds them: a tile never moves. */
  readonly floor: readonly PlayerTile[];
  /** Once the lineup is set, everyone else in jersey order; while picking, everyone. */
  readonly bench: readonly PlayerTile[];
  /** The starters picked so far that are still on the roster shown. */
  readonly picks: readonly string[];
  /** Players on the team now (not those who have left): the count before tip-off (A6). */
  readonly playerCount: number;
  /** Every turnover: its players' and the team's own. */
  readonly turnovers: number;
  /** Turnovers charged to the team rather than a player (G2). */
  readonly teamTurnovers: number;
  /** The players charged with turnovers, most first, then in jersey order (G1). */
  readonly turnoverList: readonly PlayerTile[];
  /** Team fouls counted toward the bonus in the period being played (F1, F5). */
  readonly teamFouls: number;
  /**
   * This team's own foul trouble (F2): 1 once its fouls have put the other team in the
   * bonus, 2 in the double bonus.
   */
  readonly foulLevel: 0 | 1 | 2;
  /** What this team shoots, from the other team's fouls (F3): 1 the bonus, 2 the double. */
  readonly bonus: 0 | 1 | 2;
  readonly timeouts: TeamTimeouts;
};

export type ScoringView = {
  readonly status: basketball.GameState['status'];
  readonly period: number;
  readonly periods: 2 | 4;
  /** How many plays the game holds as the device shows it: one more for each tap taken. */
  readonly plays: number;
  /** True until both teams that have players have their lineup set. */
  readonly pickingLineups: boolean;
  /** The format's timeouts, for the rule's one line (G7). */
  readonly timeoutRules: basketball.TimeoutRules;
  readonly teams: Readonly<Record<Side, TeamPanel>>;
};

/** A team's timeouts that still stand, each with when it was called: read from the plays. */
function takenTimeouts(game: basketball.GameState, side: Side): TakenTimeout[] {
  const taken: TakenTimeout[] = [];
  for (const play of game.plays) {
    if (play.type === 'timeout' && play.side === side) {
      taken.push({
        id: play.id,
        period: play.period,
        clockMs: play.clockMs,
        seconds: play.seconds,
      });
    } else if (play.type === 'untimeout' && play.side === side) taken.pop();
  }
  return taken;
}

/**
 * The timeout a take-back took back (the area 4 review of step 2.36, M2: the screen says
 * which one came back): `playId` is the take-back's own play. Undefined when that play is
 * not a take-back, or the team had none standing.
 */
export function timeoutTakenBack(
  game: basketball.GameState,
  playId: string,
): TakenTimeout | undefined {
  const takeBack = game.plays.find((play) => play.id === playId);
  if (takeBack?.type !== 'untimeout') return undefined;
  const standing: TakenTimeout[] = [];
  for (const play of game.plays) {
    if (play.id === playId) return standing.pop();
    if (play.type === 'timeout' && play.side === takeBack.side) {
      standing.push({
        id: play.id,
        period: play.period,
        clockMs: play.clockMs,
        seconds: play.seconds,
      });
    } else if (play.type === 'untimeout' && play.side === takeBack.side) standing.pop();
  }
  return undefined;
}

/** A player the engine has and the device's rosters lack: one object for each, kept. */
const unlistedPlayers = new Map<string, DevicePlayer>();
function unlistedPlayer(personId: string): DevicePlayer {
  const known = unlistedPlayers.get(personId);
  if (known !== undefined) return known;
  const player: DevicePlayer = {
    personId,
    firstName: '',
    lastName: '',
    jerseyNumber: null,
    left: false,
    addedAtGameId: null,
    toReview: false,
  };
  unlistedPlayers.set(personId, player);
  return player;
}

/** Jersey order: by number (00 before 0), players with no number last, then by name. */
export function inJerseyOrder(players: readonly DevicePlayer[]): DevicePlayer[] {
  const key = (p: DevicePlayer): readonly [number, number, number] =>
    p.jerseyNumber === null || p.jerseyNumber === ''
      ? [1, 0, 0]
      : [0, Number(p.jerseyNumber), -p.jerseyNumber.length];
  const name = (p: DevicePlayer) => `${p.lastName} ${p.firstName}`;
  return [...players].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    for (let i = 0; i < 3; i += 1) {
      const difference = (ka[i] ?? 0) - (kb[i] ?? 0);
      if (difference !== 0) return difference;
    }
    return name(a).localeCompare(name(b));
  });
}

/**
 * The players a team's panel shows: those on the team now, and of those who have left
 * only the ones with a line in this game or still on the court (checklist D2, finding L7).
 */
export function shownPlayers(
  team: DeviceRosters['home'],
  lines: basketball.Derived['players'],
  onCourt: readonly string[],
): DevicePlayer[] {
  return inJerseyOrder(
    team.players.filter(
      (p) => !p.left || lines[p.personId] !== undefined || onCourt.includes(p.personId),
    ),
  );
}

/**
 * The scoring screen's view of the game. `elapsedMs` is the clock's running time now
 * (`clockAt(game, now).elapsedMs`), so a player on the court is credited their open stint.
 */
export function scoringView(
  game: basketball.GameState,
  rosters: DeviceRosters,
  picks: LineupPicks,
  elapsedMs: number = game.clock.elapsedMs,
): ScoringView {
  const derived = basketball.derive(game, elapsedMs);
  const timeoutRules = basketball.timeoutRules(game.rules);
  const panel = (side: Side): TeamPanel => {
    const team = rosters[side];
    const view = derived.teams[side];
    // Everyone the engine has on this team's court or with a line in this game is drawn,
    // whether or not this device's rosters know them (a player added at another table a
    // minute ago): the screen never shows fewer on the court than the engine has, and
    // such a player can still be scored and substituted.
    const listed = new Set(team.players.map((p) => p.personId));
    const unlisted = [
      ...new Set([
        ...view.onCourt,
        ...Object.keys(derived.players).filter((id) => derived.players[id]?.side === side),
      ]),
    ]
      .filter((id) => !listed.has(id))
      .map(unlistedPlayer);
    const shown = [...shownPlayers(team, derived.players, view.onCourt), ...unlisted];
    const stage: TeamPanel['stage'] =
      view.onCourt.length > 0 ? 'set' : shown.length === 0 ? 'no-players' : 'picking';
    // Picks kept from before a reload: only players still shown, and none once the
    // lineup is set (perhaps from another device).
    const kept =
      stage === 'picking' ? picks[side].filter((id) => shown.some((p) => p.personId === id)) : [];
    const tile = (player: DevicePlayer): PlayerTile => {
      const line = derived.players[player.personId];
      const number =
        player.jerseyNumber === null || player.jerseyNumber === '' ? null : player.jerseyNumber;
      return {
        id: player.personId,
        side,
        player,
        number,
        shortName: player.firstName !== '' ? player.firstName : player.lastName,
        unlisted: !listed.has(player.personId),
        onCourt: view.onCourt.includes(player.personId),
        points: line?.points ?? 0,
        fouls: line?.fouls ?? 0,
        turnovers: line?.turnovers ?? 0,
        ms: line?.ms ?? 0,
        fouledOut: line?.fouledOut === true,
        picked: kept.includes(player.personId),
      };
    };
    const tiles = shown.map(tile);
    const floor = view.onCourt.flatMap((id) => tiles.find((p) => p.id === id) ?? []);
    const order = new Map(tiles.map((p, index) => [p.id, index]));
    const taken = takenTimeouts(game, side);
    // Below zero in the engine once a team has taken more than allowed; the screen says
    // "none left" and asks before another is recorded.
    const full = Math.max(0, view.timeoutsLeft.full);
    const short = Math.max(0, view.timeoutsLeft.short);
    return {
      side,
      name: team.name,
      color: teamColor(side, game.colorsSwapped),
      score: view.score,
      stage,
      floor,
      bench: tiles.filter((p) => !p.onCourt),
      picks: kept,
      playerCount: team.players.filter((p) => !p.left).length,
      turnovers: view.turnovers,
      teamTurnovers: view.teamTurnovers,
      turnoverList: tiles
        .filter((p) => p.turnovers > 0)
        .sort(
          (a, b) => b.turnovers - a.turnovers || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
        ),
      teamFouls: view.periodFouls,
      foulLevel: view.penalty,
      bonus: view.bonus,
      timeouts: {
        full,
        short,
        left: full + short,
        offersShort: timeoutRules.shortTimeouts > 0 || taken.some((t) => t.seconds === 30),
        taken,
      },
    };
  };
  const teams = { home: panel('home'), away: panel('away') };
  return {
    status: game.status,
    period: derived.period,
    periods: game.rules.periods,
    plays: game.plays.length,
    pickingLineups: teams.home.stage === 'picking' || teams.away.stage === 'picking',
    timeoutRules,
    teams,
  };
}

/** The tile of a player of either team, or undefined for someone the screen does not show. */
export function findTile(view: ScoringView, playerId: string): PlayerTile | undefined {
  for (const side of basketball.SIDES) {
    const team = view.teams[side];
    const found =
      team.floor.find((p) => p.id === playerId) ?? team.bench.find((p) => p.id === playerId);
    if (found !== undefined) return found;
  }
  return undefined;
}
