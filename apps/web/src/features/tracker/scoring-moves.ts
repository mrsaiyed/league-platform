// What a tap or a drag on the scoring screen means (step 2.35), with no drawing: which
// tap goes to the controller, what the pad shows next, or which sentence explains why
// nothing happened. The controller applies every tap to the engine; nothing here changes
// the game.
import type { MessageKey } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import type { LineupPicks } from './opened-game-storage.ts';
import { findTile, type PlayerTile, type ScoringView, type Side } from './scoring-view.ts';
import type { TapInput } from './tracker-controller.ts';

/**
 * What the pad shows: nothing picked, a player's options, a team's turnovers, or a
 * team's whole bench. The bench opens where it does not all fit beside the court (a
 * short phone folds it away; a long bench ends in "+5"): to pick a bench player
 * (`forId` null), or who comes in for the floor player `forId`.
 */
export type PadMode =
  | { readonly kind: 'rest' }
  | { readonly kind: 'player'; readonly playerId: string }
  | { readonly kind: 'turnovers'; readonly side: Side }
  | { readonly kind: 'bench'; readonly side: Side; readonly forId: string | null }
  /**
   * Both teams' timeouts (step 2.36). `asking` is the timeout a team with none of that
   * length left is about to be given: it is recorded only after the scorekeeper says so
   * (checklist G5).
   */
  | { readonly kind: 'timeouts'; readonly asking: TimeoutCall | null }
  /**
   * End game was tapped, in More or in the pad (step 2.37): the question, or why the game
   * cannot be ended now. `refused` is what the league said of an End it did not take.
   */
  | { readonly kind: 'end'; readonly refused: string | null }
  /** The game is final: the final panel. Never asked for; `padFor` gives it. */
  | { readonly kind: 'final' }
  /** "Reopen game" was tapped on the final panel: its question, with the reason. */
  | { readonly kind: 'reopen' }
  /** "Mark not started" was tapped in More: its question. */
  | { readonly kind: 'not-started' }
  /**
   * A way off the screen was tapped while plays wait to be sent: asked first, since what
   * waits is sent only from this screen (lane 2.37, fix round, F1). `to` is where to go.
   */
  | { readonly kind: 'leave'; readonly to: string };

/** A timeout to record: whose, and how long. */
export type TimeoutCall = { readonly side: Side; readonly seconds: 60 | 30 };

export const padAtRest: PadMode = { kind: 'rest' };
const padFinal: PadMode = { kind: 'final' };

/**
 * A timeout button tapped (checklist G4, G5): the tap that records it, or, when the team
 * has none of that length left, the question to ask first. Officials grant an extra one
 * at the cost of a technical foul, so it is never refused, only asked about.
 */
export function timeoutTap(
  view: ScoringView,
  call: TimeoutCall,
): { readonly kind: 'record'; readonly input: TapInput } | { readonly kind: 'ask' } {
  const left = view.teams[call.side].timeouts[call.seconds === 30 ? 'short' : 'full'];
  return left > 0
    ? { kind: 'record', input: { type: 'timeout', side: call.side, seconds: call.seconds } }
    : { kind: 'ask' };
}

/**
 * Whether the pad is open on one of these players: an option is taken only while it is.
 * The pad goes to rest with the tap, so the same option tapped again before the closed
 * pad is drawn is not a second play.
 */
export const padIsFor = (pad: PadMode, ...playerIds: readonly string[]): boolean =>
  pad.kind === 'player' && playerIds.includes(pad.playerId);

/** The options of a player's pad, apart from the substitution row. */
export type PadAction = 'p1' | 'p2' | 'p3' | 'foul' | 'unfoul' | 'turnover';

/** What tapping a player's tile does. */
export type TileTap =
  /** Picking starters: the picks as they now stand, and the lineup if that set it (C1, C2). */
  | { readonly kind: 'pick'; readonly picks: LineupPicks; readonly lineup: TapInput | null }
  /** The lineup is set: the player's options open, or close if they were open (D4). */
  | { readonly kind: 'pad'; readonly pad: PadMode };

/** Tapping the tile of `playerId`; null for a player the screen does not show. */
export function tapTile(
  view: ScoringView,
  picks: LineupPicks,
  pad: PadMode,
  playerId: string,
): TileTap | null {
  const tile = findTile(view, playerId);
  if (tile === undefined) return null;
  const team = view.teams[tile.side];
  if (team.stage !== 'set') {
    const before = team.picks;
    const after = before.includes(playerId)
      ? before.filter((id) => id !== playerId)
      : [...before, playerId].slice(0, basketball.LINEUP_SIZE);
    // The fifth pick sets the lineup at once. The five stay picked until the lineup is
    // taken (the screen forgets them once the team's lineup is set), so a refusal
    // loses no tap.
    const full = after.length === basketball.LINEUP_SIZE;
    return {
      kind: 'pick',
      picks: { ...picks, [tile.side]: after },
      lineup: full ? { type: 'lineup', side: tile.side, playerIds: after } : null,
    };
  }
  const open = pad.kind === 'player' && pad.playerId === playerId;
  return { kind: 'pad', pad: open ? padAtRest : { kind: 'player', playerId } };
}

