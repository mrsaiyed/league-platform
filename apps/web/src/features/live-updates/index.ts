// Live updates, the browser's side (T6 §6): what a page uses to subscribe to a
// game's channel or its league's live scores. Subscribing only; publishing is the
// server's alone (T-120).
export {
  readGameMessage,
  readLeagueScore,
  type LiveConnection,
  type LiveHandlers,
  type LiveSubscriber,
  type LiveSubscription,
} from './live-subscriber.ts';
export {
  serverSentEventsSubscriber,
  type EventSourceLike,
  type ServerSentEventsSubscriberOptions,
} from './server-sent-events-subscriber.ts';
export {
  supabaseRealtimeSubscriber,
  type SupabaseRealtimeSubscriberOptions,
  type WebSocketLike,
} from './supabase-realtime-subscriber.ts';
