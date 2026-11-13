# 017 — The league of an endpoint, and the one proper spelling of an address

Date: 2026-11-13. Step 1.16 review; carries out T-26 and T-34; decides T-229. Decided by the lead (technical).

## What

- **Endpoints name their league by its id.** Every JSON endpoint that is about one league (T-26) sits under `/api/v1/leagues/{leagueId}/...`, the id a UUID in lower case: the tracker posts to `/api/v1/leagues/{leagueId}/games/{game}/commands` (T6 §3). `leagueApiUrl(league, ['games', game, 'commands'])` in the leagues module builds these addresses; nothing writes them by hand.
- **`server/context.ts` still works out every league.** For `/api/v1/leagues/{leagueId}/...` it checks the id's form and reads the league in a transaction for that league (the database's `findCurrentLeague`, which finds nothing in the bin), then hands the handler the same league context a page gets. An id spelled any other way (capitals, percent-encoding) or naming no league is "not found". Any other `/api/...` address (webhooks, the account's own endpoints) gets a platform context with no league; a handler there that needs one has to be moved under `/api/v1/leagues/{leagueId}`.
- **One proper spelling for every page.** A league's page is served only at its short name exactly as stored. Other capitals, `%2D` for `-` or any other encoding of the name forwards permanently to the proper address, as a former name does (U-7). Our own pages (`/account`, `/signin`, `/api`) forward the same way when spelled otherwise (refusal `forward`).
- **A forward carries the league's id and state.** So step 1.17 can apply U-9 before it forwards: a draft or suspended league's forward is given only to those who may see that league, and everyone else gets "not found", so the forward does not show that the league exists.
- **Our own words, not the blocked list, say "one of our pages".** The short names nobody may take are two lists: our own words and offensive words. Only our own words route to our pages; an offensive word simply finds no league.
- **A bad short name in the database is "not found", never a crash.** If the stored name would not pass the address builder's check, the request is refused as not found.
- **The request id is made by the server** (`newRequestId`), never taken from a header the browser sent.

## Considered

- **Endpoints under the league's short name** (`/{league}/api/...`). One rule for pages and endpoints, but a renamed league would break a tracker's queued commands, and endpoints would share a namespace with custom pages.
- **The league in the request body or a header.** Simple for the tracker, but the league would come from what the browser sends, which fence 1 (T4 §2) rules out.
- **No league in the endpoint address, read from the game** (`/api/v1/games/{game}`). Needs a lookup across leagues before the league is known, another T-221 function, for every call; and every handler would repeat it.

## Revisit if

- Leagues move to their own subdomains (U-13) or domains (U-2): the endpoints can stay on our main host by id, or move with the league; either changes only `context.ts` and `league-url.ts`.
