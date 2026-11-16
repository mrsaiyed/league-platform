// Cards that are not games: a team with its round emblem, a leader board with one big
// number, and a group that opens and closes, such as a round of the schedule
// (docs/build/DESIGN.md, section 3).
export const cardsCss = String.raw`
/* A team's emblem: a shield with its first letter, drawn in the team's own color. The
   color is laid inside the shield and drawn strongly along its lines, with a little of the
   page's text color in it, so a team's dark color still shows on a dark page and a pale
   one on a light page. The letter is in the page's text color: it reads whatever color the
   team chose. A team with no color of its own takes the league's accent. */
.ui-emblem {
  --emblem-color: var(--team-color, var(--color-accent));
  flex: none;
  inline-size: auto;
  block-size: var(--step-7);
  aspect-ratio: 6 / 7;
  overflow: visible;
  color: color-mix(in srgb, var(--emblem-color) 74%, var(--color-text));
}
/* In a row of a table: a little taller than a line of its words. */
.ui-emblem[data-size='small'] {
  block-size: calc(var(--step-5) + var(--step-1));
}
.ui-emblem[data-size='large'] {
  block-size: calc(var(--step-8) + var(--step-5));
}
/* How much of the team's color fills the shield is the design's (--emblem-strength): a
   third on a dark panel, more than half on a white one, so it has the same strength on
   either. */
.ui-emblem-shield {
  fill: color-mix(in srgb, var(--emblem-color) var(--emblem-strength, 30%), transparent);
  stroke: currentColor;
  stroke-width: 1.4;
}
.ui-emblem-inner,
.ui-emblem-bar {
  fill: none;
  stroke: currentColor;
  stroke-width: 0.6;
  opacity: 0.8;
}
.ui-emblem-letter {
  color: var(--color-text);
  fill: currentColor;
  font-family: var(--font-heading);
  font-weight: var(--heading-weight);
  text-transform: uppercase;
}
/* In a row of a table the shield is small: only its outline and its letter are drawn. */
.ui-emblem[data-size='small'] .ui-emblem-inner,
.ui-emblem[data-size='small'] .ui-emblem-bar {
  display: none;
}
.ui-emblem[data-size='small'] .ui-emblem-shield {
  stroke-width: 2.4;
}
.ui-emblem[data-size='small'] .ui-emblem-letter {
  font-weight: 700;
}
/* The league's own mark, in the header: a shield filled with the strongest color of its
   bands (its main color, laid over a panel or deepened), edged in the color the eye lands
   on in the header, its letter in the color of a band's words. */
.ui-emblem[data-kind='league'] {
  color: var(--header-pop);
}
.ui-emblem[data-kind='league'] .ui-emblem-shield {
  fill: var(--color-band-glow);
}
.ui-emblem[data-kind='league'] .ui-emblem-letter {
  color: var(--color-on-band);
}

.ui-team-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--step-4);
  inline-size: 100%;
  padding-block: var(--step-5);
  padding-inline: var(--step-5);
  /* As a game's card: the panel, warmed at one corner in a dark design. At its top a fine
     line in the team's own color (the accent for a team with none), drawn as the lines of
     the team's shield are: the color itself with a little of the page's text color in it,
     so a dark team color still shows on a dark page and a pale one on a light page. */
  background-color: var(--color-panel);
  background-image: linear-gradient(120deg, var(--card-wash), var(--color-panel) 70%);
  border: var(--card-border-width) solid var(--color-line);
  border-block-start: var(--line-heavy) solid
    color-mix(in srgb, var(--team-color, var(--color-accent)) 74%, var(--color-text));
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  transition: border-color 0.15s;
}
/* Under the pointer the card's other three edges take the color the eye lands on; its top
   keeps the team's own. */
.ui-team-card:hover {
  border-inline-color: color-mix(in srgb, var(--color-pop) 50%, transparent);
  border-block-end-color: color-mix(in srgb, var(--color-pop) 50%, transparent);
}
/* The team's shield is the largest thing on its card. */
.ui-team-card > .ui-emblem {
  block-size: var(--step-8);
}
.ui-team-card-text {
  display: grid;
  flex: 1 1 auto;
  /* One column exactly as wide as the room there is: a long word in a name wraps or is
     broken inside it, and never makes the card wider than the screen. */
  grid-template-columns: minmax(0, 1fr);
  gap: var(--step-1);
  min-inline-size: 0;
}
.ui-team-card-name {
  margin: 0;
  font-family: var(--font-heading);
  font-size: var(--text-18);
  font-weight: var(--heading-weight);
  letter-spacing: var(--heading-tracking);
  line-height: 1.2;
  text-transform: var(--heading-case);
  /* A name breaks only between its words: a word is never split, and one too long even
     for a line of its own is cut short with "…", as on a scoreboard. */
  overflow-wrap: normal;
  hyphens: manual;
  overflow-x: clip;
  text-overflow: ellipsis;
}
.ui-team-card-name a {
  color: var(--color-text);
  text-decoration: none;
}
/* The whole card is the link to the team. */
.ui-team-card-name a::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--radius);
}
.ui-team-card-name a:focus-visible {
  outline: none;
}
.ui-team-card-name a:focus-visible::after {
  outline: 3px solid var(--color-primary-text);
  outline-offset: 2px;
}
.ui-facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--step-1) var(--step-4);
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-14);
}
.ui-facts > div {
  display: flex;
  align-items: baseline;
  gap: var(--step-2);
}
.ui-facts dt {
  font-size: var(--text-12);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ui-facts dd {
  margin: 0;
  color: var(--color-text);
  font-variant-numeric: lining-nums tabular-nums;
  font-weight: 600;
}
.ui-team-card-figure {
  flex: none;
  color: var(--color-pop);
  font-family: var(--font-score);
  font-size: var(--text-28);
  font-weight: var(--heading-weight);
  font-variant-numeric: lining-nums tabular-nums;
  line-height: 1;
}
/* The way on at an upright card's foot ("Roster", with the arrow): not drawn on a card
   that is one row. */
.ui-team-card-way {
  display: none;
}
/* On the narrowest phones the shield is a step smaller and the card's sides closer, so a
   name's longest word has the room it needs beside the record. */
@media (max-width: 22.49rem) {
  .ui-team-card {
    gap: var(--step-3);
    padding-inline: var(--step-4);
  }
  .ui-team-card > .ui-emblem {
    block-size: var(--step-7);
  }
}

/* A page of teams ("meet the teams"). On a phone each card is one row, so nine teams are
   not a long scroll. From a tablet up the cards stand upright, three across: the shield
   centered and large, the name in the display face, the record beneath as the number the
   eye lands on, and a foot line with the seed and division at its start and the way on at
   its end. */
@media (min-width: 48rem) {
  /* Three across on a grid of six, so a row that is left short is shared out and no card
     has a hole beside it: two left over take half the row each; one left over joins the
     three before it, two rows of two. */
  .ui-card-grid[data-layout='teams'] {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--step-5);
  }
  .ui-card-grid[data-layout='teams'] > li {
    grid-column: span 2;
  }
  .ui-card-grid[data-layout='teams'] > li:nth-last-child(2):nth-child(3n + 1),
  .ui-card-grid[data-layout='teams'] > li:nth-last-child(2):nth-child(3n + 1) ~ li,
  .ui-card-grid[data-layout='teams'] > li:nth-last-child(4):nth-child(3n + 1),
  .ui-card-grid[data-layout='teams'] > li:nth-last-child(4):nth-child(3n + 1) ~ li {
    grid-column: span 3;
  }
  .ui-card-grid[data-layout='teams'] .ui-team-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto 1fr auto;
    align-items: start;
    justify-items: center;
    gap: 0;
    padding-block: var(--step-6) var(--step-4);
    padding-inline: var(--step-4);
    text-align: center;
  }
  .ui-card-grid[data-layout='teams'] .ui-team-card > .ui-emblem {
    grid-column: 1 / -1;
    block-size: calc(var(--step-8) + var(--step-2));
  }
  /* The name and the facts leave their box and take their own places on the card. */
  .ui-card-grid[data-layout='teams'] .ui-team-card-text {
    display: contents;
  }
  .ui-card-grid[data-layout='teams'] .ui-team-card-name {
    grid-column: 1 / -1;
    grid-row: 2;
    max-inline-size: 100%;
    margin-block-start: var(--step-4);
    font-size: var(--text-22);
    text-wrap: balance;
  }
  .ui-card-grid[data-layout='teams'] .ui-team-card-figure {
    grid-column: 1 / -1;
    grid-row: 3;
    margin-block: var(--step-3) var(--step-5);
  }
  .ui-card-grid[data-layout='teams'] :is(.ui-facts, .ui-team-card-way) {
    grid-row: 4;
    align-self: stretch;
    justify-self: stretch;
    align-items: center;
    min-block-size: var(--step-6);
    padding-block-start: var(--step-3);
    border-block-start: 1px solid var(--color-line);
  }
  .ui-card-grid[data-layout='teams'] .ui-facts {
    grid-column: 1;
    gap: var(--step-1) var(--step-3);
    font-size: var(--text-12);
    text-align: start;
  }
  .ui-card-grid[data-layout='teams'] .ui-facts dd {
    font-size: var(--text-14);
  }
  .ui-card-grid[data-layout='teams'] .ui-team-card-way {
    grid-column: 2;
    display: inline-flex;
    gap: var(--step-2);
    padding-inline-start: var(--step-3);
    color: var(--color-muted);
    font-size: var(--text-14);
    font-weight: 600;
    white-space: nowrap;
  }
  .ui-card-grid[data-layout='teams'] .ui-team-card-way::after {
    content: '';
    flex: none;
    inline-size: var(--step-4);
    block-size: var(--step-4);
    background: currentColor;
    -webkit-mask: var(--ui-arrow) center / contain no-repeat;
    mask: var(--ui-arrow) center / contain no-repeat;
  }
  [dir='rtl'] .ui-card-grid[data-layout='teams'] .ui-team-card-way::after {
    transform: scaleX(-1);
  }
  /* Under the pointer, and with the keyboard on the card, the way on is in the text color:
     the record stays the one thing on the card in the color the eye lands on. */
  .ui-card-grid[data-layout='teams'] .ui-team-card:is(:hover, :focus-within) .ui-team-card-way {
    color: var(--color-text);
  }
}
@media (min-width: 64rem) {
  .ui-card-grid[data-layout='teams'] .ui-team-card {
    padding-inline: var(--step-5);
  }
  .ui-card-grid[data-layout='teams'] .ui-team-card-name {
    font-size: var(--text-28);
  }
  .ui-card-grid[data-layout='teams'] .ui-team-card-figure {
    font-size: var(--text-36);
  }
}

/* A leader board: who leads, with the leader's number the biggest thing on the card. */
.ui-leader-card {
  display: grid;
  align-content: start;
  gap: var(--step-3);
  inline-size: 100%;
  padding-block: var(--step-4);
  padding-inline: var(--space);
  background: var(--color-panel);
  border: var(--card-border-width) solid var(--color-line);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
.ui-leader-card h3 {
  margin: 0;
  color: var(--color-accent-text);
  font-family: var(--font-body);
  font-size: var(--text-12);
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
}
.ui-leader-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ui-leader {
  display: flex;
  align-items: center;
  gap: var(--step-3);
  padding-block: var(--step-2);
  border-block-start: 1px solid var(--color-line);
}
.ui-leader:first-child {
  padding-block-start: 0;
  border-block-start: 0;
}
.ui-leader-who {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr);
  min-inline-size: 0;
}
.ui-leader-name {
  font-weight: 600;
  line-height: 1.25;
}
.ui-leader-detail {
  color: var(--color-muted);
  font-size: var(--text-12);
}
.ui-leader-value {
  flex: none;
  font-family: var(--font-score);
  font-size: var(--text-18);
  font-weight: var(--heading-weight);
  font-variant-numeric: lining-nums tabular-nums;
  line-height: 1;
}
.ui-leader:first-child .ui-leader-value {
  color: var(--color-pop);
  font-size: var(--text-36);
}
/* A list that starts after the leader (who has a card of their own above it) picks out no
   line: its first is second place. */
.ui-leader-card[data-after-leader='true'] .ui-leader:first-child .ui-leader-value {
  color: inherit;
  font-size: var(--text-18);
}

/* One leader, picked out: a tiny label, one very large number, the player's name, a quiet
   line, and the team's shield in the corner. The card is its own measure: narrow, its
   parts stand one over the other; wide (a card with a column to itself), the number
   stands at the start and the name beside it, so the card is one short row. */
.ui-spot {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-content: start;
  gap: var(--step-2) var(--step-5);
  inline-size: 100%;
  padding: var(--step-5);
  background-color: var(--color-panel);
  background-image: linear-gradient(120deg, var(--card-wash), var(--color-panel) 70%);
  color: var(--color-text);
  border: var(--card-border-width) solid var(--color-line);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  container: spot / inline-size;
}
/* Each part takes the card's width, one over the other, unless the card is wide (below). */
.ui-spot > * {
  grid-column: 1 / -1;
  margin: 0;
}
.ui-spot-label {
  /* Clear of the shield in the corner. */
  padding-inline-end: var(--step-7);
  color: var(--color-accent-text);
  font-size: var(--text-12);
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  line-height: 1.5;
  text-transform: uppercase;
}
.ui-spot > .ui-emblem {
  position: absolute;
  inset-block-start: var(--step-4);
  inset-inline-end: var(--step-4);
  block-size: var(--step-7);
}
.ui-spot-figure {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--step-2);
}
/* A big number that stands alone may wear the display face's own figures. */
.ui-spot-value {
  color: var(--color-pop);
  font-family: var(--font-heading);
  font-size: var(--text-48);
  font-weight: var(--display-weight);
  line-height: 1.1;
}
.ui-spot-unit {
  color: var(--color-muted);
  font-size: var(--text-12);
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
}
.ui-spot-who {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--step-1);
  min-inline-size: 0;
}
.ui-spot-who > * {
  margin: 0;
}
.ui-root .ui-spot-name {
  font-size: var(--text-22);
  line-height: 1.2;
  overflow-wrap: break-word;
}
.ui-spot-detail {
  color: var(--color-muted);
  font-size: var(--text-14);
}
/* The first of a row is a small band: the league's main color, with a band's own colors
   for its words and its number, which are fitted to it whatever the league chose. */
.ui-spot[data-first='true'] {
  background-color: var(--spot-ground, var(--color-band));
  background-image: linear-gradient(
    120deg,
    var(--spot-glow, var(--color-band-glow)),
    var(--spot-ground, var(--color-band))
  );
  border-color: var(--spot-edge, color-mix(in srgb, var(--color-band-pop) 28%, transparent));
  color: var(--spot-words, var(--color-on-band));
}
[dir='rtl'] .ui-spot[data-first='true'] {
  background-image: linear-gradient(
    240deg,
    var(--spot-glow, var(--color-band-glow)),
    var(--spot-ground, var(--color-band))
  );
}
/* A design may soften the first card (the --spot values: packages/site, frame-look.ts): a
   light design does, where a filled card of the main color would be a second band over
   the closing one. Left unsaid, the card is a small band. */
.ui-spot[data-first='true'] :is(.ui-spot-label, .ui-spot-unit, .ui-spot-detail) {
  color: var(--spot-muted, var(--color-band-muted));
}
.ui-spot[data-first='true'] .ui-spot-value {
  color: var(--spot-pop, var(--color-band-pop));
}
/* On the filled card a shield keeps its team's own color: it is filled with that color,
   a little deepened, not laid thinly over the card's (which turned a green team grey on a
   maroon card). Its lines and its letter are in the band's words' color, and the letter
   has a fine dark edge so it reads on a light team color too. */
.ui-spot[data-first='true'] > .ui-emblem {
  color: color-mix(
    in srgb,
    var(--emblem-color) var(--spot-line-share, 35%),
    var(--spot-letter, var(--color-on-band))
  );
}
.ui-spot[data-first='true'] .ui-emblem-shield {
  fill: color-mix(
    in srgb,
    var(--emblem-color) var(--spot-shield-share, 82%),
    var(--spot-shield-under, var(--color-band-deep))
  );
}
.ui-spot[data-first='true'] .ui-emblem-letter {
  color: var(--spot-letter, var(--color-on-band));
  paint-order: stroke;
  stroke: var(--spot-letter-edge, color-mix(in srgb, var(--color-band-deep) 70%, transparent));
  stroke-width: 1.5px;
}
/* Wide: the number in a first column of its own, the name beside it, clear of the shield. */
@container spot (min-width: 28rem) {
  .ui-spot-figure {
    grid-column: 1;
    align-self: center;
    min-inline-size: calc(2 * var(--step-8) + var(--step-5));
  }
  .ui-spot-who {
    grid-column: 2;
    align-self: center;
    padding-inline-end: var(--step-7);
  }
}
/* Leaders in a row: three across on a laptop, one under the other on a phone; in a column
   of their own (beside a list of games), one under the other at any width. */
.ui-spot-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--step-4);
  margin: 0;
  padding: 0;
  list-style: none;
}
.ui-spot-row > li {
  display: grid;
  min-inline-size: 0;
}
@media (min-width: 48rem) {
  .ui-spot-row[data-across='two'] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--step-5);
  }
  .ui-spot-row[data-across='three'] {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--step-5);
  }
}

/* A group that opens and closes without any script: a round of the schedule. */
.ui-group {
  border-block-start: 1px solid var(--color-line);
}
.ui-group:last-of-type {
  border-block-end: 1px solid var(--color-line);
}
.ui-group > summary {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--step-1) var(--step-3);
  min-block-size: var(--step-7);
  padding-block: var(--step-3);
  /* Room at the start for the mark that says the group opens. Everything else in the
     heading starts after it, on every line: what wraps (a note beside the round's mark, the
     count of its games) wraps under the round's name, never under the mark. */
  padding-inline-start: var(--step-6);
  list-style: none;
  cursor: pointer;
}
.ui-group > summary::-webkit-details-marker {
  display: none;
}
/* The mark that says a group opens: a small corner that points on when shut, down when
   open. It stands in the room at the start, level with the heading's first line. */
.ui-group > summary::before {
  content: '';
  position: absolute;
  inset-block-start: calc(var(--step-3) + var(--step-2));
  inset-inline-start: var(--step-2);
  inline-size: var(--step-2);
  block-size: var(--step-2);
  border-block-end: var(--line-heavy) solid var(--color-muted);
  border-inline-end: var(--line-heavy) solid var(--color-muted);
  transition: transform 0.15s;
  transform: rotate(-45deg);
}
[dir='rtl'] .ui-group > summary::before {
  transform: rotate(45deg);
}
.ui-group[open] > summary::before {
  transform: rotate(45deg);
}
[dir='rtl'] .ui-group[open] > summary::before {
  transform: rotate(-45deg);
}
.ui-group > summary h2,
.ui-group > summary h3 {
  margin: 0;
  font-size: var(--text-18);
}
.ui-group > summary:hover h2,
.ui-group > summary:hover h3 {
  color: var(--color-primary-text);
}
.ui-group-mark {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--step-5);
  padding-block: 0;
  padding-inline: var(--step-2);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  color: var(--color-muted);
  font-size: var(--text-12);
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.5;
  text-transform: uppercase;
  white-space: nowrap;
}
/* The group to look at now: the round being played. Its mark is in the text color on a soft
   tint, with a control's edge: plainer than the quiet marks beside the other rounds, and
   never as loud as the Live pill of a game inside it, which is the one filled mark of the
   page. */
.ui-group[data-phase='current'] .ui-group-mark {
  border-color: var(--color-line-strong);
  background: var(--color-tint);
  color: var(--color-text);
}
/* What the mark does not say, beside it ("1 game postponed"), is drawn like a postponed
   game's own pill, soft, so it is read as news about the games inside in any round and is
   never the loudest mark of the page: the rule is with the game's pills (game-css.ts). */
.ui-group-summary {
  margin-inline-start: auto;
  color: var(--color-muted);
  font-size: var(--text-14);
}
/* On a phone every round's count stands on a line of its own under the round's name, in
   line with it (the heading's own room at the start sees to that): so a round with a note
   beside its mark is not the only one whose heading breaks. */
@media (max-width: 29.99rem) {
  .ui-group-summary {
    flex: 1 1 100%;
    margin-inline-start: 0;
  }
}
.ui-group-body {
  padding-block: var(--step-1) var(--step-5);
}
`;
