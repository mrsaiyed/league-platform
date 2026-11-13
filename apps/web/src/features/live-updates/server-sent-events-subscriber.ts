// The browser's side of the local stand-in (T-14): listens to the web app's own
// live address over server-sent events, which the stand-in hub in the providers
// package answers. For local work and tests; on the platform pages use the
// Supabase Realtime subscriber instead (T-8).
//
// The browser's EventSource only ever asks (GET), so this cannot publish (T-120).
import { liveChannelName, liveEventName } from '@srleagues/contracts';
import {
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
  /** Waits before opening again once the browser has given up. Default 1, 2, 5, 10 s. */
  readonly retryDelaysMs?: readonly number[];
};

/** EventSource's readyState once it has given up and will not try again by itself. */
const closedState = 2;

export function serverSentEventsSubscriber(
  options: ServerSentEventsSubscriberOptions,
): LiveSubscriber {
  const openSource = options.open ?? ((url: string) => new EventSource(url));
  const delays = options.retryDelaysMs ?? [1_000, 2_000, 5_000, 10_000];
  const join = options.address.includes('?') ? '&' : '?';

  const openChannel: ChannelOpener = (channel, events) => {
    const url = `${options.address}${join}channel=${encodeURIComponent(liveChannelName(channel))}`;
    let stopped = false;
    let failures = 0;
    let source: EventSourceLike | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const current = openSource(url);
      source = current;
      current.addEventListener('open', () => {
        if (stopped || source !== current) return;
        failures = 0;
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
        retry = setTimeout(connect, nextDelay(delays, failures));
        failures += 1;
      });
    };

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
