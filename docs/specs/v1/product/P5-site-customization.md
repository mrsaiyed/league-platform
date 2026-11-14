# P5 — Site customization

[Spec home](../README.md) · Decisions C-1 to C-14

"Maximum admin customizability" has to mean something exact, or it becomes a promise we cannot keep. This file says what an admin can change, how they change it, and where the line is.

## 1. The principle

**C-1 (agreed): an admin can change anything about how their site looks and what it shows by choosing, arranging and configuring parts we built. They cannot add parts we did not build.**

That gives a league a site that looks like its own, and gives us one product to maintain. When a league needs a part that does not exist, we build it for everyone (B-3). Faraj's own stated goal, "the admin never has to touch the code or database", is the same idea.

Letting a league add its own code is "maybe later" (the founder, November 12). It becomes possible only once a league's site sits on its own separate address (U-13, U-2), and it would arrive as an add-on with its own safety rules. Nothing in the first stages depends on it.

There are six layers of customization. From most used to least:

| Layer        | Example                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| **Content**  | Wording, images, news, sponsors, awards                                                                        |
| **Design**   | Colors, fonts, logo, the overall style                                                                         |
| **Menu**     | Which pages exist, their order and names                                                                       |
| **Pages**    | Which sections are on each page, in what order, set up how                                                     |
| **Wording**  | "Conference" instead of "Division", "Week" instead of "Round"                                                  |
| **Behavior** | Standings rules, which stats are kept, game format, which features are on ([P7](P7-teams-schedule-gameday.md)) |

## 2. Design

One screen, with a live preview beside it.

