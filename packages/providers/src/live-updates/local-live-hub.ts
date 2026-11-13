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
import { parseLiveChannelName } from '@srleagues/contracts';
import { livePublisherFrom, type LiveDelivery, type LivePublisher } from './live-publisher.ts';

export type LiveListener = (delivery: LiveDelivery) => void;

export type LocalLiveHub = LivePublisher & {
  /** Listens on one channel, in this process. Returns the way to stop. */
  readonly listen: (channel: string, listener: LiveListener) => () => void;
  /**
   * Answers a page's `GET …?channel=<name>` with an event stream of that channel's
   * messages. The web app mounts it on one route.
   */
  readonly serve: (request: Request) => Response;
  /** How many listeners a channel has, streams included. */
  readonly listenerCount: (channel: string) => number;
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

export function createLocalLiveHub(options: LocalLiveHubOptions = {}): LocalLiveHub {
  const keepAliveMs = Math.max(1, options.keepAliveMs ?? 25_000);
  const maxWaiting = Math.max(1, options.maxWaiting ?? 500);
  const retryMs = Math.max(0, options.retryMs ?? 3_000);
  const listeners = new Map<string, Set<LiveListener>>();
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

  function serve(request: Request): Response {
    if (request.method !== 'GET') {
      return plain(405, 'Live channels can only be listened to.', { Allow: 'GET' });
    }
    const name = new URL(request.url).searchParams.get('channel') ?? '';
    const channel = parseLiveChannelName(name);
    if (channel === null) return plain(400, 'Unknown live channel.');

    let stop = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let ended = false;
        const write = (text: string) => controller.enqueue(encoder.encode(text));
        const unlisten = listen(name, (delivery) => {
          if (ended) return;
          // The page is not reading: end its stream rather than hold every message.
          if ((controller.desiredSize ?? 0) <= -maxWaiting) {
            stop();
            controller.error(new Error('The page fell too far behind.'));
            return;
          }
          write(eventText(delivery));
        });
        const timer = setInterval(() => {
          if (!ended) write(': keep-alive\n\n');
        }, keepAliveMs);
        const end = () => {
          if (ended) return;
          ended = true;
          clearInterval(timer);
          unlisten();
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
        stop = end;
        closers.add(closeStream);
        request.signal.addEventListener('abort', closeStream);
        write(`retry: ${retryMs}\n\n`);
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
    close: () => {
      for (const closeStream of [...closers]) closeStream();
      listeners.clear();
    },
  };
}
