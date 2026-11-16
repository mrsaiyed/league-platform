# The founder's design direction, 2026-11-14 (about 17:50 UTC)

From the chat lead to the build lead. This changes the standard for the look. You are the only writer of the plans and of `docs/build`: write this in yourself (DESIGN.md, the plan, DECISIONS.md, the log), with the next free step number. The same text was sent to your session as a message; act on it once.

## The founder's words

After seeing three pictures of step 2.85 (both home pages and the standings):

"the 3 pictures were better but not great. the initial build we had for the alhadi demo looked better than this… for the ui we want to prioritize simplicity but not make it boring. different color pops or something. lets start with alhadi branding how we did for the initial demo with the maroon and white and their specific gold accent, see if we can build a page around that; then the idea is that the admin can switch those colors to whatever he wants. so better but still boring."

They are stepping away and expect a dev product soon.

## What the first demo is

It is in this repository: `examples/alhadi-school` (static, fictional data; `styles/public.css`, `styles/commissioner.css`, `src/views/public.js`, `src/views/commissioner.js`). Read it, never change it. Pictures of it, taken today, are in `C:\Old PC Transfer\Projects-Final\league-platform\.local\reference\first-demo\`: `1280-home`, `1280-schedule`, `1280-standings`, `1280-teams`, `1280-stats`, `1280-admin`, `390-home` and `390-standings` (.jpg), with `shoot.mjs`, the script that took them. The design lead and the design reviewer open these pictures before anything else.

## Why it feels better than 2.85

2.85 is clean and correct but generic: flat navy boxes, coloured dots for teams, small type, no character. The demo has:

1. **Colour with warmth.** A wine-black page (`#170e13`), panels one step lighter with a faint wine tint and gradient (`#24171e`), cream text (`#f6f1e9`), the brand maroon (`#96062d`) for identity and the main button, a soft rose (`#b77d8c`) as the second colour, and gold (`#d3b780`, lighter `#f3dfb7`) for the numbers and words the eye should land on. The staff side is the reverse: a white and cream workspace (`#fffefa`, `#eee7e8`) with a dark wine side menu.
2. **Display type with character.** A serif (Georgia) for every title, team name, score and big number, with old-style figures; a plain sans for body text. Titles are short phrases with a full stop ("The standings.", "The next matchups", "Leading the way"), each under a small kicker: a short rule and a tiny letter-spaced label.
3. **A hero.** A full-width band with a very large two-line serif title, the second line in gold, one sentence, a filled gold button and an outlined one. Under it a strip of four gold serif numbers with tiny labels.
4. **Team emblems.** Each team has a shield with its initial, drawn in the team's colour. Dots are gone.
5. **Match cards laid out like a scoreboard.** Emblem and name on each side, and in the middle "VS" or the score in large gold serif figures ("51 : 45"); a quiet line above (week, state, time) and below (place, "View box score").
6. **Leader cards.** One very large gold number ("17.0 PPG"), the player's name in serif, team and games played, the team's emblem in the corner; the first card carries a wine gradient.
7. **A header with presence.** Emblem or logo, the name letter-spaced with a small line under it, the season picker as an outlined box, one call to action in gold with an arrow, and the menu as small widely spaced capitals with a gold underline on the current page.
8. **Small touches.** Line icons, status pills in soft colour (green "Paid", amber "Pending"), a filled band near the foot with one call to action.
9. **The staff workspace** (`1280-admin.jpg`). A side menu with icons and the current item filled; a greeting title with one line under it and the main action at the top right; four number cards; a table with pills; a checklist; a progress line with steps. Calm, light, and clearly the same brand.

## What to do

A. **Land 2.85 as it is**, as already ordered: its structure (frame, grid, tables, phone menu) is right and other screen steps wait on it.

B. **Straight after it, ahead of 2.102 and 2.103, open a new design step** (you number it): "The first starting design, built from the first Al-Hadi demo". Built by the design lead on `fable`, with the pictures above. In it:

- A new starting design stored as data, with a neutral name (no league is ever named in code): the demo's colours above, serif titles, the scoreboard cards, emblems, hero, leader cards and kickers. It becomes the first starting design and the look of the first made-up league in the stand-in. The founder's phrase is "maroon and white and their specific gold accent": the maroon is `#96062d`, the gold `#d3b780`. Build its light sibling too (white and cream page, maroon header and buttons, gold accent), since the founder said maroon and white: the dark public look and the light one are two starting designs from one brand.
- The shared display pieces gain what the list above names (emblem, scoreboard match card, leader card, hero, kicker and phrased title, number strip, call-to-action band, icons, pills), all driven by the design's variables, so that an admin who changes the main colour, the accent and the highlight gets the same quality in their own colours. Prove it: the pictures must look finished in at least three different colour sets, one of them light.
- Simple, not boring: generous space and few elements on a page, but colour where the eye should land. Flat single-colour boxes with dots are what the founder called boring.
- No real photographs, logos or names: the demo's photos show real students and the school's crest, so nothing from `examples/alhadi-school/assets` is copied into the product or its made-up leagues. The hero must look finished with no photograph (gradient and pattern), and take a league's own picture later.
- The titles' wording goes in the message files (T-187).
- Done test: section 4 of DESIGN.md answered again, plus a side-by-side of each new picture with the matching demo picture, named in the report; the design reviewer says in words whether a person would call it at least as good as the demo.

C. **Rewrite DESIGN.md's section 3** so that the first demo is the first standard (with the list above), and Faraj's site and the Al-Hadi tracker's pages the second and third. Add "simple, not boring" and "three colour sets" to section 4. Change step 2.103 so the staff area is modelled on `1280-admin.jpg`, and 2.102 to match.

D. **Record the founder's direction** in `docs/specs/v1/DECISIONS.md` as their own words. It changes C-2: the first starting design is held against the first Al-Hadi demo, not Faraj's site; an admin can change every colour. It is theirs, so it is "Agreed", quoted.

E. **For area 4 (scoring a game live):** the demo also has a scoring view (`examples/alhadi-school/src/views/commissioner.js`, the "scoring" page). Add it to what the scoring screens are compared with.

Carry on with everything else as briefed. Write one log line that says you received this.
