// Supabase Realtime (T-8), the browser's side: one connection per page to the
// project's Realtime service, joining a private channel for each game or league the
// page watches and handing on each broadcast message. It speaks Realtime's own
// message format (Phoenix channels, version 1.0.0) directly, with no vendor library.
//
// NOT VERIFIED against the live service. Written from Supabase's published protocol
// and tested only against recorded-style messages, never over the network (T-201).
// It is checked against a real project once the vendor accounts exist.
//
// It sends only three things: join a channel, leave it, and the heartbeat that keeps
// the connection open. It never sends a broadcast, so it cannot publish (T-120); the
// private channels and the project's policies make sure no browser can, either.
import { liveChannelName, liveEventName } from '@srleagues/contracts';
import {
  liveSubscriberFrom,
  nextDelay,
  parseJson,
  type ChannelEvents,
  type ChannelOpener,
  type LiveConnection,
  type LiveSubscriber,
} from './live-subscriber.ts';

/** The part of the browser's WebSocket used here, so tests can stand in for it. */
export type WebSocketLike = {
  send(data: string): void;
  close(): void;
  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event: Event) => void,
  ): void;
};

export type SupabaseRealtimeSubscriberOptions = {
  /** The project's address, such as https://<project>.supabase.co. */
  readonly url: string;
  /** The project's publishable key: public by design, never the secret key. */
  readonly publishableKey: string;
  /** Stand-in for tests; the browser's WebSocket otherwise. */
  readonly open?: (url: string) => WebSocketLike;
  /** How often to tell the service the page is still here. Default 25 s. */
  readonly heartbeatMs?: number;
  /** How long a join may go unanswered before it is tried again. Default 10 s. */
  readonly joinTimeoutMs?: number;
  /** Waits before trying again after a failure. Default 1, 2, 5, 10 s. */
  readonly retryDelaysMs?: readonly number[];
};

/** The only events this subscriber ever sends. */
export const sentRealtimeEvents = ['phx_join', 'phx_leave', 'heartbeat'] as const;
type SentEvent = (typeof sentRealtimeEvents)[number];

type Frame = {
  topic: string;
  event: SentEvent;
  payload: Record<string, unknown>;
  ref: string;
  join_ref?: string;
};

type Received = { topic?: unknown; event?: unknown; payload?: unknown; ref?: unknown };

type Topic = {
  readonly name: string;
  readonly entries: Set<ChannelEvents>;
  joinRef: string | null;
  joined: boolean;
  failures: number;
  timer: ReturnType<typeof setTimeout> | undefined;
};

const topicPrefix = 'realtime:';

