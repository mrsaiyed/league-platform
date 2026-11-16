# The look of the product

Who owns how the product looks, the standard it is held to, and how that is checked. Every run reads this before it opens, reviews or lands a step that adds or changes a screen.

## Why this file exists

The founder opened the product on 2026-11-14 and said: "wow. the UI is awful… the Al-Hadi page with the stats has a far better feel to it, as does Faraj League. Maybe we need to put a more capable model with a capable professional in charge of UI." They were right, and the cause was the way the build was set up, not one bad step:

- The look was left to one step at the very end of the public pages. Until then every page was built to work, by an ordinary builder, from a description in words.
- Nobody ever saw a screen. Builders and reviewers read code and ran text checks. A menu that is a bulleted list of blue links passes every one of those checks.
- The whole product had about 10 KB of styles. Faraj's public site has about 60 KB and the Al-Hadi tracker about 38 KB.
- The admin area had no look planned at all.

So three things change (decided by the lead, 2026-11-14): one owner for the look, on the strongest model; pictures of every screen that the owner and the reviewer must look at; and a design review before any screen lands.

## 1. Who owns the look

- **The design lead** is a builder on the strongest model there is (runbook, section 4: `fable`, high effort). It builds the design steps (2.85, 2.102, 2.103 and any later step whose job is the look). It owns `packages/ui`, `packages/site/src/design` and the web app's stylesheets. It works like a product designer who also writes the front end: it decides layout, spacing, type and color use, and it is expected to change a page's markup where the look needs it.
- **Every other builder** that adds or changes a screen uses the shared display pieces and the shared classes. It adds no color, no font size, no spacing value and no one-off style of its own. If a piece it needs does not exist, it builds the screen with the nearest piece and says so in its report; the design lead adds the piece.
- **The design reviewer** is a fresh sub-agent on the same strongest model that did not write the change. It looks at the pictures first and the code second (section 6).
- **The lead** looks at the home page of both made-up leagues, at both widths, before it tells the founder a design step is done.

## 2. Seeing it

```bash
node scripts/shots.mjs --dev
```

This starts the web app on its made-up stand-in, opens every screen in a real browser and saves a picture of each, whole, at two widths: 390 (a phone) and 1280 (a laptop). The pictures land in `.local/shots/390` and `.local/shots/1280`; open them with the Read tool. `--only=home,standings` takes only the pictures whose names contain those words. In a lane it shows that lane's work. Without `--dev` it builds first, which is what GitHub's machines would see.

Nobody writes a look, and nobody passes one, without having looked at the pictures. A report on a screen names the pictures it is based on.

## 3. The standard

The founder has named three things that feel right. None is copied, and no league is ever named in code (CLAUDE.md): what makes them good is turned into design values and shared pieces, so that any league's own colors drop into a finished layout.

**The founder's direction, 2026-11-14, after seeing three pictures of step 2.85** (C-16): "the 3 pictures were better but not great. the initial build we had for the alhadi demo looked better than this… for the ui we want to prioritize simplicity but not make it boring. different color pops or something. lets start with alhadi branding how we did for the initial demo with the maroon and white and their specific gold accent, see if we can build a page around that; then the idea is that the admin can switch those colors to whatever he wants. so better but still boring."

So the rule for every screen is **simple, not boring**: generous space and few elements on a page, and color where the eye should land. Flat single-color boxes with colored dots for teams are what the founder called boring.

### The first standard: the first Al-Hadi demo

It is in this repository: `examples/alhadi-school` (static, fictional data; `styles/public.css`, `styles/commissioner.css`, `src/views/public.js`, `src/views/commissioner.js`). Read it, never change it. Pictures of it are on this computer in `.local/reference/first-demo/` (`1280-home`, `1280-schedule`, `1280-standings`, `1280-teams`, `1280-stats`, `1280-admin`, `390-home`, `390-standings`, all `.jpg`); `shoot.mjs` beside them takes them again. **The design lead and the design reviewer open these pictures before anything else.** It is the standard for the first starting design (dark) and its light sibling, and for the staff area. What makes it work:

