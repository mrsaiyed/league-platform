# 021 — Where the browser half of live updates lives, and what Realtime still needs

Date: 2026-11-13. Step 2.31; carries out T-8, T-14, T-117 to T-120; decides T-233. Decided by the lead (technical).

## What

- **Two halves in two places.** The server half (publish a game's message, publish a league's score; the local stand-in hub; the Supabase Realtime publisher) is in `packages/providers/src/live-updates/`, behind `LivePublisher`, as every outside service is (T-14). The browser half (subscribe to a game or a league's live scores; the server-sent events subscriber for the stand-in and the Supabase Realtime subscriber) is in `apps/web/src/features/live-updates/`. `packages/providers` is server-only: it holds secrets and reads settings, and the structure check fails any browser file that imports it (T-30). Putting the subscribers there would either break that rule or need a browser-safe corner of a server-only package; keeping them in the web app means no page can even load a publisher (T-120), which a test proves.
- **What both halves share is in `packages/contracts`:** the channel names (`gameChannelName`, `leagueScoresChannelName`, `parseLiveChannelName`), the event name, and the shapes `LiveMessage` and `LeagueScoreMessage`. The server and the browser build names with the same helpers, so they always agree. Every name starts with the league, and IDs are written in lower case, in the name and in the message.
- **The subscribers speak the services directly,** with no vendor library: Realtime's own message format (Phoenix channels 1.0.0) over a WebSocket, and the browser's EventSource. Each sends only "join", "leave" and the heartbeat; nothing that could publish.
- **Behaviour on trouble.** Waits before trying again are spread at random between half and all of each delay, so pages that lost the same connection do not all return at once. A failure count is forgotten only after the connection or channel stayed up 30 seconds. An explicit refusal (Realtime refusing a join; for the stand-in any answer that is not a 200 event stream: 400, 403, 405, 503) waits on slower delays: 30 seconds, 1, 2, then 5 minutes. An ID that is not an ID, a channel past the page's limit (50 for Realtime), or a browser that will not open the connection gives the page `unavailable`, never an exception; the page then polls the snapshot (T-119), and the last case keeps retrying.
- **The stand-in hub's limits.** At most 1,000 streams per channel and 5,000 in all, answered 503 past that; a page that stops reading is cut off after 500 waiting messages, keep-alives included.
- **Who may listen (U-9).** The hub's `serve` takes an optional `authorize(channel, request)` and allows everything without one, which is right only for tests. The web route that mounts it must pass one that refuses a league that is not published, or not visible to this viewer, exactly as the league's pages would. The hub knows channel names, not leagues.
- **What callers must do** (written on `LivePublisher`): take `leagueId` from the saved game or the server's own context, never from a request; pass `latestPlay` through the one names-and-statistics function at the strictest setting any viewer has before publishing (T-81, T-87, S-22), since the message is the same for everyone; await each publish of one game before the next, so messages arrive in order.

## Must-dos for the Realtime policies, when the real project exists

Private channels are only as safe as the project's policies on `realtime.messages`, and none exist yet. When the founder's Supabase project for the platform is set up (stage 2, "Vendor accounts for a real demo"), the migration that creates them must:

1. Let a browser **receive** (select) only on topics `league:<id>:…` whose league is published and visible to that viewer (U-9), checked with the same rule as the league's pages.
2. **Refuse every browser broadcast** (insert): no policy allows it for `anon` or `authenticated`. Only the server, with the secret key, publishes (T-120).
3. Turn off **"Allow public access"** in the project's Realtime settings, so no channel can be joined without the private flag.

A test against the real project then checks that a browser can join a visible league's channel, cannot join a hidden one, and cannot broadcast on either. Until then both Realtime adapters stay marked "not verified".

## Left to later steps

- **The web route that mounts `hub.serve`,** with its `authorize`, is step 2.32's or 2.45's, whichever first needs a page to listen locally.
- **One hub per server process.** The stand-in is in-process: the web app must create it once and share it between the route that serves pages and the code that publishes. Where that single copy is kept is decided with the same route (2.32 or 2.45).

## Considered

- **Subscribers in `packages/providers`, in a browser-only entry.** One package per outside service is tidy, but the T-30 check works per package; an exception for one folder is easy to get wrong later.
- **Subscribers in `packages/contracts`.** Contracts holds shapes, not network code.
- **Supabase's own client library.** Larger, and it can also send broadcasts; speaking the protocol directly keeps the browser to join, leave and heartbeat.

## Revisit if

- The live service behaves differently from the recorded messages (join replies, refusal reasons, heartbeat answers).
- A second app (the worker, a mobile app) needs to subscribe: then the browser half moves to its own shared package.
