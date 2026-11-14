// Following one game on a viewer's page (step 2.45; T6 §6; T-117 to T-119, T-255). The
// page arrives drawn from a snapshot; this then listens to the game's channel and applies
// each message by step 2.6's rules (viewer-state.ts), and fetches a fresh snapshot when
// those rules say so. No drawing and no React: the page hands it a subscriber, a way to
// fetch the snapshot and a place to send each change, and tests hand it stand-ins.
//
// When a snapshot is fetched (record 051):
// - at once, on a gap in the numbers (T-118), and each time the live connection opens,
//   since messages may have been missed while it was connecting or lost;
// - every 5 seconds while the live connection is not open and the game is live (T-119),
//   and only every 60 seconds for a game not live (scheduled, postponed, cancelled),
//   which is enough to see it start;
// - again after 2 seconds while a snapshot is behind messages already seen (the
//   snapshot address is cached for 2 seconds, T-119);
// - at most every 5 seconds while the players shown are older than the score, because
//   messages carry the score and not the players;
// - every 30 seconds while a live game is open and quiet, because a lost LAST message
//   leaves no later one to show the gap.
// One fetch at a time; a final game is not followed at all.
import type { GameSnapshot, LiveMessage } from '@srleagues/contracts';
import type { LiveConnection, LiveSubscriber, LiveSubscription } from '../live-updates/index.ts';
import { serverOffsetMs } from './clock.ts';
import {
  applyMessage,
  applySnapshot,
  playersAreCurrent,
  startViewing,
  type ViewerGame,
  type ViewerState,
} from './viewer-state.ts';

/** What the page draws: the game, the connection, and how far this device's clock is out. */
export type FollowedGame = {
  readonly game: ViewerGame;
  readonly connection: LiveConnection;
  /** Server time minus this device's time (clock.ts), from the newest message. */
  readonly offsetMs: number;
};

/** The timers and the device's clock, so tests can stand in for them. */
export type FollowTimers = {
  readonly setTimeout: (run: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  readonly now: () => number;
};

export type FollowGameOptions = {
  readonly leagueId: string;
  readonly gameId: string;
  /** The snapshot the page was drawn from. */
  readonly initial: GameSnapshot;
  /** This device's time when that snapshot arrived. */
  readonly initialReceivedAt: number;
  readonly subscriber: LiveSubscriber;
  /** The game's snapshot now; null when it could not be had (the next try comes later). */
  readonly fetchSnapshot: () => Promise<GameSnapshot | null>;
  readonly onChange: (followed: FollowedGame) => void;
  readonly timers?: FollowTimers;
  /** Re-fetch while the live connection is not open and the game is live. Default 5 s (T-119). */
  readonly pollMs?: number;
  /** Re-fetch while the live connection is not open and the game is not live. Default 60 s. */
  readonly slowPollMs?: number;
  /** Re-fetch while a snapshot is behind the messages seen. Default 2 s. */
  readonly retryMs?: number;
  /** Re-fetch while the players are older than the score. Default 5 s. */
  readonly playersMs?: number;
  /** Re-fetch while a live game is quiet. Default 30 s. */
  readonly quietMs?: number;
};

export type FollowedGameHandle = {
  /** Stops listening and fetching. Nothing is sent to onChange after this. */
  readonly close: () => void;
};

const deviceTimers: FollowTimers = {
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export function followGame(options: FollowGameOptions): FollowedGameHandle {
  const timers = options.timers ?? deviceTimers;
  const pollMs = options.pollMs ?? 5_000;
  const slowPollMs = options.slowPollMs ?? 60_000;
  const retryMs = options.retryMs ?? 2_000;
  const playersMs = options.playersMs ?? 5_000;
  const quietMs = options.quietMs ?? 30_000;

  let state: ViewerState = applySnapshot(startViewing(options.gameId), options.initial).state;
  let connection: LiveConnection = 'connecting';
  let offsetMs = serverOffsetMs(options.initial.sentAt, options.initialReceivedAt);
  let stopped = false;
  let fetching = false;
  let fetchAgain = false;
  let lastFetchAt = timers.now();
  let timer: unknown;
  let timerSet = false;
  let subscription: LiveSubscription | undefined;

  const emit = () => {
    if (stopped || state.game === null) return;
    options.onChange({ game: state.game, connection, offsetMs });
  };

  /** A final game with nothing awaited: nothing more will come. */
  const finished = () => state.game?.status === 'final' && !state.awaitingSnapshot;

  const clearTimer = () => {
    if (timerSet) timers.clearTimeout(timer);
    timerSet = false;
  };

  /** How long after the last fetch the next one is due; undefined when none is. */
  function nextWait(): number | undefined {
    const game = state.game;
    if (stopped || game === null) return undefined;
    if (state.awaitingSnapshot) return retryMs;
    if (finished()) return undefined;
    if (connection !== 'open') return game.status === 'live' ? pollMs : slowPollMs;
    if (game.status === 'live' && !playersAreCurrent(game)) return playersMs;
    if (game.status === 'live') return quietMs;
    return undefined;
  }

  function plan(): void {
    clearTimer();
    if (finished()) {
      subscription?.close();
      subscription = undefined;
    }
    const wait = nextWait();
    if (wait === undefined || fetching) return;
    timer = timers.setTimeout(
      () => {
        timerSet = false;
        void fetchNow();
      },
      Math.max(0, lastFetchAt + wait - timers.now()),
    );
    timerSet = true;
  }

  async function fetchNow(): Promise<void> {
    if (stopped) return;
    if (fetching) {
      fetchAgain = true;
      return;
    }
    fetching = true;
    clearTimer();
    lastFetchAt = timers.now();
    let snapshot: GameSnapshot | null;
    try {
      snapshot = await options.fetchSnapshot();
    } catch {
      snapshot = null;
    }
    fetching = false;
    if (stopped) return;
    if (snapshot !== null) {
      // A snapshot may be a cached copy up to 2 seconds old, so the device's clock is
      // lined up by the messages and the page's own snapshot, never by a fetched one.
      const adopted = applySnapshot(state, snapshot).state;
      if (adopted !== state) {
        state = adopted;
        emit();
      }
    }
    if (fetchAgain) {
      fetchAgain = false;
      void fetchNow();
      return;
    }
    plan();
  }

  function onMessage(message: LiveMessage): void {
    if (stopped) return;
    const { state: next, outcome } = applyMessage(state, message);
    state = next;
    if (outcome === 'applied') {
      offsetMs = serverOffsetMs(message.sentAt, timers.now());
      emit();
      plan();
    } else if (outcome === 'ask-for-snapshot') {
      void fetchNow();
    }
  }

  function onConnection(next: LiveConnection): void {
    if (stopped) return;
    const before = connection;
    connection = next;
    if (next !== before) emit();
    if (next === 'open' && before !== 'open') void fetchNow();
    else plan();
  }

  if (!finished()) {
    subscription = options.subscriber.subscribeGame(options.leagueId, options.gameId, {
      onMessage,
      onConnection,
    });
  }
  plan();

  return {
    close: () => {
      stopped = true;
      clearTimer();
      subscription?.close();
      subscription = undefined;
    },
  };
}
