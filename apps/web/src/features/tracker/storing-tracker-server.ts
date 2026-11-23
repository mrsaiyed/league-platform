// T-115: the game's state stored on the device as the server gives it. This wraps the
// controller's door to the server (tracker-server.ts), so the one state read of record
// 049 (GET .../games/{game}/state) is the only one: each state the controller loads,
// when it opens the game and when it reloads after a refusal or a takeover, is also
// written to the device's opened games (opened-game-storage.ts) before the controller
// sees it. Taps are kept by the queue (T-114), not here.
//
// The copy on the device is for opening with no signal (step 2.38). A failure to write
// it does not stop the game being scored: the controller still gets the state, and
// `onStoreFailed` is told, so the screen can say the device could not save.
import type { OpenedGameStorage } from './opened-game-storage.ts';
import { QueueError, type QueueErrorCode } from './queue-storage.ts';
import type { TrackerServer } from './tracker-server.ts';

export type StoringTrackerServerOptions = {
  readonly gameId: string;
  readonly server: TrackerServer;
  readonly storage: OpenedGameStorage;
  readonly onStoreFailed?: (code: QueueErrorCode) => void;
};

export function createStoringTrackerServer(options: StoringTrackerServerOptions): TrackerServer {
  const { gameId, server, storage, onStoreFailed } = options;
  return {
    session: (request, signal) => server.session(request, signal),
    async loadState(signal) {
      const outcome = await server.loadState(signal);
      if (outcome.kind === 'answer') {
        try {
          await storage.saveState(gameId, outcome.value);
        } catch (error) {
          onStoreFailed?.(error instanceof QueueError ? error.code : 'storage-write-failed');
        }
      }
      return outcome;
    },
  };
}
