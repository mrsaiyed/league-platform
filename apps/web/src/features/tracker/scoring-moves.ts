// What a tap or a drag on the scoring screen means (step 2.35), with no drawing: which
// tap goes to the controller, what the pad shows next, or which sentence explains why
// nothing happened. The controller applies every tap to the engine; nothing here changes
// the game.
import type { MessageKey } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import type { LineupPicks } from './opened-game-storage.ts';
import { findTile, type PlayerTile, type ScoringView, type Side } from './scoring-view.ts';
import type { TapInput } from './tracker-controller.ts';

/** What the pad shows: nothing picked, a player's options, or a team's turnovers. */
export type PadMode =
  | { readonly kind: 'rest' }
  | { readonly kind: 'player'; readonly playerId: string }
  | { readonly kind: 'turnovers'; readonly side: Side };

export const padAtRest: PadMode = { kind: 'rest' };

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
  if (pad.kind !== 'player') return pad;
  const tile = findTile(view, pad.playerId);
  return tile !== undefined && view.teams[tile.side].stage === 'set' ? pad : padAtRest;
}
