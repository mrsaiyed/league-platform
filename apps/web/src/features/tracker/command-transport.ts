// How the queue reaches the server, as the queue sees it. The browser's version is
// fetch-command-transport.ts; tests give a stand-in server. The queue never learns
// about addresses or status codes, only which of four things happened.
import type { CommandBatch, CommandReply, VersionRefusal } from '@srleagues/contracts';

export type TransportOutcome =
  /** The server answered for the batch (T-111). */
  | { readonly kind: 'reply'; readonly reply: CommandReply }
  /** The server does not speak this batch's protocol version (T-127). */
  | { readonly kind: 'version-refused'; readonly refusal: VersionRefusal }
  /**
   * The server turned the request away whole, and sending the same again will not
   * help until something changes: signed out, not allowed, no such game.
   */
  | { readonly kind: 'rejected'; readonly httpStatus: number }
  /** No usable answer: no network, a timeout, a server error. Send again later. */
  | { readonly kind: 'unanswered' };

export interface CommandTransport {
  /** Never throws: every failure is an outcome. `signal` aborts a send that took too long. */
  send(batch: CommandBatch, signal: AbortSignal): Promise<TransportOutcome>;
}
