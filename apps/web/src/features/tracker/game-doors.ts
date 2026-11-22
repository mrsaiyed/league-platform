// The two doors a scorekeeper reaches from the scoring screen that are not taps (step
// 2.37; steps 2.120 and 2.121; S-36, S-40): reopening a game ended too soon, with the
// read that says whether and until when it is offered, and marking a game that went live
// by mistake "not started". Neither can be queued (the server refuses a reopen or reset
// tap), so each is a plain request the controller makes once nothing is waiting to send
// (tracker-controller.ts). The browser's version is fetch-game-doors.ts; nothing here
// throws, every failure is an outcome, sorted as tracker-server.ts sorts them.
import type {
  NotStartedReply,
  NotStartedRequest,
  ReopenOffer,
  ReopenReply,
  ReopenRequest,
} from '@srleagues/contracts';
import type { ServerOutcome } from './tracker-server.ts';

export interface GameDoors {
  /** Whether Reopen is offered to this account now, until when, and who ended the game. */
  reopenOffer(signal: AbortSignal): Promise<ServerOutcome<ReopenOffer>>;
  /** Reopens the game. A refusal with its code is an answer: `ReopenReply` has it. */
  reopen(request: ReopenRequest, signal: AbortSignal): Promise<ServerOutcome<ReopenReply>>;
  /** Marks the game not started. A refusal with its code is an answer too. */
  markNotStarted(
    request: NotStartedRequest,
    signal: AbortSignal,
  ): Promise<ServerOutcome<NotStartedReply>>;
}
