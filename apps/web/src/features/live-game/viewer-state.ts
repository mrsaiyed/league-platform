// T-117, T-118: what a viewer's page does with numbered messages. Messages count up by
// one; a jump means one was missed, and the page asks for a fresh snapshot rather than
// guess. These rules hold no network and no timers; the page feeds them.
import type { GameSnapshot, LiveMessage } from '@srleagues/contracts';

export type ViewerGame = Omit<GameSnapshot, 'teams' | 'players' | 'periods' | 'correctedOn'> &
  Partial<Pick<GameSnapshot, 'teams' | 'players' | 'periods' | 'correctedOn'>>;

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
    return { state, outcome: 'waiting' };
  }
  if (message.sequence <= state.game.sequence) return { state, outcome: 'ignored' };
  const seenSequence = Math.max(state.seenSequence, message.sequence);
  if (state.awaitingSnapshot) return { state: { ...state, seenSequence }, outcome: 'waiting' };
  if (message.sequence !== state.game.sequence + 1) {
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
 * Adopts a snapshot. One older than what is shown (a cached copy that lagged behind live
 * messages) is ignored; the page keeps waiting if it was waiting.
 */
export function applySnapshot(state: ViewerState, snapshot: GameSnapshot): ViewerState {
  if (snapshot.gameId !== state.gameId) return state;
  if (state.game !== null && snapshot.sequence < state.game.sequence) return state;
  return {
    ...state,
    game: snapshot,
    awaitingSnapshot: snapshot.sequence < state.seenSequence,
    seenSequence: Math.max(state.seenSequence, snapshot.sequence),
  };
}