/** "Start with 3": a short-handed lineup of the players picked so far, if any (C2). */
export function startShortHanded(view: ScoringView, side: Side): TapInput | null {
  const team = view.teams[side];
  if (team.stage !== 'picking' || team.picks.length === 0) return null;
  return { type: 'lineup', side, playerIds: [...team.picks] };
}

/** The tap one of a player's options makes (D5). */
export function padTap(tile: PlayerTile, action: PadAction): TapInput {
  const who = { side: tile.side, playerId: tile.id };
  switch (action) {
    case 'p1':
      return { type: 'score', ...who, points: 1 };
    case 'p2':
      return { type: 'score', ...who, points: 2 };
    case 'p3':
      return { type: 'score', ...who, points: 3 };
    case 'foul':
      return { type: 'foul', ...who };
    case 'unfoul':
      return { type: 'unfoul', ...who };
    case 'turnover':
      return { type: 'turnover', ...who };
  }
}

/** The substitution of `coming` for `going`, both of one team (E1). */
export const subTap = (coming: PlayerTile, going: PlayerTile): TapInput => ({
  type: 'sub',
  side: going.side,
  inId: coming.id,
  outId: going.id,
});

/** What dropping one player's tile on another does (E2, E3). */
export type Drop =
  | {
      readonly kind: 'sub';
      readonly input: TapInput;
      readonly inId: string;
      readonly outId: string;
    }
  | {
      readonly kind: 'say';
      readonly key: Extract<
        MessageKey,
        'tracker.say.subAcrossTeams' | 'tracker.say.subBenchToFloor'
      >;
    };

/** Dropping `fromId` on `toId`; null when it was dropped on nobody, or on itself. */
export function dropOn(view: ScoringView, fromId: string, toId: string | null): Drop | null {
  if (toId === null || toId === fromId) return null;
  const from = findTile(view, fromId);
  const to = findTile(view, toId);
  if (from === undefined || to === undefined) return null;
  if (from.side !== to.side) return { kind: 'say', key: 'tracker.say.subAcrossTeams' };
  if (from.onCourt || !to.onCourt) return { kind: 'say', key: 'tracker.say.subBenchToFloor' };
  return { kind: 'sub', input: subTap(from, to), inId: from.id, outId: to.id };
}

/** "Swap colors": the other way round from how the game is drawn now (D3). */
export const swapColorsTap = (game: basketball.GameState): TapInput => ({
  type: 'colors',
  swapped: !game.colorsSwapped,
});

/**
 * The pad after the game changed: a player no longer shown (their roster entry went, or
 * the game was rebuilt without them) is not left open.
 */
export function padFor(view: ScoringView, pad: PadMode): PadMode {
  // A final game shows the final panel in the pad's place, whatever was open (step 2.37):
  // only the Reopen question, and the question before leaving, stand in its place. And
  // nothing about a final game is left open once the game is live again (the End taken
  // back, the game reopened).
  if (view.status === 'final')
    return pad.kind === 'reopen' || pad.kind === 'leave' ? pad : padFinal;
  if (pad.kind === 'final' || pad.kind === 'reopen') return padAtRest;
  // A game that is not live has nothing to mark not started.
  if (pad.kind === 'not-started') return view.status === 'live' ? pad : padAtRest;
  if (pad.kind === 'bench') {
    // The bench of a team with no lineup, or for a player no longer on the court, closes.
    if (view.teams[pad.side].stage !== 'set') return padAtRest;
    if (pad.forId === null) return pad;
    return findTile(view, pad.forId)?.onCourt === true ? pad : padAtRest;
  }
  if (pad.kind !== 'player') return pad;
  const tile = findTile(view, pad.playerId);
  return tile !== undefined && view.teams[tile.side].stage === 'set' ? pad : padAtRest;
}

/**
 * Tapping a player in the opened bench: they come in for the floor player the bench was
 * opened for, or their own options open.
 */
export function pickFromBench(
  view: ScoringView,
  pad: PadMode,
  playerId: string,
):
  | { readonly kind: 'sub'; readonly coming: PlayerTile; readonly going: PlayerTile }
  | TileTap
  | null {
  if (pad.kind !== 'bench') return null;
  const coming = findTile(view, playerId);
  if (coming === undefined || coming.onCourt || coming.side !== pad.side) return null;
  if (pad.forId === null) return { kind: 'pad', pad: { kind: 'player', playerId } };
  const going = findTile(view, pad.forId);
  return going === undefined || !going.onCourt ? null : { kind: 'sub', coming, going };
}