export function supabaseRealtimeSubscriber(
  options: SupabaseRealtimeSubscriberOptions,
): LiveSubscriber {
  const openSocket = options.open ?? ((url: string) => new WebSocket(url));
  const heartbeatMs = options.heartbeatMs ?? 25_000;
  const joinTimeoutMs = options.joinTimeoutMs ?? 10_000;
  const delays = options.retryDelaysMs ?? [1_000, 2_000, 5_000, 10_000];
  const address =
    `${options.url.replace(/\/+$/, '').replace(/^http/i, 'ws')}/realtime/v1/websocket` +
    `?apikey=${encodeURIComponent(options.publishableKey)}&vsn=1.0.0`;

  const topics = new Map<string, Topic>();
  let socket: WebSocketLike | undefined;
  let socketOpen = false;
  let socketFailures = 0;
  let lastRef = 0;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let heartbeatRef: string | null = null;
  let reconnect: ReturnType<typeof setTimeout> | undefined;

  const nextRef = () => String((lastRef += 1));
  const send = (frame: Frame) => {
    if (socket !== undefined && socketOpen) socket.send(JSON.stringify(frame));
  };
  const tell = (topic: Topic, state: LiveConnection) => {
    for (const entry of [...topic.entries]) entry.connection(state);
  };
  const clearTopicTimer = (topic: Topic) => {
    if (topic.timer !== undefined) clearTimeout(topic.timer);
    topic.timer = undefined;
  };

  function join(topic: Topic): void {
    clearTopicTimer(topic);
    if (!socketOpen) return;
    const ref = nextRef();
    topic.joinRef = ref;
    topic.joined = false;
    send({
      topic: topicPrefix + topic.name,
      event: 'phx_join',
      payload: {
        config: { broadcast: { ack: false, self: false }, presence: { key: '' }, private: true },
      },
      ref,
      join_ref: ref,
    });
    topic.timer = setTimeout(() => failTopic(topic), joinTimeoutMs);
  }

  /** The channel was refused, lost or not answered: say so and join again later. */
  function failTopic(topic: Topic): void {
    clearTopicTimer(topic);
    topic.joined = false;
    topic.joinRef = null;
    tell(topic, 'unavailable');
    topic.timer = setTimeout(() => join(topic), nextDelay(delays, topic.failures));
    topic.failures += 1;
  }

  function stopHeartbeat(): void {
    if (heartbeat !== undefined) clearInterval(heartbeat);
    heartbeat = undefined;
    heartbeatRef = null;
  }

  function connect(): void {
    reconnect = undefined;
    const current = openSocket(address);
    socket = current;
    current.addEventListener('open', () => {
      if (socket !== current) return;
      socketOpen = true;
      socketFailures = 0;
      heartbeat = setInterval(() => {
        // No answer to the last heartbeat: the connection is dead, though not closed.
        if (heartbeatRef !== null) {
          lost(current);
          current.close();
          return;
        }
        heartbeatRef = nextRef();
        send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: heartbeatRef });
      }, heartbeatMs);
      for (const topic of topics.values()) join(topic);
    });
    current.addEventListener('message', (event) => {
      if (socket === current) receive(parseJson((event as MessageEvent).data));
    });
    current.addEventListener('close', () => lost(current));
  }

  /** The connection closed or died: every channel is unavailable until it is back. */
  function lost(current: WebSocketLike): void {
    if (socket !== current) return;
    socket = undefined;
    socketOpen = false;
    stopHeartbeat();
    for (const topic of topics.values()) {
      clearTopicTimer(topic);
      topic.joined = false;
      topic.joinRef = null;
      tell(topic, 'unavailable');
    }
    if (topics.size > 0 && reconnect === undefined) {
      reconnect = setTimeout(connect, nextDelay(delays, socketFailures));
      socketFailures += 1;
    }
  }

  function receive(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const frame = data as Received;
    const payload =
      typeof frame.payload === 'object' && frame.payload !== null
        ? (frame.payload as Record<string, unknown>)
        : {};
    if (frame.topic === 'phoenix') {
      if (frame.event === 'phx_reply' && frame.ref === heartbeatRef) heartbeatRef = null;
      return;
    }
    if (typeof frame.topic !== 'string' || !frame.topic.startsWith(topicPrefix)) return;
    const topic = topics.get(frame.topic.slice(topicPrefix.length));
    if (topic === undefined) return;

    if (frame.event === 'phx_reply') {
      if (topic.joinRef === null || frame.ref !== topic.joinRef) return;
      if (payload.status === 'ok') {
        clearTopicTimer(topic);
        topic.joined = true;
        topic.failures = 0;
        tell(topic, 'open');
      } else {
        failTopic(topic);
      }
      return;
    }
    if (frame.event === 'phx_error' || frame.event === 'phx_close') {
      if (topic.joined || topic.joinRef !== null) failTopic(topic);
      return;
    }
    if (frame.event === 'broadcast' && topic.joined && payload.event === liveEventName) {
      for (const entry of [...topic.entries]) entry.message(payload.payload);
    }
  }

  function leave(topic: Topic): void {
    clearTopicTimer(topic);
    topics.delete(topic.name);
    if (topic.joinRef !== null) {
      send({
        topic: topicPrefix + topic.name,
        event: 'phx_leave',
        payload: {},
        ref: nextRef(),
        join_ref: topic.joinRef,
      });
    }
    if (topics.size > 0) return;
    // Nothing left to watch: close the connection and try nothing more.
    if (reconnect !== undefined) clearTimeout(reconnect);
    reconnect = undefined;
    stopHeartbeat();
    const current = socket;
    socket = undefined;
    socketOpen = false;
    current?.close();
  }

  const openChannel: ChannelOpener = (channel, events) => {
    const name = liveChannelName(channel);
    let topic = topics.get(name);
    if (topic === undefined) {
      topic = {
        name,
        entries: new Set(),
        joinRef: null,
        joined: false,
        failures: 0,
        timer: undefined,
      };
      topics.set(name, topic);
      topic.entries.add(events);
      events.connection('connecting');
      if (socket === undefined && reconnect === undefined) connect();
      else join(topic);
    } else {
      topic.entries.add(events);
      events.connection(topic.joined ? 'open' : 'connecting');
    }
    const mine = topic;
    return () => {
      mine.entries.delete(events);
      if (mine.entries.size === 0 && topics.get(name) === mine) leave(mine);
    };
  };

  return liveSubscriberFrom(openChannel);
}