1. **Color with warmth.** A wine-black page (`#170e13`), panels one step lighter with a faint wine tint and a gradient (`#24171e`), cream text (`#f6f1e9`), the brand maroon (`#96062d`) for identity and the main button, a soft rose (`#b77d8c`) as the second color, and gold (`#d3b780`, lighter `#f3dfb7`) for the numbers and words the eye should land on. The staff side is the reverse: a white and cream workspace (`#fffefa`, `#eee7e8`) with a dark wine side menu.
2. **Display type with character.** A serif for every title, team name, score and big number; a plain sans for body text. Titles are short phrases with a full stop ("The standings.", "The next matchups", "Leading the way"), each under a small "kicker": a short rule and a tiny letter-spaced label.
3. **A hero.** A full-width band with a very large two-line serif title, the second line in gold, one sentence, a filled gold button and an outlined one. Under it a strip of four gold serif numbers with tiny labels.
4. **Team emblems.** Each team has a shield with its initial, drawn in the team's color. Dots are gone.
5. **Match cards laid out like a scoreboard.** Emblem and name on each side, and in the middle "VS" or the score in large gold serif figures ("51 : 45"); a quiet line above (week, state, time) and below (place, the way to the box score).
6. **Leader cards.** One very large gold number ("17.0 PPG"), the player's name in serif, team and games played, the team's emblem in the corner; the first card carries a wine gradient.
7. **A header with presence.** Emblem or logo, the name letter-spaced with a small line under it, the season picker as an outlined box, one call to action in gold with an arrow, and the menu as small widely spaced capitals with a gold underline on the current page.
8. **Small things.** Line icons, status pills in soft color (green "Paid", amber "Pending"), and a filled band near the foot with one call to action.
9. **The staff workspace** (`1280-admin.jpg`): a side menu with icons and the current item filled; a greeting title with one line under it and the main action at the top right; four number cards; a table with pills; a checklist; a progress line with steps. Calm, light, and clearly the same brand.

