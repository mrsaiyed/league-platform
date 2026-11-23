# 085 — The numbers a page keeps from the public, for the people allowed more

Date: 2026-11-17. Step 2.46 (T-287). Serves S-22, T-87, T-95, T-75, T-74, T4 §7, T5 §4.

**Not verified against a real PostgreSQL server or Supabase.** Everything below runs on the made-up stand-in and the made-up database (PGlite) only.

## Problem

A team may keep its players' numbers from the public (S-22, "only the team's staff and the league's admins"). Until this step nobody saw them on the website at all: every public page and every live message is read as the public viewer (T-87), so it is the same for everyone and can one day be kept by a shared cache (T5 §4, T-95). The team's coach and the league's admins need to see them, and the players whose numbers the league chose not to publish need them never to reach anyone else: not in the page, not in its data, not in an address, a log line or a live message, and not on a shared device after sign-out.

## What

- **The page does not change.** The statistics page, a team's page and a game's page are read as the public viewer, as before. Where a page already says that a team's players are not shown (the "only team totals" note, a team page's totals-only line, a box score's "players not public"), and only there, it carries one address to ask after it has arrived. A page with nothing kept back never asks. The address names only what the page shows: `?page=stats&season=…&by=…`, `?page=team&season=…&team=…` or `?page=game&game=…`.
- **One signed-in read**, `GET /api/v1/leagues/{leagueId}/staff-numbers` (`apps/web/src/server/staff-numbers-endpoint.ts`). The league comes from the address and the account from the server's session, through `leagueEndpoint` as for every league endpoint; a session that no longer works is a visitor. A league the person may not see is "not found", the snapshot's own answer (U-9).
- **Who is allowed more** is core's `signedInViewer` (`packages/core/src/modules/people/rules/viewer.ts`), from what the account holds in the league, read fresh on that request (T-75): the owner and admins of the whole league are its admins; a coach or captain role on a team makes that team's staff. A coach or captain role at any other scope, an admin limited to one program, and every other role see what the public sees (fail closed: which program a team is in is not read).
- **Whether there is more** is core's `readTeamsBeyondPublic` (standings): the season's teams this viewer sees and the public does not. The answer is given only for a team with a player line to show (or, on a game, a named play): the statistics page and the team page are read again as this viewer (`loadStatsPage`, `loadTeamStats` with a viewer), the game page twice, as the public and as this viewer, in one snapshot.
- **One answer for "nothing more"**: `{"more":null}`, status 200, for a visitor, a member with no role, another team's coach, another league's admin, a role taken back, a page with nothing kept back, a question that cannot be read or names nothing there, and a read that fails. So the answer never says that numbers are being kept from someone. Every answer is `Cache-Control: private, no-store`; nothing in it is logged.
- **The answer is drawn by the page's own pieces.** The statistics tables, a team's numbers and a game's box scores and plays are each split into a view of words worked out on the server (`stats-tables-view.ts`, `team-stats-view.ts`, `game-numbers-view.ts`) and a drawing component with no words and no reads (`…-drawn.tsx`). The page draws the public viewer's view; the answer carries the allowed person's view and a note ("Not public: shown to you as staff", naming the teams), every word from the message files on the server (T-187). The device puts them in place of the public's (`features/staff-numbers`, one swap per page).
- **Shown again, asked again.** The device asks when the page arrives, when its tab comes back into view (a sign-out or an ended session in another tab is seen then) and when Back or Forward brings the page out of the browser's memory; before the browser keeps a page it is leaving, the numbers are taken off it. A game's numbers are asked again when the page is drawn again as the game starts or ends (record 051). A read that fails leaves the public numbers.
- **The live part is unchanged.** The live messages and the scoreboard's players stay the public's (T-87, T-120); a staff-only team's numbers are shown to its staff in the box score and the plays, read when the page arrives and again with "Show newer plays".

## Considered

- **A server action returning the drawn tables.** It would have reused the server components as they were, with no split into words and drawing. Refused: it is a POST that Next.js runs one at a time for a page, its league would come from an argument the browser sends rather than from the address checked in one place (`context.ts`, T-229), its answer headers are the framework's to choose, and every other read after a page (the snapshot, "Score this game") is a league endpoint.
- **Only the extra lines, added under the public tables.** Less to send, but the leaders and a player of a shown and a hidden team would stay wrong for the person allowed to see them, and a second table of the same players reads as a mistake.
- **Telling a person not allowed that numbers exist ("You may not see these").** Refused: S-22's choice is the team's, and the read must not tell anyone what is kept from them.
- **Asking on every page.** Every visitor's page would cost a request; asking only where the page already says something is kept back costs nothing elsewhere and says nothing new.

## Would make us revisit

- The two middle levels of S-22 (signed-in members, a team's own players and parents, stage 4): `signedInViewer` gains them from the account's roster and profile links, and the role tests their rows.
- A roster place as coach or captain linked to an account, with no role: today it makes no one staff (only a role does); if it should, `signedInViewer` reads the account's roster places too.
- An admin limited to one program: seeing that program's teams needs the team's program on the read.
- The league home's leaders: drawn for the public only; a staff view of them would be a fourth page here.
- A shared cache in front of the pages (T5 §4): nothing here changes; this read is private and never cached.