- **Colors**: background, panels, text, a main color, an accent and a highlight. The highlight is a third color used sparingly, on the few things that should catch the eye (a live marker, a winning score, the button that matters most on a page), and never for body text (C-15). Each division and each team can also have its own color (Faraj's gold Mecca and teal Medina). We warn when text would be hard to read against its background and suggest the nearest readable shade.
- **Fonts**: a heading font and a body font from a curated list of about 30. No font uploads at first.
- **Logo and icon**: uploaded once, used in the header, browser tab, share images and emails.
- **Style options**: square or rounded corners, flat or outlined cards, compact or roomy spacing, light or dark base.
- **Starting designs**: complete combinations of all of the above. Picking one never changes content, only appearance, and can be undone.

**C-2 (agreed November 12): Faraj's current look becomes one of the starting designs**, under a neutral name, for any league to pick. Later, any league can offer its own design for others to copy, if it chooses to.

**C-16 (your direction, November 14): the first starting design is built from the first Al-Hadi demo, and every color in it is the admin's to change.** After seeing the first redesigned pages you said: "the initial build we had for the alhadi demo looked better than this… for the ui we want to prioritize simplicity but not make it boring. different color pops or something. lets start with alhadi branding how we did for the initial demo with the maroon and white and their specific gold accent, see if we can build a page around that; then the idea is that the admin can switch those colors to whatever he wants." So the first starting design, under a neutral name, carries that demo's maroon, white and gold, its serif titles, hero, team emblems, scoreboard match cards and leader cards; it has a light sibling; Faraj's look (C-2) stays as another starting design. The pieces take every color from the league's design, so a league that changes them gets the same quality in its own colors. The rule for every screen is "simple, not boring". How I read your words into a build (the list of pieces, the light sibling, the proof in three color sets) is in `docs/build/DESIGN.md`, and is mine to get right.

## 3. Menu

The admin sees the menu as a list they can drag to reorder. They can rename any item, hide it, add a page they created, add a link to another website, and group items under a dropdown. On phones the menu becomes a slide-in drawer, as on Faraj's site today. The season picker's position (in the header or in the drawer) is a setting.

## 4. Pages and sections

Every page is a stack of **sections**. A league starts with the standard pages already built: Home, Schedule, Standings, Teams, Stats, and whichever optional ones are switched on (Awards, Draft, Media, Sponsors, News, About, Register). The admin can change the sections on any of them and create new pages from scratch.

**Sections that show the league's own data**

| Section              | Options                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| Headline numbers     | Which numbers (teams, players, divisions, weeks played); each tile links somewhere |
| Upcoming games       | How many; which division or team; card or list style                               |
| Recent results       | Same                                                                               |
| Live now             | Appears only while a game is live                                                  |
| Standings            | Full or compact; which division; which columns                                     |
| Schedule             | All rounds grouped as past, current and upcoming; or one round; filter by team     |
| Team grid            | Card style; show record, seed, logo                                                |
| Team roster          | Which team; show jersey numbers, captain                                           |
| Stat leaders         | Which stats; how many players                                                      |
| Stats table          | Which columns; sortable                                                            |
| Playoff bracket      | Which stage                                                                        |
| News list            | How many; with or without images                                                   |
| Register call-out    | Wording; shows spots left and the closing date                                     |
| Awards               | Weekly or season; which awards                                                     |
| Champion banner      | Current or chosen season; with team photo                                          |
| Trophy display       | Style (section 6)                                                                  |
| Sponsors             | By tier; logo sizes; whose sponsors (the league's, a division's, or one team's)    |
| Draft board or recap | Live board during the draft; recap after                                           |
| Media by round       | Which collections (Faraj's Top Plays, Baseline Episodes, Match Highlights)         |

**Sections for the league's own content**

Large banner (image, badge, headline, buttons) · Text · Image · Photo gallery · Video · Button row · Questions and answers (collapsible) · Notice bar · Countdown to a date · Contact details · Social links and "follow us" button · Spacer or divider · Embed from an approved service.

Each section has a few clearly named options. There is no free-form positioning: sections stack, and inside a section the layout comes from the options. This is what keeps every league's site working on every phone.

## 5. How editing works

1. The admin opens **Edit site**. They see their real page.
2. Pointing at (or tapping) a section shows its toolbar: **Edit · Move up · Move down · Duplicate · Hide · Remove**.
3. Text is edited by clicking on it and typing. Other options open in a side panel.
4. A **+** between sections opens the section list.
5. A switch at the top previews the page as a phone, tablet or laptop.
6. All changes are a **draft**. The public site does not change. A badge shows "unpublished changes".
7. **Preview** opens the draft as visitors would see it. **Publish** makes it live at once.
8. **History** lists every published version with who and when. Any version can be restored.

**C-3 (agreed): site edits are always draft-then-publish, and restoring an old version never touches league data.** Restoring last month's home page does not undo last month's scores; pages hold arrangement and wording, not results.

**C-4 (agreed): content that changes weekly is edited in the dashboard, not by redesigning pages.** News posts, award winners, sponsors and media links are entries in lists. The sections that show them update by themselves.

## 6. Custom features: the trophy case

Faraj's site has a 3D model of the league's real trophy. Its plates are engraved with each champion team: team and season, the captain, then the roster. Visitors scroll around it. Nothing like it comes with an ordinary league website.

**C-5 (agreed, changed November 12): the trophy is a "Trophy display" section, part of the Awards feature. Faraj's trophy is built first; a league bringing its own trophy comes later.**

- It fills itself from data the league already has: each season's champion team, its captain and its roster. Marking a champion at the end of a season adds the next plate.
- Options: the plaque title ("Faraj League Champions"), metal color, how names are laid out on a plate, and the display style.
- Styles at first: **3D trophy** (modelled on Faraj's real trophy, because Faraj needs it), **banner wall**, and **simple list**. A league that does not have that trophy still gets its champions history in a plainer form.
- **Later: your own trophy.** Every league's trophy is different. A league would upload photos of its real trophy and answer a few questions: its shape, how many plates it has, and whether it wants a full 360° view or a still picture with the names beside it. From that we make its trophy style. At first each one is work we do by hand, so it is a paid setup, and the result is still a style of this same section, not code for one customer (B-3). A builder that leagues use by themselves is further off.

This is the pattern for every "we are different" request: find the general feature inside the special one, build that, and make the special version one of its settings.

**C-6 (agreed): other Faraj-specific parts follow the same rule** and are listed one by one in [P9](P9-faraj-and-tcsaal.md): the weekly awards including the Akhlaq award, the media collections, sponsor tiers, the draft recap, conference descriptions on the About page.

## 7. "Exactly as it currently is"

**C-7 (agreed, changed November 12) meaning and test.** "Exactly as it is" means Faraj can move onto the product without its visitors losing anything that matters. Every page, every piece of information and everything a visitor can do today is still there, and the site still looks like Faraj: its colors, fonts, logo and trophy. It does not mean identical to the pixel. Where our standard version of something is as good or better, we use it.

The test: the list in [P9](P9-faraj-and-tcsaal.md) section 1.1 is checked row by row on the rebuilt site, which is built using only the admin (no special code). The founder, who runs Faraj, then reviews old and new side by side at phone and laptop sizes and signs off. Screenshots help that review; they are not an automatic pass or fail.

This is about what visitors see. The admin side is deliberately not copied (A-1).

Some differences are intended and better:

- **C-8 (agreed): each page gets a real address.** Today Faraj is one page with tabs (`#schedule`). On the platform it is `/farajleague/schedule`. Moving between pages stays instant, links can be shared, the back button works, and search engines can find each page. Old links are forwarded.
- Pages load with their content already in place, without the brief "Loading..." the current site shows.
- A signed-in player sees their own team highlighted and a "my next game" strip. Signed-out visitors see what they see today.

## 8. Where the line is

| Not allowed                                | Why                                                                | What we offer instead                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Pasting HTML, JavaScript or CSS            | Safety between leagues (U-1); we could not keep such sites working | Sections, design options, approved embeds                                                      |
| Uploading fonts                            | Licensing and page speed                                           | Curated list; requests considered                                                              |
| Removing the account button or legal links | People must be able to sign in and read the terms                  | Their position follows the design                                                              |
| Unreadable color combinations              | Accessibility                                                      | A warning and a suggested fix; the admin may still proceed for decoration, never for body text |
| Changing other leagues' or our pages       | Obviously                                                          |                                                                                                |

**C-9 (agreed): approved embeds at launch** are YouTube, Vimeo, Instagram, Google Maps and Google Calendar. Others are added on request after we check them.

## 9. Images, news and sharing

- **C-10:** uploaded images are resized and compressed automatically. The admin chooses the crop. Every image can have a text description for screen readers; we prompt for it.
- **C-11:** news posts are written in a simple editor: headings, bold, lists, links, images, video. A post can be pinned to the home page and can be sent as an announcement ([P8](P8-notifications.md)).
- **C-12:** every page has a title and description for search engines and link previews, filled in sensibly by default and editable. Game pages produce a share image with both teams and the score.

## 10. Big leagues

**C-13 (agreed): design is set once for the whole league; each program can override the accent color and its own landing page.** TCSAAL looks like TCSAAL everywhere, while basketball and volleyball can each have their own front page.

**C-14 (later): a club page** (a member school) uses a fixed layout showing that school's teams across programs, with the school's logo and colors. Clubs do not get the full editor.