Three limits. **Nothing real is copied:** the demo's photographs show real students and its crest is the school's, so nothing from `examples/alhadi-school/assets` goes into the product or its made-up leagues; the hero must look finished with no photograph (a gradient and a pattern) and take a league's own picture later. **The colors are the admin's:** the maroon, white and gold are the first starting design's values, not the product's; an admin who changes the main color, the accent and the highlight gets the same quality in their own colors, and that is proved with pictures in at least three color sets, one of them light (section 4, line 28). **Figures:** the big display numbers (the number strip, a leader's number) may use the display face's own figures as the demo does; a score, and any number that is compared with another beside or beneath it, uses lining, even-width figures (line 6).

### The second standard: Faraj's public site

**Faraj's public site is the standard for the second dark starting design.** What makes it work:

- A near-black navy page with panels one step lighter. Borders are hairlines in the main color at about a fifth strength, not bright lines around every box.
- Gold is spent on names, numbers and the current tab. Teal is the quiet second color, used for small labels. Everything else is off-white and grey.
- Headings are in the display face, often small, uppercase and widely letter-spaced. Body text is light and calm.
- The header stays at the top as you scroll, in two rows: the league's name and the season picker, then the menu as uppercase tabs with a thin underline on the current page. On a phone the tabs become a menu that slides in.
- The home page opens with the league's name large and a season badge, then a strip of four big numbers, then sections. Each section has a title with a short rule under it.
- Teams are cards with a round emblem. Leaders are three cards with one big number each. The schedule is grouped under round headings, with the current round picked out.

### The third standard: the Al-Hadi tracker's public pages

**The Al-Hadi tracker's public pages are the standard for the plain light starting design.** Their styles are in this repository (`apps/live-stats/public/css/site.css`; read it, never change it):

- A quiet paper background, white panels, and one strong bar of the league's color across the top that holds the logo, the name and the menu as rounded links, the current one filled.
- The content is held to about 1080 wide and centered. It never runs edge to edge on a laptop.
- Plain system type at 16 with comfortable line height. A strong focus ring. Live is red, a win is green, a loss is brown-red, and those colors mean nothing else.
- Everything you can tap is at least 44 high.

## 4. What "finished" means

A screen is finished when every line below is true for it, at 390 and at 1280, for both starting designs. The design lead answers the list line by line in its report; the design reviewer checks it against the pictures.

**Layout**

1. Content sits in a centered column no wider than about 1120. Side padding is 16 on a phone and 24 to 32 above. Text and cards never stretch across a whole laptop screen.
2. All spacing comes from one scale (4, 8, 12, 16, 24, 32, 48, 64), worked out from the design's `--space`. No other gaps.
3. On a laptop the home page uses the width: results and upcoming games in a grid of two or three cards across, the standings beside them or beneath in their own panel. One long column of full-width boxes is not a layout.
4. Nothing scrolls sideways at 320 wide except a table inside its own box.

**Type**

5. One scale of sizes (12, 14, 16, 18, 22, 28, 36) and nothing between, with three display sizes above it (48, 64, 88) kept for a hero's title, a big number and a score that is picked out. One page title per page, 28 to 36, or a hero's title in a display size (one step smaller where a line of it is long, down to 22 on the narrowest phone). Section titles 18 to 22 with a short rule in the main color; or, under a kicker (a short rule and a tiny letter-spaced label), 22 to 28 with no rule of their own. Small labels are 12 to 13, uppercase, letter-spaced.
6. Numbers line up (tabular figures). A score is the largest thing in its card.

**No browser defaults, anywhere**

7. No bullets beside menus or lists of cards. No default buttons, inputs, selects, tables or link styles. If a screen shows a grey system button or a blue underlined menu, it is not finished.

**The header and menu**

8. The header stays at the top. On a phone it is one row, and that row stays on top: the league's mark, its name, and the menu button (which shows a cross while the menu is open). From a tablet up it is two rows: the mark, the name, the season picker and sign-in; then the menu as tabs. Nothing is written under the name: a fixed phrase there said the same of every league (the lead, 2026-11-15), and a league's own line waits for a setting of its own. Only the menu's row stays on top while the page scrolls; the first row goes with the page and comes back whenever the keyboard is in the header. The current page is marked (`aria-current`): by a line under it in a design with square or soft corners and in every dark design, by a filled pill in a light design with round corners. A long name never touches its row's edges: on a phone it takes two lines and is cut short after that, and the row grows by what the second line needs, with 8 clear above the name.
9. Below 768 wide the menu is behind one menu button and opens as a panel. It works with scripts switched off.

**Games**

10. A game is a scoreboard card (line 27). A quiet top line says which game and when, with the state as a small pill (Final, Live, Postponed, Forfeit; or a quiet "Awaiting result" on a game whose start has passed with no result, which is never listed among the games to come). Then an emblem and a name on each side, away team first, and between them the score in large lining, even-width figures, or "VS" while there is no score. Then a quiet line beneath for the place. Once a game is decided only the winner's score keeps the color the eye lands on, and the winner is marked by more than color: its name and its score are heavier, a bar stands under its score, and "winner" is said to screen readers. Where two names cannot sit side by side (a card too narrow for any two names, or a long name in a narrow card) the board is two rows instead, one for each team: its emblem and its name at the start of the row and its own score at the end, so nobody has to work out whose number is whose, and nothing stands between the rows (a game with no score yet is just the two rows). Both rows start at the emblem, and a name that wraps there is set from the start, like the name in the other row. A name breaks only between its words: a short word never breaks, and a word too long even for a row of its own is cut short with "…", never split. The top line never breaks inside the date and time: when it cannot hold them and the state's pill, the pill takes a line of its own. In a list, boards are one across on a phone and two across where the list has the page's width, and a board left over takes the whole row. On a laptop an odd list ends with three boards in a row, and a board that is a list by itself keeps its two teams within reach of each other in the middle of its card: a board is never stretched across the page. Every board of a list reckons with the list's longest name and score, so a list is one shape, all side by side or all two rows. In a card as narrow as a phone's the state's pill always has a line of its own. Boards that stand side by side share the height of their top line, of their middle and of their foot, so a board whose pill has dropped under its date, or whose name runs to two lines, never stands lower than the board beside it. The home page, the schedule and a team's page draw their games this way; the compact card of step 2.85 (each team on its own row) is kept as a piece and used by no public page.
11. The whole card is one link to the game, in every state. There is no separate "View box score" line and no team names repeated under it: the words the link says (who plays, the state, the score) are kept for screen readers and not drawn.
12. A live game is shown first on the home page, under its own heading, with the Live pill in the highlight color.

**Tables**

13. Column headings are small uppercase labels. Rows are separated by hairlines at low strength and light up on hover. Number columns are right-aligned and only as wide as they need; the team column takes the spare width, so a table is not six numbers scattered across a wide page.
14. A team has its mark beside its name: its small shield (the emblem) in the standings and the statistics tables, and its large one on a game's big board. A play in a game's play-by-play still carries a small chip of its team's color, because a play is given its team's color and not its name; it gets the shield in a later step. A long name wraps inside its column, and the small number that points at a note stands after its last word. On a phone the table scrolls inside its box, and the team column, its heading and the table's name stay put. While there are more columns out of sight, the far edge of the box says so: the last column in view fades and a small arrow points on.

**Filters**

15. Season, round, team and "per game or totals" sit in one compact toolbar. With scripts on, choosing a value applies it; the "Show" button is only for when scripts are off, and is quiet.

**Color**

16. Most of a screen is the background, the panel and the text color. One color is the one the eye lands on. It is worked out from the league's own three: the main color where that reads as text on the page and on a panel; otherwise the highlight; otherwise the accent. It is worked out the same way for a band and for the header, against their own grounds. It is spent only on: a hero's second line; a big number (the number strip, a leader's number, a team's place); a score (both scores while a game is live, only the winner's once it is decided); the current tab; the way on beside a title and the short rule under a plain one; the Live pill, which is always the highlight itself; and the one filled button on a band. Never on body text, a whole card, or two buttons in one view. The main color is identity: the header's bar in a light design, the bands, the fill of a mark. The accent is for kickers and small labels. The same color the band's eye lands on (a league's gold) is also drawn, as the league gave it, on a few small marks that need not be read: the short rule of a kicker, the bar under the winner's score, and the fine lines of line 17. A picker's chosen value is in the text color, a little heavier, never the color the eye lands on.
17. Lines are the text or main color at 12 to 25 percent strength (`color-mix`). A line that edges a band may be the color the eye lands on, up to about a third. The fine lines that frame the number strip and stand at the top of a scoreboard card or of the home page's standings are in the league's color of decoration (line 16), laid on the page only as strongly as it takes to be seen and never less than about a third. The one card picked out in a view (the game being played now), or a card under the pointer, has its outline in the color the eye lands on, up to about half. The outline of a control is about 40 percent. Never more than one picked-out card in a view, and never a full-strength accent line around every box.

**Empty, loading and refused**

18. An empty screen is a calm panel that says in one sentence what will appear here and, where there is one, what to do next. Never a bare "Nothing here yet."
19. "Not built yet", "You do not have access" and "not found" pages are finished pages too: centered, titled, with one clear way on.

**The admin area**

20. Its own frame: on a laptop a side menu with the current page marked and "View the site" apart at the bottom; on a phone one menu button. Never a bulleted list of links above the page.
21. Each admin page has a title, one line saying what it is for, and its main action at the top right.
22. Forms are panels: label above its field, fields 44 high, help text quiet beneath, errors in words beside the field. The main button is filled with the main color, the second is outlined, and a destructive one looks different from both.
23. The admin area stays calm under any league's colors: neutral panels, the league's main color only as an accent.

**Sign-in, account and SR Leagues' own pages**

24. A centered card about 420 wide with a clear title, labeled fields and one main button. These pages carry SR Leagues' own neutral look, not a league's.

**Unchanged rules that still hold**

25. Every color, font, corner and space comes from the design's variables (T-90). Text comes from message files (T-187). Logical properties only, so right-to-left pages mirror (T-188). Contrast meets AA (checked on save). Focus is always visible. Everything works at phone width (A-2) and with scripts off wherever it did before.
26. The starting designs look clearly different from each other, and each looks finished.

**Simple, not boring (the founder, 2026-11-14; C-16)**

27. A page has few elements and generous space, and color where the eye should land: the hero's second line, the big numbers, a score, the current tab, the one button that matters. A team is shown by its emblem (a shield with its initial in the team's color, or the team's own logo), never by a colored dot. A game is a scoreboard: emblem and name on each side, the score or "VS" large in the middle. A page of flat single-color boxes is not finished. The reviewer puts each picture beside the matching picture of the first demo (section 3) and says in words whether a person would call it at least as good.
28. Every shared piece takes its colors from the design's variables, and that is proved, not assumed: the pictures look finished in at least three different color sets, one of them light (the first starting design, its light sibling, and one color set that is neither, such as a green or a blue league).

**The staff area follows the first demo's workspace** (`.local/reference/first-demo/1280-admin.jpg`): lines 20 to 23 are read against that picture, with the side menu in a dark shade of the league's main color, icons beside its items and the current one filled; a title that greets, one line under it and the main action at the top right; number cards; tables with soft-colored pills; a checklist and a progress line where a job has steps.

## 5. How a design step is built

1. Take the pictures before changing anything, and look at them.
2. Foundations first (the scales, the page frame, the header and menu), then the shared pieces (game card, tables, pills, buttons, fields, toolbar, empty panel), then each page.
3. After each round, take the pictures again and look at them. Expect at least three rounds. Compare the dark design with section 3's first list and the light one with its second.
4. Change a page's markup where the look needs it. Keep what the page does and what its tests check: a test that finds an element by its text or role may be pointed at the new element, and no check is removed or loosened.
5. Commit each part that works by itself.
6. The report answers section 4 line by line for both designs, names the before and after pictures, and lists what is not finished.

## 6. How every screen is reviewed

For a design step, and for any other step that adds or changes a screen, before it lands:

1. In the lane, run `node scripts/shots.mjs --dev --only=<the screens the step touched>`.
2. A fresh sub-agent on the strongest model reads those pictures at both widths against section 4, without the builder's reasoning, and lists every line a screen breaks, with the picture's name.
3. The builder fixes what was found and the pictures are taken again. The step lands when the list is empty, or when what is left is written into a design step that is still open.

This is on top of the code review, not instead of it.

## 7. The scoring screen: the courtside look

For a scorekeeper at a noisy table, glancing down between plays, in a bright gym, on a phone or a tablet that may be five years old. This section is what step 2.35 (the frame), 2.36 (the clock), 2.37 (plays, undo, end) and 2.38 (offline) are built and reviewed against, with the checklist in [the audit of scoring a game live](audits/live-scoring.md). Decided by the lead on 2026-11-15 (T-267, record 064; audit finding M10: nobody had decided how the new tracker looks).

**The standards, in this order.** The Al-Hadi tracker in this repository (`apps/live-stats/public/css/track.css` and `track.js`; read them, never change them): it is used for real games and the founder holds it up. Then the first demo's scoring view (`examples/alhadi-school/src/views/commissioner.js`, the "scoring" page, and `.scorer-*` in `styles/commissioner.css`), for what makes the job plainer: the title "Keep your eyes on the game.", the three-part scoreboard (team, clock, team), a player row that says "On court" or "Bench", and three large point buttons. Neither is copied; the design lead takes what works and says in its report what it took.

1. **One look for every league.** The scoring screen is the product's own, as the sign-in pages are (line 24): it does not take a league's design values, fonts or corners. A league's pale panel color, or two teams in two shades of blue, must never make a score hard to read at arm's length. The league appears as words only: its name in the title, the teams' names, the game's day and time.
2. **Dark, with one meaning for each color.** A near-black page that belongs to no league (start from the standard's `#140c10` page, `#21131a` panel and `#2d1a23` tile and take the wine out of them: neutral, slightly warm), off-white text, a muted grey for second-rank words. Then four colors that each mean one thing and nothing else: **gold** for labels, the clock and what is picked now (the ring round a tapped player or a picked starter, the one filled button that takes the next step, such as "Start with 3"); **green** for points and Start; **red** for fouls, Pause and anything that takes away; **blue** for timeouts. A fifth, amber, is the saved banner when plays are waiting. They live as variables in the tracker's own stylesheet under one prefix (`--court-…`), never as the league's `--color-…` variables, so nothing a league saves can reach them.
3. **Contrast is higher here than anywhere else.** The score, the clock, a player's number, the saved banner and the mark a tile shows of a tap ("+2", "Foul": read at a glance, for two thirds of a second) are at least 7 to 1 against what they sit on; everything else at least 4.5 to 1. That mark is hollow until the tap is stored and solid after, and is taken off at once when the tap is refused: it never reads as a recorded play for a tap that was not taken (step 2.35). A color never carries a meaning alone: Start and Pause differ in word and shape, a fouled-out player has a mark and a word, a play that is not saved is dimmed and says so.
4. **Two teams that cannot be mistaken.** Home is drawn light and away dark, on the scoreboard and around each team's panel (checklist D3); "Swap colors" swaps them and is saved with the game. Light is a pale ground with dark figures, like a white jersey; dark is the tile's own ground with pale figures and an edge that shows. The difference is light against dark, never a hue, so it holds for every eye (step 2.35). A team's own color is not used for this: it may show as a small mark beside the team's name, and only where it can be told from the other team's and from the page.
5. **The scoreboard never leaves.** Team, score, clock, period and the saved banner stay at the top at every size, and take no more than about a fifth of an upright phone. On an upright phone (390 × 844) a basket, a foul or a substitution for either team's floor players is recorded without scrolling (checklist S6, finding H4); this is the rule the standard itself does not meet, and the reason it is not copied.
6. **Big, and nothing else.** Everything tapped during play is at least 44 × 44, with at least 8 between targets; the point buttons and a floor player's tile are larger (56 or more on the short side). The standard's small targets (its 80 × 30 clock, its 27-high chips, its 30-high header buttons lying down) are not copied (finding L3). A jersey number is the largest thing on a tile; the score is the largest thing on the screen after the clock.
7. **Type for a glance.** One plain sans face that the device already has (no font is downloaded for this screen: it must open with no signal), numbers with even widths so nothing shifts as they change, no serif, no letter-spaced small capitals except labels. Three sizes do most of the work: the score and clock, a tile's number, and everything else.
8. **Four sizes, one arrangement each, and the phone as it is really held.** 390 × 844 (a phone upright), 844 × 390 (a phone lying down), 820 × 1180 and 1180 × 820 (a tablet both ways). A phone's size is the height its browser really shows, not its glass: a 390 × 844 phone shows about **390 × 664** with the browser's bars up, and they never tuck away on a page that does not scroll. That is the fifth size, and line 5 holds there too: both fives whole and the pad on the screen, a basket, a foul or a substitution for either team with nothing scrolling. Below about 760 high the two bench strips fold away; the bench is then one tap away in the pad ("Bench 7" beside the team's name), and "Sub in" on the player coming off needs no bench at all. No bench player is ever hidden without a sign and no number is ever cut: a line of bench players shows as many as fit whole and, when there are more, ends in a tile that says how many in words ("5 more": never "+5", since "+" on this screen means points and the tile sits beside the points buttons) and opens them all in the pad; nothing scrolls sideways, and on a phone lying down the bench is two rows at most, so no row is cut and a team's panel never scrolls (step 2.35, area 4 review and its second look). Two teams side by side from about 880 wide and on a phone lying down; stacked below that (checklist S2). A tapped player's options never open over the tiles: they are in **the pad**, one panel whose place and height do not change during play, so the second tap is always in the same spot and no tile moves. The pad is at the bottom on an upright phone (by the thumbs) and between the two teams at the other three sizes. At rest it holds the hint, the latest sentence the screen said and, from step 2.36, the Start clock button; a team's turnovers and timeouts open in it too (step 2.35). The pictures of a design review are taken at all five, with a game in play, not an empty one, and with fifteen a side as well as twelve (`node scripts/tracker-shots.mjs`, into `.local/shots/court`).
9. **Calm under the hand.** Nothing on the screen can be selected by a long press and a double tap does not zoom (checklist S1). A tap answers at once: the tile or button shows it was taken within a tenth of a second, before anything is saved (finding M6). Movement is short and stops for people who ask their device for less (S5). No shadow, gradient or picture: flat panels with fine lines, so a slow tablet keeps up.
10. **It says what happened in words.** Every refusal is a sentence from the message files. The saved banner always tells the truth: "All saved", how many plays are waiting, or that there is no connection; never a spinner alone.
11. **Its frame is its own.** No public header, menu or footer: the title says the two teams, the day and the time; one way out ("Back to the games"), which asks first while plays are waiting; the account button of step 2.127 so a shared tablet can be signed out.

**What "finished" means for a scoring screen:** lines 1 to 11 above, the audit's checklist lines its step names, line 25 of section 4 where it applies (text from message files, logical properties, visible focus, usable by keyboard), and the area lead for live scoring has worked a game night on it. Lines 1 to 24 and 26 to 28 of section 4 are for a league's pages and do not apply here. The design reviewer reads the pictures at the four sizes beside the Al-Hadi tracker's own screen at the same sizes and says in words whether a scorekeeper would find the new one at least as easy.
