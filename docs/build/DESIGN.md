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

5. One scale of sizes (12, 14, 16, 18, 22, 28, 36) and nothing between. One page title per page, 28 to 36. Section titles 18 to 22 with a short rule in the main color. Small labels are 12 to 13, uppercase, letter-spaced.
6. Numbers line up (tabular figures). A score is the largest thing in its card.

**No browser defaults, anywhere**

7. No bullets beside menus or lists of cards. No default buttons, inputs, selects, tables or link styles. If a screen shows a grey system button or a blue underlined menu, it is not finished.

**The header and menu**

8. The header stays at the top. The league's name (and logo when it has one) on the first row with the season picker and sign-in; the menu on the second row as tabs. The current page is marked (`aria-current`): an underline in the dark design, a filled pill in the light one.
9. Below 768 wide the menu is behind one menu button and opens as a panel. It works with scripts switched off.

**Games**

10. A game is a compact card: a quiet top line (date, time, place) with the state as a small pill (Final, Live, Postponed, Forfeit); then each team on its own row, color chip and name on the left, score on the right in large figures. The winner is bold and its score takes the highlight. No "vs" floating in the middle of an empty row.
11. The whole card is one link to the game. There is no separate "View box score" line, and no repeated team names shown under it (text for screen readers stays, hidden).
12. A live game is shown first on the home page, under its own heading, with the Live pill in the highlight color.

**Tables**

13. Column headings are small uppercase labels. Rows are separated by hairlines at low strength and light up on hover. Number columns are right-aligned and only as wide as they need; the team column takes the spare width, so a table is not six numbers scattered across a wide page.
14. A team has its color chip beside its name. On a phone the table scrolls inside its box and the team column stays put.

**Filters**

15. Season, round, team and "per game or totals" sit in one compact toolbar. With scripts on, choosing a value applies it; the "Show" button is only for when scripts are off, and is quiet.

**Color**

16. Most of a screen is the background, the panel and the text color. The main color is for identity: the name, the current tab, section rules, the main button. The accent is for small labels and second-rank marks. The highlight is only for Live, the winner's score and the chosen item (C-15).
17. Borders are the text or main color at 12 to 25 percent strength (`color-mix`). A full-strength accent line around every box is not allowed.

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
