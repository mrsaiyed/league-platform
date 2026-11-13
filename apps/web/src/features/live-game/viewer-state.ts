// T-117, T-118: what a viewer's page does with numbered messages. Messages count up by
// one; a jump means one was missed, and the page asks for a fresh snapshot rather than
// guess. These rules hold no network and no timers; the page feeds them.
import type { GameSnapshot, LiveMessage } from '@srleagues/contracts';

export type ViewerGame = Omit<GameSnapshot, 'teams' | 'players' | 'periods' | 'correctedOn'> &
  Partial<Pick<GameSnapshot, 'teams' | 'players' | 'periods' | 'correctedOn'>> & {
    /** The sequence the players were taken at. Messages do not update players. */
    playersAsOfSequence?: number;
  };

/** True only when the players shown are those of the game's current sequence. */
export const playersAreCurrent = (game: ViewerGame): boolean =>
  game.players !== undefined && game.playersAsOfSequence === game.sequence;

export type ViewerState = {
  gameId: string;
  /** Null until the first snapshot has been adopted. */
  game: ViewerGame | null;
  /** True once a gap was noticed and until a snapshot at or past it arrives. */
  awaitingSnapshot: boolean;
  /** The highest sequence number heard of; a snapshot older than this does not end the wait. */
  seenSequence: number;
};

export type MessageOutcome =
  /** The next message in order: applied. */
  | 'applied'
  /** Already seen, or older than what is shown, or for another game: ignored. */
  | 'ignored'
  /** A message was missed: ask for a snapshot now. */
  | 'ask-for-snapshot'
  /** Still waiting on a snapshot already asked for: ignored, no second ask. */
  | 'waiting';

export const startViewing = (gameId: string): ViewerState => ({
  gameId,
  game: null,
  awaitingSnapshot: true,
  seenSequence: 0,
});

/** Applies one message. Returns the new state and what the page should do. */
export function applyMessage(
  state: ViewerState,
  message: LiveMessage,
): { state: ViewerState; outcome: MessageOutcome } {
  if (message.gameId !== state.gameId) return { state, outcome: 'ignored' };
  if (state.game === null) {
    // No snapshot yet: nothing to number against. The first snapshot is already asked for.
    // Remember how far the game has got, so a snapshot that is behind asks again.
    // Step 2.45 needs a slow safety poll: a lost LAST message leaves no later one to
    // reveal the gap, so the page must refetch now and then even when nothing arrives.
    const seenSequence = Math.max(state.seenSequence, message.sequence);
    return { state: { ...state, seenSequence }, outcome: 'waiting' };
  }
  if (message.sequence <= state.game.sequence) return { state, outcome: 'ignored' };
  const seenSequence = Math.max(state.seenSequence, message.sequence);
  const inOrder = message.sequence === state.game.sequence + 1;
  if (state.awaitingSnapshot && !inOrder) {
    return { state: { ...state, seenSequence }, outcome: 'waiting' };
  }
  if (!inOrder) {
    return {
      state: { ...state, awaitingSnapshot: true, seenSequence },
      outcome: 'ask-for-snapshot',
    };
  }
  const { gameId, sequence, sentAt, status, score, period, clock, teamFouls, latestPlay } = message;
  return {
    state: {
      ...state,
      seenSequence,
      // An in-order message after an old snapshot is applied; the wait ends only once
      // nothing seen is ahead of what is shown.
      awaitingSnapshot: state.awaitingSnapshot && sequence < seenSequence,
      game: {
        ...state.game,
        gameId,
        sequence,
        sentAt,
        status,
        score,
        period,
        clock,
        teamFouls,
        latestPlay,
      },
    },
    outcome: 'applied',
  };
}

/**
 * Adopts a snapshot and says whether the page must fetch another now (`refetch`): true
 * when the snapshot is behind messages already seen, or is an old cached copy while a
 * snapshot is still awaited. The page should retry with a pause, not in a tight loop.
 */
export function applySnapshot(
  state: ViewerState,
  snapshot: GameSnapshot,
): { state: ViewerState; refetch: boolean } {
  if (snapshot.gameId !== state.gameId) return { state, refetch: false };
  if (state.game !== null && snapshot.sequence < state.game.sequence) {
    return { state, refetch: state.awaitingSnapshot };
  }
  const behind = snapshot.sequence < state.seenSequence;
  return {
    state: {
      ...state,
      game: { ...snapshot, playersAsOfSequence: snapshot.sequence },
      awaitingSnapshot: behind,
      seenSequence: Math.max(state.seenSequence, snapshot.sequence),
    },
    refetch: behind,
  };
}
