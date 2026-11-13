// The browser's side of the local stand-in (T-14): listens to the web app's own
// live address over server-sent events, which the stand-in hub in the providers
// package answers. For local work and tests; on the platform pages use the
// Supabase Realtime subscriber instead (T-8).
//
// The browser's EventSource only ever asks (GET), so this cannot publish (T-120).
//
// The browser reconnects by itself after a dropped connection. It gives up only on
// a refusal (any answer that is not a 200 event stream: 400, 403, 405, 503), and
// only then does this open it again, on the slower refusal delays.
import { liveChannelName, liveEventName } from '@srleagues/contracts';
import {
  defaultRefusedDelaysMs,
  defaultStableMs,
  liveSubscriberFrom,
  nextDelay,
  parseJson,
  type ChannelOpener,
  type LiveSubscriber,
} from './live-subscriber.ts';

/** The part of the browser's EventSource used here, so tests can stand in for it. */
export type EventSourceLike = {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: Event) => void): void;
  close(): void;
};

export type ServerSentEventsSubscriberOptions = {
  /** The web app's live address, such as `/api/v1/live`. The channel is added to it. */
  readonly address: string;
  /** Stand-in for tests; the browser's EventSource otherwise. */
  readonly open?: (url: string) => EventSourceLike;
  /**
   * Waits before opening again once the browser has given up (a refusal) or could
   * not open at all. Default 30 s, 1, 2, then 5 min, each spread at random.
   */
  readonly retryDelaysMs?: readonly number[];
  /** How long a connection must stay open before its failures are forgotten. Default 30 s. */
  readonly stableMs?: number;
  /** Stand-in for Math.random, for tests. */
  readonly random?: () => number;
};

/** EventSource's readyState once it has given up and will not try again by itself. */
const closedState = 2;

export function serverSentEventsSubscriber(
  options: ServerSentEventsSubscriberOptions,
): LiveSubscriber {
  const openSource = options.open ?? ((url: string) => new EventSource(url));
  const delays = options.retryDelaysMs ?? defaultRefusedDelaysMs;
  const stableMs = options.stableMs ?? defaultStableMs;
  const random = options.random ?? Math.random;
  const join = options.address.includes('?') ? '&' : '?';

  const openChannel: ChannelOpener = (channel, events) => {
    // Throws for an ID that is not one; the page is then told 'unavailable'.
    const url = `${options.address}${join}channel=${encodeURIComponent(liveChannelName(channel))}`;
    let stopped = false;
    let failures = 0;
    let openedAt: number | undefined;
    let source: EventSourceLike | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const tryAgainLater = () => {
      // Failures are forgotten only once a connection has stayed up a while, so one
      // that opens and is refused at once keeps waiting longer each time.
      if (openedAt !== undefined && Date.now() - openedAt >= stableMs) failures = 0;
      openedAt = undefined;
      retry = setTimeout(connect, nextDelay(delays, failures, random));
      failures += 1;
    };

    function connect(): void {
      retry = undefined;
      if (stopped) return;
      let current: EventSourceLike;
      try {
        current = openSource(url);
      } catch {
        source = undefined;
        events.connection('unavailable');
        tryAgainLater();
        return;
      }
      source = current;
      current.addEventListener('open', () => {
        if (stopped || source !== current) return;
        openedAt = Date.now();
        events.connection('open');
      });
      current.addEventListener(liveEventName, (event) => {
        if (stopped || source !== current) return;
        events.message(parseJson((event as MessageEvent).data));
      });
      current.addEventListener('error', () => {
        if (stopped || source !== current) return;
        events.connection('unavailable');
        // The browser tries again by itself unless the answer was a refusal; then we do.
        if (current.readyState !== closedState) return;
        current.close();
        tryAgainLater();
      });
    }

    events.connection('connecting');
    connect();
    return () => {
      stopped = true;
      if (retry !== undefined) clearTimeout(retry);
      source?.close();
    };
  };

  return liveSubscriberFrom(openChannel);
}
