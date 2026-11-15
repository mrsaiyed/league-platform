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
.ui-emblem[data-size='small'] {
  block-size: var(--step-5);
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
     line in the team's own color (the accent for a team with none), strong enough to be
     told from its neighbors' and no stronger than a picked-out card's edge. */
  background-color: var(--color-panel);
  background-image: linear-gradient(120deg, var(--card-wash), var(--color-panel) 70%);
  border: var(--card-border-width) solid var(--color-line);
  border-block-start: 2px solid
    color-mix(in srgb, var(--team-color, var(--color-accent)) 50%, transparent);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  transition: border-color 0.15s;
}
.ui-team-card:hover {
  border-color: color-mix(in srgb, var(--color-pop) 55%, transparent);
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
  /* A word too long for the card is broken at a syllable, with a hyphen, where the
     browser knows the language. */
  hyphens: auto;
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
  background-color: var(--color-band);
  background-image: linear-gradient(120deg, var(--color-band-glow), var(--color-band));
  border-color: color-mix(in srgb, var(--color-band-pop) 28%, transparent);
  color: var(--color-on-band);
}
[dir='rtl'] .ui-spot[data-first='true'] {
  background-image: linear-gradient(240deg, var(--color-band-glow), var(--color-band));
}
.ui-spot[data-first='true'] :is(.ui-spot-label, .ui-spot-unit, .ui-spot-detail) {
  color: var(--color-band-muted);
}
.ui-spot[data-first='true'] .ui-spot-value {
  color: var(--color-band-pop);
}
/* On the filled card a shield keeps its team's own color: it is filled with that color,
   a little deepened, not laid thinly over the card's (which turned a green team grey on a
   maroon card). Its lines and its letter are in the band's words' color, and the letter
   has a fine dark edge so it reads on a light team color too. */
.ui-spot[data-first='true'] > .ui-emblem {
  color: color-mix(in srgb, var(--emblem-color) 35%, var(--color-on-band));
}
.ui-spot[data-first='true'] .ui-emblem-shield {
  fill: color-mix(in srgb, var(--emblem-color) 82%, var(--color-band-deep));
}
.ui-spot[data-first='true'] .ui-emblem-letter {
  color: var(--color-on-band);
  paint-order: stroke;
  stroke: color-mix(in srgb, var(--color-band-deep) 70%, transparent);
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--step-1) var(--step-3);
  min-block-size: var(--step-7);
  padding-block: var(--step-3);
  list-style: none;
  cursor: pointer;
}
.ui-group > summary::-webkit-details-marker {
  display: none;
}
/* The mark that says a group opens: a small corner that points on when shut, down when open. */
.ui-group > summary::before {
  content: '';
  flex: none;
  inline-size: var(--step-2);
  block-size: var(--step-2);
  margin-inline: var(--step-1);
  border-block-end: 2px solid var(--color-muted);
  border-inline-end: 2px solid var(--color-muted);
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
/* The group to look at now: the round being played. */
.ui-group[data-phase='current'] .ui-group-mark {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-on-primary);
}
/* What the mark does not say, beside it ("1 game postponed"), is drawn like a postponed
   game's own pill, soft, so it is read as news about the games inside in any round and is
   never the loudest mark of the page: the rule is with the game's pills (game-css.ts). */
.ui-group-summary {
  margin-inline-start: auto;
  color: var(--color-muted);
  font-size: var(--text-14);
}
.ui-group-body {
  padding-block: var(--step-1) var(--step-5);
}
`;
