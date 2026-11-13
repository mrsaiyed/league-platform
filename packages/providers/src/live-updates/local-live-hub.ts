// The local stand-in for live updates (T-14): it runs inside the web app's own
// process and hands each message to every page listening, over server-sent events.
// For local work and tests only, with made-up data (T-201); on the platform the
// Supabase Realtime adapter carries messages instead (T-8).
//
// Messages on one channel reach every listener in the order they were published:
// each publish hands its message to every listener before it returns. Nothing is
// kept for later. A page that connects late or misses one finds the gap from the
// sequence numbers and fetches a snapshot (T-118).
//
// `serve` is the page-facing door and only lets a page listen: it answers GET with
// the event stream and refuses every other method, so no page can publish (T-120).
// Who may listen to which league is the web route's to say, through `authorize`
// (record 021): the hub only knows channel names.
import { parseLiveChannelName, type LiveChannel } from '@srleagues/contracts';
import { livePublisherFrom, type LiveDelivery, type LivePublisher } from './live-publisher.ts';

export type LiveListener = (delivery: LiveDelivery) => void;

/**
 * Whether this request may listen to this channel. The hub allows every channel by
 * default, which is right only for tests. The web route that mounts `serve` must
 * pass one that refuses a league that is not published or not visible to this
 * viewer (U-9), as the league's pages would.
 */
export type LiveAuthorize = (channel: LiveChannel, request: Request) => boolean | Promise<boolean>;

export type LocalLiveHub = LivePublisher & {
  /** Listens on one channel, in this process. Returns the way to stop. */
  readonly listen: (channel: string, listener: LiveListener) => () => void;
  /**
   * Answers a page's `GET …?channel=<name>` with an event stream of that channel's
   * messages. The web app mounts it on one route. Refusals: 405 for any other
   * method, 400 for a name that is not ours, 403 when `authorize` says no, 503 when
   * there are already too many streams or `authorize` failed (the page tries later).
   */
  readonly serve: (request: Request) => Promise<Response>;
  /** How many listeners a channel has, streams included. */
  readonly listenerCount: (channel: string) => number;
  /** How many page streams are open, on one channel or in all. */
  readonly streamCount: (channel?: string) => number;
  /** Ends every stream and forgets every listener. */
  readonly close: () => void;
};

export type LocalLiveHubOptions = {
  /** How often a stream sends a comment so nothing in between closes it. Default 25 s. */
  readonly keepAliveMs?: number;
  /**
   * How many messages may wait for one slow page before its stream is ended. The page
   * reconnects and fetches a snapshot; the others are not held up. Default 500.
   */
  readonly maxWaiting?: number;
  /** How long a page waits before reconnecting, sent to it as `retry`. Default 3 s. */
  readonly retryMs?: number;
  /** Who may listen to what; allows everything when left out (see `LiveAuthorize`). */
  readonly authorize?: LiveAuthorize;
  /** Most page streams on one channel. Default 1,000. */
  readonly maxStreamsPerChannel?: number;
  /** Most page streams in all. Default 5,000. */
  readonly maxStreams?: number;
};

const encoder = new TextEncoder();

/** One server-sent event: the event name, then the message as one line of JSON. */
const eventText = (delivery: LiveDelivery): string =>
  `event: ${delivery.event}\ndata: ${JSON.stringify(delivery.payload)}\n\n`;

const plain = (status: number, text: string, headers: Record<string, string> = {}) =>
  new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers },
  });

const allowAll: LiveAuthorize = () => true;

export function createLocalLiveHub(options: LocalLiveHubOptions = {}): LocalLiveHub {
  const keepAliveMs = Math.max(1, options.keepAliveMs ?? 25_000);
  const maxWaiting = Math.max(1, options.maxWaiting ?? 500);
  const retryMs = Math.max(0, options.retryMs ?? 3_000);
  const authorize = options.authorize ?? allowAll;
  const maxPerChannel = Math.max(1, options.maxStreamsPerChannel ?? 1_000);
  const maxStreams = Math.max(1, options.maxStreams ?? 5_000);
  const listeners = new Map<string, Set<LiveListener>>();
  const streams = new Map<string, number>();
  let streamTotal = 0;
  const closers = new Set<() => void>();

  function listen(channel: string, listener: LiveListener): () => void {
    let set = listeners.get(channel);
    if (set === undefined) {
      set = new Set();
      listeners.set(channel, set);
    }
    // Wrapped, so the same function can listen twice and each stops on its own.
    const entry: LiveListener = (delivery) => listener(delivery);
    set.add(entry);
    return () => {
      const current = listeners.get(channel);
      if (current === undefined) return;
      current.delete(entry);
      if (current.size === 0) listeners.delete(channel);
    };
  }

  const publisher = livePublisherFrom(async (delivery) => {
    const set = listeners.get(delivery.channel);
    if (set === undefined) return;
    // A copy: a listener that stops during the hand-out does not skip the next one.
    for (const listener of [...set]) {
      try {
        listener(delivery);
      } catch {
        // One broken listener never keeps the message from the others.
      }
    }
  });

  const countStream = (name: string, change: 1 | -1) => {
    const next = (streams.get(name) ?? 0) + change;
    if (next <= 0) streams.delete(name);
    else streams.set(name, next);
    streamTotal += change;
  };

  async function serve(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return plain(405, 'Live channels can only be listened to.', { Allow: 'GET' });
    }
    const name = new URL(request.url).searchParams.get('channel') ?? '';
    const channel = parseLiveChannelName(name);
    if (channel === null) return plain(400, 'Unknown live channel.');
    let allowed: boolean;
    try {
      allowed = await authorize(channel, request);
    } catch {
      return plain(503, 'Live updates are not available just now.', { 'Retry-After': '30' });
    }
    if (!allowed) return plain(403, 'This live channel is not open to you.');
    if (streamTotal >= maxStreams || (streams.get(name) ?? 0) >= maxPerChannel) {
      return plain(503, 'Live updates are busy; try again shortly.', { 'Retry-After': '30' });
    }

    let stop = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let ended = false;
        countStream(name, 1);
        const end = () => {
          if (ended) return;
          ended = true;
          clearInterval(timer);
          unlisten();
          countStream(name, -1);
          request.signal.removeEventListener('abort', closeStream);
          closers.delete(closeStream);
        };
        const closeStream = () => {
          if (ended) return;
          end();
          try {
            controller.close();
          } catch {
            // Already closed or errored.
          }
        };
        // Sends text, unless the page has stopped reading: then its stream is ended
        // rather than holding every message, or every keep-alive, for it.
        const send = (text: string) => {
          if (ended) return;
          if ((controller.desiredSize ?? 0) <= -maxWaiting) {
            end();
            controller.error(new Error('The page fell too far behind.'));
            return;
          }
          controller.enqueue(encoder.encode(text));
        };
        const unlisten = listen(name, (delivery) => send(eventText(delivery)));
        const timer = setInterval(() => send(': keep-alive\n\n'), keepAliveMs);
        stop = end;
        closers.add(closeStream);
        request.signal.addEventListener('abort', closeStream);
        send(`retry: ${retryMs}\n\n`);
        if (request.signal.aborted) closeStream();
      },
      cancel() {
        stop();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  return {
    ...publisher,
    listen,
    serve,
    listenerCount: (channel) => listeners.get(channel)?.size ?? 0,
    streamCount: (channel) => (channel === undefined ? streamTotal : (streams.get(channel) ?? 0)),
    close: () => {
      for (const closeStream of [...closers]) closeStream();
      listeners.clear();
    },
  };
}
